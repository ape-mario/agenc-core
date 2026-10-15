import snapshot from "./venice-models.data.json" with { type: "json" };
import type { ReasoningEffort } from "../../session/turn-context.js";
import type { ModelCostEntry } from "../../session/cost.js";
import { asRecord } from "../../utils/record.js";

export interface VeniceModel {
  readonly model: string;
  readonly displayName: string;
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
  readonly supportsToolUse: boolean;
  readonly supportsReasoning: boolean;
  readonly supportsVision: boolean;
  readonly supportsStructuredOutput: boolean;
  readonly supportedReasoningLevels: readonly ReasoningEffort[];
  readonly defaultReasoningLevel?: ReasoningEffort;
  readonly functionCallingDefault: boolean;
  readonly privacy?: "private" | "anonymized";
  /** Anonymous routing alone makes no retention guarantee. */
  readonly zeroDataRetention?: true;
  readonly cost?: ModelCostEntry;
}
const EFFORTS: readonly string[] = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
function price(value: unknown): number | undefined {
  const usd = asRecord(value)?.usd;
  // Venice publishes USD per million tokens. Core accounts per thousand.
  return typeof usd === "number" && Number.isFinite(usd) && usd >= 0 ? usd / 1000 : undefined;
}

/**
 * One model's published price (`model_spec.pricing`). `extended` holds the
 * rates for a request above `context_token_threshold` input tokens. The
 * `cache_write` price is not used: AgenC asks Venice for no prompt caching and
 * Chat Completions cannot report cache writes, so pricing them would charge
 * every uncached input token at the write rate.
 */
function veniceCost(pricing: Record<string, unknown> | null | undefined): ModelCostEntry | undefined {
  const inputUsdPer1K = price(pricing?.input);
  const outputUsdPer1K = price(pricing?.output);
  if (inputUsdPer1K === undefined || outputUsdPer1K === undefined) return undefined;
  const cachedInputUsdPer1K = price(pricing?.cache_input);
  const extended = asRecord(pricing?.extended);
  const aboveInputTokens = positiveInteger(extended?.context_token_threshold);
  const longContextRates = aboveInputTokens === undefined ? undefined : veniceCost(extended);
  return Object.freeze({
    inputUsdPer1K,
    outputUsdPer1K,
    ...(cachedInputUsdPer1K === undefined ? {} : { cachedInputUsdPer1K, cachedInputIncludedInInputTokens: true }),
    ...(aboveInputTokens === undefined || longContextRates === undefined ? {} : {
      longContext: Object.freeze({ aboveInputTokens, rates: longContextRates }),
    }),
  });
}

/** Parse only online text models explicitly advertising function calling. */
export function parseVeniceModels(payload: unknown): readonly VeniceModel[] {
  const data = asRecord(payload)?.data;
  if (!Array.isArray(data)) return [];
  const models = new Map<string, VeniceModel>();
  for (const value of data) {
    const row = asRecord(value);
    const spec = asRecord(row?.model_spec);
    const caps = asRecord(spec?.capabilities);
    if (row?.type !== "text" || typeof row.id !== "string" || !row.id.trim() ||
        !spec || spec.offline === true || caps?.supportsFunctionCalling !== true) continue;
    const supportedReasoningLevels = caps.supportsReasoning === true && caps.supportsReasoningEffort === true && Array.isArray(caps.reasoningEffortOptions)
      ? caps.reasoningEffortOptions.filter((value): value is ReasoningEffort => typeof value === "string" && EFFORTS.includes(value))
      : [];
    const defaultReasoningLevel = supportedReasoningLevels.find(value => value === caps.defaultReasoningEffort);
    const cost = veniceCost(asRecord(spec.pricing));
    const privacy = spec.privacy === "private" || spec.privacy === "anonymized" ? spec.privacy : undefined;
    models.set(row.id, Object.freeze({
      model: row.id,
      displayName: typeof spec.name === "string" ? spec.name : row.id,
      contextWindow: positiveInteger(spec.availableContextTokens),
      maxOutputTokens: positiveInteger(spec.maxCompletionTokens),
      supportsToolUse: true,
      supportsReasoning: caps.supportsReasoning === true,
      supportsVision: caps.supportsVision === true,
      supportsStructuredOutput: caps.supportsResponseSchema === true,
      supportedReasoningLevels: Object.freeze(supportedReasoningLevels),
      ...(defaultReasoningLevel === undefined ? {} : { defaultReasoningLevel }),
      functionCallingDefault: Array.isArray(spec.traits) && spec.traits.includes("function_calling_default"),
      ...(privacy === undefined ? {} : { privacy }),
      ...(privacy === "private" ? { zeroDataRetention: true as const } : {}),
      ...(cost === undefined ? {} : { cost }),
    }));
  }
  // Put Venice's function-calling default first in selection menus.
  return Object.freeze([...models.values()].sort((a, b) => Number(b.functionCallingDefault) - Number(a.functionCallingDefault)));
}

/** Each listed model's published price, keyed by model ID (see published-model-costs). */
export function veniceModelCosts(models: readonly VeniceModel[]): ReadonlyMap<string, ModelCostEntry> {
  return new Map(models.flatMap(model => model.cost === undefined ? [] : [[model.model, model.cost] as const]));
}

/** Small offline snapshot from the public /models response on 2026-10-15. */
export const VENICE_MODELS = parseVeniceModels(snapshot);
export function veniceDefaultModel(models: readonly VeniceModel[]): string | undefined {
  return models.find(model => model.functionCallingDefault)?.model;
}
