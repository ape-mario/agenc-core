import { describe, expect, it } from "vitest";
import { MAX_AGENT_MESSAGE_BYTES, resolveAgentMessage } from "../../src/agents/message-reference.js";

const source = (text: string) => ({ currentRootHumanTurn: () => ({ text, turnId: "turn-1" }) });
const ref = (extra = {}) => ({ message_ref: { source: "current_user_message", ...extra } });

describe("agent message references", () => {
  it("copies a long original user message with a constant sized call", () => {
    const text = ' Unicode 🐈 <data> &amp; "quoted" \\ \\n'.repeat(2_000);
    const args = ref();
    expect(JSON.stringify(args).length).toBeLessThan(100);
    expect(resolveAgentMessage(args, source(text))).toBe(text);
  });
  it("selects an exact delimited task without the parent instructions", () => {
    const task = ' \n{"value":"<tag> &amp; 🐈"}\n ';
    expect(resolveAgentMessage(ref({ after: "<task>", before: "</task>" }), source(`Parent instruction<task>${task}</task>End`))).toBe(task);
  });
  it.each([
    [{ source: "another_session" }, "abc"],
    [{ source: "current_user_message", path: "/secret" }, "abc"],
    [{ source: "current_user_message", after: "missing" }, "abc"],
    [{ source: "current_user_message", after: "x" }, "x abc x"],
    [{ source: "current_user_message", after: "end", before: "start" }, "start abc end"],
  ])("rejects inaccessible or ambiguous references", (reference, text) => {
    expect(() => resolveAgentMessage({ message_ref: reference }, source(text))).toThrow();
  });
  it("does not reuse a previous turn or silently truncate an oversized task", () => {
    expect(() => resolveAgentMessage(ref(), { currentRootHumanTurn: () => null })).toThrow(/no active human/);
    expect(() => resolveAgentMessage(ref(), source("🐈".repeat(MAX_AGENT_MESSAGE_BYTES / 4 + 1)))).toThrow(/256 KiB/);
    // A message next to a reference that selects an excerpt is a conflict.
    expect(() => resolveAgentMessage({ ...ref({ after: "<t>" }), message: "replacement" }, source("<t>task"))).toThrow(/either/);
  });
  it("accepts the placeholder fields models fill in when they fill every field", () => {
    // Live on 0.19 RCs with OpenAI models: a real message plus a reference
    // with empty delimiters, refused on every spawn before this fix.
    const filled = { message: "Research cron retries", message_ref: { source: "current_user_message", after: "", before: "" } };
    expect(resolveAgentMessage(filled, source("whole user text"))).toBe("Research cron retries");
    expect(resolveAgentMessage({ message: "do it", message_ref: null }, source("x"))).toBe("do it");
    // An empty message next to a real reference uses the reference.
    expect(resolveAgentMessage({ message: "", ...ref({ after: "<t>" }) }, source("<t>task"))).toBe("task");
    // Empty delimiters mean no delimiter: the whole user message.
    expect(resolveAgentMessage(ref({ after: "", before: null }), source("abc"))).toBe("abc");
    // Nothing usable is still refused.
    expect(() => resolveAgentMessage({ message: "  ", message_ref: null }, source("abc"))).toThrow(/required/);
  });
});
