/**
 * Calls from one model response: literal read-only exec_command inspections
 * run side by side; every other command is exclusive. Results are recorded in
 * the order the model submitted the calls either way.
 */
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, test } from "vitest";
import { execCommandRunsConcurrently } from "./read-only-shell-concurrency.js";
import { createExecCommandTool } from "./system/exec-command.js";
import { StreamingToolExecutor } from "./streaming-executor.js";
import type { ToolRegistry, ToolDispatchResult } from "../tool-registry.js";
import type { LLMToolCall } from "../llm/types.js";
import type { Tool } from "./types.js";
import type { ToolUseBlock } from "../session/turn-state.js";

const cwd = "/workspace";
const call = (cmd: string, extra: Record<string, unknown> = {}) => ({ cmd, workdir: cwd, ...extra });

describe("read-only exec_command concurrency", () => {
  test.each([
    "ls -la",
    "cat README.md",
    "wc -l data/orders.csv",
    "head -n 3 src/main.js",
    "grep -n amount src/read.js",
    "git log --oneline -n 3",
    "pwd",
  ])("runs the literal inspection %s alongside other calls", (cmd) => {
    expect(execCommandRunsConcurrently(call(cmd), cwd)).toBe(true);
  });

  test.each([
    "touch out.txt",
    "printf 'a\\n' > out.txt",
    "mkdir -p build",
    "ls | wc -l",
    "cat README.md && cat package.json",
    "git status --short",
    "git diff",
    "npm test",
    "rm -rf build",
    "ls $HOME",
  ])("keeps %s exclusive", (cmd) => {
    expect(execCommandRunsConcurrently(call(cmd), cwd)).toBe(false);
  });

  test.each([
    { detach: true },
    { tty: true },
    { login: true },
    { dangerouslyDisableSandbox: true },
    { sandbox_permissions: "require_escalated" },
  ])("keeps a read-only command exclusive with %o", (extra) => {
    expect(execCommandRunsConcurrently(call("ls -la", extra), cwd)).toBe(false);
  });

  test("the exec_command tool declares the same classification", () => {
    const tool = createExecCommandTool({ cwd });
    expect(tool.isConcurrencySafe?.(call("cat README.md"))).toBe(true);
    expect(tool.isConcurrencySafe?.(call("touch x"))).toBe(false);
  });
});

function block(id: string): ToolUseBlock {
  return { type: "tool_use", id, name: "exec_command", input: {} };
}

function execCall(id: string, cmd: string): LLMToolCall {
  return { id, name: "exec_command", arguments: JSON.stringify(call(cmd)) };
}

/** The real exec_command definition with a scripted dispatch per command. */
function harness(durations: Record<string, number>) {
  const tool: Tool = createExecCommandTool({ cwd });
  let active = 0;
  const timeline: string[] = [];
  const overlaps: Record<string, number> = {};
  const registry: ToolRegistry = {
    tools: [tool],
    toLLMTools: () => [],
    dispatch: async () => ({ content: "unused" }),
  } as unknown as ToolRegistry;
  const exec = new StreamingToolExecutor({
    registry,
    runToolUseFn: async (toolCall: LLMToolCall): Promise<ToolDispatchResult> => {
      const cmd = (JSON.parse(toolCall.arguments) as { cmd: string }).cmd;
      active += 1;
      overlaps[toolCall.id] = Math.max(overlaps[toolCall.id] ?? 0, active);
      timeline.push(`start:${toolCall.id}`);
      await delay(durations[toolCall.id] ?? 1);
      timeline.push(`end:${toolCall.id}`);
      active -= 1;
      return { content: `ran ${cmd}` };
    },
  });
  return { exec, timeline, overlaps, active: () => active };
}

async function drain(exec: StreamingToolExecutor): Promise<string[]> {
  const seen: string[] = [];
  for await (const result of exec.getRemainingResults()) seen.push(result.toolCall.id);
  return seen;
}

describe("executor scheduling of exec_command calls from one response", () => {
  test("three read-only inspections run concurrently and report in submission order", async () => {
    const { exec, timeline, overlaps } = harness({ a: 40, b: 20, c: 1 });
    exec.addTool(block("a"), execCall("a", "ls -la"));
    exec.addTool(block("b"), execCall("b", "cat README.md"));
    exec.addTool(block("c"), execCall("c", "wc -l data/orders.csv"));
    exec.dispatchPending();
    exec.close();
    const seen = await drain(exec);
    expect(timeline.slice(0, 3)).toEqual(["start:a", "start:b", "start:c"]);
    expect(Math.max(...Object.values(overlaps))).toBe(3);
    expect(seen).toEqual(["a", "b", "c"]);
  });

  test("a non-read-only command runs alone between read-only ones, in order", async () => {
    const { exec, timeline } = harness({ a: 10, b: 10, c: 10, d: 1 });
    exec.addTool(block("a"), execCall("a", "ls -la"));
    exec.addTool(block("b"), execCall("b", "touch out.txt"));
    exec.addTool(block("c"), execCall("c", "cat README.md"));
    exec.addTool(block("d"), execCall("d", "cat package.json"));
    exec.dispatchPending();
    exec.close();
    const seen = await drain(exec);
    // b waits for a, and c/d wait for b: nothing overlaps the write.
    expect(timeline.indexOf("start:b")).toBeGreaterThan(timeline.indexOf("end:a"));
    expect(timeline.indexOf("start:c")).toBeGreaterThan(timeline.indexOf("end:b"));
    expect(timeline.indexOf("start:d")).toBeGreaterThan(timeline.indexOf("end:b"));
    expect(seen).toEqual(["a", "b", "c", "d"]);
  });

  test("non-read-only commands keep running one at a time", async () => {
    const { exec, overlaps } = harness({ a: 5, b: 5, c: 5 });
    exec.addTool(block("a"), execCall("a", "touch one"));
    exec.addTool(block("b"), execCall("b", "touch two"));
    exec.addTool(block("c"), execCall("c", "mkdir -p three"));
    exec.dispatchPending();
    exec.close();
    expect(await drain(exec)).toEqual(["a", "b", "c"]);
    expect(Math.max(...Object.values(overlaps))).toBe(1);
  });
});
