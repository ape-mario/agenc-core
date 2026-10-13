import { expect, it } from "vitest";
import { adaptTranscriptEvents } from "../../src/tui/session-transcript.js";
import { TaskBudget } from "../../src/session/task-budget.js";

const event = (id: string, type: string, payload: Record<string, unknown>) => ({ id, type, payload });
it("shows a task budget stop once and gives a session budget remedy", () => {
  const budget = new TaskBudget(100); budget.tokens = 90;
  const summary = budget.summary("The first check passed. " + "details ".repeat(400));
  const transcript = adaptTranscriptEvents([
    event("start", "turn_started", { turnId: "turn" }),
    event("denied", "execution_admission", { event: "denied", kind: "model_turn", reason: "budget_exceeded", details: { budgetDimension: "tokens", usedTokens: 90, heldTokens: 0, maxTokens: 100 } }),
    event("delta", "agent_message_delta", { delta: summary }),
    event("answer", "agent_message", { message: summary }),
    event("failed", "turn_failed", { turnId: "turn", code: "task_budget", message: summary.slice(0, 2_000) }),
  ]);
  const output = JSON.stringify(transcript.messages);
  expect(output.match(/Partial result: stopped at the task budget/g)).toHaveLength(1);
  expect(output).toContain("90 of 100 tokens");
  expect(output).toContain("/budget");
  expect(output).not.toContain("/compact");
  expect(output).not.toContain("start a new session");
});
it("shows the recorded usage and budget remedy while awaiting the final partial result", () => {
  const transcript = adaptTranscriptEvents([event("denied", "execution_admission", {
    event: "denied", kind: "model_turn", reason: "budget_exceeded", details: { budgetDimension: "tokens", usedTokens: 90, heldTokens: 5, maxTokens: 100 },
  })]);
  const output = JSON.stringify(transcript.messages);
  expect(output).toContain("95 of 100 tokens");
  expect(output).toContain("/budget");
  expect(output).not.toContain("/compact");
});
