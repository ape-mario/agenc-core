import { createHash } from "node:crypto";
import { resolve } from "node:path";

export function normalizePromptCacheKey(key: string): string {
  // Preserve existing cache routing unless the key exceeds the wire limit.
  return key.length <= 64
    ? key
    : createHash("sha256").update(key).digest("hex");
}

/**
 * The prompt-cache scope of one local user: every session of one AgenC home
 * gets the same key, and different homes (users) get different keys, so the
 * provider keeps separate cache accounting per user, as its guide asks,
 * without separating one user's sessions from each other. The home path is
 * hashed, never sent.
 */
export function promptCacheScopeKeyForHome(agencHome: string): string {
  const digest = createHash("sha256")
    .update(`agenc-prompt-cache-scope-v1\0${resolve(agencHome)}`)
    .digest("hex")
    .slice(0, 32);
  return `agenc-${digest}`;
}
