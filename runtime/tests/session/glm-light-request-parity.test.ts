import { expect, test, vi } from "vitest";
import type { LLMChatOptions, LLMMessage } from "../../src/llm/types.js";
import { assembleBaseInstructionsForModel } from "../../src/prompts/system-prompt.js";
import { runTurn } from "../../src/session/run-turn.js";
import { resolveAgentRuntimeOptions } from "../../src/session/runtime-options.js";
import { SessionProviderService } from "../../src/session/provider-service.js";
import { buildToolRegistry } from "../../src/tool-registry.js";
import type { UnifiedExecProcessManagerLike } from "../../src/unified-exec/types.js";
import { createTestConfigStore, drain, mkCtx, mkProvider, mkSession } from "../fixtures.js";
import { explicitDangerBroker } from "../helpers/explicit-danger-boundary.js";

vi.mock("node:crypto", async importOriginal => ({
  ...await importOriginal<typeof import("node:crypto")>(),
  randomUUID: () => "00000000-0000-4000-8000-000000000001",
}));

const tuning = vi.hoisted(() => ({ enabled: true, onLegacyYield: undefined as (() => void) | undefined }));
vi.mock("../../src/tools/system/exec-command.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/tools/system/exec-command.js")>();
  return {
    ...actual,
    createExecCommandTool: (options: Parameters<typeof actual.createExecCommandTool>[0] = {}) => actual.createExecCommandTool({
      ...options,
      // Reconstruct the former yield callback at the tool boundary. The
      // production registry still builds and presents both requests.
      ...(!tuning.enabled && options.lightMode && options.onSessionYielded
        ? { onSessionYielded: () => tuning.onLegacyYield?.() }
        : {}),
    }),
  };
});
vi.mock("../../src/tools/light-profile.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/tools/light-profile.js")>();
  const { modelFamilyFor } = await import("../../src/llm/model-family.js");
  return {
    ...actual,
    lightUsesGlmTuning: (provider?: string, model?: string) => tuning.enabled && actual.lightUsesGlmTuning(provider, model),
    // Before this change only DeepSeek models used batch Edit. Disabling the
    // tuning here reconstructs that routing without a production env switch.
    lightUsesBatchEdit: (provider?: string, model?: string) => tuning.enabled
      ? actual.lightUsesBatchEdit(provider, model)
      : modelFamilyFor(provider, model) === "deepseek",
  };
});

async function captureRequests(providerName: string, model: string, enabled: boolean, configStore: ReturnType<typeof createTestConfigStore>, execYield = false) {
  tuning.enabled = enabled;
  const requests: string[] = [];
  const provider = mkProvider();
  Object.assign(provider, { name: providerName });
  provider.chatStream = async (messages: LLMMessage[], _onChunk: unknown, options?: LLMChatOptions) => {
    // runtimeOnly is internal history metadata, never sent to the model.
    requests.push(JSON.stringify({ messages, options }, (key, value) => key === "runtimeOnly" ? undefined : value));
    const callExec = execYield && requests.length === 1;
    return { content: callExec ? "" : "Done.",
      toolCalls: callExec ? [{ id: "exec-yield", name: "exec_command", arguments: '{"cmd":"pwd","yield_time_ms":250}' }] : [],
      model, finishReason: callExec ? "tool_calls" as const : "stop" as const,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
  };
  const { session } = mkSession({ provider, model, services: {
    configStore,
    runtimeOptions: resolveAgentRuntimeOptions({}, { lightMode: true, nonInteractive: true }),
    providerService: new SessionProviderService({
      initialProvider: provider, initialProviderName: providerName, initialModel: model,
      environment: {}, sessionId: "glm-parity",
    }),
  } });
  const execCommand = vi.fn(async () => ({
    stdout: "ready", stderr: "", output: "ready", exitCode: null, exit_code: null,
    process_id: 71, timedOut: false, truncated: false, durationMs: 1,
    wall_time_seconds: 0.001, original_token_count: 1,
  }));
  const manager: UnifiedExecProcessManagerLike = {
    maxTimeoutMs: Infinity, execCommand, startDetachedProcess: execCommand,
    writeStdin: vi.fn(), closeAll: vi.fn(async () => {}),
  };
  const registry = buildToolRegistry({
    workspaceRoot: "/tmp", lightMode: true, getSession: () => session,
    ...(execYield ? { unifiedExecManager: manager, sandboxExecutionBroker: explicitDangerBroker } : {}),
  });
  tuning.onLegacyYield = () => registry.discoverToolNames!(["write_stdin"]);
  Object.assign(session.services, { registry });
  const ctx = mkCtx({ modelInfo: session.modelInfo, collaborationMode: { model },
    config: { maxTurns: 100, completionGate: { mode: "never" } },
  } as never);
  const baseInstructions = await assembleBaseInstructionsForModel({
    session, ctx, registry, provider: providerName, promptIdentity: { provider: providerName, model },
    permissionContext: session.permissionModeRegistry.current(), profile: "light",
  });
  try {
    await drain(runTurn(session, { ...ctx, baseInstructions }, "Fix the failing test."));
    expect(requests).toHaveLength(execYield ? 2 : 1);
    if (execYield) expect(execCommand).toHaveBeenCalledOnce();
    return requests;
  } finally {
    tuning.onLegacyYield = undefined;
  }
}

test.each([
  ["deepseek", "deepseek-v4-pro", false],
  ["deepseek", "deepseek-flash", false],
  ["openai", "gpt-6-luna", false],
  ["abliteration", "abliterated-model-large", false],
  ["openrouter", "z-ai/glm-5.3", false],
  ["abliteration", "abliterated-model-large-v2", true],
] as const)("first Light request parity: %s %s (changes=%s)", async (provider, model, changes) => {
  const configStore = createTestConfigStore();
  const [before] = await captureRequests(provider, model, false, configStore);
  const [after] = await captureRequests(provider, model, true, configStore);
  if (changes) expect(after).not.toBe(before);
  else expect(after).toBe(before);
});

test.each([
  ["deepseek", "deepseek-v4-pro"],
  ["deepseek", "deepseek-flash"],
  ["openai", "gpt-6-luna"],
] as const)("Light request after exec yield adds only kill_process: %s %s", async (provider, model) => {
  const configStore = createTestConfigStore();
  const before = await captureRequests(provider, model, false, configStore, true);
  const after = await captureRequests(provider, model, true, configStore, true);
  expect(after[0]).toBe(before[0]);

  const baseline = JSON.parse(before[1]!) as { messages: LLMMessage[]; options: LLMChatOptions };
  const current = JSON.parse(after[1]!) as typeof baseline;
  const baselineNames = baseline.options.tools!.map(tool => tool.function.name);
  expect(baselineNames).toContain("write_stdin");
  expect(baselineNames).not.toContain("kill_process");
  const addedTools = current.options.tools!.filter(tool => tool.function.name === "kill_process");
  expect(addedTools).toHaveLength(1);
  expect(current.messages.some(message => message.role === "tool" &&
    typeof message.content === "string" && message.content.includes("session_id=71"))).toBe(true);

  // Discovery announces each newly loaded tool in history as well as adding
  // its schema and routing entry. Permit exactly the new tool's notice line.
  const baselineNotice = baseline.messages.at(-1)!;
  const currentNotice = current.messages.at(-1)!;
  expect(baselineNotice.role).toBe("user");
  const noticeLines = (baselineNotice.content as string).split("\n");
  const pollingLine = noticeLines.findIndex(line => line.startsWith("write_stdin: "));
  expect(pollingLine).toBeGreaterThan(0);
  noticeLines.splice(pollingLine, 0, `kill_process: ${addedTools[0]!.function.description}`);
  expect(currentNotice).toEqual({ ...baselineNotice, content: noticeLines.join("\n") });

  // This internal count is derived from the larger input and is not model
  // request text. All other options and history bytes must remain identical.
  const { accountedInputTokens: baselineTokens, ...baselineOptions } = baseline.options;
  const { accountedInputTokens: currentTokens, ...currentOptions } = current.options;
  expect(currentTokens).toBeGreaterThan(baselineTokens!);
  const withoutKill = {
    ...current,
    messages: [...current.messages.slice(0, -1), baselineNotice],
    options: {
      ...currentOptions,
      tools: currentOptions.tools!.filter(tool => tool.function.name !== "kill_process"),
      toolRouting: {
        ...currentOptions.toolRouting,
        allowedToolNames: currentOptions.toolRouting!.allowedToolNames!.filter(name => name !== "kill_process"),
      },
    },
  };
  expect(JSON.stringify(withoutKill)).toBe(JSON.stringify({ ...baseline, options: baselineOptions }));
});
