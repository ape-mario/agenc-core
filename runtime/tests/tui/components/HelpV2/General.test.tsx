import React from "react";
import { describe, expect, test, vi } from "vitest";

import { renderToString } from "../../../../src/utils/staticRender.js";
import { General } from "../../../../src/tui/components/HelpV2/General.js";

vi.mock("bun:bundle", () => ({
  feature: () => false,
}));

vi.mock("../../../../src/tui/keybindings/useShortcutDisplay.js", () => ({
  useShortcutDisplay: (_action: string, _context: string, fallback: string) =>
    fallback,
}));

vi.mock("../../../../src/tui/keybindings/loadUserBindings.js", () => ({
  isKeybindingCustomizationEnabled: () => false,
}));

vi.mock("../../../../src/utils/platform.js", () => ({
  getPlatform: () => "linux",
}));

function RerenderGeneral() {
  const [tick, setTick] = React.useState(0);

  React.useLayoutEffect(() => {
    if (tick === 0) {
      setTick(1);
    }
  }, [tick]);

  return <General runtimeState={{}} />;
}

describe("HelpV2 General", () => {
  test("renders the overview copy and shortcut section", async () => {
    const output = await renderToString(<RerenderGeneral />, 120);

    expect(output).toContain("AgenC understands your codebase");
    expect(output).toContain("Shortcuts");
    expect(output).toMatch(/!\s+run a shell command/);
    expect(output).toContain("shift+tab or alt+m");
    expect(output).toContain("change mode");
  });
});
