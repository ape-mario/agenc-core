/**
 * OpenRouter's zero-data-retention endpoint list for the `/providers` and
 * `/model` menus.
 *
 * Zero data retention is on by default for the user's own OpenRouter key
 * (llm/providers/openrouter/zero-data-retention.ts), so OpenRouter refuses a
 * model that has no qualifying endpoint. The menus read OpenRouter's list
 * (`GET <base URL>/endpoints/zdr`, public, no key) and show such models as
 * unavailable, with the setting that turns it off. The list is read from the
 * OpenRouter endpoint the session uses. A list that cannot be read marks
 * nothing; the request still carries `provider.zdr`.
 *
 * @module
 */

import { resolveProviderSettings } from "../config/resolve-provider.js";
import {
  openRouterZdrEndpointsUrl,
  openRouterZeroDataRetentionEnabled,
  parseOpenRouterZdrModels,
} from "../llm/providers/openrouter/zero-data-retention.js";
import { BUILT_IN_PROVIDER_BASE_URLS } from "../llm/registry/provider-info.js";
import {
  providerEnvironmentFromCommandContext,
  readCommandConfig,
} from "./config-context.js";
import type { SlashCommandContext } from "./types.js";

/** Shown under the OpenRouter models when the list could not be read. */
export const OPENROUTER_ZDR_LIST_UNAVAILABLE_NOTE =
  "Could not read OpenRouter's zero data retention list, so no model is marked.";

/** A list read from OpenRouter is reused this long before the menu asks again. */
const LIST_REUSE_MS = 10 * 60_000;
/** The menu shows progress while it waits. */
const LIST_TIMEOUT_MS = 10_000;
/** The list was about 1.4 MB on 2026-10-22. */
const MAX_LIST_CHARS = 32 * 1024 * 1024;
const MAX_REMEMBERED_LISTS = 4;

const remembered = new Map<string, { readonly at: number; readonly models: ReadonlySet<string> }>();
const inFlight = new Map<string, Promise<ReadonlySet<string> | undefined>>();

/** Whether this context's OpenRouter requests carry `provider.zdr`. */
export function openRouterZeroDataRetentionOn(ctx: SlashCommandContext): boolean {
  return openRouterZeroDataRetentionEnabled(readCommandConfig(ctx));
}

/** The list's URL on the OpenRouter endpoint this context's session uses. */
function listUrl(ctx: SlashCommandContext): string {
  let environment: Readonly<Record<string, string | undefined>> = {};
  try {
    environment = providerEnvironmentFromCommandContext(ctx);
  } catch {
    // Without a captured environment the configured or default endpoint answers.
  }
  const baseURL =
    resolveProviderSettings("openrouter", readCommandConfig(ctx) ?? {}, environment)?.baseURL ??
    BUILT_IN_PROVIDER_BASE_URLS.openrouter;
  return openRouterZdrEndpointsUrl(baseURL);
}

function fresh(url: string): ReadonlySet<string> | undefined {
  const entry = remembered.get(url);
  return entry !== undefined && Date.now() - entry.at < LIST_REUSE_MS ? entry.models : undefined;
}

/**
 * The model ids with a zero-data-retention endpoint, as last read for this
 * context's endpoint while fresh. Synchronous and offline: menus call it
 * while they render; `loadOpenRouterZdrModels` does the asking.
 */
export function readOpenRouterZdrModels(ctx: SlashCommandContext): ReadonlySet<string> | undefined {
  if (remembered.size === 0) return undefined;
  return fresh(listUrl(ctx));
}

/** Read OpenRouter's list, reusing a fresh answer. Undefined when it cannot be read. */
export async function loadOpenRouterZdrModels(
  ctx: SlashCommandContext,
  options: { readonly fetchImpl?: typeof fetch } = {},
): Promise<ReadonlySet<string> | undefined> {
  const url = listUrl(ctx);
  const known = fresh(url);
  if (known !== undefined) return known;
  const pending = inFlight.get(url);
  if (pending !== undefined) return await pending;
  const request = readList(url, options.fetchImpl ?? globalThis.fetch);
  inFlight.set(url, request);
  try {
    return await request;
  } finally {
    inFlight.delete(url);
  }
}

async function readList(url: string, fetchImpl: typeof fetch): Promise<ReadonlySet<string> | undefined> {
  let models: ReadonlySet<string> | undefined;
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    const text = await response.text();
    if (text.length > MAX_LIST_CHARS) return undefined;
    models = parseOpenRouterZdrModels(JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
  if (models === undefined) return undefined;
  remembered.delete(url);
  remembered.set(url, { at: Date.now(), models });
  while (remembered.size > MAX_REMEMBERED_LISTS) {
    remembered.delete(remembered.keys().next().value!);
  }
  return models;
}

/** Test seam: forget every list read so far. */
export function clearOpenRouterZdrModels(): void {
  remembered.clear();
  inFlight.clear();
}
