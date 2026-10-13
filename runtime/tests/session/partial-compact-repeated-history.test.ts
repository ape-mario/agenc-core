import { expect, it, vi } from "vitest";
import { Session } from "../../src/session/session.js";
import { responseItemToLlmMessage } from "../../src/session/message-history-conversion.js";
import { createCompactionTransactionHarness } from "../helpers/compaction-transaction-harness.js";
import type { LLMMessage } from "../../src/llm/types.js";

it("compacts retained history again without losing canonical summary metadata or reasoning replay", async () => {
  const source = Array.from({ length: 12 }, (_, index) => ({
    role: "user" as const, type: "user", content: `request ${index} ` + "context ".repeat(1000),
    uuid: `source-${index}`, timestamp: new Date(0).toISOString(),
  }));
  const harness = createCompactionTransactionHarness(source);
  const capability = harness.provider.tokenCountCapability!;
  vi.mocked(capability.countTokens).mockImplementation(async request => ({
    inputTokens: request.messages.reduce((sum, message) => sum + (message.runtimeOnly?.compactionHistory ? 128 : Math.ceil(JSON.stringify(message.content).length / 4)), 0),
    complete: true, confidence: "exact", countedComponents: ["system", "messages"],
  }));
  let history: readonly LLMMessage[] = harness.store.readAll().flatMap(item => item.type === "response_item" ? [responseItemToLlmMessage(item.payload)] : []);
  const owner = {
    rolloutStore: harness.store,
    nextInternalSubId: () => harness.session.nextInternalSubId(),
    beginIdleTask: vi.fn(async () => ({ subId: harness.session.nextInternalSubId() })),
    throwIfPartialCompactAborted: (signal: AbortSignal) => signal.throwIfAborted(),
    settleInterruptedTurnHandoff: vi.fn(),
    snapshotHistoryMessages: () => history,
    buildPartialCompactContext: (abortController: AbortController) => ({ ...harness.context, abortController }),
    commitPartialCompaction: async (params: { replacementHistory: readonly LLMMessage[] }) => { history = params.replacementHistory; return null; },
    onTaskFinished: vi.fn(),
  };
  try {
    const compact = () => Session.prototype.partialCompactFromMessage.call(owner as unknown as Session, { messageOrdinal: 0, direction: "from" });
    expect(await compact()).toMatchObject({ ok: true });
    expect(history.some(message => message.runtimeOnly?.compactionHistory?.kind === "summary")).toBe(true);
    const laterItems = [
      { role: "user" as const, content: "new request " + "more context ".repeat(1000) },
      { role: "assistant" as const, content: "new answer", providerReasoning: { version: 2 as const, provider: "deepseek", model: "deepseek-flash", content: "preserved reasoning replay" } },
    ];
    for (const payload of laterItems) harness.store.appendRollout({ type: "response_item", payload });
    harness.store.flushDurable();
    history = [...history, ...laterItems.map(responseItemToLlmMessage)];
    expect(await compact()).toMatchObject({ ok: true });
    expect(harness.store.readAll().filter(item => item.type === "compaction_committed")).toHaveLength(2);
  } finally { harness.close(); }
});
