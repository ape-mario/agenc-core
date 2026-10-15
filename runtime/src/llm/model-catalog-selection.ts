import type { AgenCConfig } from "../config/schema.js";
import {
  BUILT_IN_PROVIDER_MODEL_CATALOG,
  providerLocalModelIdFromCatalog,
  type BuiltInProviderSlug,
} from "./registry/provider-info.js";
import { listRegisteredModelCatalogEntries } from "./registry/model-catalog.js";
import { hasDynamicProviderModelCatalog } from "./model-metadata.js";

function editDistance(input: string, candidate: string): number {
  let previous = Array.from({ length: candidate.length + 1 }, (_, i) => i);
  for (let i = 1; i <= input.length; i++) {
    const row = [i];
    for (let j = 1; j <= candidate.length; j++) {
      row[j] = Math.min(
        row[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + (input[i - 1] === candidate[j - 1] ? 0 : 1),
      );
    }
    previous = row;
  }
  return previous[candidate.length]!;
}

/** Validate resolved intent before an interactive switch or startup mutates state. */
export function assertModelCatalogSelection(
  config: AgenCConfig,
  provider: BuiltInProviderSlug,
  model: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (hasDynamicProviderModelCatalog(config, provider, env)) return;
  // Explicit operator mappings can name private deployments and Bedrock
  // inference profiles. They are user-defined routes, not spelling guesses.
  if (Object.values(config.modelOverrides ?? {}).includes(model)) return;
  const models = BUILT_IN_PROVIDER_MODEL_CATALOG[provider].map(
    (entry) => providerLocalModelIdFromCatalog(provider, entry),
  );
  if (models.includes(model) || listRegisteredModelCatalogEntries(provider).some(
    (entry) => entry.model === model,
  )) return;

  let closest: string | undefined;
  let distance = Infinity;
  for (const candidate of models) {
    const score = editDistance(model.toLowerCase(), candidate.toLowerCase());
    if (score < distance) {
      closest = candidate;
      distance = score;
    }
  }
  throw new Error(
    `unknown model '${model}' for provider '${provider}'.` +
    (closest === undefined ? "" : ` did you mean '${closest}'?`),
  );
}
