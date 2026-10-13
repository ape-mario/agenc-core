import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ update: vi.fn(async () => ({ error: null as Error | null })) }));
vi.mock("../../src/utils/settings/settings.js", () => ({ updateSettingsForSource: mocks.update }));
vi.mock("../../src/utils/settings/canonicalAuthority.js", () => ({ runWithCanonicalSettingsAuthority: (_: unknown, fn: () => unknown) => fn() }));
import { budgetCommand } from "../../src/commands/budget.js";
import type { SlashCommandContext } from "../../src/commands/types.js";
const context = (argsRaw: string) => ({ argsRaw, configStore: {}, session: { config: { taskTokenBudget: 1_000_000 } } }) as SlashCommandContext;
beforeEach(() => mocks.update.mockClear());
it("shows the active level without a model call or settings mutation", async () => {
  expect(await budgetCommand.execute(context(""))).toMatchObject({ kind: "text", text: expect.stringContaining("eco (1,000,000 tokens)") });
  expect(mocks.update).not.toHaveBeenCalled();
});
it("saves and applies a level to the current session", async () => {
  const ctx = context("max");
  expect(await budgetCommand.execute(ctx)).toMatchObject({ kind: "text", text: expect.stringContaining("Current session budget: max") });
  expect(mocks.update).toHaveBeenCalledWith("userSettings", { budget_level: "max", task_token_budget: 0 });
  expect(ctx.session.config.taskTokenBudget).toBe(0);
});
it("rejects invalid choices without saving", async () => {
  expect(await budgetCommand.execute(context("bad"))).toMatchObject({ kind: "error" });
  expect(mocks.update).not.toHaveBeenCalled();
});
it("reports failed saves", async () => {
  mocks.update.mockResolvedValueOnce({ error: new Error("read-only") });
  expect(await budgetCommand.execute(context("balanced"))).toMatchObject({ kind: "error", message: expect.stringContaining("read-only") });
});

it("opens a current-session picker without saving until a choice is applied", async () => {
  const ctx = context("");
  const setToolJSX = vi.fn();
  Object.assign(ctx, { appState: { setToolJSX } });
  expect(await budgetCommand.execute(ctx)).toEqual({ kind: "skip" });
  expect(mocks.update).not.toHaveBeenCalled();
  const menu = setToolJSX.mock.calls[0]![0].jsx;
  expect(menu.props.current).toBe(1_000_000);
  await menu.props.apply("max");
  expect(ctx.session.config.taskTokenBudget).toBe(0);
});
it("applies through the live daemon and reports an explicit override", async () => {
  const ctx = context("max");
  const applyDaemonConfig = vi.fn(async () => ({ taskTokenBudget: 123, summary: "explicit project allowance" }));
  Object.assign(ctx.session, { applyDaemonConfig });
  expect(await budgetCommand.execute(ctx)).toMatchObject({ kind: "text", text: expect.stringContaining("override the saved choice") });
  expect(applyDaemonConfig).toHaveBeenCalledWith({ taskBudgetLevel: "max", reload: true });
});
