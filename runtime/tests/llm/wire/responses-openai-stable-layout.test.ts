/**
 * The OpenAI Responses request of one session only ever grows at its end.
 *
 * GPT-5.6 and later write the prompt cache up to the last user message or
 * tool output of a request and read it back only through the same key. The
 * oa Luna race (main c85e49ae4) showed both ways AgenC lost cache: the session
 * tail rode as the LAST input item, so it moved behind the new history on
 * every request and was never cached (283 uncached tokens on each of 131
 * Light calls), and every session sent its own `conv-<id>` key, so no first
 * request read the instructions, tools and tail that the previous session
 * had just written (0 of 22, against 1,821 cached tokens on the same prefix
 * through gateways that send no key).
 *
 * These tests pin the layout that fixes both: instructions = static head,
 * the session tail as the first input item, history appended after it, and
 * the user's cache scope as the key on GPT-5.6 and later.
 */
import { describe, expect, it } from "vitest";

import { buildOpenAIResponsesRequest } from "../../../src/llm/wire/responses-openai.js";
import { SYSTEM_PROMPT_DYNAMIC_BOUNDARY_MARKER } from "../../../src/llm/wire/shared.js";
import { promptCacheScopeKeyForHome } from "../../../src/llm/prompt-cache-key.js";
import { openAiModelScopesPromptCacheByKey } from "../../../src/llm/registry/openai-reasoning-models.js";
import type { LLMMessage, LLMTool } from "../../../src/llm/types.js";

const STATIC_HEAD = "You are AgenC. Follow user scope.";
const SESSION_TAIL = "Workspace: /workspace\n\nPermission mode: bypassPermissions.";
const SYSTEM_PROMPT = `${STATIC_HEAD}\n\n${SYSTEM_PROMPT_DYNAMIC_BOUNDARY_MARKER}\n\n${SESSION_TAIL}`;
const TOOLS: LLMTool[] = [{
  type: "function",
  function: {
    name: "exec_command",
    description: "Run a command",
    parameters: { type: "object", properties: { cmd: { type: "string" } }, required: ["cmd"] },
  },
}];

/** One session: a prompt, two tool rounds, an answer, a follow-up prompt. */
const PROMPT: LLMMessage = { role: "user", content: "What does this repo do?" };
const CALL_1: LLMMessage = {
  role: "assistant",
  content: "",
  toolCalls: [{ id: "call_1", name: "exec_command", arguments: "{\"cmd\":\"ls\"}" }],
};
const RESULT_1: LLMMessage = { role: "tool", toolCallId: "call_1", content: "README.md\nsrc" };
const CALL_2: LLMMessage = {
  role: "assistant",
  content: "",
  toolCalls: [{ id: "call_2", name: "exec_command", arguments: "{\"cmd\":\"cat README.md\"}" }],
};
const RESULT_2: LLMMessage = { role: "tool", toolCallId: "call_2", content: "An invoice kit." };
const ANSWER: LLMMessage = { role: "assistant", content: "It builds invoices." };
const FOLLOW_UP: LLMMessage = { role: "user", content: "Where does it start?" };
const SESSION_REQUESTS: LLMMessage[][] = [
  [PROMPT],
  [PROMPT, CALL_1, RESULT_1],
  [PROMPT, CALL_1, RESULT_1, CALL_2, RESULT_2],
  [PROMPT, CALL_1, RESULT_1, CALL_2, RESULT_2, ANSWER, FOLLOW_UP],
];

type Item = Record<string, unknown>;

function request(
  messages: LLMMessage[],
  extra: Partial<Parameters<typeof buildOpenAIResponsesRequest>[0]> = {},
  systemPrompt = SYSTEM_PROMPT,
): Record<string, unknown> {
  return buildOpenAIResponsesRequest({
    model: "gpt-6-luna",
    messages,
    tools: TOOLS,
    ...extra,
    options: {
      systemPrompt,
      promptCacheKey: "conv-abc123",
      promptCacheScopeKey: promptCacheScopeKeyForHome("/home/user/.agenc"),
      ...extra.options,
    },
  });
}

function items(body: Record<string, unknown>): Item[] {
  return body.input as Item[];
}

describe("OpenAI Responses requests of one session are append-only", () => {
  it("sends the session tail as the first input item, after the static instructions", () => {
    const body = request([PROMPT]);
    expect(body.instructions).toBe(STATIC_HEAD);
    expect(items(body)[0]).toEqual({
      type: "message",
      role: "system",
      content: [{ type: "input_text", text: SESSION_TAIL }],
    });
    expect(items(body)[1]).toMatchObject({ type: "message", role: "user" });
  });

  it("repeats every item of the previous request byte for byte and adds only new history", () => {
    const bodies = SESSION_REQUESTS.map((messages) => request(messages));
    for (let index = 1; index < bodies.length; index += 1) {
      const previous = bodies[index - 1]!;
      const current = bodies[index]!;
      const { input: _previousInput, ...previousStatic } = previous;
      const { input: _currentInput, ...currentStatic } = current;
      // instructions, tools, key and every other field stay identical
      expect(JSON.stringify(currentStatic)).toBe(JSON.stringify(previousStatic));
      const previousItems = items(previous).map((item) => JSON.stringify(item));
      const currentItems = items(current).map((item) => JSON.stringify(item));
      expect(currentItems.length).toBeGreaterThan(previousItems.length);
      expect(currentItems.slice(0, previousItems.length)).toEqual(previousItems);
    }
  });

  it("ends every request with a conversation item, never a system item", () => {
    for (const messages of SESSION_REQUESTS) {
      const last = items(request(messages)).at(-1)!;
      expect(last.role).not.toBe("system");
      expect(JSON.stringify(last)).not.toContain(SESSION_TAIL);
    }
    // The tail appears once per request.
    const body = request(SESSION_REQUESTS.at(-1)!);
    expect(JSON.stringify(body.input).split("Permission mode: bypassPermissions.").length - 1).toBe(1);
  });

  it("a changed tail changes only the first item; instructions and history stay byte-identical", () => {
    const before = request(SESSION_REQUESTS[2]!);
    const after = request(
      SESSION_REQUESTS[3]!,
      {},
      `${STATIC_HEAD}\n\n${SYSTEM_PROMPT_DYNAMIC_BOUNDARY_MARKER}\n\nWorkspace: /workspace\n\nPermission mode: default.`,
    );
    expect(after.instructions).toBe(before.instructions);
    expect(JSON.stringify(items(after)[0])).toContain("Permission mode: default.");
    const previousHistory = items(before).slice(1).map((item) => JSON.stringify(item));
    expect(items(after).slice(1, previousHistory.length + 1).map((item) => JSON.stringify(item)))
      .toEqual(previousHistory);
  });

  it("keeps the subscription backend's tail in the instructions (that route rejects system items)", () => {
    const body = request([PROMPT, CALL_1, RESULT_1], { chatgptBackend: true });
    expect(body.instructions).toBe(`${STATIC_HEAD}\n\n${SESSION_TAIL}`);
    expect(JSON.stringify(body.input)).not.toContain('"role":"system"');
  });
});

describe("prompt_cache_key on the OpenAI Responses wire", () => {
  const scope = promptCacheScopeKeyForHome("/home/user/.agenc");

  it("sends the user's cache scope to GPT-5.6 and later on the platform API", () => {
    for (const model of ["gpt-6-luna", "gpt-6-sol", "gpt-6.1-sol", "gpt-5.6-terra", "openai/gpt-6-luna",
      "gpt-6-luna-2026-09-22"]) {
      expect(openAiModelScopesPromptCacheByKey(model)).toBe(true);
      expect(request([PROMPT], { model }).prompt_cache_key).toBe(scope);
    }
  });

  it("keeps the conversation key for older models, the subscription backend and requests without a scope", () => {
    for (const model of ["gpt-5", "gpt-5.5", "gpt-5.4-nano", "gpt-4.1", "gpt-6-luna-mini"]) {
      expect(openAiModelScopesPromptCacheByKey(model)).toBe(false);
      expect(request([PROMPT], { model }).prompt_cache_key).toBe("conv-abc123");
    }
    expect(request([PROMPT], { chatgptBackend: true }).prompt_cache_key).toBe("conv-abc123");
    const unscoped = buildOpenAIResponsesRequest({
      model: "gpt-6-luna",
      messages: [PROMPT],
      tools: TOOLS,
      options: { systemPrompt: SYSTEM_PROMPT, promptCacheKey: "conv-abc123" },
    });
    expect(unscoped.prompt_cache_key).toBe("conv-abc123");
    const keyless = buildOpenAIResponsesRequest({
      model: "gpt-6-luna",
      messages: [PROMPT],
      tools: TOOLS,
      options: { systemPrompt: SYSTEM_PROMPT },
    });
    expect(keyless).not.toHaveProperty("prompt_cache_key");
  });

  it("derives one stable scope per AgenC home without sending the path", () => {
    expect(promptCacheScopeKeyForHome("/home/user/.agenc")).toBe(scope);
    expect(promptCacheScopeKeyForHome("/home/user/.agenc/")).toBe(scope);
    expect(promptCacheScopeKeyForHome("/home/other/.agenc")).not.toBe(scope);
    expect(scope).toMatch(/^agenc-[0-9a-f]{32}$/u);
    expect(scope).not.toContain("home");
  });
});
