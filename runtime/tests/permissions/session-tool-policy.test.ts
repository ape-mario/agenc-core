import { describe, expect, it } from "vitest";
import {
  attachContextDefaults,
  hasPermissionsToUseTool,
  type AppStateSnapshot,
  type ToolEvaluatorContext,
} from "../../src/permissions/evaluator.js";
import { freshDenialTracking } from "../../src/permissions/denial-tracking.js";
import {
  PermissionModeRegistry,
} from "../../src/permissions/permission-mode.js";
import {
  MAX_SESSION_TOOL_POLICY_TOOLS,
  TOOL_POLICY_METADATA_KEY,
  TOOL_POLICY_MODE_CEILING_METADATA_KEY,
  isWiderPermissionMode,
  normalizeSessionToolPolicy,
  retainedToolPolicyModeCeiling,
  sameSessionToolPolicy,
  sessionToolPolicyAllowsTool,
  sessionToolPolicyFromMetadata,
  sessionToolPolicyIssue,
} from "../../src/permissions/session-tool-policy.js";
import {
  createEmptyToolPermissionContext,
  immutableToolPermissionContext,
  type PermissionMode,
  type ToolPermissionContext,
} from "../../src/permissions/types.js";
import { applyUnattendedPermissionPolicyToContext } from "../../src/permissions/unattended-policy.js";
import type { Session } from "../../src/session/session.js";

describe("sessionToolPolicyIssue", () => {
  it("accepts a minimal and a full policy", () => {
    expect(sessionToolPolicyIssue({ enabledTools: ["FileRead"] })).toBeUndefined();
    expect(
      sessionToolPolicyIssue({
        enabledTools: ["FileRead", "mcp.desktop.read_file", "mcp.plugin:srv.tool-1"],
        frozenPermissionMode: true,
        deferMcpTools: false,
      }),
    ).toBeUndefined();
  });

  it.each([
    [undefined, "must be an object"],
    [[], "must be an object"],
    ["FileRead", "must be an object"],
    [{}, "enabledTools must be an array of strings"],
    [{ enabledTools: "FileRead" }, "enabledTools must be an array of strings"],
    [{ enabledTools: [] }, "enabledTools must not be empty"],
    [{ enabledTools: ["FileRead", 3] }, "enabledTools must be an array of strings"],
    [{ enabledTools: ["FileRead", "FileRead"] }, 'lists "FileRead" more than once'],
    [{ enabledTools: [""] }, "not a well-formed tool name"],
    [{ enabledTools: [" FileRead"] }, "not a well-formed tool name"],
    [{ enabledTools: ["File Read"] }, "not a well-formed tool name"],
    [{ enabledTools: [".hidden"] }, "not a well-formed tool name"],
    [{ enabledTools: ["a/b"] }, "not a well-formed tool name"],
    [{ enabledTools: ["tool\n"] }, "not a well-formed tool name"],
    [{ enabledTools: ["x".repeat(129)] }, "not a well-formed tool name"],
    [{ enabledTools: ["FileRead"], frozenPermissionMode: "yes" }, "frozenPermissionMode must be a boolean"],
    [{ enabledTools: ["FileRead"], deferMcpTools: 0 }, "deferMcpTools must be a boolean"],
    [{ enabledTools: ["FileRead"], extra: true }, "does not accept 'extra'"],
  ])("rejects %j", (value, fragment) => {
    expect(sessionToolPolicyIssue(value)).toContain(fragment);
  });

  it("caps the number of tools", () => {
    const tooMany = Array.from({ length: MAX_SESSION_TOOL_POLICY_TOOLS + 1 }, (_, i) => `tool${i}`);
    expect(sessionToolPolicyIssue({ enabledTools: tooMany })).toContain("at most");
    expect(sessionToolPolicyIssue({ enabledTools: tooMany.slice(0, -1) })).toBeUndefined();
  });
});

describe("normalizeSessionToolPolicy and metadata", () => {
  it("returns a frozen copy that omits unset flags", () => {
    const input = { enabledTools: ["FileRead"] };
    const policy = normalizeSessionToolPolicy(input);
    expect(policy).toEqual({ enabledTools: ["FileRead"] });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.enabledTools)).toBe(true);
    expect(policy.enabledTools).not.toBe(input.enabledTools);
    expect(() => normalizeSessionToolPolicy({ enabledTools: [] })).toThrow(/invalid toolPolicy/);
  });

  it("reads the stored policy back, and fails closed on a malformed one", () => {
    expect(sessionToolPolicyFromMetadata(undefined)).toBeUndefined();
    expect(sessionToolPolicyFromMetadata({})).toBeUndefined();
    expect(
      sessionToolPolicyFromMetadata({
        [TOOL_POLICY_METADATA_KEY]: { enabledTools: ["FileRead"], frozenPermissionMode: true },
      }),
    ).toEqual({ enabledTools: ["FileRead"], frozenPermissionMode: true });
    // Dropping a corrupt policy would silently widen a restored session.
    expect(() =>
      sessionToolPolicyFromMetadata({ [TOOL_POLICY_METADATA_KEY]: { enabledTools: [] } }),
    ).toThrow(/invalid toolPolicy/);
    expect(() => sessionToolPolicyFromMetadata({ [TOOL_POLICY_METADATA_KEY]: "FileRead" })).toThrow();
  });

  it("reads the recorded mode ceiling and rejects an unknown one", () => {
    expect(retainedToolPolicyModeCeiling(undefined)).toBeUndefined();
    expect(retainedToolPolicyModeCeiling({ [TOOL_POLICY_MODE_CEILING_METADATA_KEY]: "acceptEdits" }))
      .toBe("acceptEdits");
    expect(() => retainedToolPolicyModeCeiling({ [TOOL_POLICY_MODE_CEILING_METADATA_KEY]: "root" }))
      .toThrow(/ceiling/);
  });

  it("allows only listed names, and everything without a policy", () => {
    const policy = normalizeSessionToolPolicy({ enabledTools: ["FileRead"] });
    expect(sessionToolPolicyAllowsTool(policy, "FileRead")).toBe(true);
    expect(sessionToolPolicyAllowsTool(policy, "fileread")).toBe(false);
    expect(sessionToolPolicyAllowsTool(policy, "system.bash")).toBe(false);
    expect(sessionToolPolicyAllowsTool(undefined, "system.bash")).toBe(true);
  });

  it("compares policies by authority, not by order", () => {
    const a = normalizeSessionToolPolicy({ enabledTools: ["A", "B"], frozenPermissionMode: true });
    expect(sameSessionToolPolicy(a, normalizeSessionToolPolicy({ enabledTools: ["B", "A"], frozenPermissionMode: true })))
      .toBe(true);
    expect(sameSessionToolPolicy(a, normalizeSessionToolPolicy({ enabledTools: ["A", "B"] }))).toBe(false);
    expect(sameSessionToolPolicy(a, normalizeSessionToolPolicy({ enabledTools: ["A"], frozenPermissionMode: true })))
      .toBe(false);
  });
});

describe("permission mode ranking", () => {
  it("orders plan below default below acceptEdits below bypass", () => {
    const widerThan = (target: PermissionMode, ceiling: PermissionMode) => isWiderPermissionMode(target, ceiling);
    expect(widerThan("bypassPermissions", "default")).toBe(true);
    expect(widerThan("acceptEdits", "default")).toBe(true);
    expect(widerThan("auto", "acceptEdits")).toBe(true);
    expect(widerThan("default", "default")).toBe(false);
    expect(widerThan("plan", "default")).toBe(false);
    expect(widerThan("dontAsk", "default")).toBe(false);
    expect(widerThan("default", "plan")).toBe(true);
    expect(widerThan("default", "unattended")).toBe(false);
    expect(widerThan("acceptEdits", "unattended")).toBe(true);
  });
});

describe("the tool allowlist on the bypass-immune permission floor", () => {
  function contextFor(mode: PermissionMode, enabledTools: readonly string[] | undefined): ToolEvaluatorContext {
    const ctx: ToolPermissionContext = applyUnattendedPermissionPolicyToContext(
      createEmptyToolPermissionContext({ mode }),
      enabledTools === undefined ? {} : { enabledTools },
    );
    const state: AppStateSnapshot = {
      toolPermissionContext: ctx,
      denialTracking: freshDenialTracking(),
      autoModeActive: false,
    };
    return attachContextDefaults({
      getAppState: (): AppStateSnapshot => state,
      session: { state: { unsafePeek: () => ({ history: [] }) } } as unknown as Session,
    } as ToolEvaluatorContext);
  }

  it.each(["bypassPermissions", "default", "acceptEdits", "unattended"] as const)(
    "denies a tool outside enabledTools in %s mode",
    async (mode) => {
      const context = contextFor(mode, ["FileRead"]);
      const result = await hasPermissionsToUseTool({ name: "system.bash" }, { command: "ls" }, context);
      expect(result.behavior).toBe("deny");
      if (result.behavior === "deny") {
        expect(result.decisionReason).toMatchObject({
          type: "other",
          reason: "session tool policy: system.bash is not enabled",
        });
      }
    },
  );

  it("keeps a listed tool on its normal path", async () => {
    const context = contextFor("bypassPermissions", ["FileRead"]);
    const result = await hasPermissionsToUseTool({ name: "FileRead", isReadOnly: true }, { path: "a" }, context);
    expect(result.behavior).toBe("allow");
  });

  it("matches exact names, not risk families", async () => {
    // exec_command shares the system.bash risk family; listing one must not list the other.
    const context = contextFor("bypassPermissions", ["exec_command"]);
    expect((await hasPermissionsToUseTool({ name: "exec_command" }, { cmd: "ls" }, context)).behavior).toBe("allow");
    expect((await hasPermissionsToUseTool({ name: "system.bash" }, { command: "ls" }, context)).behavior).toBe("deny");
    expect((await hasPermissionsToUseTool({ name: "write_stdin" }, {}, context)).behavior).toBe("deny");
  });

  it("changes nothing without enabledTools", async () => {
    const context = contextFor("bypassPermissions", undefined);
    const result = await hasPermissionsToUseTool({ name: "system.bash" }, { command: "ls" }, context);
    expect(result.behavior).toBe("allow");
  });

  it("survives the registry's immutable snapshot", () => {
    const ctx = applyUnattendedPermissionPolicyToContext(
      createEmptyToolPermissionContext({ mode: "default" }),
      { enabledTools: ["FileRead"] },
    );
    const cloned = immutableToolPermissionContext(ctx, { forceClone: true });
    expect(cloned.unattendedPolicy?.enabledTools).toEqual(["FileRead"]);
    expect(cloned.unattendedPolicy?.enabledTools).not.toBe(ctx.unattendedPolicy?.enabledTools);
  });
});

describe("PermissionModeRegistry mode ceiling", () => {
  const at = (mode: PermissionMode) => createEmptyToolPermissionContext({ mode });

  it("refuses every publication path that would widen the mode", async () => {
    const registry = new PermissionModeRegistry(at("default"));
    registry.freezeModeCeiling("default");
    await expect(registry.update(at("bypassPermissions"))).rejects.toThrow(/frozen by this session's toolPolicy/);
    await expect(
      registry.transact(() => ({ next: at("acceptEdits"), result: () => "wide" })),
    ).rejects.toThrow(/frozen/);
    expect(registry.current().mode).toBe("default");
  });

  it("allows narrowing and a return to the ceiling, never past it", async () => {
    const registry = new PermissionModeRegistry(at("acceptEdits"));
    registry.freezeModeCeiling("acceptEdits");
    await registry.update(at("plan"));
    expect(registry.current().mode).toBe("plan");
    await registry.update(at("acceptEdits"));
    expect(registry.current().mode).toBe("acceptEdits");
    await expect(registry.update(at("bypassPermissions"))).rejects.toThrow(/frozen/);
  });

  it("cannot be raised once set, and is absent by default", () => {
    const registry = new PermissionModeRegistry(at("default"));
    expect(registry.modeCeiling).toBeUndefined();
    registry.freezeModeCeiling("default");
    expect(() => registry.freezeModeCeiling("bypassPermissions")).toThrow(/cannot be raised/);
    registry.freezeModeCeiling("plan");
    expect(registry.modeCeiling).toBe("plan");
  });

  it("changes nothing for a registry without a ceiling", async () => {
    const registry = new PermissionModeRegistry(at("default"));
    await registry.update(at("bypassPermissions"));
    expect(registry.current().mode).toBe("bypassPermissions");
  });
});
