/**
 * Light sends its tool definitions ahead of the conversation on every
 * request, so a prompt cache reuses a request's prefix only while the tool
 * definitions before it stay byte for byte where they were. A tool loaded
 * mid-session (by system.searchTools or by the runtime when a command
 * yields) joins after the tools the session started with, in load order,
 * like standard sessions (tool-registry.ts loadOrderedSpecs).
 */
import { describe, expect, test } from "vitest";

import { buildToolRegistry } from "../../src/tool-registry.js";
import {
  buildFilteredRegistry,
  TEST_ONLY_ALLOW_UNADMITTED_CHILD_REGISTRY_DISPATCH,
} from "../../src/agents/run-agent.js";
import { SYSTEM_SEARCH_TOOLS_NAME } from "../../src/tools/system/tool-search-name.js";
import { explicitDangerBroker } from "../helpers/explicit-danger-boundary.js";

type Registry = ReturnType<typeof buildToolRegistry>;

const LIGHT_START = [SYSTEM_SEARCH_TOOLS_NAME, "exec_command", "FileRead", "Edit", "Write"];

function lightRegistry(): Registry {
  return buildToolRegistry({
    workspaceRoot: "/tmp",
    requireAdmission: false,
    sandboxExecutionBroker: explicitDangerBroker,
    lightMode: true,
  });
}

const names = (registry: Registry): string[] =>
  registry.toLLMTools().map((tool) => tool.function.name);

const definitions = (registry: Registry): string => JSON.stringify(registry.toLLMTools());

async function select(registry: Registry, name: string): Promise<void> {
  const result = await registry.dispatch({
    id: `select-${name}`,
    name: SYSTEM_SEARCH_TOOLS_NAME,
    arguments: JSON.stringify({ select: name }),
  });
  expect(JSON.parse(result.content).loaded).toEqual([name]);
}

/** The earlier request's tool definitions are the leading bytes of the later one's. */
function expectPrefixKept(before: string, after: string): void {
  expect(after.startsWith(before.slice(0, -1))).toBe(true);
}

describe("Light tool order", () => {
  test("a loaded tool joins after the tools the session started with, in load order", async () => {
    const tools = lightRegistry();
    expect(names(tools)).toEqual(LIGHT_START);
    const first = definitions(tools);
    await select(tools, "Grep");
    const second = definitions(tools);
    expectPrefixKept(first, second);
    // The registry lists write_stdin right after exec_command and Glob before
    // Grep; neither may move a tool that was already sent.
    await select(tools, "write_stdin");
    expectPrefixKept(second, definitions(tools));
    await select(tools, "Glob");
    expect(names(tools)).toEqual([...LIGHT_START, "Grep", "write_stdin", "Glob"]);
  });

  test("a tool the runtime loads by itself, write_stdin after a command yields, also joins at the end", () => {
    const tools = lightRegistry();
    tools.discoverToolNames?.(["Grep"]);
    const before = definitions(tools);
    tools.discoverToolNames?.(["write_stdin"]);
    expectPrefixKept(before, definitions(tools));
    expect(names(tools)).toEqual([...LIGHT_START, "Grep", "write_stdin"]);
  });

  test("selecting a tool the session started with keeps its place", async () => {
    const tools = lightRegistry();
    await select(tools, "Grep");
    await select(tools, "exec_command");
    expect(names(tools)).toEqual([...LIGHT_START, "Grep"]);
    // exec_command now carries its full schema where the lean one was.
    const exec = tools.toLLMTools()[1]?.function;
    expect(exec?.name).toBe("exec_command");
    expect(Object.keys((exec?.parameters as { properties: object }).properties)).toContain("yield_time_ms");
  });

  test("a Light child keeps the tools it started with first and appends its own loads", async () => {
    const child = buildFilteredRegistry(lightRegistry(), {
      childConversationId: "child",
      lightMode: true,
      unadmittedDispatchOverride: TEST_ONLY_ALLOW_UNADMITTED_CHILD_REGISTRY_DISPATCH,
    });
    const start = names(child);
    expect(start).toEqual(LIGHT_START);
    const first = definitions(child);
    await select(child, "Grep");
    const second = definitions(child);
    expectPrefixKept(first, second);
    await select(child, "write_stdin");
    expectPrefixKept(second, definitions(child));
    await select(child, "Glob");
    expect(names(child)).toEqual([...start, "Grep", "write_stdin", "Glob"]);
  });
});
