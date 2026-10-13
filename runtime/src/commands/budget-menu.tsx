import React from "react";
import { Box, useInput } from "../tui/ink.js";
import ThemedText from "../tui/components/design-system/ThemedText.js";
import { MenuModal } from "../tui/components/v2/primitives.js";
import { TASK_BUDGET_LEVELS, taskBudgetLabel, type TaskBudgetLevel } from "../config/task-budget.js";
import { openLocalJsxCommand } from "./local-jsx-command.js";
import { nextMenuIndex, previousMenuIndex } from "./menu-navigation.js";
import type { SlashCommandContext, SlashCommandResult } from "./types.js";

const levels = Object.keys(TASK_BUDGET_LEVELS) as TaskBudgetLevel[];
function BudgetMenu({ current, currentBudget, apply, close }: {
  current: number; currentBudget: () => number; apply: (level: TaskBudgetLevel) => Promise<SlashCommandResult>; close: () => void;
}) {
  const [index, setIndex] = React.useState(Math.max(0, levels.findIndex(level => TASK_BUDGET_LEVELS[level] === current)));
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [active, setActive] = React.useState(current);
  useInput((input, key) => {
    if (busy) return;
    if (key.escape || input === "q") { close(); return; }
    if (key.upArrow) setIndex(value => previousMenuIndex(value, levels.length));
    if (key.downArrow) setIndex(value => nextMenuIndex(value, levels.length));
    if (key.return) {
      const level = levels[index]!;
      setBusy(true);
      void apply(level).then(result => {
        setBusy(false);
        setMessage(result.kind === "text" ? result.text : result.kind === "error" ? result.message : "Budget applied.");
        if (result.kind === "text") setActive(currentBudget());
      }, error => { setBusy(false); setMessage(String(error)); });
    }
  });
  return <MenuModal title="budget" count="3" summary={`current ${taskBudgetLabel(active)}`} columns={[14, 48]} headers={["level", "allowance"]}
    items={levels} activeIndex={index} renderRow={level => [
      <ThemedText key="level" color="text">{level}{TASK_BUDGET_LEVELS[level] === active ? " (current)" : ""}</ThemedText>,
      <ThemedText key="allowance" color="text2">{taskBudgetLabel(TASK_BUDGET_LEVELS[level])}</ThemedText>,
    ]} preview={<Box flexDirection="column"><ThemedText color="text2">Apply to this session and save for new sessions.</ThemedText>{message ? <ThemedText color="text2" wrap="wrap">{message}</ThemedText> : null}</Box>}
    footer={[{ keyName: "up/down", label: "navigate" }, { keyName: "enter", label: "apply" }, { keyName: "esc", label: "close" }]} />;
}
export function openBudgetMenu(ctx: SlashCommandContext, current: number, apply: (level: TaskBudgetLevel) => Promise<SlashCommandResult>): boolean {
  return openLocalJsxCommand(ctx, close => <BudgetMenu current={current} currentBudget={() => ctx.session.config?.taskTokenBudget ?? current} apply={apply} close={close} />);
}
