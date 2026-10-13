import { DEFAULT_TASK_TOKEN_BUDGET, TASK_BUDGET_LEVELS, isTaskBudgetLevel, taskBudgetLabel } from "../config/task-budget.js";
import { updateSettingsForSource } from "../utils/settings/settings.js";
import { runWithCanonicalSettingsAuthority } from "../utils/settings/canonicalAuthority.js";
import { openBudgetMenu } from "./budget-menu.js";
import { setSessionTaskTokenBudget } from "../session/task-budget.js";
import { requireCommandConfigStore } from "./config-context.js";
import { safeExecute, type SlashCommand } from "./types.js";

export const budgetCommand: SlashCommand = {
  name: "budget",
  description: "Show or set the task budget",
  immediate: true,
  supportsNonInteractive: true,
  execute: async (ctx) => safeExecute(async () => {
    const active = ctx.session.config === undefined ? "unavailable" : taskBudgetLabel(ctx.session.config.taskTokenBudget ?? DEFAULT_TASK_TOKEN_BUDGET);
    const choice = ctx.argsRaw.trim();
    if (!choice && openBudgetMenu(ctx, ctx.session.config?.taskTokenBudget ?? DEFAULT_TASK_TOKEN_BUDGET,
      level => budgetCommand.execute({ ...ctx, argsRaw: level }))) return { kind: "skip" };
    if (!choice) return { kind: "text", text: `Current session budget: ${active}.\nChoose /budget eco (1,000,000), balanced (2,400,000), or max (no token cap). Choices apply to this session and new sessions; independent call and cost limits still apply.` };
    if (!isTaskBudgetLevel(choice)) return { kind: "error", message: "Usage: /budget [eco|balanced|max]" };
    const store = requireCommandConfigStore(ctx);
    const saved = await runWithCanonicalSettingsAuthority(store, () => updateSettingsForSource("userSettings", {
      budget_level: choice,
      task_token_budget: TASK_BUDGET_LEVELS[choice],
    }));
    if (saved.error) return { kind: "error", message: `Could not save budget: ${saved.error.message}` };
    const bridge = ctx.session as unknown as { applyDaemonConfig?: (params: { taskBudgetLevel: typeof choice; reload: boolean }) => Promise<{ taskTokenBudget?: number; summary: string }> };
    const applied = bridge.applyDaemonConfig !== undefined
      ? await bridge.applyDaemonConfig({ taskBudgetLevel: choice, reload: true })
      : undefined;
    const effective = applied?.taskTokenBudget ?? (store.current?.().task_token_budget ?? TASK_BUDGET_LEVELS[choice]);
    if (applied === undefined) setSessionTaskTokenBudget(ctx.session, effective);
    else if (ctx.session.config !== undefined) (ctx.session.config as { taskTokenBudget?: number }).taskTokenBudget = effective;
    const override = effective !== TASK_BUDGET_LEVELS[choice] ? " Explicit CLI, project, or independent admission limits override the saved choice." : "";
    return { kind: "text", text: `Current session budget: ${taskBudgetLabel(effective)}. Saved ${taskBudgetLabel(TASK_BUDGET_LEVELS[choice])} for new sessions.${override} Independent call and cost limits still apply.` };
  }),
};
