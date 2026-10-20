/**
 * Real-kernel coverage: a workspace whose missing protected metadata path
 * (`.agenc` below a directory that has one, as for any project under a HOME
 * holding ~/.agenc) keeps workspace-write commands in the persistent session
 * sandbox. The created-path monitor gives the same guarantee as the
 * per-command Node launcher: a protected path a command creates is removed
 * and a clean exit fails.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnifiedExecProcessManager } from "../../src/unified-exec/process-manager.js";
import { SessionSandbox } from "../../src/sandbox/linux-launcher/session-sandbox.js";
import * as supervised from "../../src/utils/supervisedProcess.js";
import { permissionProfileFromRuntimePermissions, restrictedFileSystemPolicy } from "../../src/sandbox/engine/index.js";
import type { UnifiedExecRuntimeSandbox } from "../../src/unified-exec/types.js";

let base: string, work: string, manager: UnifiedExecProcessManager, policy: UnifiedExecRuntimeSandbox;
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), "protected-create-session-"));
  work = path.join(base, "work");
  fs.mkdirSync(path.join(work, "temp"), { recursive: true });
  fs.mkdirSync(path.join(base, ".agenc"));
  fs.mkdirSync(path.join(work, ".agents"));
  manager = new UnifiedExecProcessManager({ cwd: work, sessionTempRoot: path.join(work, "temp"),
    baseEnv: { PATH: "/usr/local/bin:/usr/bin:/bin" } });
  policy = { agencLinuxSandboxExe: fileURLToPath(new URL("../../bin/agenc-linux-sandbox", import.meta.url)),
    sandboxPolicyCwd: work, sessionTempRoot: path.join(work, "temp"),
    permissionProfile: permissionProfileFromRuntimePermissions(restrictedFileSystemPolicy([
      { path: { kind: "special", value: { kind: "root" } }, access: "read" },
      { path: { kind: "path", path: work }, access: "write" },
    ]), "disabled") };
});
afterEach(async () => { await manager.closeAll(); vi.restoreAllMocks(); fs.rmSync(base, { recursive: true, force: true }); });
const namespace = "readlink /proc/self/ns/pid";
function run(cmd: string, extra: Record<string, unknown> = {}) {
  return manager.execCommand({ cmd, login: false, runtimeSandbox: policy, yield_time_ms: 2000, ...extra });
}

describe.runIf(process.platform === "linux")("protected-create targets in the warm session sandbox", () => {
  it("runs workspace-write commands in one namespace and fails the one that creates a protected path", async () => {
    const launch = vi.spyOn(supervised, "spawnContainedProcess");
    const spawn = vi.spyOn(SessionSandbox.prototype, "spawn");
    const first = await run(namespace);
    const write = await run(`printf x > written; ${namespace}`);
    const created = await run("mkdir .agenc && printf ran");
    const createdThenFailed = await run("mkdir .agenc; exit 3");
    const after = await run(`test ! -e .agenc && ${namespace}`);
    expect(first.exitCode).toBe(0);
    expect(write.exitCode).toBe(0);
    expect(fs.readFileSync(path.join(work, "written"), "utf8")).toBe("x");
    // The command ran; creating the protected path failed it and it is gone.
    expect(created.stdout).toBe("ran");
    expect(created.exitCode).toBe(1);
    expect(createdThenFailed.exitCode).toBe(3);
    expect(after.exitCode).toBe(0);
    expect(fs.existsSync(path.join(work, ".agenc"))).toBe(false);
    // Every command ran in the same warm namespace: one launch in total.
    expect(write.stdout).toBe(first.stdout);
    expect(after.stdout).toBe(first.stdout);
    for (const result of spawn.mock.results) expect(await result.value).toBeDefined();
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it("removes a protected path a still-running command creates before the command ends", async () => {
    const result = await run("mkdir .agenc; sleep 0.5; test -e .agenc && echo still-there || echo removed");
    expect(result.stdout.trim()).toBe("removed");
    expect(result.exitCode).toBe(1);
    expect(fs.existsSync(path.join(work, ".agenc"))).toBe(false);
  });

  it("rebuilds the namespace for a protected path created outside it instead of removing it", async () => {
    const first = await run(namespace);
    fs.mkdirSync(path.join(work, ".agenc"));
    fs.writeFileSync(path.join(work, ".agenc", "config.toml"), "kept\n");
    const result = await run(`cat .agenc/config.toml; touch .agenc/new 2>/dev/null && echo writable || echo protected; ${namespace}`);
    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trim().split("\n");
    expect(lines[0]).toBe("kept");
    expect(lines[1]).toBe("protected");
    expect(lines[2]).not.toBe(first.stdout.trim());
    expect(fs.readFileSync(path.join(work, ".agenc", "config.toml"), "utf8")).toBe("kept\n");
    expect(fs.existsSync(path.join(work, ".agenc", "new"))).toBe(false);
  });

  it("keeps git work in the warm namespace and refuses its narrowed .git carve-outs", async () => {
    execFileSync("git", ["init", "-q", "-b", "main", work], { stdio: "ignore" });
    const first = await run(namespace);
    const git = "git -c user.email=t@example.test -c user.name=T -c commit.gpgsign=false";
    const commit = await run(`printf x > tracked.txt && ${git} add tracked.txt && ${git} commit -qm init && ${git} switch -qc topic && git rev-parse --verify HEAD >/dev/null && ${namespace}`);
    const pointer = await run("printf ../elsewhere > .git/commondir; printf done");
    const modules = await run("mkdir .git/modules && printf done");
    expect(first.exitCode).toBe(0);
    expect(commit.exitCode, commit.stderr).toBe(0);
    expect(commit.stdout).toBe(first.stdout);
    for (const result of [pointer, modules]) {
      expect(result.stdout).toBe("done");
      expect(result.exitCode).toBe(1);
    }
    expect(fs.existsSync(path.join(work, ".git", "commondir"))).toBe(false);
    expect(fs.existsSync(path.join(work, ".git", "modules"))).toBe(false);
  });

  it("gives per-command launches the same guarantee", async () => {
    // Without a delegated cgroup the per-command route is the direct
    // bubblewrap plan (which now carries the monitored targets); with one it
    // is the Node launcher. Either way the protected path is removed and the
    // clean exit fails.
    const perCommand = { ...policy, persistentSession: false };
    const ok = await run("printf fine", { runtimeSandbox: perCommand });
    const created = await run("mkdir .agenc && printf ran", { runtimeSandbox: perCommand });
    expect(ok.exitCode).toBe(0);
    expect(created.stdout).toBe("ran");
    expect(created.exitCode).toBe(1);
    expect(fs.existsSync(path.join(work, ".agenc"))).toBe(false);
  });
});
