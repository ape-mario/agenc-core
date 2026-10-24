import React from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { renderToString } from "../../../src/utils/staticRender.js";
import { AttachmentMessage } from "../../../src/tui/message-renderers/AttachmentMessage.js";

const swarmsMock = vi.hoisted(() => ({
  enabled: false,
}));

const appStateMock = vi.hoisted(() => ({
  tasks: {} as Record<string, unknown>,
}));

vi.mock("bun:bundle", () => ({
  feature: () => false,
}));

vi.mock("../../../src/utils/agentSwarmsEnabled.js", () => ({
  isAgentSwarmsEnabled: () => swarmsMock.enabled,
}));

vi.mock("../../../src/tui/state/AppState.js", () => ({
  useAppState: (selector: (state: typeof appStateMock) => unknown) =>
    selector(appStateMock),
}));

vi.mock("../../../src/tui/components/messageActions.js", () => ({
  useSelectedMessageBg: () => undefined,
}));

vi.mock("../../../src/tui/components/CtrlOToExpand.js", async () => {
  const ReactActual = await vi.importActual<typeof import("react")>("react");
  return {
    CtrlOToExpand: () =>
      ReactActual.createElement("ink-text", null, "ctrl-o"),
  };
});

vi.mock("../../../src/tui/components/MessageResponse.js", async () => {
  const ReactActual = await vi.importActual<typeof import("react")>("react");
  return {
    MessageResponse: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement(ReactActual.Fragment, null, children),
  };
});

vi.mock("../../../src/tui/components/design-system/FullWidthRow.js", async () => {
  const ReactActual = await vi.importActual<typeof import("react")>("react");
  return {
    default: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement(ReactActual.Fragment, null, children),
  };
});

vi.mock("../../../src/tui/message-renderers/UserTextMessage.js", async () => {
  const ReactActual = await vi.importActual<typeof import("react")>("react");
  return {
    UserTextMessage: ({ param }: { param: { text: string } }) =>
      ReactActual.createElement("ink-text", null, `queued: ${param.text}`),
  };
});

vi.mock("../../../src/tui/components/v2/messagePrimitives.js", async () => {
  const ReactActual = await vi.importActual<typeof import("react")>("react");
  return {
    UserImageMessage: ({ imageId }: { imageId: number }) =>
      ReactActual.createElement("ink-text", null, `image ${imageId}`),
  };
});

async function renderAttachment(
  attachment: unknown,
  options: {
    isTranscriptMode?: boolean;
    verbose?: boolean;
  } = {},
): Promise<string> {
  return renderToString(
    <AttachmentMessage
      addMargin={false}
      attachment={attachment as never}
      isTranscriptMode={options.isTranscriptMode}
      verbose={options.verbose ?? false}
    />,
    { columns: 120 },
  );
}

describe("AttachmentMessage coverage swarm 025", () => {
  beforeEach(() => {
    swarmsMock.enabled = false;
    appStateMock.tasks = {};
  });

  test("renders lesser-used visible attachment summaries", async () => {
    await expect(
      renderAttachment({
        content: {
          file: { originalSize: 1536 },
          type: "binary",
        },
        displayPath: "assets/logo.bin",
        type: "file",
      }),
    ).resolves.toContain("Read assets/logo.bin (1.5KB)");

    const memories = await renderAttachment({
      memories: [{ content: "hidden unless verbose", path: "/repo/NOTES.md" }],
      type: "relevant_memories",
    });
    expect(memories).toContain("Recalled 1 memory");
    expect(memories).not.toContain("hidden unless verbose");

    await expect(
      renderAttachment({
        prompt: [
          { text: "first line", type: "text" },
          { source: { media_type: "image/png", type: "base64" }, type: "image" },
          { text: "second line", type: "text" },
        ],
        type: "queued_command",
      }),
    ).resolves.toContain("queued: first line\nsecond line");

    await expect(
      renderAttachment(
        {
          hookEvent: "PostToolUse",
          type: "async_hook_response",
        },
        { isTranscriptMode: true },
      ),
    ).resolves.toContain("Async hook PostToolUse completed");

    await expect(
      renderAttachment({
        decision: "allow",
        hookEvent: "PreToolUse",
        type: "hook_permission_decision",
      }),
    ).resolves.toContain("Allowed by PreToolUse hook");
  });

  test("keeps hidden hook branches silent and falls back to generic tasks", async () => {
    const hiddenCases = [
      { hookEvent: "PostToolUse", type: "async_hook_response" },
      {
        blockingError: { blockingError: "will be summarized elsewhere" },
        hookEvent: "SubagentStop",
        hookName: "cleanup",
        type: "hook_blocking_error",
      },
      {
        hookEvent: "SubagentStop",
        hookName: "cleanup",
        type: "hook_non_blocking_error",
      },
    ];

    for (const attachment of hiddenCases) {
      const output = await renderAttachment(attachment);
      expect(output.trim()).toBe("");
    }

    await expect(
      renderAttachment({
        blockingError: { blockingError: "   " },
        hookEvent: "PreToolUse",
        hookName: "lint",
        type: "hook_blocking_error",
      }),
    ).resolves.toContain("lint hook returned blocking error");

    swarmsMock.enabled = true;
    appStateMock.tasks = {
      other: {
        type: "local_agent",
      },
    };

    await expect(
      renderAttachment({
        description: "cleanup",
        status: "killed",
        taskId: "other",
        taskType: "in_process_teammate",
        type: "task_status",
      }),
    ).resolves.toContain('Task "cleanup" stopped');

    await expect(
      renderAttachment({
        description: "checkpoint",
        status: "paused",
        taskType: "local_agent",
        type: "task_status",
      }),
    ).resolves.toContain('Task "checkpoint" paused');
  });
});
