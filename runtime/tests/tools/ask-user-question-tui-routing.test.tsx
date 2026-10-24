import { describe, expect, test, vi } from "vitest";

vi.mock("../../src/tui/ink.js", () => {
  function Box(_props: { readonly children?: unknown }) {
    return null;
  }
  function Text(_props: { readonly children?: unknown }) {
    return null;
  }
  return { Box, Text };
});

import {
  createTuiTool,
  createTuiTools,
} from "../../src/tui/tool-rendering.js";
import { AskUserQuestionTool } from "../../src/tools/ask-user-question/tui-tool.js";

describe("AskUserQuestion TUI routing", () => {
  test("uses the AgenC tool object so approval routing preserves structured question handling", () => {
    expect(createTuiTool("AskUserQuestion")).toBe(AskUserQuestionTool);
    expect(createTuiTools([])).toContain(AskUserQuestionTool);
  });
});
