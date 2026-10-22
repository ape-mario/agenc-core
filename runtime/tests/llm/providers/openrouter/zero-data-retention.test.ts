import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { LLMProviderError } from "../../../../src/llm/errors.js";
import {
  explainOpenRouterZeroDataRetentionRefusal,
  isOpenRouterDataPolicyRoutingRefusal,
  openRouterModelHasZdrEndpoint,
  openRouterZdrEndpointsUrl,
  openRouterZeroDataRetentionEnabled,
  parseOpenRouterZdrModels,
} from "../../../../src/llm/providers/openrouter/zero-data-retention.js";

// Seven entries of OpenRouter's public GET /api/v1/endpoints/zdr answer on
// 2026-10-22, as served (the full list had 1053 endpoints for 375 models).
const fixture = JSON.parse(
  readFileSync(new URL("../../fixtures/openrouter-zdr-endpoints.json", import.meta.url), "utf8"),
) as unknown;

describe("OpenRouter zero data retention", () => {
  test("is on unless the config turns it off", () => {
    expect(openRouterZeroDataRetentionEnabled(undefined)).toBe(true);
    expect(openRouterZeroDataRetentionEnabled({})).toBe(true);
    expect(openRouterZeroDataRetentionEnabled({ providers: { openrouter: {} } })).toBe(true);
    expect(openRouterZeroDataRetentionEnabled({ providers: { openrouter: { zero_data_retention: true } } })).toBe(true);
    expect(openRouterZeroDataRetentionEnabled({ providers: { openrouter: { zero_data_retention: false } } })).toBe(false);
  });

  test("reads the model ids that have a zero-data-retention endpoint", () => {
    const models = parseOpenRouterZdrModels(fixture);
    expect(models === undefined ? [] : [...models].sort()).toEqual([
      "anthropic/claude-sonnet-5.5",
      "baseten/mammoth-1:free",
      "deepseek/deepseek-v4.1-flash-1017",
      "qwen/qwen3-coder-next",
      "x-ai/grok-4.5",
      "z-ai/glm-5.3",
    ]);
    // Anything else marks nothing.
    expect(parseOpenRouterZdrModels({ data: [] })).toBeUndefined();
    expect(parseOpenRouterZdrModels({ error: { message: "unavailable" } })).toBeUndefined();
    expect(parseOpenRouterZdrModels("<html>")).toBeUndefined();
    expect(parseOpenRouterZdrModels(null)).toBeUndefined();
  });

  test("matches a model, its routing shortcuts, and not its separate variants", () => {
    const models = parseOpenRouterZdrModels(fixture)!;
    expect(openRouterModelHasZdrEndpoint(models, "x-ai/grok-4.5")).toBe(true);
    expect(openRouterModelHasZdrEndpoint(models, " X-AI/Grok-4.5 ")).toBe(true);
    expect(openRouterModelHasZdrEndpoint(models, "deepseek/deepseek-v4.1-flash-1017:nitro")).toBe(true);
    expect(openRouterModelHasZdrEndpoint(models, "z-ai/glm-5.3:floor")).toBe(true);
    expect(openRouterModelHasZdrEndpoint(models, "baseten/mammoth-1:free")).toBe(true);
    // A `:free` model is its own model with its own endpoints.
    expect(openRouterModelHasZdrEndpoint(models, "x-ai/grok-4.5:free")).toBe(false);
    expect(openRouterModelHasZdrEndpoint(models, "google/gemini-2.5-flash-lite")).toBe(false);
  });

  test("explains OpenRouter's refusal and no other error", () => {
    const explain = (message: string, status = 404) => explainOpenRouterZeroDataRetentionRefusal(
      new LLMProviderError("openrouter", message, status),
      { model: "google/gemini-2.5-flash-lite", requestedByAgenC: true },
    )?.message;
    expect(explain(
      "No endpoints found matching your data policy (Zero data retention). Configure: https://openrouter.ai/settings/privacy",
    )).toContain("OpenRouter has no zero data retention endpoint for google/gemini-2.5-flash-lite");
    expect(explain(
      "No endpoints found matching your data policy (Paid model training). Configure: https://openrouter.ai/settings/privacy",
    )).toBeUndefined();
    expect(explain("No endpoints found that support tool use.")).toBeUndefined();
    expect(explain("No endpoints found matching your data policy (Zero data retention).", 400)).toBeUndefined();
    expect(explainOpenRouterZeroDataRetentionRefusal(
      new Error("No endpoints found matching your data policy (Zero data retention)."),
      { model: "x", requestedByAgenC: true },
    )).toBeUndefined();
  });

  test("takes a refusal as proof that nothing ran only when routing failed on the data policy", () => {
    const refusal = {
      error: {
        message: "No endpoints found matching your data policy (Zero data retention). Configure: https://openrouter.ai/settings/privacy",
        code: 404,
        metadata: { failed_routing_step: "Filter by Data Policy" },
      },
    };
    expect(isOpenRouterDataPolicyRoutingRefusal(404, refusal)).toBe(true);
    // A body the client kept as text.
    expect(isOpenRouterDataPolicyRoutingRefusal(404, JSON.stringify(refusal))).toBe(true);
    expect(isOpenRouterDataPolicyRoutingRefusal(400, refusal)).toBe(false);
    expect(isOpenRouterDataPolicyRoutingRefusal(404, { error: { message: refusal.error.message, code: 404 } })).toBe(false);
    expect(isOpenRouterDataPolicyRoutingRefusal(404, { error: { metadata: { failed_routing_step: "Filter by Tool Support" } } })).toBe(false);
    expect(isOpenRouterDataPolicyRoutingRefusal(404, "Not Found")).toBe(false);
  });

  test("reads the list on the endpoint the session uses", () => {
    expect(openRouterZdrEndpointsUrl("https://openrouter.ai/api/v1")).toBe("https://openrouter.ai/api/v1/endpoints/zdr");
    expect(openRouterZdrEndpointsUrl("http://127.0.0.1:9000/api/v1/")).toBe("http://127.0.0.1:9000/api/v1/endpoints/zdr");
  });
});
