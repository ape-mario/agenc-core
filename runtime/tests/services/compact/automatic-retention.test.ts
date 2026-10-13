import { describe, expect, test } from "vitest";
import { automaticCompactionSplit, compactConversation } from "../../../src/services/compact/compact.js";
import type { RuntimeMessage } from "../../../src/services/compact/types.js";

describe("automatic continuation retention", () => {
  const history: RuntimeMessage[] = [
    { role: "user", content: "old facts".repeat(8_000) },
    { role: "assistant", content: "old reply" },
    { role: "user", content: "fix parser" },
    { role: "assistant", content: "", toolCalls: [
      { id: "read-a", name: "exec_command", arguments: '{}' },
      { id: "read-b", name: "exec_command", arguments: '{}' },
    ] },
    { role: "tool", toolCallId: "read-a", content: "README facts" },
    { role: "tool", toolCallId: "read-b", content: "parser contents" },
  ];
  test("widens the tail to include the parent of all newest results", () => {
    expect(automaticCompactionSplit(history, 32_768)).toBe(1);
    expect(automaticCompactionSplit(history, 32_768, true)).toBe(3);
    expect(history.slice(automaticCompactionSplit(history, 32_768, true)))
      .toEqual(history.slice(3));
  });
  test("does not drop an oversized newest result", () => {
    const huge = [...history.slice(0, -1), { ...history.at(-1)!, content: "x".repeat(200_000) }];
    expect(automaticCompactionSplit(huge, 32_768)).toBe(3);
  });
  test("declines when only the current exchange remains", async () => {
    const current = history.slice(2);
    await expect(compactConversation(current, { compactionTransaction: {} as never }))
      .rejects.toThrow(/cannot free room.*latest tool results/);
    expect(current).toEqual(history.slice(2));
  });
  test("keeps recent parser edits beside a large current-step read", () => {
    const recent: RuntimeMessage[] = [
      { role: "user", content: "old".repeat(20_000) },
      { role: "assistant", content: "parser fixed", toolCalls: [{ id: "edit", name: "Write", arguments: JSON.stringify({ content: "correct parser".repeat(80) }) }] },
      { role: "tool", toolCallId: "edit", content: "write succeeded" },
      { role: "assistant", content: "batch01 parsed", toolCalls: [{ id: "batch", name: "exec_command", arguments: '{}' }] },
      { role: "tool", toolCallId: "batch", content: "batch01 total150 latency72625".repeat(140) },
      { role: "assistant", content: "inspect remaining data", toolCalls: [{ id: "chunk", name: "FileRead", arguments: '{}' }] },
      { role: "tool", toolCallId: "chunk", content: "x".repeat(13_000) },
    ];
    expect(automaticCompactionSplit(recent, 31_129)).toBe(1);
  });
});
