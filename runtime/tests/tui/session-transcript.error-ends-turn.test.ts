import { describe, expect, test } from "vitest";

import { adaptTranscriptEvents } from "./session-transcript.js";

describe("explicit failures end the streaming turn", () => {
  const turnStart = {
    type: "turn_started",
    payload: { turnId: "turn-1" },
  } as never;

  test("renders local and daemon interruption notices once per turn in plain words", () => {
    const error = { type: "error", payload: { message: "AdmissionDeniedError: execution admission cancelled: interrupted" } };
    const abort = { type: "turn_aborted", payload: { reason: "interrupted", turnId: "turn-1" } };
    const transcript = adaptTranscriptEvents([
      turnStart,
      { type: "turn_aborted", payload: { reason: "interrupted" } },
      { ...abort, id: "daemon-abort" }, { ...error, id: "error-1" }, { ...error, id: "error-2" },
    ] as never);
    const notices = transcript.messages.filter((message: any) => message.type === "system").map((message: any) => message.content);
    expect(notices).toEqual(["Turn interrupted.", "Tool execution cancelled: interrupted."]);
    const next = adaptTranscriptEvents([
      turnStart, abort,
      { type: "turn_started", payload: { turnId: "turn-2" } },
      { type: "turn_aborted", payload: { reason: "interrupted", turnId: "turn-2" } },
    ] as never);
    expect(next.messages.filter((message: any) => message.content === "Turn interrupted.")).toHaveLength(2);
  });

  test.each([true, false])("renders one plain cancellation across a failed tool result and session error (error first: %s)", errorFirst => {
    const error = { id: "error", type: "error", payload: { message: "AdmissionDeniedError: execution admission cancelled: interrupted" } };
    const result = { id: "result", type: "tool_call_completed", payload: { callId: "call", isError: true, result: JSON.stringify({ error: "AdmissionDeniedError: execution admission cancelled: interrupted" }) } };
    const transcript = adaptTranscriptEvents([
      turnStart,
      { id: "tool", type: "tool_call_started", payload: { callId: "call", toolName: "exec_command", args: { cmd: "echo ok" } } },
      ...(errorFirst ? [error, result] : [result, error]),
      { ...result, id: "repeated-result" },
    ] as never);
    const output = JSON.stringify(transcript.messages);
    expect(output).not.toContain("AdmissionDeniedError");
    const toolResult = transcript.messages.find((message: any) => message.type === "user");
    expect(toolResult.message.content[0].content).toBe("Tool execution cancelled: interrupted.");
    expect(transcript.messages.filter((message: any) => message.type === "system")).toHaveLength(0);
  });

  test("`turn_failed` clears isStreaming and preserves partial text", () => {
    const transcript = adaptTranscriptEvents([
      turnStart,
      {
        type: "assistant_text",
        payload: { content: "partial answ" },
      } as never,
      {
        type: "turn_failed",
        payload: {
          turnId: "turn-1",
          code: "background_agent_error",
          message:
            "openai-compatible error: fetch failed [openai_category=connection_refused]",
        },
      } as never,
    ]);

    expect(transcript.isStreaming).toBe(false);
    const rendered = JSON.stringify(transcript.messages);
    expect(rendered).toContain("connection_refused");
    expect(rendered).toContain("partial answ");
  });

  test("`stream_error` keeps a retrying stream active", () => {
    const transcript = adaptTranscriptEvents([
      turnStart,
      {
        type: "stream_error",
        payload: { message: "stream broke" },
      } as never,
    ]);

    expect(transcript.isStreaming).toBe(true);
  });

  test("`error` with stream_disconnected cause keeps the turn streaming", () => {
    const transcript = adaptTranscriptEvents([
      turnStart,
      {
        type: "assistant_text",
        payload: { content: "partial answ" },
      } as never,
      {
        type: "error",
        payload: {
          cause: "stream_disconnected",
          message: "Reconnecting after stream interruption (attempt 1)",
        },
      } as never,
    ]);

    expect(transcript.isStreaming).toBe(true);
    expect(JSON.stringify(transcript.messages)).toContain(
      "Reconnecting after stream interruption",
    );
  });

  test("unrecognized session errors keep the turn streaming", () => {
    const transcript = adaptTranscriptEvents([
      turnStart,
      {
        type: "error",
        payload: {
          cause: "future_mid_turn_diagnostic",
          message: "diagnostic event",
        },
      } as never,
    ]);

    expect(transcript.isStreaming).toBe(true);
    expect(JSON.stringify(transcript.messages)).toContain("diagnostic event");
  });

  test("turns still stream while no terminal event has arrived", () => {
    const transcript = adaptTranscriptEvents([
      turnStart,
      {
        type: "assistant_text",
        payload: { content: "thinking about it" },
      } as never,
    ]);

    expect(transcript.isStreaming).toBe(true);
  });
});
