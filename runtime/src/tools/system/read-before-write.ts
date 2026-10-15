import { realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { nonEmptyString } from "../../utils/stringUtils.js";
import { readToolRuntimeContext } from "../runtimes/context.js";
import type { ToolPreflightFailure } from "../types.js";
import { hasSessionRead, resolveSessionId } from "./filesystem.js";

/** Keep the recovery instruction usable for both preflight and execute-time races. */
export function readBeforeWriteMessage(paths: readonly string[]): string {
  return "File has not been read yet. Read it first before writing to it. " +
    "Call FileRead for each file, then retry the edit: " +
    [...new Set(paths)].map(file_path => `FileRead(${JSON.stringify({ file_path })})`).join("; ");
}

/**
 * Reject a known missing prerequisite before permission evaluation. This only
 * inspects file identity/metadata, never file contents, and grants no authority.
 * Paths outside the current roots also need this check: approval may widen the
 * roots later. Confinement, drift and read checks still run at the write boundary.
 * The dispatcher attaches an authenticated runtime context before preflight;
 * internal callers without it use their injected session id as at execute time.
 */
export function unreadFilePreflight(
  args: Readonly<Record<string, unknown>>,
  paths: readonly string[],
  defaultCwd: string,
): ToolPreflightFailure | null {
  const runtime = readToolRuntimeContext(args);
  const sessionId = nonEmptyString(runtime?.invocation.session.conversationId) ?? resolveSessionId(args);
  if (sessionId === undefined) return null;
  const cwd = nonEmptyString(args.cwd) ?? runtime?.invocation.turn.cwd ?? defaultCwd;
  const unread: string[] = [];
  for (const path of paths) {
    try {
      const canonical = realpathSync(resolve(cwd, path)).normalize("NFC");
      // Missing files, directories and special files have separate execute-time
      // diagnostics. In particular, creation must not require an impossible read.
      if (statSync(canonical).isFile() && !hasSessionRead(sessionId, canonical)) unread.push(canonical);
    } catch {
      // No known unmet read prerequisite. Existing path/permission gates decide.
    }
  }
  return unread.length === 0 ? null : { code: "file_read_required", message: readBeforeWriteMessage(unread) };
}
