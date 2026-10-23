import { describe, expect, test, vi } from "vitest";
import { KimiProvider } from "../../src/llm/providers/kimi/index.js";
import { KIMI_CHAT_MODELS, isKimiK3Model } from "../../src/llm/registry/kimi-models.js";
import { OpenRouterProvider } from "../../src/llm/providers/openrouter/index.js";
import { buildChatCompletionsRequest } from "../../src/llm/wire/chat-completions.js";
import { chatCompletionsCapabilityHintsForProvider } from "../../src/llm/wire/capability-gating.js";
import { SYSTEM_PROMPT_DYNAMIC_BOUNDARY_MARKER } from "../../src/llm/wire/shared.js";
import { lightEditsWithApplyPatch, lightUsesBatchEdit } from "../../src/tools/light-profile.js";
import { computeUsdCostWithResolution, DEFAULT_MODEL_COSTS, resolveModelCostEntry } from "../../src/session/cost.js";
import type { LLMMessage, LLMTool } from "../../src/llm/types.js";
import { bodyAt, sseResponse } from "./providers/openai-compatible-test-helpers.js";

const tool: LLMTool = { type: "function", function: {
  name: "FileRead", description: "Read a file", parameters: { type: "object", properties: { path: { type: "string" } } },
} };
const routes = [
  ...KIMI_CHAT_MODELS.map(model => ["kimi", model] as const),
  ["openrouter", "moonshotai/kimi-k3"],
] as const;

describe.each(routes)("%s %s harness", (providerName, model) => {
  test.each([false, true])("replays reasoning and pairs parallel results when response ids restart, stream=%s", async (stream) => {
    const reasoningField = providerName === "kimi" ? "reasoning_content" : "reasoning";
    const reply = () => {
      const message = { role: "assistant", content: "", [reasoningField]: "Inspect both files before editing.", tool_calls: [0, 1].map(index => ({
        index, id: `FileRead:${index}`, type: "function", function: { name: "FileRead", arguments: JSON.stringify({ path: `${index}.txt` }) },
      })) };
      return stream ? sseResponse([
        `data: ${JSON.stringify({ model, choices: [{ index: 0, delta: message, finish_reason: null }] })}\n\n`,
        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n',
      ]) : new Response(JSON.stringify({ model, choices: [{ message, finish_reason: "tool_calls" }] }), { headers: { "content-type": "application/json" } });
    };
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => reply());
    const config = { model, apiKey: "test-key", fetchImpl, tools: [tool] };
    const provider = providerName === "kimi" ? new KimiProvider(config) : new OpenRouterProvider(config);
    const messages: LLMMessage[] = [{ role: "user", content: "Read both files, then read them again." }];
    const run = () => stream ? provider.chatStream(messages, () => undefined, { parallelToolCalls: true, reasoningEffort: "high" }) : provider.chat(messages, { parallelToolCalls: true, reasoningEffort: "high" });
    const first = await run();
    expect(first.toolCalls).toHaveLength(2);
    messages.push({ role: "assistant", content: first.content, toolCalls: first.toolCalls,
      providerReasoningContent: first.providerReasoningContent, providerReasoningProvenance: first.providerReasoningProvenance });
    for (const call of first.toolCalls!) messages.push({ role: "tool", toolCallId: call.id, toolName: call.name, content: "file content" });
    const second = await run();
    expect(second.toolCalls).toHaveLength(2);
    expect(new Set([...first.toolCalls!, ...second.toolCalls!].map(call => call.id)).size).toBe(4);
    const body = bodyAt(fetchImpl, 1);
    const history = body.messages as Record<string, unknown>[];
    expect(history.find(m => m.role === "assistant")).toMatchObject({ [reasoningField]: "Inspect both files before editing." });
    expect(history.filter(m => m.role === "tool").map(m => m.tool_call_id)).toEqual(first.toolCalls!.map(call => call.id));
    // Both routes emit multiple calls without an optional parallel control.
    expect(body.parallel_tool_calls).toBeUndefined();
    if (providerName === "kimi") {
      if (isKimiK3Model(model)) {
        expect(body.reasoning_effort).toBe("high");
        expect(body.max_completion_tokens).toBe(131_072);
        expect(body).not.toHaveProperty("thinking");
      } else {
        expect(body).not.toHaveProperty("reasoning_effort");
        expect(body.max_completion_tokens).toBe(32_768);
        if (model === "kimi-k2.6") {
          expect(body.thinking).toEqual({ type: "enabled", keep: "all" });
        } else {
          expect(body).not.toHaveProperty("thinking");
        }
      }
      expect(body).not.toHaveProperty("temperature");
    }
  });

  test("keeps the cacheable head stable and the Light editor family consistent", () => {
    const request = (directory: string) => buildChatCompletionsRequest({ model, tools: [tool], messages: [{ role: "user", content: "Fix the code" }],
      options: { systemPrompt: `Stable instructions\n${SYSTEM_PROMPT_DYNAMIC_BOUNDARY_MARKER}\nWorking directory: ${directory}` },
      providerCapabilityHints: chatCompletionsCapabilityHintsForProvider(providerName, model) });
    const a = request("/project/a");
    const b = request("/project/b");
    expect((a.messages as unknown[])[0]).toEqual((b.messages as unknown[])[0]);
    expect(JSON.stringify(a.messages)).toContain("/project/a");
    expect(JSON.stringify(b.messages)).toContain("/project/b");
    expect(lightEditsWithApplyPatch(providerName, model)).toBe(false);
    expect(lightUsesBatchEdit(providerName, model)).toBe(false);
  });
});

test.each([false, true])("Moonshot cache writes are reported without double counting, stream=%s", async (stream) => {
  const model = "kimi-k3.1-pro";
  const usage = { prompt_tokens: 100, completion_tokens: 5, total_tokens: 105, prompt_tokens_details: { cached_tokens: 60, cache_write_tokens: 30 } };
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(stream ? sseResponse([
    'data: {"choices":[{"index":0,"delta":{"content":"done"},"finish_reason":"stop"}]}\n\n',
    `data: ${JSON.stringify({ choices: [], usage })}\n\n`, 'data: [DONE]\n\n',
  ]) : new Response(JSON.stringify({ model, choices: [{ message: { content: "done" }, finish_reason: "stop" }], usage }), { headers: { "content-type": "application/json" } }));
  const provider = new KimiProvider({ model, apiKey: "test-key", fetchImpl });
  const messages: LLMMessage[] = [{ role: "user", content: "Go" }];
  const result = await (stream ? provider.chatStream(messages, () => undefined) : provider.chat(messages));
  expect(result.usage).toMatchObject({ promptTokens: 100, cachedInputTokens: 60, cacheCreationInputTokens: 30, cacheWritesUnreported: false });
  expect(resolveModelCostEntry({ provider: "kimi", model }, DEFAULT_MODEL_COSTS)).toBeNull();
  const cost = computeUsdCostWithResolution({ model: "kimi-k3", provider: "kimi",
    inputTokens: result.usage.promptTokens, outputTokens: result.usage.completionTokens,
    cachedInputTokens: result.usage.cachedInputTokens!, cacheCreationInputTokens: result.usage.cacheCreationInputTokens!,
    reasoningOutputTokens: 0, webSearchRequests: 0, totalTokens: result.usage.totalTokens, turns: 1,
  }, DEFAULT_MODEL_COSTS);
  expect(cost.known).toBe(true);
  expect(cost.costUsd).toBeCloseTo(0.000213, 9);
});
