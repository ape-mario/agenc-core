import { PassThrough } from "node:stream";
import { describe, expect, test, vi } from "vitest";
import React from "react";
import stripAnsi from "strip-ansi";

import {
  calculateFileTreeGutterWidth,
  calculateFullscreenLayoutBudget,
  calculateModalViewport,
  FullscreenLayout,
  shouldShowFileTreeGutter,
  statusLineSegments,
  workspacePathLabel,
} from "./FullscreenLayout.js";
import { AppStateProvider, AppStoreContext, getDefaultAppState } from "../state/AppState.js";
import { createStore } from "../state/store.js";
import { syncCollabAgentEventToAppState } from "../state/collabAgentTaskSync.js";
import { Box, Text } from "../ink.js";
import { createRoot } from "../ink/root.js";
import { renderToString } from "../../utils/staticRender.js";
import { FullscreenModeProvider } from "../context/fullscreenModeContext.js";

function fullscreen(node: React.ReactNode): React.ReactNode {
  return <FullscreenModeProvider enabled={true}>{node}</FullscreenModeProvider>;
}

describe("FullscreenLayout modal viewport", () => {
  test.each([0, 1, 2, 3])(
    "clamps modal rows and maxHeight for tiny terminal height %i",
    (rows) => {
      const viewport = calculateModalViewport(rows, 3);

      expect(viewport.rows).toBeGreaterThanOrEqual(0);
      expect(viewport.columns).toBeGreaterThanOrEqual(0);
      expect(viewport.maxHeight).toBeGreaterThanOrEqual(0);
    },
  );

  test("preserves normal modal sizing on larger terminals", () => {
    expect(calculateModalViewport(24, 100)).toEqual({
      rows: 21,
      columns: 96,
      maxHeight: 22,
    });
  });

  test.each([
    [0, { showScrollable: false, showBottomChrome: false, bottomMaxHeight: 1 }],
    [1, { showScrollable: false, showBottomChrome: false, bottomMaxHeight: 1 }],
    [3, { showScrollable: true, showBottomChrome: false, bottomMaxHeight: 2 }],
    [5, { showScrollable: true, showBottomChrome: true, bottomMaxHeight: 2 }],
    [8, { showScrollable: true, showBottomChrome: true, bottomMaxHeight: 4 }],
    [24, { showScrollable: true, showBottomChrome: true, bottomMaxHeight: 12 }],
  ])("keeps a positive bottom slot budget at terminal height %i", (rows, expected) => {
    expect(calculateFullscreenLayoutBudget(rows)).toEqual(expected);
  });

  test("sizes and gates the optional file-tree gutter for wide fullscreen sessions", () => {
    expect(calculateFileTreeGutterWidth(80)).toBe(0);
    expect(calculateFileTreeGutterWidth(112)).toBe(22);
    expect(calculateFileTreeGutterWidth(148)).toBe(26);
    expect(calculateFileTreeGutterWidth(200)).toBe(28);

    expect(shouldShowFileTreeGutter(148, 40)).toBe(true);
    expect(shouldShowFileTreeGutter(111, 40)).toBe(false);
    expect(shouldShowFileTreeGutter(148, 15)).toBe(false);
    expect(shouldShowFileTreeGutter(148, 40, true)).toBe(false);
  });

  test("does not render the deprecated static file-tree gutter by default", async () => {
    const output = await renderToString(
      <AppStateProvider initialState={getDefaultAppState()}>
        <FullscreenModeProvider enabled={true}>
          <FullscreenLayout
            scrollable={<Text>ready.</Text>}
            bottom={<Text>prompt row</Text>}
          />
        </FullscreenModeProvider>
      </AppStateProvider>,
      { columns: 148, rows: 40 },
    );

    expect(output).not.toContain("FILES");
  });

  test.each([
    ["plan", true],
    ["default", false],
    ["acceptEdits", false],
  ] as const)(
    "renders the plan banner only while permission mode is %s",
    async (mode, shouldRenderBanner) => {
      const state = getDefaultAppState();
      const output = await renderToString(
        <AppStateProvider
          initialState={{
            ...state,
            toolPermissionContext: {
              ...state.toolPermissionContext,
              mode,
            },
          }}
        >
          {fullscreen(
            <FullscreenLayout
              scrollable={<Text>proposal body</Text>}
              bottom={<Text>prompt row</Text>}
            />,
          )}
        </AppStateProvider>,
        { columns: 120, rows: 30 },
      );

      expect(output.includes("PLAN MODE")).toBe(shouldRenderBanner);
      expect(output.includes("AgenC will propose changes first")).toBe(
        shouldRenderBanner,
      );
    },
  );

  test.each([true, false])("counts only working helper tasks when swarm is %s", async swarmMode => {
    const state = getDefaultAppState();
    const statuses = ["running", "pending", "completed", "failed", "killed"] as const;
    const tasks = Object.fromEntries(statuses.map(status => [status, {
      id: status, type: "local_agent", status,
    }])) as typeof state.tasks;
    const output = await renderToString(
      <AppStateProvider initialState={{ ...state, swarmMode, tasks: {
        ...tasks,
        shell: { id: "shell", type: "local_bash", status: "running", isBackgrounded: true } as typeof state.tasks[string],
      } }}>
        {fullscreen(<FullscreenLayout scrollable={<Text>research</Text>} bottom={<Text>prompt</Text>} />)}
      </AppStateProvider>,
      { columns: 180, rows: 24 },
    );
    expect(output.includes("swarm (2)")).toBe(swarmMode);
    expect(output).not.toContain("swarm (3)");
  });

  test.each([0, 1, 2])("shows the footer count for %i active agents beside shells", async agentCount => {
    const state = getDefaultAppState();
    const tasks = Object.fromEntries(Array.from({ length: agentCount }, (_, index) => [index, {
      id: String(index), type: "local_agent", status: index === 0 ? "running" : "pending",
    }])) as typeof state.tasks;
    const output = await renderToString(
      <AppStateProvider initialState={{ ...state, swarmMode: false, tasks: {
        ...tasks,
        shell: { id: "shell", type: "local_bash", status: "running", isBackgrounded: true } as typeof state.tasks[string],
        completed: { id: "completed", type: "local_agent", status: "completed" } as typeof state.tasks[string],
        failed: { id: "failed", type: "local_agent", status: "failed" } as typeof state.tasks[string],
        killed: { id: "killed", type: "local_agent", status: "killed" } as typeof state.tasks[string],
      } }}>
        {fullscreen(<FullscreenLayout scrollable={<Text>research</Text>} bottom={<Text>prompt</Text>} />)}
      </AppStateProvider>,
      { columns: 180, rows: 24 },
    );
    if (agentCount === 0) {
      expect(output).not.toMatch(/\b\d+ agents?\b/u);
      expect(output).toContain("1 shell");
    } else {
      expect(output).toContain(`1 shell · ${agentCount} ${agentCount === 1 ? "agent" : "agents"}`);
    }
  });

  test("updates the mounted footer when subagents finish after a wait timeout", async () => {
    const store = createStore({ ...getDefaultAppState(), swarmMode: false });
    const applyEvent = (event: unknown) => syncCollabAgentEventToAppState(event, updater => {
      store.setState(state => updater(state) as typeof state);
    });
    for (const id of ["agent-1", "agent-2"]) {
      applyEvent({ type: "collab_agent_spawn_end", payload: { newThreadId: id, status: "running" } });
    }
    const stdout = new PassThrough();
    Object.assign(stdout, { columns: 180, rows: 24 });
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
        <AppStoreContext.Provider value={store}>
          {fullscreen(<FullscreenLayout scrollable={<Text>research</Text>} bottom={<Text>prompt</Text>} />)}
        </AppStoreContext.Provider>,
      );
      await vi.waitFor(() => expect(latestFrame()).toContain("2 agents"));
      applyEvent({ type: "collab_waiting_end", payload: { timedOut: true, agentStatuses: [] } });
      expect(latestFrame()).toContain("2 agents");
      applyEvent({ type: "background_agent_status", payload: {
        agentId: "agent-1", status: "idle", runStatus: "completed",
      } });
      await vi.waitFor(() => {
        expect(latestFrame()).toContain("1 agent");
        expect(latestFrame()).not.toContain("2 agents");
      });
      output = "";
      applyEvent({ type: "collab_agent_status", payload: { threadId: "agent-2", status: "completed" } });
      await vi.waitFor(() => {
        expect(latestFrame()).toContain("asks first");
        expect(latestFrame()).not.toMatch(/\b\d+ agents?\b/u);
      });
    } finally {
      root.unmount();
      stdin.end();
      stdout.end();
    }
  });

  test("does not count a finished helper that is briefly re-sent as running", async () => {
    // Cancelling the parent re-emits finished helpers as running, still
    // carrying their end time, before they settle again (swc RC4.8 Esc case).
    const state = getDefaultAppState();
    const tasks = {
      live: { id: "live", type: "local_agent", status: "running" },
      stale: { id: "stale", type: "local_agent", status: "running", startTime: 1, endTime: 2 },
    } as unknown as typeof state.tasks;
    const output = await renderToString(
      <AppStateProvider initialState={{ ...state, swarmMode: true, tasks }}>
        {fullscreen(<FullscreenLayout scrollable={<Text>research</Text>} bottom={<Text>prompt</Text>} />)}
      </AppStateProvider>,
      { columns: 180, rows: 24 },
    );
    expect(output).toContain("swarm (1)");
    expect(output).not.toContain("swarm (2)");
    expect(output).toContain("1 agent");
    expect(output).not.toContain("2 agents");
  });

  test("omits the Light label without changing other status facts", () => {
    const regular = statusLineSegments(100, "~/project", "deepseek-flash", "default", "main", "$0.04", "max effort");
    const light = statusLineSegments(100, "~/project", "deepseek-flash", "default", "main", "$0.04", "max effort", true);
    expect(light).toEqual(regular);
    expect(light.light).toBeNull();
  });

  test("shows each status fact once with plain mode labels", () => {
    expect(
      statusLineSegments(100, "~/project", "grok-4-fast", "bypassPermissions", "main", "$0.04"),
    ).toEqual({
      folder: "~/project",
      model: "grok-4-fast",
      effort: null,
      mode: "never asks",
      light: null,
      branch: "main",
      spend: "$0.04",
    });
    expect(
      statusLineSegments(100, "~/project", "grok-4-fast", "acceptEdits", "main", "$0.00").mode,
    ).toBe("edits freely");
    expect(
      statusLineSegments(100, "~/project", "grok-4-fast", "plan", "main", "$0.00").mode,
    ).toBe("plan only");
  });

  test("drops the folder, then the branch, on narrow terminals", () => {
    expect(
      statusLineSegments(72, "~/project", "grok-4-fast", "default", "main", "$0.00"),
    ).toMatchObject({ folder: null, branch: "main" });
    expect(
      statusLineSegments(60, "~/project", "grok-4-fast", "default", "main", "$0.00"),
    ).toMatchObject({ folder: null, branch: null, model: "grok-4-fast" });
  });

  test("shows the session effort next to the model", () => {
    expect(
      statusLineSegments(100, "~/project", "deepseek-flash", "default", "main", "", "high effort").effort,
    ).toBe("high effort");
  });

  test("hides the branch outside git and the spend until usage arrives", () => {
    expect(
      statusLineSegments(100, "~/project", "grok-4-fast", "default", null, ""),
    ).toEqual({
      folder: "~/project",
      model: "grok-4-fast",
      effort: null,
      mode: "asks first",
      light: null,
      branch: null,
      spend: null,
    });
  });

  test.each([
    [148, 40],
    [120, 30],
    [80, 24],
  ])("smoke-renders the v2 frame at %ix%i", async (columns, rows) => {
    const state = getDefaultAppState();
    const output = await renderToString(
      <AppStateProvider initialState={state}>
        {fullscreen(
          <FullscreenLayout
            scrollable={
              <Box flexDirection="column">
                <Text>ready.</Text>
                <Text>/help for commands · /claim for protocol tasks</Text>
              </Box>
            }
            bottom={<Text>prompt owns this row</Text>}
          />,
        )}
      </AppStateProvider>,
      { columns, rows },
    );

    const lines = output.split(/\r?\n/u);
    // One status line under the prompt and no top bar.
    expect(output).toContain("asks first");
    expect(output).toContain("$0.00");
    expect(output).not.toContain("orchestrator");
    expect(output).not.toContain("spend");
    expect(output).not.toContain("—");
    // No fabricated chrome: no real ctx%/stake feed exists at this point in
    // the tree, so those segments must stay hidden rather than show fake data.
    expect(output).not.toContain("ctx 0%");
    expect(output).not.toContain("12.4K");
    expect(output).not.toContain("◆");
    expect(output).not.toMatch(/[░▒▓]/u);
    expect(output).not.toContain("undefined");
    expect(output).not.toContain("NaN");
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(columns);
    }
  });
});

describe('workspacePathLabel', () => {
  test('abbreviates only the actual home prefix and keeps nested directories', () => {
    expect(workspacePathLabel('/home/paul/claude-agenc-work/tq1-tui-round3/ws', '/home/paul'))
      .toBe('~/claude-agenc-work/tq1-tui-round3/ws');
    expect(workspacePathLabel('/home/paul', '/home/paul')).toBe('~');
    expect(workspacePathLabel('/opt/ws', '/home/paul')).toBe('/opt/ws');
    expect(workspacePathLabel('/home/paulish/ws', '/home/paul')).toBe('/home/paulish/ws');
  });
});
