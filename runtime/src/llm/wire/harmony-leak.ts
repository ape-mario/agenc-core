/**
 * gpt-oss tool calls that a host returned as harmony text.
 *
 * gpt-oss writes its output in OpenAI's harmony format, and the host that
 * serves it turns each `commentary to=functions.<name> ... <|message|>{args}<|call|>`
 * segment into a structured tool call. Some routed hosts (seen on
 * OpenRouter) fail to parse a call and return the raw harmony text as the
 * answer instead, for example:
 *
 *   ` to=files\n\nWe have a third file ...<|end|><|start|>assistant<|channel|>commentary to=functions.FileRead <|constrain|>json<|message|>{"file_path":"notes/c.txt"}<|call|>`
 *
 * Taken as it is, that text ends the turn as the model's final answer. A
 * harmony call ends the model's output (the model stops at `<|call|>` and
 * waits for the result), so a complete call at the very end of the text, to
 * a tool the request advertised, with a JSON object as its arguments, is
 * the call the model made. Anything less complete is left as it is.
 *
 * @module
 */

import { randomUUID } from "node:crypto";

const GPT_OSS_MODEL = /(?:^|[/:_-])gpt-oss(?:$|[-_.:])/iu;
const TRAILING_CALL =
  /<\|channel\|>\s*commentary\s+to=functions\.([A-Za-z0-9_.:-]+)\s*(?:<\|constrain\|>\s*[A-Za-z]+\s*)?<\|message\|>([\s\S]*?)<\|call\|>\s*$/u;
const HARMONY_HEADER = /<\|start\|>\s*assistant|<\|channel\|>\s*(?:analysis|commentary|final)\b/gu;
const HARMONY_TOKEN = /<\|(?:start|end|channel|message|constrain|call|return)\|>/gu;

/** An open-weight gpt-oss model under any host's naming. */
export function isGptOssModel(model: string): boolean {
  return GPT_OSS_MODEL.test(model.trim());
}

export interface LeakedHarmonyToolCall {
  readonly name: string;
  /** The call's arguments, a JSON object. */
  readonly arguments: string;
  /** The text before the call with the harmony markers removed. */
  readonly reasoning: string;
}

/** The complete harmony call at the end of `content`, if there is one. */
export function recoverLeakedHarmonyToolCall(
  content: string,
  advertisedToolNames: readonly string[],
): LeakedHarmonyToolCall | undefined {
  if (!content.includes("<|call|>")) return undefined;
  const match = TRAILING_CALL.exec(content);
  if (match === null) return undefined;
  const name = match[1]!;
  if (!advertisedToolNames.includes(name)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[2]!.trim());
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const reasoning = content
    .slice(0, match.index)
    // What is left of the header the host cut off, for example ` to=files`.
    .replace(/^\s*to=\S*/u, "")
    .replace(HARMONY_HEADER, "\n")
    .replace(HARMONY_TOKEN, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  return { name, arguments: JSON.stringify(parsed), reasoning };
}

/**
 * A gpt-oss Chat Completions message whose only tool call came back as
 * harmony text, rewritten as the structured call; any other message is
 * returned unchanged.
 */
export function withRecoveredHarmonyToolCall(
  model: string,
  message: Record<string, unknown>,
  advertisedToolNames: readonly string[],
  reasoningField: string,
): Record<string, unknown> {
  if (!isGptOssModel(model) || typeof message.content !== "string") return message;
  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) return message;
  const recovered = recoverLeakedHarmonyToolCall(message.content, advertisedToolNames);
  if (recovered === undefined) return message;
  const existing = typeof message[reasoningField] === "string" ? message[reasoningField] as string : "";
  const reasoning = [existing, recovered.reasoning].filter((text) => text.length > 0).join("\n");
  return {
    ...message,
    content: "",
    ...(reasoning.length > 0 ? { [reasoningField]: reasoning } : {}),
    tool_calls: [{
      id: `call_harmony_${randomUUID().replace(/-/gu, "").slice(0, 16)}`,
      type: "function",
      function: { name: recovered.name, arguments: recovered.arguments },
    }],
  };
}

/**
 * Holds back a streamed gpt-oss answer that starts the way leaked harmony
 * text does (` to=files`, ` to=functions.FileRead`) until the response
 * ends, so a call recovered from it does not first appear as an answer in
 * the transcript. Every other answer streams as it arrives; held text that
 * does not turn into a call is shown when the response ends.
 */
export class HarmonyLeakHold {
  #state: "deciding" | "holding" | "passing";
  #held = "";

  constructor(model: string) {
    this.#state = isGptOssModel(model) ? "deciding" : "passing";
  }

  /** The part of `text` to show now. */
  push(text: string): string {
    if (this.#state === "passing") return text;
    this.#held += text;
    if (this.#state === "holding") return "";
    const lead = this.#held.trimStart();
    if (lead.startsWith("to=")) {
      this.#state = "holding";
      return "";
    }
    if (lead.length < 3 && "to=".startsWith(lead)) return "";
    return this.flush();
  }

  /** Whatever is still held; streaming passes through from here on. */
  flush(): string {
    const held = this.#held;
    this.#held = "";
    this.#state = "passing";
    return held;
  }
}
