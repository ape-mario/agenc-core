import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { literalGitCommands } from "../../../src/utils/shell/git-commands.js";
import { shellGitMutationPermission } from "../../../src/tools/system/shell-git-permission.js";
import { classifyShellWorkspaceWritePolicy } from "../../../src/llm/shell-write-policy.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe("workspace Git command grants", () => {
  it("keeps command separators and rejects another program or active expansion", () => {
    expect(literalGitCommands('git add a; git commit -m "message"')?.separators).toEqual([";"]);
    for (const cmd of ['git add a && echo bad > .git/hooks/bad', 'git add "$(touch .git/config)"', 'git -c alias.bad=bad commit', 'git -C "$OUTSIDE" add a']) {
      expect(literalGitCommands(cmd)).toBeUndefined();
    }
    expect(literalGitCommands("git status")?.mutates).toBe(false);
    expect(literalGitCommands("git branch")?.mutates).toBe(false);
  });
  it("requires edit consent and preserves protected Git paths", () => {
    const root = mkdtempSync(join(tmpdir(), "shell-git-permission-")); roots.push(root);
    mkdirSync(join(root, ".git/hooks"), { recursive: true });
    mkdirSync(join(root, ".git/objects")); mkdirSync(join(root, ".git/refs"));
    writeFileSync(join(root, ".git/HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(root, ".git/config"), "[core]\n");
    expect(shellGitMutationPermission("git add file", root, root, false)).toBeUndefined();
    const permission = shellGitMutationPermission("git add file", root, root, true);
    expect(permission?.command).toContain("/usr/bin/git");
    expect(permission?.permissions.fileSystem?.entries).toContainEqual({path:{kind:"path",path:join(root,".git/hooks")},access:"read"});
    expect(shellGitMutationPermission("git -C .. add file", root, root, true)).toBeUndefined();
    expect(classifyShellWorkspaceWritePolicy({toolName:"exec_command",args:{command:"git add file"},workspaceRoot:root}).blocked).toBe(true);
    expect(classifyShellWorkspaceWritePolicy({toolName:"exec_command",args:{command:"git add file"},workspaceRoot:root,allowWorkspaceWrites:true}).blocked).toBe(false);
    expect(classifyShellWorkspaceWritePolicy({toolName:"exec_command",args:{command:"echo bad > .git/hooks/bad"},workspaceRoot:root,allowWorkspaceWrites:true}).blocked).toBe(true);
  });
});
