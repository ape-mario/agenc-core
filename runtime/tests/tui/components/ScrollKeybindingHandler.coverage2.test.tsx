import React from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { renderToString } from "../../../src/utils/staticRender.js";

type KeybindingCall = {
  handlers: Record<string, () => unknown>;
  options: { context: string; isActive: boolean };
};

const harness = vi.hoisted(() => {
  const state = {
    addNotification: vi.fn(),
    getClipboardPath: vi.fn(() => "osc52"),
    keybindingCalls: [] as KeybindingCall[],
    selection: {
      clearSelection: vi.fn(),
      copySelection: vi.fn(() => "terminal copy"),
      getState: vi.fn(() => null),
      hasSelection: vi.fn(() => false),
      moveFocus: vi.fn(),
      captureScrolledRows: vi.fn(),
      shiftSelection: vi.fn(),
      shiftAnchor: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
    },
  };

  return state;
});

vi.mock("../../../src/tui/context/notifications.js", () => ({
  useNotifications: () => ({
    addNotification: harness.addNotification,
  }),
}));

vi.mock("../../../src/tui/hooks/useCopyOnSelect.js", () => ({
  useCopyOnSelect: vi.fn(),
  useSelectionBgColor: vi.fn(),
}));

vi.mock("../../../src/tui/ink/hooks/use-selection.js", () => ({
  useSelection: () => harness.selection,
}));

vi.mock("../../../src/tui/ink/terminal.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../../src/tui/ink/terminal.js")>(
      "../../../src/tui/ink/terminal.js",
    );
  return {
    ...actual,
    isXtermJs: vi.fn(() => false),
  };
});

vi.mock("../../../src/tui/ink/termio/osc.js", () => ({
  getClipboardPath: harness.getClipboardPath,
}));

vi.mock("src/utils/debug.js", () => ({
  logForDebugging: vi.fn(),
}));

vi.mock("../../../src/tui/keybindings/useKeybinding.js", () => ({
  useKeybindings: (
    handlers: Record<string, () => unknown>,
    options: { context: string; isActive: boolean },
  ) => {
    harness.keybindingCalls.push({ handlers, options });
  },
}));

vi.mock("../../../src/tui/ink.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/tui/ink.js")>("../../../src/tui/ink.js");
  return {
    ...actual,
    useInput: vi.fn(),
  };
});

describe("ScrollKeybindingHandler copy notification coverage", () => {
  beforeEach(() => {
    harness.addNotification.mockClear();
    harness.getClipboardPath.mockClear();
    harness.getClipboardPath.mockReturnValue("osc52");
    harness.keybindingCalls.length = 0;
    harness.selection.copySelection.mockClear();
    harness.selection.copySelection.mockReturnValue("terminal copy");
  });

  test("reports OSC 52 clipboard delivery when copying a selection", async () => {
    const { ScrollKeybindingHandler } = await import("../../../src/tui/components/ScrollKeybindingHandler.js");

    await renderToString(
      <ScrollKeybindingHandler
        isActive
        scrollRef={{ current: null }}
      />,
      80,
    );

    harness.keybindingCalls[0]?.handlers["selection:copy"]?.();

    expect(harness.selection.copySelection).toHaveBeenCalledOnce();
    expect(harness.addNotification).toHaveBeenCalledWith({
      key: "selection-copied",
      text: "sent 13 chars via OSC 52 · check terminal clipboard settings if paste fails",
      color: "suggestion",
      priority: "immediate",
      timeoutMs: 4000,
    });
  });
});
