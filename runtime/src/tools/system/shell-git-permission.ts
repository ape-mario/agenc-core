import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { findCanonicalGitRoot } from "../../utils/git.js";
import { shlexJoin } from "../../shell-command/parser.js";
import { literalGitCommands } from "../../utils/shell/git-commands.js";
import type { AdditionalPermissionProfile } from "../../sandbox/engine/index.js";

function within(root: string, target: string): boolean {
  const suffix = relative(root, target);
  return suffix !== ".." && !suffix.startsWith("../") && !isAbsolute(suffix);
}

/** Per-call metadata access for the selected workspace repository only. */
export function shellGitMutationPermission(
  command: string,
  cwd: string,
  workspaceRoot: string,
  allowWorkspaceWrites: boolean,
): { readonly command: string; readonly permissions: AdditionalPermissionProfile } | undefined {
  const git = literalGitCommands(command);
  if (!allowWorkspaceWrites || git?.mutates !== true || !existsSync("/usr/bin/git")) return undefined;
  try {
    const root = realpathSync(workspaceRoot);
    const working = realpathSync(cwd);
    if (!within(root, working)) return undefined;
    const metadata = new Set<string>();
    for (const argv of git.commands) {
      let directory = working;
      for (let at = 1; argv[at] === "-C"; at += 2) directory = resolve(directory, argv[at + 1]!);
      directory = realpathSync(directory);
      if (!within(root, directory)) return undefined;
      const repo = findCanonicalGitRoot(directory);
      if (repo === null || !within(root, realpathSync(repo))) return undefined;
      const dotGit = join(repo, ".git");
      // External linked-worktree metadata remains under its existing authority.
      if (!statSync(dotGit).isDirectory()) return undefined;
      const gitRoot = realpathSync(dotGit);
      if (!within(root, gitRoot)) return undefined;
      metadata.add(gitRoot);
    }
    return {
      command: git.commands.map((argv, index) =>
        `${index > 0 ? `${git.separators[index - 1]} ` : ""}${shlexJoin(["/usr/bin/git", ...argv.slice(1)])}`,
      ).join(" "),
      permissions: { fileSystem: { entries: [...metadata].flatMap(path => [
        { path: { kind: "path" as const, path }, access: "write" as const },
        ...["hooks", "config", "config.worktree", "info"].filter(name => existsSync(join(path, name))).map(name => ({
          path: { kind: "path" as const, path: join(path, name) }, access: "read" as const,
        })),
      ]) } },
    };
  } catch { return undefined; }
}
