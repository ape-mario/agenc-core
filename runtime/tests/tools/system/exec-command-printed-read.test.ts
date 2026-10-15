import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vitest";

import { createExecCommandTool, PRINTED_READ_MAX_VISIBLE_BYTES, recordPrintedFileReads } from "./exec-command.js";
import { formatUnifiedExecToolContent } from "./exec-result-format.js";
import { createFileEditTool } from "./file-edit.js";
import { getSessionReadSnapshot, hasSessionRead, SESSION_ID_ARG } from "./filesystem.js";
import { MIN_TOOL_RESULT_BYTES } from "../execution.js";
import { bindExplicitDangerBoundary } from "../../helpers/explicit-danger-boundary.js";
import { UnifiedExecProcessManager } from "../../unified-exec/process-manager.js";
import type { ExecCommandToolOutput } from "../../unified-exec/types.js";

// Standard sessions count a workspace file as read when a command printed its
// exact current text, whatever shell construct printed it. In the agent race
// DeepSeek read the sources with `for f in src/*.js; do ... cat -n "$f"; done`
// in 4 of 6 standard runs; every first Edit was then refused and the model
// paid a FileRead round trip plus a resent edit. Light keeps its stricter
// parser (exec-command-cat-read*.test.ts).

let root: string;
let session: string;
let counter = 0;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "agenc-printed-read-")));
  counter += 1;
  session = `session-printed-read-${process.pid}-${counter}`;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function finished(stdout: string, overrides: Partial<ExecCommandToolOutput> = {}): ExecCommandToolOutput {
  return {
    output: stdout, stdout, stderr: "", exitCode: 0, exit_code: 0, durationMs: 1,
    wall_time_seconds: 0.001, timedOut: false, truncated: false, original_token_count: 1, ...overrides,
  };
}

async function record(cmd: string, output: ExecCommandToolOutput, cwd = root): Promise<void> {
  await recordPrintedFileReads({
    cmd, output, visible: formatUnifiedExecToolContent(output), cwd, allowedPaths: [root],
    args: { [SESSION_ID_ARG]: session },
  });
}

function catN(text: string): string {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines.map((line, index) => `${String(index + 1).padStart(6, " ")}\t${line}\n`).join("");
}

const MONEY = "export function toCents(amount) {\n  return Math.floor(amount * 100);\n}\n";
const SPLIT = "export function splitCents(total, parts) {\n  throw new Error(\"todo\");\n}\n";

test("a for loop over a glob with cat -n records a full read of every printed file", async () => {
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "money.js"), MONEY, "utf8");
  await writeFile(join(root, "src", "split.js"), SPLIT, "utf8");
  await record(
    `cd ${root} && for f in src/*.js src/**/*.js; do echo "===== $f ====="; cat -n "$f"; done 2>/dev/null`,
    finished(`===== src/money.js =====\n${catN(MONEY)}===== src/split.js =====\n${catN(SPLIT)}`, { exitCode: 1, exit_code: 1 }),
  );
  expect(getSessionReadSnapshot(session, join(root, "src", "money.js"))).toMatchObject({ viewKind: "full", rawContent: MONEY });
  expect(hasSessionRead(session, join(root, "src", "split.js"))).toBe(true);
});

test("a raw cat in a cd chain records the file relative to the cd target", async () => {
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "money.js"), MONEY, "utf8");
  await record("cd src && cat money.js", finished(MONEY));
  expect(hasSessionRead(session, join(root, "src", "money.js"))).toBe(true);
});

test("output that is not the whole current text, or an incomplete command, records nothing", async () => {
  await writeFile(join(root, "a.js"), MONEY, "utf8");
  const cases: Array<[string, ExecCommandToolOutput]> = [
    ["cat a.js", finished(MONEY.slice(0, 20))],
    ["head -n 1 a.js", finished("export function toCents(amount) {\n")],
    ["cat a.js", finished(MONEY, { truncated: true })],
    ["cat a.js", finished(MONEY, { timedOut: true })],
    ["cat a.js", finished(MONEY, { exitCode: null, exit_code: null })],
    ["cat a.js", finished(MONEY, { exitCode: null, exit_code: null, session_id: 7 })],
    // The text is printed, but the command does not name the file.
    ["cat other.js", finished(MONEY)],
  ];
  for (const [cmd, output] of cases) await record(cmd, output);
  expect(getSessionReadSnapshot(session, join(root, "a.js"))).toBeUndefined();
});

test("a quoted mention or a short file proves nothing", async () => {
  await writeFile(join(root, "a.js"), MONEY, "utf8");
  await writeFile(join(root, "short.txt"), "old\n", "utf8");
  // The file name only appears inside a quoted argument, so the command never read it.
  await record(`printf '%s\\n' '; cat a.js;'; printf '%s' '${MONEY}'`, finished(`; cat a.js;\n${MONEY}`));
  // A few bytes can appear in any output by coincidence.
  await record("cat short.txt", finished("old\n"));
  // The text must start a line of the output.
  await record("cat a.js", finished(`prefix ${MONEY}`));
  expect(getSessionReadSnapshot(session, join(root, "a.js"))).toBeUndefined();
  expect(getSessionReadSnapshot(session, join(root, "short.txt"))).toBeUndefined();
});

test("a file outside the workspace is never recorded", async () => {
  const outside = await realpath(await mkdtemp(join(tmpdir(), "agenc-printed-outside-")));
  try {
    await writeFile(join(outside, "secret.txt"), "token\n", "utf8");
    await record(`cat ${join(outside, "secret.txt")}`, finished("token\n"));
    await record(`for f in ${outside}/*.txt; do cat "$f"; done`, finished("token\n"));
    expect(getSessionReadSnapshot(session, join(outside, "secret.txt"))).toBeUndefined();
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});

test("an Edit after a printed read passes the read-before-write gate", async () => {
  await mkdir(join(root, "src"));
  const file = join(root, "src", "money.js");
  await writeFile(file, MONEY, "utf8");
  const edit = createFileEditTool({ allowedPaths: [root] });
  const args = {
    file_path: file, old_string: "Math.floor", new_string: "Math.round", cwd: root, [SESSION_ID_ARG]: session,
  };

  const refused = await edit.execute({ ...args });
  expect(refused.isError).toBe(true);
  expect(refused.content).toContain("File has not been read yet");

  await record('for f in src/*.js; do cat -n "$f"; done', finished(catN(MONEY)));
  const applied = await edit.execute({ ...args });
  expect(applied.isError).not.toBe(true);
});

// The read must be what the model receives. Real exec_command runs, so the head-and-tail cut and the
// returned text are the production ones.
async function execStandard(cmd: string, extra: Record<string, unknown> = {}) {
  const manager = new UnifiedExecProcessManager({ cwd: root });
  try {
    const tool = bindExplicitDangerBoundary(createExecCommandTool({
      cwd: root, allowedPaths: [root], unifiedExecManager: manager,
    }));
    return await tool.execute({ cmd, ...extra, [SESSION_ID_ARG]: session });
  } finally {
    await manager.closeAll();
  }
}

async function editRefused(file: string, oldString: string): Promise<boolean> {
  const edit = createFileEditTool({ allowedPaths: [root] });
  const result = await edit.execute({
    file_path: file, old_string: oldString, new_string: `${oldString}_changed`, cwd: root, [SESSION_ID_ARG]: session,
  });
  return result.isError === true && String(result.content).includes("File has not been read yet");
}

function numberedLines(count: number, width: number): string {
  return Array.from({ length: count }, (_, i) => `line ${String(i).padStart(6, "0")} ${"x".repeat(width)}`).join("\n") + "\n";
}

test("the visible-size bound is the smallest cap the tool-result pipeline applies", () => {
  expect(PRINTED_READ_MAX_VISIBLE_BYTES).toBe(MIN_TOOL_RESULT_BYTES);
});

test("a real cat of a small file counts as read and lets Edit through", async () => {
  await writeFile(join(root, "money.js"), MONEY, "utf8");
  const result = await execStandard("cat money.js");
  expect(result.isError).not.toBe(true);
  expect(hasSessionRead(session, join(root, "money.js"))).toBe(true);
  expect(await editRefused(join(root, "money.js"), "Math.floor")).toBe(false);
});

test("a file larger than the default exec output cap, printed with cat, does not count and Edit stays refused", async () => {
  // The default exec cap keeps 40,000 characters as head and tail; this file is about 60 KB.
  const big = numberedLines(1200, 40);
  expect(big.length).toBeGreaterThan(40_000);
  await writeFile(join(root, "big.txt"), big, "utf8");
  const result = await execStandard("cat big.txt");
  expect(String(result.content).length).toBeLessThan(big.length);
  expect(getSessionReadSnapshot(session, join(root, "big.txt"))).toBeUndefined();
  expect(await editRefused(join(root, "big.txt"), "line 000600")).toBe(true);
});

test("an explicit max_output_tokens cut does not count either", async () => {
  const text = numberedLines(60, 20);
  await writeFile(join(root, "mid.txt"), text, "utf8");
  await execStandard("cat mid.txt", { max_output_tokens: 100 });
  expect(getSessionReadSnapshot(session, join(root, "mid.txt"))).toBeUndefined();
  expect(await editRefused(join(root, "mid.txt"), "line 000030")).toBe(true);
});

test("an untruncated result above the smallest pipeline cap does not count", async () => {
  // Under the exec cap (40,000 characters) but over the 16,000 bytes a small-window model's
  // tool-result cap can cut to, so the model might not see all of it.
  const text = numberedLines(500, 40);
  expect(text.length).toBeGreaterThan(PRINTED_READ_MAX_VISIBLE_BYTES);
  expect(text.length).toBeLessThan(40_000);
  await writeFile(join(root, "medium.txt"), text, "utf8");
  const result = await execStandard("cat medium.txt");
  expect(String(result.content)).toContain(text);
  expect(getSessionReadSnapshot(session, join(root, "medium.txt"))).toBeUndefined();
  expect(await editRefused(join(root, "medium.txt"), "line 000250")).toBe(true);
});

test("a file with terminal control characters does not count", async () => {
  await writeFile(join(root, "ansi.txt"), `\u001b[31mred\u001b[0m ${MONEY}`, "utf8");
  await execStandard("cat ansi.txt");
  expect(getSessionReadSnapshot(session, join(root, "ansi.txt"))).toBeUndefined();
});
