import { closeSync, fstatSync, mkdirSync, renameSync } from "node:fs";
import fsPromises, { mkdtemp, rm, symlink } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openStartupResumeCwd } from "../../src/state/startup-resume-cwd.js";

let root: string;
beforeEach(async () => {
  root = await fsPromises.realpath(await mkdtemp(join(tmpdir(), "agenc-startup-cwd-")));
});
afterEach(async () => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  await rm(root, { recursive: true, force: true });
});

describe("startup workspace pinning", () => {
  it("pins the exact directory identity", async () => {
    const proof = await openStartupResumeCwd(root);
    try {
      const stats = fstatSync(proof.fd, { bigint: true });
      expect(proof.identity).toEqual({ dev: String(stats.dev), ino: String(stats.ino) });
      expect(stats.isDirectory()).toBe(true);
    } finally {
      closeSync(proof.fd);
    }
  });

  it("rejects missing paths and symlinks", async () => {
    await expect(openStartupResumeCwd(join(root, "missing"))).rejects.toMatchObject({ code: "ENOENT" });
    const link = join(root, "link");
    await symlink(root, link);
    await expect(openStartupResumeCwd(link)).rejects.toThrow("non-symlink directory");
  });

  it("rejects replacement during pinning and closes the directory fd", async () => {
    const cwd = join(root, "workspace");
    mkdirSync(cwd);
    let openedFd: number | undefined;
    await expect(openStartupResumeCwd(cwd, {
      afterOpenForTestingOnly: (_cwd, fd) => {
        openedFd = fd;
        renameSync(cwd, join(root, "old-workspace"));
        mkdirSync(cwd);
      },
    })).rejects.toThrow("changed while pinned");
    expect(() => fstatSync(openedFd!)).toThrow(expect.objectContaining({ code: "EBADF" }));
  });

  it("bounds a filesystem operation that never resolves", async () => {
    vi.spyOn(fsPromises, "lstat").mockImplementation(() => new Promise(() => {}));
    syncBuiltinESMExports();
    await expect(openStartupResumeCwd(root, { timeoutMs: 20 })).rejects.toThrow("timed out after 20ms");
  });

  it("closes an opened fd when a timed out operation returns late", async () => {
    const originalLstat = fsPromises.lstat;
    let releaseStat: (() => void) | undefined;
    let calls = 0;
    vi.spyOn(fsPromises, "lstat").mockImplementation((...args) => {
      calls += 1;
      if (calls === 2) {
        return new Promise((resolve, reject) => {
          releaseStat = () => Reflect.apply(originalLstat, fsPromises, args).then(resolve, reject);
        });
      }
      return Reflect.apply(originalLstat, fsPromises, args);
    });
    syncBuiltinESMExports();
    let openedFd: number | undefined;
    await expect(openStartupResumeCwd(root, {
      timeoutMs: 100,
      afterOpenForTestingOnly: (_cwd, fd) => { openedFd = fd; },
    })).rejects.toThrow("timed out");
    expect(releaseStat).toBeTypeOf("function");
    releaseStat!();
    await vi.waitFor(() => {
      expect(() => fstatSync(openedFd!)).toThrow(expect.objectContaining({ code: "EBADF" }));
    });
  });

  it("aborts a blocked workspace without waiting for its deadline", async () => {
    const controller = new AbortController();
    const blocked = vi.spyOn(fsPromises, "lstat").mockImplementation(() => new Promise(() => {}));
    syncBuiltinESMExports();
    const pin = openStartupResumeCwd(root, { signal: controller.signal });
    expect(blocked).toHaveBeenCalledOnce();
    controller.abort(new Error("daemon shutdown"));
    await expect(pin).rejects.toThrow("daemon shutdown");
    await expect(openStartupResumeCwd(root, { signal: controller.signal })).rejects.toThrow("daemon shutdown");
    expect(blocked).toHaveBeenCalledOnce();
  });
});
