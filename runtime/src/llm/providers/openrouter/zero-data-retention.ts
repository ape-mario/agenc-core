/**
 * OpenRouter zero data retention (ZDR).
 *
 * On by default whenever the user's own OpenRouter key is in use: every
 * request carries `provider.zdr = true`, so OpenRouter routes only to
 * endpoints with a zero-data-retention policy (OR-ed with the account
 * setting on OpenRouter's side). `[providers.openrouter]
 * zero_data_retention = false` turns it off. The managed AgenC route pins its
 * own routing block and never sends the field (see ./index.ts).
 *
 * OpenRouter publishes the endpoints that qualify at `GET /endpoints/zdr`
 * (public, no key). The model menus read it to mark models without such an
 * endpoint; a list that cannot be read marks nothing, and the request still
 * carries `provider.zdr`. A request for such a model is refused with HTTP 404
 * and "No endpoints found matching your data policy (Zero data retention)"
 * (live answer, 2026-10-22); `explainOpenRouterZeroDataRetentionRefusal`
 * turns that into an error that names the setting.
 *
 * https://openrouter.ai/docs/guides/features/zdr
 * @module
 */

import type { AgenCConfig } from "../../../config/schema.js";
import {
  isLLMPreGenerationRejection,
  LLMProviderError,
  markLLMPreGenerationRejection,
} from "../../errors.js";

/** The config line that turns zero data retention off, as users type it. */
export const OPENROUTER_ZDR_OFF_SETTING =
  "zero_data_retention = false under [providers.openrouter]";

/** Where OpenRouter accounts require zero data retention for every request. */
const OPENROUTER_PRIVACY_SETTINGS_URL = "https://openrouter.ai/settings/privacy";

/** Whether OpenRouter requests carry `provider.zdr`: on unless the config turns it off. */
export function openRouterZeroDataRetentionEnabled(
  config: Pick<AgenCConfig, "providers"> | undefined,
): boolean {
  return config?.providers?.openrouter?.zero_data_retention !== false;
}

/** `GET <base>/endpoints/zdr`, from the OpenRouter base URL the session uses. */
export function openRouterZdrEndpointsUrl(baseURL: string): string {
  return `${baseURL.replace(/\/+$/u, "")}/endpoints/zdr`;
}

/**
 * The model ids that have at least one zero-data-retention endpoint, from the
 * body of `GET /endpoints/zdr` (`{ data: [{ model_id, tag, ... }] }`).
 * Undefined for any other body, so a broken answer marks nothing.
 */
export function parseOpenRouterZdrModels(body: unknown): ReadonlySet<string> | undefined {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return undefined;
  const data = (body as { readonly data?: unknown }).data;
  if (!Array.isArray(data)) return undefined;
  const models = new Set<string>();
  for (const entry of data) {
    if (entry === null || typeof entry !== "object") continue;
    const id = (entry as { readonly model_id?: unknown }).model_id;
    if (typeof id === "string" && id.trim().length > 0) models.add(id.trim().toLowerCase());
  }
  return models.size > 0 ? models : undefined;
}

/**
 * Routing shortcuts that keep the model's own endpoints. `:free` and other
 * variants are separate models with their own endpoints and stay as they are.
 */
const ROUTING_SHORTCUT = /:(?:nitro|floor|exacto|online)$/u;

/** Whether `models` (from `parseOpenRouterZdrModels`) lists an endpoint for `model`. */
export function openRouterModelHasZdrEndpoint(
  models: ReadonlySet<string>,
  model: string,
): boolean {
  const id = model.trim().toLowerCase();
  return models.has(id) || models.has(id.replace(ROUTING_SHORTCUT, ""));
}

/** OpenRouter's refusal text: "No endpoints found matching your data policy (Zero data retention)". */
function isOpenRouterZeroDataRetentionRefusal(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("matching your data policy") && lower.includes("zero data retention");
}

/**
 * OpenRouter's routing refused the request because no endpoint meets the
 * account's or the request's data policy: a 404 whose body names the routing
 * step that failed. No endpoint was chosen, so nothing ran or was billed.
 */
export function isOpenRouterDataPolicyRoutingRefusal(status: number, body: unknown): boolean {
  if (status !== 404) return false;
  let parsed = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body) as unknown;
    } catch {
      return false;
    }
  }
  const error = objectField(parsed, "error");
  return objectField(error, "metadata")?.failed_routing_step === "Filter by Data Policy";
}

function objectField(value: unknown, key: string): Readonly<Record<string, unknown>> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const field = (value as Readonly<Record<string, unknown>>)[key];
  return field !== null && typeof field === "object" && !Array.isArray(field)
    ? field as Readonly<Record<string, unknown>>
    : undefined;
}

/** What the person reads when OpenRouter refuses a model under zero data retention. */
function openRouterZeroDataRetentionRefusalMessage(
  model: string,
  requestedByAgenC: boolean,
): string {
  const refused = `OpenRouter has no zero data retention endpoint for ${model}, so it refused the request.`;
  return requestedByAgenC
    ? `${refused} Zero data retention is on by default. Choose another model, or set ${OPENROUTER_ZDR_OFF_SETTING} in config.toml to use this one.`
    : `${refused} Your OpenRouter privacy settings require zero data retention (${OPENROUTER_PRIVACY_SETTINGS_URL}). Choose another model, or change that setting.`;
}

/**
 * The refusal as a final, plain error, or undefined for any other error. The
 * status stays 404: a client error ends the turn and is never retried.
 */
export function explainOpenRouterZeroDataRetentionRefusal(
  error: unknown,
  context: { readonly model: string; readonly requestedByAgenC: boolean },
): LLMProviderError | undefined {
  if (!(error instanceof LLMProviderError) || error.statusCode !== 404) return undefined;
  if (!isOpenRouterZeroDataRetentionRefusal(error.message)) return undefined;
  const explained = new LLMProviderError(
    "openrouter",
    openRouterZeroDataRetentionRefusalMessage(context.model, context.requestedByAgenC),
    404,
  );
  if (isLLMPreGenerationRejection(error, "openrouter")) {
    markLLMPreGenerationRejection(explained, "openrouter");
  }
  return explained;
}
