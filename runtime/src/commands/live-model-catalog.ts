/**
 * The provider's own model rows for the TUI process.
 *
 * The session runs in the daemon, which reads Venice's, Ollama Cloud's and
 * OpenRouter's live lists when it starts. The TUI process decides what
 * `/effort` offers and what the status line shows from the same registered
 * catalog, so it reads those lists too before it answers: Venice with the
 * session's key (through the menu loader), Ollama Cloud and OpenRouter from
 * their public endpoints. Best effort: the bundled rows answer offline.
 *
 * @module
 */

import { readCommandConfig, providerEnvironmentFromCommandContext } from "./config-context.js";
import { loadVeniceMenuModels } from "./venice-menu-models.js";
import { ModelMetadataResolver } from "../llm/model-metadata.js";
import type { SlashCommandContext } from "./types.js";

/** One read per provider and model is reused this long. */
const REUSE_MS = 10 * 60_000;
const DISCOVERY_TIMEOUT_MS = 5_000;
const fresh = new Map<string, number>();

export async function ensureLiveModelCatalog(
  ctx: SlashCommandContext,
  provider: string,
  model: string,
  options: { readonly fetchImpl?: typeof fetch } = {},
): Promise<void> {
  if (provider !== "venice" && provider !== "ollama-cloud" && provider !== "openrouter") return;
  const key = `${provider}\n${provider === "ollama-cloud" ? model : ""}`;
  const at = fresh.get(key);
  if (at !== undefined && Date.now() - at < REUSE_MS) return;
  try {
    if (provider === "venice") {
      const result = await loadVeniceMenuModels(ctx, options);
      if (result.source === "live") fresh.set(key, Date.now());
      return;
    }
    let env: Readonly<Record<string, string | undefined>> = {};
    try {
      env = providerEnvironmentFromCommandContext(ctx);
    } catch {
      // Public endpoints answer without a key.
    }
    const resolver = new ModelMetadataResolver({
      fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      env,
      timeoutMs: DISCOVERY_TIMEOUT_MS,
    });
    const found = provider === "ollama-cloud"
      ? (await resolver.discoverOllamaCloudModels(readCommandConfig(ctx) ?? {}, model)) !== undefined
      : await resolver.discoverOpenRouterModels();
    if (found) fresh.set(key, Date.now());
  } catch {
    // The bundled catalog answers while the provider's list cannot be read.
  }
}
