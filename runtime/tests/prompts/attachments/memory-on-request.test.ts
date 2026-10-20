/**
 * An interactive Light session whose memory was empty when its prompt was
 * assembled gets the memory rules and directories with the first message about
 * memory or durable facts, once.
 */
import { describe, expect, test, vi } from "vitest";

import type { LLMMessage } from "../../llm/types.js";
import type { ToolPermissionContext } from "../../permissions/types.js";
import { getAttachmentTrackingState } from "../../session/attachment-state.js";
import { LIGHT_MEMORY_RULES_MARKER } from "../../memory/memdir.js";
import { attachmentsToMessages } from "./messages.js";
import type { GetAttachmentsOptions } from "./orchestrator.js";
import { asksAboutMemory, memoryOnRequestProducer } from "./memory-on-request.js";

const RULES = `# auto memory\n\n${LIGHT_MEMORY_RULES_MARKER}: ...\n\n# Memory directories (both exist: Write there directly, without mkdir)\n- Global: \`/home/u/.agenc/memory/\``;

function makeOpts(text: string, partial?: Partial<GetAttachmentsOptions>): GetAttachmentsOptions {
  return {
    sessionKey: { conversationId: "conv-memory-on-request" },
    lightMode: true,
    lightMemoryOnRequest: async () => RULES,
    turnProvenance: { turnId: "turn-1", rootHumanTurn: { turnId: "turn-1", text } },
    userInput: text,
    loadedTools: [],
    messages: [{ role: "user", content: text }],
    permissionContext: { mode: "bypassPermissions" } as ToolPermissionContext,
    cwd: "/tmp/agenc-memory-on-request",
    subagentDepth: 0,
    signal: new AbortController().signal,
    ...partial,
  };
}

async function produce(text: string, partial?: Partial<GetAttachmentsOptions>) {
  const opts = makeOpts(text, partial);
  return memoryOnRequestProducer(opts, getAttachmentTrackingState(opts.sessionKey));
}

// Memory requests and the durable facts proactive saving looks for.
const MEMORY_MESSAGES = [
  "Remember this fact in persistent memory for future sessions: my project codename is AMBER_HERON_7429.",
  "What is my project codename? Read your persistent memory if needed.",
  "Remember that I prefer tabs over spaces.",
  "Forget my indentation preference.",
  "Ignore your memory for this question.",
  "What do you know about me?",
  "I'm a data engineer on the payments team, and we only deploy on Fridays.",
  "Please always use pnpm in this repo.",
  "Stop adding comments to every function.",
  "From now on, write commit messages in the imperative mood.",
  "Our release deadline is next Thursday.",
  "Bugs are tracked in Jira project PAY.",
  "The staging dashboard is at https://grafana.example.com/d/abc",
];

// The round 4 benchmark prompts other than explain ("I'm new to this repo").
const TASK_PROMPTS = [
  "The checkout test is failing. Please fix the calculation and cover the edge cases described in the README with tests.",
  "Add an optional --pending flag to the list command so it only shows unfinished tasks. The normal list must keep working. Add pytest tests for this, including an empty list.",
  "Rename prettyName to formatDisplayName throughout the source. Remove the old name completely, keep behavior the same, and update tests to cover all five views.",
  "Build a tiny Node HTTP server with no external dependencies. Put it in server.js; export createServer() and only listen when launched directly. Include tests I can run with npm test, and a README showing how to run it.",
  "Our service crashes at startup under the supervisor. The log is in logs/startup.log. Find the cause and fix it so it works regardless of the current directory. Add a regression test.",
  "Please put my existing changes on a new branch called chore/comet-docs and commit them with a sensible message. Leave the working tree clean. Don't add unrelated changes.",
  "From sales.csv, who are our top three customers by revenue? Follow the accounting rules in the README. Give each customer and their exact USD total, highest first. Please don't change any files.",
  "Also document --pending in the README with a runnable example and what it filters.",
  "The tests in this repo are failing. Fix the source code so that npm test passes. Do not modify the tests.",
];

describe("memory-on-request attachment producer", () => {
  test.each(MEMORY_MESSAGES)("sends the memory rules for %j", async (text) => {
    expect(asksAboutMemory(text)).toBe(true);
    expect(await produce(text)).toEqual([{ kind: "memory_on_request", content: RULES }]);
  });

  test.each(TASK_PROMPTS)("sends nothing for %j", async (text) => {
    expect(asksAboutMemory(text)).toBe(false);
    expect(await produce(text)).toEqual([]);
  });

  test("renders the rules as one system reminder on the user channel", async () => {
    const [message] = attachmentsToMessages(await produce("Remember that I prefer tabs."));
    expect(message).toEqual({
      role: "user",
      content: `<system-reminder>\n${RULES}\n</system-reminder>`,
      runtimeOnly: { mergeBoundary: "user_context" },
    });
  });

  test("only when the fixed prefix left the rules out, only for the human's message of this turn, never twice", async () => {
    const text = "Remember that I prefer tabs.";
    // The prefix carries the rules (memory had content) or memory is off: no resolver.
    expect(await produce(text, { lightMemoryOnRequest: undefined })).toEqual([]);
    for (const turnProvenance of [
      undefined,
      { turnId: "turn-1", rootHumanTurn: null },
      { turnId: "turn-2", rootHumanTurn: { turnId: "turn-1", text } },
    ]) {
      expect(await produce(text, { turnProvenance })).toEqual([]);
    }
    const retained: LLMMessage = { role: "user", content: `<system-reminder>\n${RULES}\n</system-reminder>`,
      runtimeOnly: { mergeBoundary: "user_context" } };
    const resolve = vi.fn(async () => RULES);
    expect(await produce(text, { messages: [retained, { role: "user", content: text }], lightMemoryOnRequest: resolve })).toEqual([]);
    expect(resolve).not.toHaveBeenCalled();
    // Memory disabled after assembly: the resolver finds nothing to send.
    expect(await produce(text, { lightMemoryOnRequest: async () => undefined })).toEqual([]);
  });
});
