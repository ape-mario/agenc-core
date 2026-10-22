import { OpenAIProvider } from "../openai/adapter.js";
import type { OpenAIProviderConfig } from "../openai/types.js";
import type { LLMChatOptions, LLMMessage, StreamProgressCallback } from "../../types.js";
import { explainOpenRouterZeroDataRetentionRefusal } from "./zero-data-retention.js";

export type OpenRouterProviderConfig = OpenAIProviderConfig;

export const OPENROUTER_DEFAULT_REFERER = "https://agenc.tech";
export const OPENROUTER_DEFAULT_TITLE = "AgenC";

function buildOpenRouterHeaders(
  headers: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  return {
    "HTTP-Referer": OPENROUTER_DEFAULT_REFERER,
    "X-Title": OPENROUTER_DEFAULT_TITLE,
    ...(headers ?? {}),
  };
}

/**
 * Whether requests carry `provider.zdr = true`: on unless `zeroDataRetention`
 * is false (`[providers.openrouter] zero_data_retention = false`), never on
 * the managed route.
 */
function openRouterSendsZeroDataRetention(
  config: Pick<OpenRouterProviderConfig, "zeroDataRetention" | "managedRequestId">,
): boolean {
  return config.zeroDataRetention !== false && config.managedRequestId !== true;
}

/**
 * Request-level zero data retention, on by default: `provider.zdr = true`
 * restricts routing to endpoints with a zero-data-retention policy (OR-ed
 * with the account setting on OpenRouter's side). A model with no such
 * endpoint is refused by OpenRouter rather than silently served elsewhere.
 * https://openrouter.ai/docs/features/provider-routing
 *
 * The managed AgenC gateway pins its own routing block (one reviewed
 * endpoint, `zdr: true`, `data_collection: "deny"`) and refuses any request
 * field it has not reviewed, so the managed route never sends one.
 */
export function openRouterExtraBody(
  config: Pick<
    OpenRouterProviderConfig,
    "zeroDataRetention" | "extraBody" | "managedRequestId"
  >,
): Readonly<Record<string, unknown>> | undefined {
  if (!openRouterSendsZeroDataRetention(config)) {
    return config.extraBody;
  }
  const existingProvider = config.extraBody?.provider;
  const provider =
    existingProvider !== null &&
    typeof existingProvider === "object" &&
    !Array.isArray(existingProvider)
      ? { ...(existingProvider as Record<string, unknown>), zdr: true }
      : { zdr: true };
  return { ...(config.extraBody ?? {}), provider };
}

export class OpenRouterProvider extends OpenAIProvider {
  readonly #model: string;
  readonly #managed: boolean;
  readonly #zeroDataRetention: boolean;

  constructor(config: OpenRouterProviderConfig) {
    const extraBody = openRouterExtraBody(config);
    super({
      ...config,
      providerName: "openrouter",
      useResponsesApi: false,
      defaultHeaders: buildOpenRouterHeaders(config.defaultHeaders),
      ...(extraBody !== undefined ? { extraBody } : {}),
    });
    this.#model = config.model;
    this.#managed = config.managedRequestId === true;
    this.#zeroDataRetention = openRouterSendsZeroDataRetention(config);
  }

  override async chat(messages: LLMMessage[], options?: LLMChatOptions) {
    try {
      return await super.chat(messages, options);
    } catch (error) {
      throw this.#explain(error, options);
    }
  }

  override async chatStream(
    messages: LLMMessage[],
    onChunk: StreamProgressCallback,
    options?: LLMChatOptions,
  ) {
    try {
      return await super.chatStream(messages, onChunk, options);
    } catch (error) {
      throw this.#explain(error, options);
    }
  }

  /**
   * A model with no zero-data-retention endpoint is refused with a 404 whose
   * hint otherwise reads like a wrong base URL. Name the setting instead. The
   * managed route keeps its own errors.
   */
  #explain(error: unknown, options: LLMChatOptions | undefined): unknown {
    if (this.#managed) return error;
    return explainOpenRouterZeroDataRetentionRefusal(error, {
      model: options?.model?.trim() || this.#model,
      requestedByAgenC: this.#zeroDataRetention,
    }) ?? error;
  }
}
