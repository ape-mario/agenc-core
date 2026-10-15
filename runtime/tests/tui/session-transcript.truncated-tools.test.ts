import { describe, expect, test } from "vitest";
import { adaptTranscriptEvents } from "../../src/tui/session-transcript.js";

const result = JSON.stringify({
  code: "tool_arguments_truncated", retryable: true, executed: false,
  error: "Output limit interrupted tool arguments. Retry a complete tool call.",
});

describe("output-limited tool handoffs", () => {
  test.each(["Write", "spawn_agent"])("shows a truthful retry notice for buffered %s arguments", toolName => {
    const event = { type: "tool_call_completed", payload: { callId: "cut", toolName, result, isError: true } };
    const transcript = adaptTranscriptEvents([event, event]);
    const notices = transcript.messages.filter(message => message.type === "system");
    expect(notices).toHaveLength(1);
    expect(notices[0].content).toBe("Output limit interrupted tool arguments. Retry a complete tool call.");
    expect(JSON.stringify(transcript.messages)).not.toContain("out of order");
  });

  test("keeps a truncated collaboration handoff visible after its input cell was suppressed", () => {
    const transcript = adaptTranscriptEvents([
      { type: "tool_input_block_start", payload: { callId: "cut", index: 0,
        contentBlock: { type: "tool_use", id: "cut", name: "spawn_agent", input: {} } } },
      { type: "tool_input_delta", payload: { callId: "cut", index: 0, partialJson: '{"message":"unfinished' } },
      { type: "tool_call_completed", payload: { callId: "cut", toolName: "spawn_agent", result, isError: true } },
    ]);
    expect(JSON.stringify(transcript.messages)).toContain("Output limit interrupted tool arguments");
    expect(transcript.streamingToolUses).toEqual([]);
    expect(transcript.inProgressToolUseIDs.size).toBe(0);
  });
});
