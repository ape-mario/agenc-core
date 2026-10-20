import { OpenAIProvider } from "../openai/adapter.js";
import type { OpenAIProviderConfig } from "../openai/types.js";
import type { LLMChatOptions } from "../../types.js";
import { OLLAMA_CLOUD_BASE_URL } from "../../registry/ollama-cloud-models.js";
import { ModelMetadataResolver } from "../../model-metadata.js";

/** Direct Cloud inference, independent of the local Ollama daemon. */
export class OllamaCloudProvider extends OpenAIProvider {
  readonly #model: string;
  readonly #metadata: ModelMetadataResolver;

  constructor(config: OpenAIProviderConfig) {
    if (config.baseURL !== undefined && config.baseURL.replace(/\/+$/, "") !== OLLAMA_CLOUD_BASE_URL) {
      throw new Error(`Ollama Cloud requires ${OLLAMA_CLOUD_BASE_URL}`);
    }
    const fetchImpl = config.fetchImpl ?? fetch;
    const pinnedFetch: typeof fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin !== "https://ollama.com") {
        throw new Error("Ollama Cloud requests must stay on https://ollama.com");
      }
      return fetchImpl(input, { ...init, redirect: "error" });
    };
    super({
      ...config,
      baseURL: OLLAMA_CLOUD_BASE_URL,
      providerName: "ollama-cloud",
      useResponsesApi: false,
      authMode: "api_key",
      oauth: undefined,
      fetchImpl: pinnedFetch,
    });
    this.#model = config.model;
    this.#metadata = new ModelMetadataResolver({
      fetchImpl: pinnedFetch,
      env: config.apiKey === undefined ? {} : { OLLAMA_API_KEY: config.apiKey },
      timeoutMs: 5_000,
    });
  }

  /**
   * Read Ollama's own row for the model (`/api/tags`, `/api/show`) before
   * admission, so capability flags and effort levels are the live ones for
   * a model the bundled snapshot does not know. Best effort.
   */
  override async getExecutionProfile(options?: LLMChatOptions) {
    try {
      await this.#metadata.discoverOllamaCloudModels({}, options?.model?.trim() || this.#model);
    } catch {
      // The bundled rows answer while Ollama's list cannot be read.
    }
    return super.getExecutionProfile(options);
  }
}
