import { homedir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import React from "react";
import stripAnsi from "strip-ansi";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FullscreenLayout, statusLineUsageItems } from "./FullscreenLayout.js";
import { ThemeProvider } from "./design-system/ThemeProvider.js";
import { FullscreenModeProvider } from "../context/fullscreenModeContext.js";
import { SessionUsageContext, type SessionUsageSnapshot } from "../context/sessionUsageContext.js";
import {
  StatusContextUsageContext,
  StatusEffortContext,
  StatusOffPeakContext,
  StatusPromptCacheContext,
} from "../context/statusEffortContext.js";
import { AppStateProvider, getDefaultAppState } from "../state/AppState.js";
import { Text } from "../ink.js";
import { createRoot } from "../ink/root.js";
import { stringWidth } from "../ink/stringWidth.js";
import { renderToAnsiString, renderToString } from "../../utils/staticRender.js";
import { getTheme } from "../../utils/theme.js";
import { resolveThemeSetting } from "../../utils/terminalBackground.js";
import { TUI_THEME_SETTINGS } from "../../config/schema.js";
import { modelDisplayString } from "../../utils/model/model.js";
import { offPeakScheduleFor, type OffPeakSchedule } from "../../session/off-peak-pricing.js";
import { promptCacheSharePercent } from "../../session/prompt-cache-share.js";
import { createSessionTranscriptStateForTesting } from "../session-transcript.js";

const MODEL = "qwen3-coder-480b-a35b-instruct";
const SPEND: SessionUsageSnapshot = { costUsd: 0.0044, hasUnknownCost: false };
const DEEPSEEK_HOURS = offPeakScheduleFor("deepseek", "deepseek-flash");
const SATURDAY_OFF_PEAK = "2026-10-24T02:00:00Z";
const MONDAY_PEAK = "2026-10-19T02:00:00Z";

type FooterOptions = {
  readonly columns?: number;
  readonly contextPercent?: number | null;
  readonly cachePercent?: number | null;
  readonly usage?: SessionUsageSnapshot | null;
  readonly offPeak?: OffPeakSchedule | null;
  readonly effort?: string | null;
};

function footerTree(options: FooterOptions): React.ReactElement {
  return (
    <AppStateProvider initialState={{ ...getDefaultAppState(), mainLoopModel: MODEL }}>
      <SessionUsageContext value={options.usage === undefined ? SPEND : options.usage}>
        <StatusEffortContext value={options.effort ?? null}>
          <StatusContextUsageContext value={options.contextPercent === undefined ? 9 : options.contextPercent}>
            <StatusPromptCacheContext value={options.cachePercent === undefined ? 91 : options.cachePercent}>
              <StatusOffPeakContext value={options.offPeak ?? null}>
                <FullscreenModeProvider enabled>
                  <FullscreenLayout scrollable={<Text>ready</Text>} bottom={<Text>prompt</Text>} />
                </FullscreenModeProvider>
              </StatusOffPeakContext>
            </StatusPromptCacheContext>
          </StatusContextUsageContext>
        </StatusEffortContext>
      </SessionUsageContext>
    </AppStateProvider>
  );
}

/** The rendered status line: the row that carries the permission mode. */
async function footer(options: FooterOptions = {}): Promise<string> {
  const output = await renderToString(footerTree(options), { columns: options.columns ?? 140, rows: 24 });
  const line = output.split(/\r?\n/u).find((row) => row.includes("asks first"));
  expect(line, output).toBeDefined();
  return line!;
}

const ANSI16 = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

/** Each visible character of the status line with the foreground it is drawn in. */
async function coloredFooter(
  setting: (typeof TUI_THEME_SETTINGS)[number],
  options: FooterOptions = {},
): Promise<{ readonly text: string; readonly colorOf: (part: string, from?: number) => string | null }> {
  const output = await renderToAnsiString(
    <ThemeProvider initialState={setting}>{footerTree(options)}</ThemeProvider>,
    { columns: options.columns ?? 140, rows: 24, color: true },
  );
  const row = output.split(/\r?\n/u).find((line) => stripAnsi(line).includes("asks first"));
  expect(row, output).toBeDefined();
  const cells: { ch: string; fg: string | null }[] = [];
  let fg: string | null = null;
  // Drop OSC sequences (hyperlinks), then walk SGR codes and characters.
  const line = row!.replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/gu, "");
  for (const token of line.match(/\u001b\[[0-9;]*[A-Za-z]|[^\u001b]/gu) ?? []) {
    if (!token.startsWith("\u001b")) {
      cells.push({ ch: token, fg });
      continue;
    }
    if (!token.endsWith("m")) continue;
    const params = token.slice(2, -1).split(";").map((value) => Number(value || "0"));
    for (let i = 0; i < params.length; i += 1) {
      const code = params[i]!;
      if (code === 0 || code === 39) fg = null;
      else if (code >= 30 && code <= 37) fg = `ansi:${ANSI16[code - 30]}`;
      else if (code >= 90 && code <= 97) fg = `ansi:${ANSI16[code - 90]}Bright`;
      else if (code === 38 && params[i + 1] === 2) {
        fg = `rgb(${params[i + 2]},${params[i + 3]},${params[i + 4]})`;
        i += 4;
      } else if (code === 38 && params[i + 1] === 5) {
        fg = `ansi256(${params[i + 2]})`;
        i += 2;
      } else if (code === 48) i += params[i + 1] === 2 ? 4 : 2;
    }
  }
  const text = cells.map((cell) => cell.ch).join("");
  /** The one color every visible character of `part` is drawn in. */
  const colorOf = (part: string, from = 0): string | null => {
    const index = text.indexOf(part, from);
    expect(index, `${part} in ${text}`).toBeGreaterThanOrEqual(0);
    const colors = new Set(cells.slice(index, index + part.length).filter((cell) => cell.ch.trim() !== "").map((cell) => cell.fg));
    expect(colors.size, `${part} has one color`).toBe(1);
    return [...colors][0]!;
  };
  return { text, colorOf };
}

/** Cache share from token_count events, as App computes it for the footer. */
function cacheShareOf(...payloads: readonly Record<string, unknown>[]): number | null {
  const state = createSessionTranscriptStateForTesting(payloads.map((payload, index) => ({
    type: "token_count", id: `token-${index}`, seq: index + 1,
    payload: { model: "model", completionTokens: 10, ...payload },
  })));
  return promptCacheSharePercent(state.promptCache);
}

beforeEach(() => {
  vi.spyOn(process, "cwd").mockReturnValue(join(homedir(), "project"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("status line cache share", () => {
  test("sits between ctx and cost with the same separators", async () => {
    expect(await footer()).toContain("ctx 9% · cache 91% · $0.0044");
  });

  test("shows the share a reporting provider's calls add up to, rounded", async () => {
    const share = cacheShareOf(
      { provider: "deepseek", promptTokens: 1000, totalTokens: 1010, cachedInputTokens: 0 },
      { provider: "deepseek", promptTokens: 1000, totalTokens: 1010, cachedInputTokens: 1000 },
      { provider: "deepseek", promptTokens: 1000, totalTokens: 1010, cachedInputTokens: 1000 },
    );
    expect(share).toBe(67);
    expect(await footer({ cachePercent: share })).toContain("ctx 9% · cache 67% · $0.0044");
  });

  test("is hidden for providers that report no cached tokens and for local models", async () => {
    const neverReported = cacheShareOf({ provider: "groq", promptTokens: 4000, totalTokens: 4010 });
    const local = cacheShareOf({ provider: "ollama", promptTokens: 4000, totalTokens: 4010, cachedInputTokens: 3000 });
    const beforeUsage = cacheShareOf();
    for (const share of [neverReported, local, beforeUsage]) {
      expect(share).toBeNull();
      const line = await footer({ cachePercent: share });
      expect(line).not.toContain("cache");
      expect(line).toContain("ctx 9% · $0.0044");
    }
  });

  test("joins the cost alone when no context figure is known yet", async () => {
    expect(await footer({ contextPercent: null })).toContain("cache 91% · $0.0044");
  });

  test("narrow terminals drop the cache share before anything else", async () => {
    const left = ["~/project", modelDisplayString(MODEL), "high effort", "asks first"].join(" · ");
    const right = "ctx 9% · cache 91% · $0.0044";
    // The row is padded by two columns on each side, with a gap before the right block.
    const fits = 4 + stringWidth(left) + 1 + stringWidth(right);
    const fitsWithoutCache = fits - stringWidth("cache 91% · ");
    expect(fitsWithoutCache - 1).toBeGreaterThanOrEqual(80);

    const full = await footer({ columns: fits, effort: "high effort" });
    expect(full).toContain(left);
    expect(full).toContain(right);

    // One column short: only the cache share goes.
    for (const columns of [fits - 1, fitsWithoutCache]) {
      const narrower = await footer({ columns, effort: "high effort" });
      expect(narrower, `${columns}`).not.toContain("cache");
      expect(narrower, `${columns}`).toContain(left);
      expect(narrower, `${columns}`).toContain("ctx 9% · $0.0044");
    }

    // Narrower still: the folder follows, as before.
    const narrowest = await footer({ columns: fitsWithoutCache - 1, effort: "high effort" });
    expect(narrowest).not.toContain("cache");
    expect(narrowest).not.toContain("~/project");
    expect(narrowest).toContain("ctx 9% · $0.0044");
  });
});

describe("status line off-peak mark", () => {
  test("follows the cost inside the provider's off-peak hours", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(SATURDAY_OFF_PEAK) });
    expect(await footer({ offPeak: DEEPSEEK_HOURS })).toContain("ctx 9% · cache 91% · $0.0044 off-peak");
  });

  test("is hidden at a peak hour", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(MONDAY_PEAK) });
    const line = await footer({ offPeak: DEEPSEEK_HOURS });
    expect(line).toContain("ctx 9% · cache 91% · $0.0044");
    expect(line).not.toContain("off-peak");
  });

  test("shows for Ollama Cloud's DeepSeek models outside Ollama's peak hours", async () => {
    const ollama = offPeakScheduleFor("ollama-cloud", "deepseek-v4.1-flash:1017");
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(SATURDAY_OFF_PEAK) });
    expect(await footer({ offPeak: ollama })).toContain("ctx 9% · cache 91% · $0.0044 off-peak");
    vi.setSystemTime(new Date("2026-10-22T13:00:00Z")); // A Thursday, inside Ollama's peak hours.
    expect(await footer({ offPeak: ollama })).not.toContain("off-peak");
  });

  test("is hidden for providers without recorded hours", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(SATURDAY_OFF_PEAK) });
    for (const schedule of [
      offPeakScheduleFor("ollama-cloud", "glm-5.3"),
      offPeakScheduleFor("openrouter", "deepseek/deepseek-v4.1-flash"),
      offPeakScheduleFor("anthropic", "claude-opus-5-5"),
    ]) {
      expect(schedule).toBeNull();
      expect(await footer({ offPeak: schedule })).not.toContain("off-peak");
    }
  });

  test("never qualifies a missing or unknown price", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(SATURDAY_OFF_PEAK) });
    expect(await footer({ offPeak: DEEPSEEK_HOURS, usage: null })).not.toContain("off-peak");
    const unknown = await footer({
      offPeak: DEEPSEEK_HOURS,
      usage: { costUsd: 0.045, hasUnknownCost: false, costEstimated: true },
    });
    expect(unknown).toContain("price unknown");
    expect(unknown).not.toContain("off-peak");
  });

  test("updates when an hour boundary passes while nothing else renders", async () => {
    // One second before peak hours start on a Monday.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T00:59:59.900Z") });
    const stdout = new PassThrough();
    Object.assign(stdout, { columns: 140, rows: 24 });
    const stdin = Object.assign(new PassThrough(), {
      isTTY: true, ref() {}, unref() {}, setRawMode() {},
    });
    let output = "";
    stdout.on("data", chunk => { output += chunk.toString(); });
    const latestFrame = () => {
      const end = output.lastIndexOf("\x1b[?2026l");
      const start = output.lastIndexOf("\x1b[?2026h", end);
      return stripAnsi(output.slice(start, end));
    };
    const root = await createRoot({
      patchConsole: false,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
    });
    try {
      root.render(
        <AppStateProvider initialState={{ ...getDefaultAppState(), mainLoopModel: MODEL }}>
          <SessionUsageContext value={SPEND}>
            <StatusOffPeakContext value={DEEPSEEK_HOURS}>
              <FullscreenModeProvider enabled>
                <FullscreenLayout scrollable={<Text>ready</Text>} bottom={<Text>prompt</Text>} />
              </FullscreenModeProvider>
            </StatusOffPeakContext>
          </SessionUsageContext>
        </AppStateProvider>,
      );
      await vi.waitFor(() => expect(latestFrame()).toContain("$0.0044 off-peak"));
      // The clock passes 01:00 UTC; the footer re-checks just after the hour.
      vi.setSystemTime(new Date("2026-10-19T01:00:01Z"));
      await vi.waitFor(() => {
        expect(latestFrame()).toContain("$0.0044");
        expect(latestFrame()).not.toContain("off-peak");
      }, { timeout: 3_000 });
    } finally {
      root.unmount();
      stdin.end();
      stdout.end();
    }
  });

  test("goes on a narrow terminal before the model name is cut", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(SATURDAY_OFF_PEAK) });
    const left = [modelDisplayString(MODEL), "asks first"].join(" · ");
    const fits = 4 + stringWidth(left) + 1 + stringWidth("ctx 9% · $0.0044 off-peak");
    expect(fits).toBeLessThan(80); // below the width that shows the folder
    const full = await footer({ columns: fits, cachePercent: null, offPeak: DEEPSEEK_HOURS });
    expect(full).toContain(left);
    expect(full).toContain("ctx 9% · $0.0044 off-peak");
    const narrower = await footer({ columns: fits - 1, cachePercent: null, offPeak: DEEPSEEK_HOURS });
    expect(narrower).toContain(left);
    expect(narrower).toContain("ctx 9% · $0.0044");
    expect(narrower).not.toContain("off-peak");
  });

  test("labels compose in the documented order", () => {
    expect(statusLineUsageItems(9, 91, "$0.0044", true)).toEqual([
      { key: "ctx", spans: [{ text: "ctx ", color: "text2" }, { text: "9%", color: "accentSoft" }] },
      { key: "cache", spans: [{ text: "cache ", color: "text2" }, { text: "91%", color: "accentSoft" }] },
      { key: "spend", spans: [{ text: "$0.0044", color: "accentSoft" }, { text: " off-peak", color: "text2" }] },
    ]);
    expect(statusLineUsageItems(null, null, "≥$0.500", true, "accent")).toEqual([
      { key: "spend", spans: [{ text: "≥$0.500", color: "accent" }, { text: " off-peak", color: "text2" }] },
    ]);
    expect(statusLineUsageItems(85, null, "price unknown", true)).toEqual([
      { key: "ctx", spans: [{ text: "ctx ", color: "text2" }, { text: "85%", color: "error" }] },
      { key: "spend", spans: [{ text: "price unknown", color: "text" }] },
    ]);
    expect(statusLineUsageItems(9, null, null, true)).toEqual([
      { key: "ctx", spans: [{ text: "ctx ", color: "text2" }, { text: "9%", color: "accentSoft" }] },
    ]);
  });
});

describe("status line usage colors", () => {
  test("covers every theme setting", () => {
    expect(TUI_THEME_SETTINGS).toEqual([
      "auto", "dark", "light", "light-daltonized", "dark-daltonized", "light-ansi", "dark-ansi", "olive",
    ]);
  });

  test.each(TUI_THEME_SETTINGS)("%s: figures in the value color, names and separators in secondary ink", async (setting) => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(SATURDAY_OFF_PEAK) });
    const theme = getTheme(resolveThemeSetting(setting));
    // The dark ANSI theme's soft accent is a dark magenta; its bright accent reads on black.
    const value = setting === "dark-ansi" ? theme.accent : theme.accentSoft;
    const { text, colorOf } = await coloredFooter(setting, { offPeak: DEEPSEEK_HOURS });
    const right = text.indexOf("ctx 9%");
    expect(text.slice(right)).toBe("ctx 9% · cache 91% · $0.0044 off-peak");
    expect(colorOf("ctx", right)).toBe(theme.text2);
    expect(colorOf("9%", right)).toBe(value);
    expect(colorOf("cache", right)).toBe(theme.text2);
    expect(colorOf("91%", right)).toBe(value);
    expect(colorOf("$0.0044", right)).toBe(value);
    expect(colorOf("off-peak", right)).toBe(theme.text2);
    const firstSeparator = text.indexOf("·", right);
    expect(colorOf("·", firstSeparator)).toBe(theme.text2);
    expect(colorOf("·", firstSeparator + 1)).toBe(theme.text2);
    // The left side keeps its colors.
    expect(colorOf("~/project")).toBe(theme.text2);
    expect(colorOf(modelDisplayString(MODEL))).toBe(theme.text);
    expect(colorOf("asks first")).toBe(theme.text);
  });

  test.each(TUI_THEME_SETTINGS)("%s: a full context stays an error and an unknown price keeps primary ink", async (setting) => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(SATURDAY_OFF_PEAK) });
    const theme = getTheme(resolveThemeSetting(setting));
    const { text, colorOf } = await coloredFooter(setting, {
      contextPercent: 85,
      cachePercent: null,
      offPeak: DEEPSEEK_HOURS,
      usage: { costUsd: 0.045, hasUnknownCost: false, costEstimated: true },
    });
    const right = text.indexOf("ctx 85%");
    expect(text.slice(right)).toBe("ctx 85% · price unknown");
    expect(colorOf("ctx", right)).toBe(theme.text2);
    expect(colorOf("85%", right)).toBe(theme.error);
    expect(colorOf("price unknown", right)).toBe(theme.text);
  });
});
