/**
 * Runtime-local compaction summarizer for the `emergency_local` ladder tier
 * (#2497). It produces a valid `CompactionSummaryBodyV1` from the same
 * structured inputs the model summarizer receives, without any provider
 * call, so the durable compaction transaction runs unchanged.
 *
 * The output is deliberately plain: a header that says what happened, the
 * earlier context, latest assistant state and bounded tool-result excerpts.
 * Evidence is quoted, not paraphrased; a model-free tier must not invent.
 */

import type { LLMMessage } from "../../llm/types.js";
import { isRecord } from "../../utils/record.js";
import type { CompactionStage } from "./transaction-types.js";
import { conservativeOutputTokenEstimate } from "./transaction-limits.js";

export interface CompactionLocalSummarizerInput {
  readonly stage: CompactionStage;
  readonly messages: readonly LLMMessage[];
  readonly allowedSourceRefIds: readonly string[];
  /** Output reserve the transaction planned for this call. */
  readonly maxOutputTokens: number;
}

/** Returns the JSON text of a `CompactionSummaryBodyV1`. */
export type CompactionLocalSummarizer = (input: CompactionLocalSummarizerInput) => string;

const MAX_NARRATIVE_BYTES = 6 * 1024;
const MAX_REQUEST_BYTES = 2 * 1024;
const MAX_LATEST_TEXT_BYTES = 1024;
const MAX_TOOL_CALLS_BYTES = 1024;
const MAX_TOOL_ARGUMENT_BYTES = 200;
const MAX_LATEST_TOOL_CALLS = 8;
const MAX_EVIDENCE_RECORDS = 12;
const MAX_EVIDENCE_BYTES = 768;
const MAX_PRIOR_FACTS = 8;
const PRIOR_FACT_PREFIX = "Earlier recorded fact:\n";

const HEADER_PREFIX = "Runtime emergency compaction:";
const REQUEST_HEADING = "Original request:";
const LATEST_TEXT_HEADING = "Latest assistant text:";
const LATEST_TOOLS_HEADING = "Latest tool calls:";

interface EmergencyDigest {
  droppedMessages: number;
  toolCalls: Map<string, number>;
  originalRequest: string | undefined;
  latestAssistantText: string | undefined;
  latestToolCalls: string[];
  evidence: { text: string; sourceRef: string }[];
  priorFacts: { text: string; sourceRef: string }[];
}

interface StructuredMessage {
  readonly role?: unknown;
  readonly content?: unknown;
  readonly tool_calls?: ReadonlyArray<{ readonly name?: unknown; readonly arguments?: unknown }>;
  readonly tool_name?: unknown;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part !== null && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : "",
      )
      .filter((text) => text.length > 0)
      .join("\n");
  }
  return "";
}

/** Truncate to a UTF-8 byte budget on a code-point boundary, marking the cut. */
export function truncateUtf8(value: string, maximumBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maximumBytes) return value;
  const marker = " […]";
  const budget = Math.max(0, maximumBytes - Buffer.byteLength(marker, "utf8"));
  let bytes = 0;
  let end = 0;
  for (const codePoint of value) {
    const size = Buffer.byteLength(codePoint, "utf8");
    if (bytes + size > budget) break;
    bytes += size;
    end += codePoint.length;
  }
  return `${value.slice(0, end)}${marker}`;
}

function tailUtf8(value: string, maximumBytes: number): string {
  // At most maximumBytes UTF-16 units can contribute to this byte suffix;
  // avoid copying the full (potentially very large) tool result.
  const bytes = Buffer.from(value.slice(-maximumBytes), "utf8");
  let start = Math.max(0, bytes.length - maximumBytes);
  while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start += 1;
  return bytes.subarray(start).toString("utf8");
}

function evidenceExcerpt(value: string, maximumBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maximumBytes) return value;
  const headBytes = Math.min(128, Math.floor(maximumBytes / 4));
  return `${truncateUtf8(value, headBytes)}\n[…]\n${tailUtf8(value, maximumBytes - headBytes - 16)}`;
}

function parseInput(message: LLMMessage | undefined): unknown {
  const raw = message === undefined ? "" : textOf(message.content);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function digestTranscript(payload: unknown, sourceRef: string | undefined): EmergencyDigest {
  const digest: EmergencyDigest = {
    droppedMessages: 0,
    toolCalls: new Map(),
    originalRequest: undefined,
    latestAssistantText: undefined,
    latestToolCalls: [],
    evidence: [],
    priorFacts: [],
  };
  const units = (payload as { units?: unknown } | undefined)?.units;
  if (!Array.isArray(units)) return digest;
  for (const unit of units) {
    const messages = (unit as { messages?: unknown } | undefined)?.messages;
    if (!Array.isArray(messages)) continue;
    for (const entry of messages as StructuredMessage[]) {
      digest.droppedMessages += 1;
      const role = typeof entry.role === "string" ? entry.role : "user";
      const text = textOf(entry.content).trim();
      if (role === "user" && digest.originalRequest === undefined && text.length > 0) {
        digest.originalRequest = text;
      }
      if (sourceRef !== undefined && role === "user") {
        try {
          const prior: unknown = JSON.parse(text);
          if (isRecord(prior) && prior.kind === "agenc_compaction_context_v2" && Array.isArray(prior.facts)) {
            for (const fact of prior.facts) {
              if (typeof fact === "string") digest.priorFacts.push({
                text: evidenceExcerpt(fact.startsWith(PRIOR_FACT_PREFIX) ? fact : PRIOR_FACT_PREFIX + fact, MAX_EVIDENCE_BYTES),
                sourceRef,
              });
            }
            digest.priorFacts = digest.priorFacts.slice(0, MAX_PRIOR_FACTS);
          }
        } catch { /* Ordinary user prose is not a prior summary. */ }
      }
      if (sourceRef !== undefined && role === "tool" && text.length > 0) {
        const name = typeof entry.tool_name === "string" ? entry.tool_name : "tool";
        // Command results commonly put computed values and exit status at
        // the end. Keep both the beginning and the end of oversized output.
        const excerpt = evidenceExcerpt(text, MAX_EVIDENCE_BYTES);
        digest.evidence.push({ text: `Recorded ${name} output (excerpt):\n${excerpt}`, sourceRef });
        digest.evidence = digest.evidence.slice(-MAX_EVIDENCE_RECORDS);
      }
      if (role === "assistant") {
        if (text.length > 0) digest.latestAssistantText = text;
        if (Array.isArray(entry.tool_calls) && entry.tool_calls.length > 0) {
          digest.latestToolCalls = [];
          for (const call of entry.tool_calls) {
            const name = typeof call.name === "string" ? call.name : "tool";
            digest.toolCalls.set(name, (digest.toolCalls.get(name) ?? 0) + 1);
            const args = argumentsText(call.arguments);
            digest.latestToolCalls.push(
              args.length > 0 ? `${name}(${truncateUtf8(args, MAX_TOOL_ARGUMENT_BYTES)})` : name,
            );
          }
        }
      }
    }
  }
  return digest;
}

/**
 * The transcript embeds arguments that parse as JSON values, with sorted
 * object keys, and others as the sent string. An object's shorter entries
 * come first, so one long value (a Write's content, a MultiEdit's edits)
 * cannot push the target path past MAX_TOOL_ARGUMENT_BYTES.
 */
function argumentsText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  if (!isRecord(value)) return JSON.stringify(value);
  const entries = Object.entries(value).map(([key, entry]) => {
    const text = `${JSON.stringify(key)}:${JSON.stringify(entry)}`;
    return { text, bytes: Buffer.byteLength(text, "utf8") };
  });
  // Array sort is stable, so entries of equal size keep their order.
  entries.sort((left, right) => left.bytes - right.bytes);
  return `{${entries.map((entry) => entry.text).join(",")}}`;
}

function section(narrative: string, heading: string): string | undefined {
  const start = narrative.indexOf(`\n${heading}\n`);
  if (start < 0) return undefined;
  const bodyStart = start + heading.length + 2;
  const next = narrative.indexOf("\n\n", bodyStart);
  return narrative.slice(bodyStart, next < 0 ? undefined : next).trim();
}

function parseHeader(narrative: string): { messages: number; calls: Map<string, number> } {
  const calls = new Map<string, number>();
  const messages = Number(/(\d+) messages/u.exec(narrative)?.[1] ?? 0);
  const list = /\((.*?)\) were dropped/u.exec(narrative)?.[1] ?? "";
  for (const item of list.split(",").map((value) => value.trim()).filter(Boolean)) {
    const match = /^(.+)×(\d+)$/u.exec(item);
    if (match) calls.set(match[1]!, Number(match[2]));
  }
  return { messages: Number.isFinite(messages) ? messages : 0, calls };
}

/** Merge child summaries: earliest request, latest state, summed counts. */
function digestSummaries(payload: unknown): EmergencyDigest {
  const digest: EmergencyDigest = {
    droppedMessages: 0,
    toolCalls: new Map(),
    originalRequest: undefined,
    latestAssistantText: undefined,
    latestToolCalls: [],
    evidence: [],
    priorFacts: [],
  };
  const summaries = (payload as { summaries?: unknown } | undefined)?.summaries;
  if (!Array.isArray(summaries)) return digest;
  for (const child of summaries) {
    const narrative = (child as { narrative?: unknown } | undefined)?.narrative;
    if (typeof narrative !== "string") continue;
    const header = parseHeader(narrative);
    digest.droppedMessages += header.messages;
    for (const [name, count] of header.calls) {
      digest.toolCalls.set(name, (digest.toolCalls.get(name) ?? 0) + count);
    }
    const request = section(narrative, REQUEST_HEADING);
    if (digest.originalRequest === undefined && request !== undefined) digest.originalRequest = request;
    const latest = section(narrative, LATEST_TEXT_HEADING);
    if (latest !== undefined) digest.latestAssistantText = latest;
    const tools = section(narrative, LATEST_TOOLS_HEADING);
    if (tools !== undefined) digest.latestToolCalls = tools.split("\n").filter(Boolean);
    if (isRecord(child) && typeof child.ref_id === "string" && Array.isArray(child.facts)) {
      for (const fact of child.facts) {
        if (isRecord(fact) && typeof fact.text === "string") {
          const record = { text: evidenceExcerpt(fact.text, MAX_EVIDENCE_BYTES + 128), sourceRef: child.ref_id };
          if (fact.text.startsWith(PRIOR_FACT_PREFIX)) digest.priorFacts.push(record);
          else digest.evidence.push(record);
        }
      }
      digest.evidence = digest.evidence.slice(-MAX_EVIDENCE_RECORDS);
      digest.priorFacts = digest.priorFacts.slice(0, MAX_PRIOR_FACTS);
    }
  }
  return digest;
}

function renderNarrative(digest: EmergencyDigest, scale: number): string {
  const callTotal = [...digest.toolCalls.values()].reduce((sum, count) => sum + count, 0);
  const callList = [...digest.toolCalls.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([name, count]) => `${name}×${count}`)
    .join(", ");
  const parts = [
    `${HEADER_PREFIX} the model summarizer could not reduce this context; ` +
      `${digest.droppedMessages} messages and ${callTotal} tool calls (${callList}) were dropped. ` +
      "Use retained recent exchanges and recorded evidence to continue; excerpts are incomplete. Do not repeat completed work from older pending actions.",
  ];
  if (digest.originalRequest !== undefined) {
    parts.push(`${REQUEST_HEADING}\n${truncateUtf8(digest.originalRequest, Math.floor(MAX_REQUEST_BYTES * scale))}`);
  }
  if (digest.latestAssistantText !== undefined) {
    parts.push(
      `${LATEST_TEXT_HEADING}\n${truncateUtf8(digest.latestAssistantText, Math.floor(MAX_LATEST_TEXT_BYTES * scale))}`,
    );
  }
  if (digest.latestToolCalls.length > 0) {
    const calls = digest.latestToolCalls.slice(-MAX_LATEST_TOOL_CALLS).join("\n");
    parts.push(`${LATEST_TOOLS_HEADING}\n${truncateUtf8(calls, Math.floor(MAX_TOOL_CALLS_BYTES * scale))}`);
  }
  return truncateUtf8(parts.join("\n\n"), MAX_NARRATIVE_BYTES);
}

/** Build a summarizer that never calls a model and always fits its output reserve. */
export function createRuntimeEmergencySummarizer(maximumOutputTokens = 8_192): CompactionLocalSummarizer {
  return (input) => {
    const outputLimit = Math.min(input.maxOutputTokens, maximumOutputTokens);
    const payload = parseInput(input.messages[0]);
    // A single-call plan labels its only call `final` yet still sends the
    // transcript, so the payload kind, not the stage, decides the parser.
    const kind = (payload as { kind?: unknown } | undefined)?.kind;
    const digest = kind === "untrusted_compaction_summaries" ? digestSummaries(payload) : digestTranscript(payload, input.allowedSourceRefIds[0]);
    let narrative = "";
    for (const scale of maximumOutputTokens < 8_192 ? [0.25, 0.1, 0] : [1, 0.5, 0.25, 0.1, 0]) {
      narrative = renderNarrative(digest, scale);
      // Reduce the number of older excerpts before shortening each one: the
      // computed tail of an oversized result must survive, along with facts
      // already learned in earlier summaries.
      const records = scale === 0 ? [] : [...digest.priorFacts.map((record) => ({
        ...record, text: evidenceExcerpt(record.text, Math.max(128, Math.floor(MAX_EVIDENCE_BYTES * scale))),
      })),
        ...digest.evidence.slice(-Math.max(1, Math.ceil(digest.evidence.length * scale)))];
      const facts = records.map((record, index) => ({
        id: `e${index + 1}`,
        text: record.text,
        source_ref_ids: [record.sourceRef],
      }));
      const body = JSON.stringify({ narrative, facts, open_actions: [] });
      if (conservativeOutputTokenEstimate(body) <= outputLimit) return body;
    }
    // Even the bare header did not fit the reserve; shrink the first line
    // until it does. The body is never empty: a compaction with no
    // narrative would be rejected downstream.
    const header = narrative.split("\n")[0] ?? HEADER_PREFIX;
    for (let bytes = 256; bytes >= 16; bytes = Math.floor(bytes / 2)) {
      const body = JSON.stringify({ narrative: truncateUtf8(header, bytes), facts: [], open_actions: [] });
      if (conservativeOutputTokenEstimate(body) <= outputLimit) return body;
    }
    return JSON.stringify({ narrative: truncateUtf8(header, 16), facts: [], open_actions: [] });
  };
}
