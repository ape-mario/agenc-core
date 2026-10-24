import { describe, expect, it, vi } from "vitest";
import { rewindCommand } from "../../src/commands/rewind.js";
import { buildDefaultRegistry } from "../../src/commands/registry.js";
import type { Session } from "../../src/session/session.js";
import type { SlashCommandContext } from "../../src/commands/types.js";

function mkctx(
  session: Session,
  appState?: SlashCommandContext["appState"],
): SlashCommandContext {
  return {
    session,
    argsRaw: "",
    cwd: "/ws",
    home: "/home/test",
    ...(appState !== undefined ? { appState } : {}),
  };
}

describe("rewindCommand", () => {
  it("is registered in the default command registry", () => {
    const registry = buildDefaultRegistry();
    expect(registry.find("rewind")).toBeDefined();
  });

  it("opens the message selector via the app-state bridge", async () => {
    const requestShowMessageSelector = vi.fn();
    const session = {} as unknown as Session;
    const res = await rewindCommand.execute(
      mkctx(session, { requestShowMessageSelector }),
    );
    expect(requestShowMessageSelector).toHaveBeenCalledOnce();
    expect(res.kind).toBe("skip");
  });

  it("reports TUI requirement when no bridge is available (headless)", async () => {
    const session = {} as unknown as Session;
    const res = await rewindCommand.execute(mkctx(session));
    expect(res.kind).toBe("text");
    if (res.kind === "text") expect(res.text).toMatch(/interactive TUI/);
  });
});
