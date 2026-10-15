/**
 * Turn-scoped durability.
 *
 * Between the steps of a turn, a record only has to survive the process
 * dying (a crash, an OOM kill, a daemon restart), and a completed write()
 * already does: its bytes are in the kernel. So while a turn runs, its
 * canonical journal, snapshot and SQLite writes complete their write() in
 * order, before the next model request and before the step's tools run, and
 * do not wait on fsync (F_FULLFSYNC on macOS). Power-loss and kernel-panic
 * durability comes from a synchronous flush at each turn boundary (complete,
 * aborted, failed) and from a background flush that runs at most
 * {@link DEFERRED_SYNC_INTERVAL_MS} after the oldest write it covers.
 *
 * This module holds the process-wide part: which turns are open, and the
 * SQLite write-ahead logs whose commits skipped their sync. Each canonical
 * journal tracks its own unsynced bytes (`SessionStore.deferSyncsForTurn`).
 *
 * @module
 */

import { closeSync, constants as fsConstants, fdatasync, fdatasyncSync, openSync } from "node:fs";

/** The longest a written record waits for its background flush. */
export const DEFERRED_SYNC_INTERVAL_MS = 1_000;

/** How a turn ends its scope: a turn boundary flushes; a hand-off does not. */
export type TurnDurabilityRelease = (mode?: "sync" | "background") => void;

const openTurns = new Map<string, number>();
// SQLite write-ahead logs that hold commits made without their sync, in the
// order they first did.
const unsyncedWals = new Set<string>();
let walTimer: ReturnType<typeof setTimeout> | undefined;
let walFlushInFlight = false;

/**
 * Open a turn's durability scope for `ownerId` (the conversation id). Scopes
 * nest. Releasing the last one with "sync" (a turn boundary) flushes every
 * SQLite log written without its sync; "background" leaves that to the timer.
 */
export function openTurnDurabilityScope(ownerId: string): TurnDurabilityRelease {
  openTurns.set(ownerId, (openTurns.get(ownerId) ?? 0) + 1);
  let released = false;
  return (mode = "sync") => {
    if (released) return;
    released = true;
    const remaining = (openTurns.get(ownerId) ?? 1) - 1;
    if (remaining > 0) openTurns.set(ownerId, remaining);
    else openTurns.delete(ownerId);
    if (mode === "sync") flushUnsyncedSqliteWals();
    else armWalFlush();
  };
}

/** Whether a turn of `ownerId` is running in this process. */
export function turnDurabilityOpen(ownerId: string): boolean {
  return openTurns.has(ownerId);
}

/**
 * Whether SQLite commits made now may skip their sync. Only on Linux, where a
 * FULL commit costs a device flush of the log. On macOS SQLite's FULL commit
 * is a plain fsync that does not flush the drive cache (its fullfsync pragma
 * is off) and costs about 0.04 ms, so it stays as it is; other platforms are
 * unchanged.
 */
export function sqliteCommitsDeferSync(
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform === "linux" && openTurns.size > 0;
}

/** Record that a commit to the database behind `walPath` skipped its sync. */
export function noteUnsyncedSqliteWal(walPath: string): void {
  unsyncedWals.add(walPath);
  armWalFlush();
}

/** Flush every SQLite log written without its sync (a turn boundary). */
export function flushUnsyncedSqliteWals(): void {
  if (walTimer !== undefined) {
    clearTimeout(walTimer);
    walTimer = undefined;
  }
  for (const walPath of [...unsyncedWals]) {
    unsyncedWals.delete(walPath);
    try {
      syncFile(walPath);
    } catch {
      // A log that is gone was checkpointed and removed: nothing is left to
      // flush. Any other failure is retried by the background flush, as the
      // next commit would have hit the same disk.
      if (existsAsFile(walPath)) unsyncedWals.add(walPath);
    }
  }
  if (unsyncedWals.size > 0) armWalFlush();
}

function armWalFlush(): void {
  if (walTimer !== undefined || unsyncedWals.size === 0) return;
  walTimer = setTimeout(() => {
    walTimer = undefined;
    flushUnsyncedSqliteWalsInBackground();
  }, DEFERRED_SYNC_INTERVAL_MS);
  walTimer.unref?.();
}

function flushUnsyncedSqliteWalsInBackground(): void {
  if (walFlushInFlight) {
    armWalFlush();
    return;
  }
  const paths = [...unsyncedWals];
  unsyncedWals.clear();
  if (paths.length === 0) return;
  walFlushInFlight = true;
  let pending = paths.length;
  const done = (): void => {
    pending -= 1;
    if (pending > 0) return;
    walFlushInFlight = false;
    armWalFlush();
  };
  for (const walPath of paths) {
    let fd: number;
    try {
      fd = openSync(walPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    } catch {
      done();
      continue;
    }
    // The flush runs on the libuv pool: the event loop never waits on it.
    fdatasync(fd, (error) => {
      try {
        closeSync(fd);
      } catch {
        // The descriptor is ours alone; a failed close leaves nothing to undo.
      }
      if (error !== null) unsyncedWals.add(walPath);
      done();
    });
  }
}

function syncFile(path: string): void {
  const fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    fdatasyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function existsAsFile(path: string): boolean {
  try {
    closeSync(openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)));
    return true;
  } catch {
    return false;
  }
}

/** @internal Test seam: forget every open scope and unsynced log. */
export function resetTurnDurabilityForTest(): void {
  openTurns.clear();
  unsyncedWals.clear();
  if (walTimer !== undefined) clearTimeout(walTimer);
  walTimer = undefined;
  walFlushInFlight = false;
}
