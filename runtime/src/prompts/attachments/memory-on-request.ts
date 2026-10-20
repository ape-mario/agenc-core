/**
 * Memory-on-request attachment producer (interactive Light sessions whose
 * memory was empty when the prompt was assembled).
 *
 * Such a session's fixed prefix carries no memory rules and no memory
 * directories (memory/memdir.ts loadMemoryPrompt). When the root human message
 * of a turn asks about memory or states something worth keeping (who the user
 * is, how they work, standing instructions, team or project facts, pointers to
 * external systems), the producer sends the same rules and directories once, on
 * that turn's first request. The retention ledger anchors the reminder before
 * the message and replays it in place on every later request, so the cached
 * prefix never moves and the rules are not sent twice. The background memory
 * extractor keeps saving project facts from the conversation either way
 * (services/extractMemories).
 *
 * @module
 */

import type { LLMMessage } from "../../llm/types.js";
import { LIGHT_MEMORY_RULES_MARKER } from "../../memory/memdir.js";
import type { AttachmentProducer } from "./orchestrator.js";

/**
 * Messages about memory, or that state durable facts. A false match costs one
 * reminder of about 300 tokens; a miss leaves the save to the background
 * extractor.
 */
const MEMORY_REQUEST = new RegExp([
  // Memory itself and standing instructions over time.
  String.raw`\b(?:remember(?:ed|ing|s)?|memori[sz]e[ds]?|memor(?:y|ies)|forget(?:ting|s)?|keep (?:it|this|that) in mind|note (?:that|this) down|from now on|going forward|for future (?:reference|sessions)|in (?:the )?future|next time|about me)\b`,
  // Who the user is and how they work.
  String.raw`\bI(?:'m| am)\b`,
  String.raw`\bcall me\b`,
  String.raw`\bmy (?:name|role|job|title|team|company|preferences?|style|setup|workflow)\b`,
  String.raw`\bI (?:work|prefer|like|love|hate|dislike|want you|don'?t want you|usually|always|never)\b`,
  String.raw`\bI'?d (?:rather|prefer)\b`,
  // Feedback and standing instructions.
  String.raw`\b(?:please )?(?:always|never) (?:use|run|write|add|do|ask|commit|format|include|mention)\b`,
  String.raw`\bstop (?:doing|using|adding|asking|writing|making)\b`,
  // Team and project context, and pointers to external systems.
  String.raw`\bwe (?:use|prefer|always|never|usually|deploy|release|ship|don'?t|do not)\b`,
  String.raw`\bour (?:team|convention|conventions|style|process|policy|policies|standard|standards|deadline|release|on-?call|dashboard|wiki)\b`,
  String.raw`\b(?:deadline|code freeze|merge freeze|incident|postmortem|on-?call)\b`,
  String.raw`\b(?:dashboard|runbook|wiki|jira|confluence|notion|grafana|datadog|sentry|pagerduty)\b`,
  String.raw`https?://`,
].join("|"), "iu");

/** Whether `text` is about memory or states something worth keeping. */
export function asksAboutMemory(text: string): boolean {
  return MEMORY_REQUEST.test(text);
}

function contains(messages: readonly LLMMessage[], needle: string): boolean {
  return messages.some((message) => {
    if (typeof message.content === "string") return message.content.includes(needle);
    return message.content.some((part) =>
      (part as { type?: string }).type === "text" &&
      ((part as { text?: string }).text ?? "").includes(needle));
  });
}

export const memoryOnRequestProducer: AttachmentProducer = async (opts) => {
  const resolve = opts.lightMemoryOnRequest;
  if (resolve === undefined) return [];
  // Only the human's own message of this turn decides.
  const provenance = opts.turnProvenance;
  const root = provenance?.rootHumanTurn;
  if (provenance === undefined || root === null || root === undefined ||
      root.turnId !== provenance.turnId) {
    return [];
  }
  if (!asksAboutMemory(root.text)) return [];
  // Already in front of the model: retained from an earlier request or turn.
  if (contains(opts.messages, LIGHT_MEMORY_RULES_MARKER)) return [];
  const content = await resolve();
  return content === undefined || content.length === 0
    ? []
    : [{ kind: "memory_on_request", content }];
};
