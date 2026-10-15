import { expect, test } from "vitest";
import { adaptTranscriptEvents } from "../../src/tui/session-transcript.js";

const event = (id: string, type: string, payload: Record<string, unknown>) =>
  ({ id, msg: { type, payload } }) as never;

test("a reconnect notice separates the failed partial answer from the new stream", () => {
  const transcript = adaptTranscriptEvents([
    event("start", "turn_started", { turnId: "turn" }),
    event("partial", "agent_message_delta", { delta: "Interrupted fragment. " }),
    event("retry", "stream_error", {
      cause: "stream_disconnected", message: "provider error, retrying in up to 1 s (2/6)",
    }),
    event("fresh", "agent_message_delta", { delta: "Recovered answer." }),
  ]);
  expect(transcript.streamingText).toBe("Recovered answer.");
  expect(transcript.messages).toMatchObject([
    { type: "assistant", message: { content: [{ type: "text", text: "Interrupted fragment. " }] } },
    { type: "system", content: "provider error, retrying in up to 1 s (2/6)" },
  ]);
});

test("a stream failure preserves its partial answer before the failure notice", () => {
  const transcript = adaptTranscriptEvents([
    event("start", "turn_started", { turnId: "turn" }),
    event("partial", "agent_message_delta", { delta: "Partial answer" }),
    event("failed", "stream_error", { cause: "stream_disconnected", message: "Retry is unsafe." }),
  ]);
  expect(transcript.streamingText).toBeNull();
  expect(transcript.messages[0]).toMatchObject({
    type: "assistant", message: { content: [{ type: "text", text: "Partial answer" }] },
  });
});
