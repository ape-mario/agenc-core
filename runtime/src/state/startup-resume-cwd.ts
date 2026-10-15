import { close, constants, fstat, open } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";

import { hasSupportedFileIdentity } from "../session/session-store.js";

const openAsync = promisify(open);
const closeAsync = promisify(close);
const fstatAsync = promisify(fstat);

export const STARTUP_RESUME_CWD_TIMEOUT_MS = 10_000;

export interface StartupResumeCwd {
  readonly fd: number;
  readonly identity: { readonly dev: string; readonly ino: string };
}

/**
 * Workspace syscalls can wait for macOS privacy consent or a remote mount.
 * Keep them off the JS thread and bound the caller's wait. Native operations
 * cannot be cancelled, so an open that returns late must close its descriptor.
 */
export async function openStartupResumeCwd(
  cwd: string,
  options: {
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
    readonly afterOpenForTestingOnly?: (cwd: string, fd: number) => void;
  } = {},
): Promise<StartupResumeCwd> {
  const deadline = new AbortController();
  const signal =
    options.signal === undefined
      ? deadline.signal
      : AbortSignal.any([deadline.signal, options.signal]);
  signal.throwIfAborted();
  const timeoutMs = options.timeoutMs ?? STARTUP_RESUME_CWD_TIMEOUT_MS;
  const timer = setTimeout(() => {
    deadline.abort(
      new Error(`startup resume workspace timed out after ${timeoutMs}ms`),
    );
  }, timeoutMs);
  timer.unref?.();
  try {
    return await new Promise<StartupResumeCwd>((resolveProof, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      void pinCwd(cwd, signal, options.afterOpenForTestingOnly).then(
        (proof) => {
          signal.removeEventListener("abort", onAbort);
          if (signal.aborted) {
            // The abort can win between pinCwd returning and this callback.
            void closeAsync(proof.fd).catch(() => {});
            reject(signal.reason);
          } else {
            resolveProof(proof);
          }
        },
        (error: unknown) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
  } finally {
    clearTimeout(timer);
  }
}

async function pinCwd(
  cwd: string,
  signal: AbortSignal,
  afterOpenForTestingOnly?: (cwd: string, fd: number) => void,
): Promise<StartupResumeCwd> {
  if (!isAbsolute(cwd) || resolve(cwd) !== cwd) {
    throw new Error("canonical startup resume cwd is not absolute and normalized");
  }
  const before = await lstat(cwd, { bigint: true });
  signal.throwIfAborted();
  if (
    !before.isDirectory() ||
    before.isSymbolicLink() ||
    !hasSupportedFileIdentity(before) ||
    (await realpath(cwd)) !== cwd
  ) {
    throw new Error("canonical startup resume cwd is not a supported non-symlink directory");
  }
  signal.throwIfAborted();
  const fd = await openAsync(
    cwd,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_DIRECTORY ?? 0),
  );
  try {
    signal.throwIfAborted();
    const opened = await fstatAsync(fd, { bigint: true });
    signal.throwIfAborted();
    afterOpenForTestingOnly?.(cwd, fd);
    const after = await lstat(cwd, { bigint: true });
    signal.throwIfAborted();
    if (
      !opened.isDirectory() ||
      !after.isDirectory() ||
      after.isSymbolicLink() ||
      !hasSupportedFileIdentity(opened) ||
      !hasSupportedFileIdentity(after) ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.dev !== after.dev ||
      opened.ino !== after.ino ||
      (await realpath(cwd)) !== cwd
    ) {
      throw new Error("canonical startup resume cwd changed while pinned");
    }
    signal.throwIfAborted();
    return {
      fd,
      identity: { dev: opened.dev.toString(10), ino: opened.ino.toString(10) },
    };
  } catch (error) {
    await closeAsync(fd);
    throw error;
  }
}
