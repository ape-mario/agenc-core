import React from "react";
import { describe, expect, test, vi } from "vitest";
import { PassThrough } from "node:stream";
import stripAnsi from "strip-ansi";
import { createRoot } from "../../src/tui/ink.js";
import { getInkInstance } from "../../src/tui/ink/instances.js";
import { AppStateProvider, getDefaultAppState } from "../../src/tui/state/AppState.js";
async function renderToString(node: React.ReactNode, _columns = 180): Promise<string> {
  const stdin = Object.assign(new PassThrough(), { isTTY: true, ref() {}, unref() {}, setRawMode() {} });
  const stdout = Object.assign(new PassThrough(), { isTTY: true, columns: 180, rows: 50 });
  let output = ""; stdout.on("data", chunk => { output += chunk.toString(); });
  const root = await createRoot({ stdin: stdin as unknown as NodeJS.ReadStream, stdout: stdout as unknown as NodeJS.WriteStream, patchConsole: false, exitOnCtrlC: false });
  try {
    root.render(<AppStateProvider initialState={getDefaultAppState()}>{node}</AppStateProvider>);
    await new Promise(resolve => setTimeout(resolve, 80));
    output = "";
    getInkInstance(stdout as unknown as NodeJS.WriteStream)!.forceRedraw();
    await new Promise(resolve => setTimeout(resolve, 40));
    return stripAnsi(output).replace(/\s+/gu, "").toLowerCase();
  } finally { root.unmount(); }
}

vi.mock("../../src/utils/doctorDiagnostic.js", () => ({ findActiveGeneratedWrapper: vi.fn(async () => null) }));
vi.mock("../../src/utils/config.js", () => ({ getRuntimeState: () => ({ skippedUpdateVersion: "0.19.1-test" }), updateRuntimeState: vi.fn() }));
vi.mock("../../src/bin/update-cli.js", () => ({
  checkAgenCUpdate: vi.fn(async () => ({ currentVersion: "0.19.0", latestVersion: "0.19.0", updateAvailable: false })),
  runAgenCUpdateCli: vi.fn(), sanitizeTerminalText: (value: unknown) => String(value),
}));
import { UpdateMenu, hasSkippedUpdate, NPM_UPDATE_COMMAND } from "../../src/commands/update-menu.js";

describe("update menu", () => {
  test("shows numbered choices and both versions without animations", async () => {
    const text = await renderToString(<UpdateMenu checked={{ currentVersion: "0.19.0", latestVersion: "0.19.1-test", updateAvailable: true } as any} close={() => {}} />, 80);
    expect(text).toContain("agenc0.19.1-testisavailable.youhave0.19.0.");
    for (const choice of ["1updatenow", "2skipthisversion", "3notnow"]) expect(text).toContain(choice);
    expect(text).not.toContain("—");
  });
  test("manual check reports current/latest/install type when up to date", async () => {
    const text = await renderToString(<UpdateMenu checked={{ currentVersion: "0.19.0", latestVersion: "0.19.0", updateAvailable: false } as any} close={() => {}} />, 80);
    expect(text).toContain("uptodate");
    expect(text).toContain("latest:0.19.0");
    expect(text).toContain("installtype:");
  });
  test("skip acknowledges only one release", () => {
    expect(hasSkippedUpdate("0.19.1-test")).toBe(true);
    expect(hasSkippedUpdate("0.19.2-test")).toBe(false);
    expect(NPM_UPDATE_COMMAND).toBe("npm install -g @tetsuo-ai/agenc@latest");
  });
});
