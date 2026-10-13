import { isShellCommandSeparator, lexShellCommand } from "./command-line.js";

const MUTATIONS = new Set([
  "add", "mv", "rm", "commit", "checkout", "switch", "branch", "reset",
  "restore", "merge", "rebase", "cherry-pick", "revert", "tag", "stash",
  "clean", "fetch", "pull", "push",
]);
const READS = new Set(["status", "log", "show", "diff", "rev-parse", "ls-files", "ls-tree"]);

/** A grant applies only to literal Git invocations, never another shell program. */
export function literalGitCommands(command: string): {
  readonly commands: readonly (readonly string[])[];
  readonly separators: readonly string[];
  readonly mutates: boolean;
} | undefined {
  const parsed = lexShellCommand(command);
  if (parsed.malformed || parsed.hasComment || parsed.hasCommandSubstitution) return undefined;
  const commands: string[][] = [];
  const separators: string[] = [];
  let words: string[] = [];
  for (const token of parsed.tokens) {
    if (isShellCommandSeparator(token) && (token.value === "&&" || token.value === ";")) {
      if (words.length === 0) return undefined;
      commands.push(words); separators.push(token.value); words = [];
    } else if (token.kind === "word" && !token.requiresExpansion) {
      words.push(token.value);
    } else return undefined;
  }
  if (words.length > 0) commands.push(words);
  if (commands.length === 0) return undefined;
  let mutates = false;
  for (const argv of commands) {
    if (!["git", "/usr/bin/git", "/bin/git"].includes(argv[0]!)) return undefined;
    let at = 1;
    while (argv[at] === "-C" && argv[at + 1] !== undefined) at += 2;
    const subcommand = argv[at];
    if (subcommand === undefined || (!MUTATIONS.has(subcommand) && !READS.has(subcommand))) return undefined;
    const listsOnly = ((subcommand === "branch" || subcommand === "tag") &&
      (argv.length === at + 1 || argv[at + 1] === "--list" || argv[at + 1] === "-l")) ||
      (subcommand === "stash" && ["list", "show"].includes(argv[at + 1] ?? ""));
    mutates ||= MUTATIONS.has(subcommand) && !listsOnly;
  }
  return { commands, separators, mutates };
}
