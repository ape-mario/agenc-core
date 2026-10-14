import React from "react";

import type { PermissionMode } from "../permissions/types.js";
import { Box, useInput } from "../tui/ink.js";
import ThemedBox from "../tui/components/design-system/ThemedBox.js";
import ThemedText from "../tui/components/design-system/ThemedText.js";
import {
  Popup,
} from "../tui/components/v2/primitives.js";
import { AURA_PLAN_GLYPHS } from "../utils/theme.js";
import { openLocalJsxCommand } from "./local-jsx-command.js";
import type { SlashCommandContext } from "./types.js";

type PlanItemState = "done" | "active" | "pending" | "failed";

export type PlanDashboardSnapshot = {
  readonly mode: PermissionMode;
  readonly previousMode?: PermissionMode;
  readonly planPath: string;
  readonly planText: string | null;
  readonly items: readonly {
    readonly state: PlanItemState;
    readonly text: string;
  }[];
  readonly message: string;
};

function compact(value: string, limit = 100): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 3).trimEnd()}...`;
}

function itemState(line: string): PlanItemState {
  if (/^\s*[-*]\s+\[[xX]\]/u.test(line)) return "done";
  if (/^\s*[-*]\s+\[[!]\]/u.test(line)) return "failed";
  if (/^\s*[-*]\s+\[[\s]\]/u.test(line)) return "pending";
  return "active";
}

type PlanSourceItem = {
  readonly state: PlanItemState;
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly newline: string;
};

/** Editable source spans, never the compact dashboard preview. */
function planSourceItems(text: string): PlanSourceItem[] {
  const candidates: PlanSourceItem[] = [];
  const fallback: PlanSourceItem[] = [];
  let offset = 0;
  let fence: string | undefined;
  for (const fullLine of text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/gu) ?? []) {
    const newline = fullLine.match(/(?:\r\n|\n|\r)$/u)?.[0] ?? "";
    const line = fullLine.slice(0, fullLine.length - newline.length);
    const lineStart = offset;
    offset += fullLine.length;
    const marker = line.trimStart().match(/^(`{3,}|~{3,})/u)?.[1];
    if (fence !== undefined) {
      if (marker?.[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = undefined;
      continue;
    }
    if (marker !== undefined) { fence = marker; continue; }
    if (line.trim().length === 0) continue;
    const prefix = line.match(/^[\t ]*(?:(?:[-*][\t ]+(?:\[[xX!\t ]\][\t ]*)?)|(?:#+[\t ]+))?/u)?.[0] ?? "";
    const entry: PlanSourceItem = {
      state: itemState(line),
      text: line.slice(prefix.length),
      start: lineStart + prefix.length,
      end: lineStart + line.length,
      lineStart,
      lineEnd: offset,
      newline,
    };
    fallback.push(entry);
    if (/^\s*[-*]\s+/u.test(line) || /^\s*#+\s+/u.test(line)) candidates.push(entry);
  }
  return candidates.length > 0 ? candidates : fallback;
}

export function planItemsFromText(planText: string | null): PlanDashboardSnapshot["items"] {
  if (!planText || planText.trim().length === 0) {
    return [{
      state: "pending",
      text: "No plan written yet.",
    }];
  }
  return planSourceItems(planText).slice(0, 12).map(item => ({
    state: item.state,
    text: compact(item.text),
  }));
}

export function createPlanDashboardSnapshot(params: {
  readonly mode: PermissionMode;
  readonly previousMode?: PermissionMode;
  readonly planPath: string;
  readonly planText: string | null;
}): PlanDashboardSnapshot {
  const hasPlan = params.planText !== null && params.planText.trim().length > 0;
  return {
    ...params,
    items: planItemsFromText(params.planText),
    message: hasPlan
      ? "Review or edit the plan here. Ask AgenC to use ExitPlanMode to request execution approval."
      : "Plan mode is active. Ask AgenC to draft a plan and use ExitPlanMode to request execution approval.",
  };
}

function PlanDashboardView({
  snapshot,
  onDone,
  onPlanTextChange,
}: {
  readonly snapshot: PlanDashboardSnapshot;
  readonly onDone: () => void;
  readonly onPlanTextChange?: (nextPlanText: string, previousPlanText: string) => void | Promise<void>;
}): React.ReactNode {
  const [planText, setPlanText] = React.useState(snapshot.planText ?? "");
  const sourceItems = React.useMemo(() => planSourceItems(planText), [planText]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [notice, setNotice] = React.useState<string | undefined>();
  const saving = React.useRef(false);
  const items: readonly { state: PlanItemState; text: string }[] = sourceItems.length > 0
    ? sourceItems
    : [{ state: "pending", text: "No plan written yet." }];
  const visibleItems = adding
    ? [...items.slice(0, activeIndex), { state: "pending" as const, text: "new plan step" }, ...items.slice(activeIndex)]
    : items;
  const windowStart = Math.max(0, activeIndex - 11);

  const persistPlan = React.useCallback(async (nextPlanText: string) => {
    if (saving.current) return;
    saving.current = true;
    setNotice("saving plan");
    try {
      await onPlanTextChange?.(nextPlanText, planText);
      setPlanText(nextPlanText);
      setActiveIndex(index => Math.min(index, Math.max(0, planSourceItems(nextPlanText).length - 1)));
      setNotice("plan updated");
      setEditing(false);
      setAdding(false);
    } catch (error) {
      setNotice(`Failed to save plan: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      saving.current = false;
    }
  }, [onPlanTextChange, planText]);

  const commitDraft = React.useCallback(() => {
    if (draft.trim().length === 0) return;
    const entry = sourceItems[activeIndex];
    if (adding || entry === undefined) {
      const previous = adding ? sourceItems[activeIndex - 1] : undefined;
      const at = previous?.lineEnd ?? planText.length;
      const newline = previous?.newline || planText.match(/\r\n|\n|\r/u)?.[0] || "\n";
      const separator = at > 0 && !/[\r\n]$/u.test(planText.slice(0, at)) ? newline : "";
      void persistPlan(`${planText.slice(0, at)}${separator}- [ ] ${draft}${newline}${planText.slice(at)}`);
    } else {
      void persistPlan(`${planText.slice(0, entry.start)}${draft}${planText.slice(entry.end)}`);
    }
  }, [activeIndex, adding, draft, planText, sourceItems, persistPlan]);

  useInput((input, key) => {
    if (saving.current) return;
    if (editing) {
      if (key.escape) {
        if (adding) {
          setActiveIndex(index => Math.max(0, index - 1));
          setAdding(false);
        }
        setEditing(false);
        return;
      }
      if (key.return) {
        commitDraft();
        return;
      }
      if (key.backspace || key.delete) {
        setDraft(value => value.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setDraft(value => `${value}${input}`);
      }
      return;
    }

    if (key.escape || input === "q") {
      onDone();
      return;
    }
    if (key.upArrow || input === "k") {
      setActiveIndex(index => Math.max(0, index - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setActiveIndex(index => Math.min(items.length - 1, index + 1));
      return;
    }
    if (input === "e") {
      setDraft(sourceItems[activeIndex]?.text ?? "");
      setEditing(true);
      return;
    }
    if (input === "d" && items.length > 1) {
      const entry = sourceItems[activeIndex];
      if (entry !== undefined) void persistPlan(`${planText.slice(0, entry.lineStart)}${planText.slice(entry.lineEnd)}`);
      return;
    }
    if (input === "a") {
      setAdding(true);
      setActiveIndex(activeIndex + 1);
      setDraft("new plan step");
      setEditing(true);
      return;
    }
    if (key.return) onDone();
  });

  return (
    <Popup
      title="plan mode · full plan"
      status="e edit · d delete · a add · ↵ close"
      accentColor="worker"
      bodyBackgroundColor="planModeWash"
      footer={[
        { keyName: "e", label: "edit step" },
        { keyName: "d", label: "delete" },
        { keyName: "a", label: "add" },
        { keyName: "↵", label: "close" },
        { keyName: "esc", label: "close" },
      ]}
    >
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={2}>
          <ThemedText color="worker">mode {snapshot.mode}</ThemedText>
          <ThemedText color="text2" wrap="truncate-end">{snapshot.message}</ThemedText>
        </Box>
        {snapshot.previousMode ? (
          <ThemedText color="muted3" wrap="truncate-end">
            previous {snapshot.previousMode}
          </ThemedText>
        ) : null}
        <ThemedText color="muted3" wrap="truncate-middle">
          {snapshot.planPath}
        </ThemedText>
        <ThemedBox flexDirection="column" borderStyle="single" borderColor="lineSoft">
          <ThemedBox flexDirection="row" borderBottom borderBottomColor="lineSoft" paddingX={1}>
            <ThemedText color="muted3">CURRENT PLAN</ThemedText>
            <Box flexGrow={1} />
            {notice ? <ThemedText color="agenc">{notice}</ThemedText> : null}
          </ThemedBox>
          <Box flexDirection="column" paddingX={1} paddingY={1}>
            {visibleItems.slice(windowStart, windowStart + 12).map((item, localIndex) => {
              const index = localIndex + windowStart;
              const active = index === activeIndex;
              const glyph = AURA_PLAN_GLYPHS[item.state];
              const text = active && editing ? `${draft}█` : compact(item.text);
              return (
                <ThemedBox
                  key={`${index}-${item.text}`}
                  flexDirection="row"
                  backgroundColor={active ? "agencWash" : undefined}
                >
                  <Box width={1}>
                    <ThemedText color={active ? "agenc" : "lineSoft"}>{active ? "▌" : " "}</ThemedText>
                  </Box>
                  <Box width={4}>
                    <ThemedText color="muted3">{String(index + 1).padStart(2, "0")}</ThemedText>
                  </Box>
                  <Box width={2}>
                    <ThemedText color={item.state === "pending" ? "muted3" : "agenc"}>{glyph}</ThemedText>
                  </Box>
                  <Box flexGrow={1} overflow="hidden">
                    <ThemedText color={active ? "agenc" : "text2"} wrap={active && editing ? "truncate-start" : "truncate-end"}>
                      {text}
                    </ThemedText>
                  </Box>
                </ThemedBox>
              );
            })}
          </Box>
        </ThemedBox>
      </Box>
    </Popup>
  );
}

export function openPlanDashboard(
  ctx: SlashCommandContext,
  snapshot: PlanDashboardSnapshot,
  options: {
    readonly onPlanTextChange?: (nextPlanText: string, previousPlanText: string) => void | Promise<void>;
  } = {},
): boolean {
  return openLocalJsxCommand(ctx, close => (
    <PlanDashboardView
      snapshot={snapshot}
      onDone={close}
      onPlanTextChange={options.onPlanTextChange}
    />
  ));
}
