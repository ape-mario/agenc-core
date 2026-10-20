/** Generated from https://openrouter.ai/api/v1/models, verified 2026-10-20.
 * Text-output models advertising function tools; batch, routing aliases and
 * media-only models are excluded. Missing output limits and efforts stay unknown.
 * Regenerate: node runtime/scripts/generate-openrouter-catalog.mjs [snapshot.json]
 */
import { readFileSync } from 'node:fs';
import { OPENROUTER_MODEL_IDS } from './openrouter-model-ids.js';
import { frozenLazyArray } from './catalog-array.js';
import type { ReasoningEffort } from '../../session/turn-context.js';
import type { RegisteredModelCatalogEntry } from './model-catalog.js';
import { asRecord } from '../../utils/record.js';
export interface OpenRouterCatalogRow {
  readonly model: string; readonly label: string; readonly context: number;
  readonly output?: number; readonly modalities: readonly ('text' | 'image' | 'audio')[];
  readonly parameters: readonly string[]; readonly efforts: readonly ReasoningEffort[];
  readonly defaultEffort?: ReasoningEffort; readonly pricing: Readonly<Record<string, string | undefined>>;
  readonly priceOverrides?: readonly { readonly min_prompt_tokens?: number; readonly utc_start?: number; readonly utc_end?: number; readonly prompt: string; readonly completion: string; readonly input_cache_read?: string; readonly input_cache_write?: string }[];
  /** OpenRouter's announced retirement date (`expiration_date`), YYYY-MM-DD. */
  readonly expires?: string;
}
let loadedModels: readonly OpenRouterCatalogRow[] | undefined;

function loadModels(): readonly OpenRouterCatalogRow[] {
  if (loadedModels === undefined) {
    const rows: OpenRouterCatalogRow[] = JSON.parse(
      readFileSync(new URL('./openrouter-models.data.json', import.meta.url), 'utf8'),
    );
    if (rows.length !== OPENROUTER_MODEL_IDS.length ||
        rows.some((row, index) => row.model !== OPENROUTER_MODEL_IDS[index])) {
      throw new Error('OpenRouter catalog data does not match its model index');
    }
    loadedModels = Object.freeze(rows);
  }
  return loadedModels;
}

/** The same frozen array surface; full rows are read only on first access. */
export const OPENROUTER_MODELS: readonly OpenRouterCatalogRow[] = frozenLazyArray(
  OPENROUTER_MODEL_IDS.length,
  index => loadModels()[index]!,
);

const EFFORTS: ReadonlySet<string> = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

/**
 * One row of OpenRouter's public `GET /models` as a catalog row, with the
 * generator's filter (scripts/generate-openrouter-catalog.mjs): a model that
 * takes function tools and outputs text only, not a batch or `~` alias, and
 * not past its announced expiration date. Undefined for any other row.
 */
export function openRouterRowFromListing(value: unknown, today: string): OpenRouterCatalogRow | undefined {
  const row = asRecord(value);
  const architecture = asRecord(row?.architecture);
  const id = row?.id;
  const parameters = Array.isArray(row?.supported_parameters)
    ? row.supported_parameters.filter((item): item is string => typeof item === 'string') : [];
  const outputs = Array.isArray(architecture?.output_modalities) ? architecture.output_modalities : [];
  const expires = typeof row?.expiration_date === 'string' ? row.expiration_date.slice(0, 10) : undefined;
  if (typeof id !== 'string' || id.length === 0 || !parameters.includes('tools') || outputs.length !== 1 ||
      outputs[0] !== 'text' || id.endsWith(':batch') || id.startsWith('~') ||
      (expires !== undefined && expires < today)) return undefined;
  const context = typeof row?.context_length === 'number' && row.context_length > 0 ? row.context_length : undefined;
  if (context === undefined) return undefined;
  const top = asRecord(row?.top_provider);
  const output = typeof top?.max_completion_tokens === 'number' && top.max_completion_tokens > 0 ? top.max_completion_tokens : undefined;
  const inputs = Array.isArray(architecture?.input_modalities) ? architecture.input_modalities : [];
  const reasoning = asRecord(row?.reasoning);
  const efforts = (Array.isArray(reasoning?.supported_efforts) ? reasoning.supported_efforts : [])
    .filter((effort): effort is ReasoningEffort => typeof effort === 'string' && EFFORTS.has(effort));
  const defaultEffort = typeof reasoning?.default_effort === 'string' && EFFORTS.has(reasoning.default_effort)
    ? reasoning.default_effort as ReasoningEffort : undefined;
  const pricing = Object.fromEntries(Object.entries(asRecord(row?.pricing) ?? {})
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const overrides = asRecord(row?.pricing)?.overrides;
  return Object.freeze({
    model: id,
    label: typeof row?.name === 'string' ? row.name : id,
    context,
    ...(output === undefined ? {} : { output }),
    modalities: Object.freeze(inputs.filter((m): m is 'text' | 'image' | 'audio' => m === 'text' || m === 'image' || m === 'audio')),
    parameters: Object.freeze(parameters),
    efforts: Object.freeze(efforts),
    ...(defaultEffort === undefined ? {} : { defaultEffort }),
    pricing,
    ...(Array.isArray(overrides) ? { priceOverrides: overrides as OpenRouterCatalogRow['priceOverrides'] } : {}),
    ...(expires === undefined ? {} : { expires }),
  });
}

/** One OpenRouter row as a registered catalog entry (bundled or published). */
export function openRouterCatalogEntry(entry: OpenRouterCatalogRow, index: number): RegisteredModelCatalogEntry {
  return Object.freeze({
    provider: 'openrouter',
    model: entry.model,
    displayName: entry.label,
    contextWindow: entry.context,
    maxContextWindow: entry.context,
    ...(entry.output !== undefined ? { maxOutputTokens: entry.output } : {}),
    inputModalities: entry.modalities,
    supportsToolUse: true,
    // OpenRouter lists `reasoning` / `include_reasoning` for models that think.
    supportsThinking: entry.parameters.includes('reasoning') || entry.parameters.includes('include_reasoning'),
    ...(entry.expires === undefined ? {} : { retiresOn: entry.expires }),
    supportsParallelToolCalls: entry.parameters.includes('parallel_tool_calls'),
    supportsStructuredOutput: entry.parameters.includes('structured_outputs'),
    supportsSearchTool: false,
    supportsVerbosity: entry.parameters.includes('verbosity'),
    webSearchToolType: 'none',
    supportsReasoningSummaries: entry.parameters.includes('include_reasoning'),
    defaultReasoningSummary: 'none',
    supportedReasoningLevels: entry.efforts,
    ...(entry.defaultEffort !== undefined ? { defaultReasoningLevel: entry.defaultEffort } : {}),
    additionalSpeedTiers: Object.freeze([]),
    priority: index + 100,
    visibility: 'list',
  });
}
