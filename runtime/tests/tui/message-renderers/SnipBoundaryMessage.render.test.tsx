import React from "react";
import { describe, expect, test } from "vitest";

import { renderToString } from "../../../src/utils/staticRender.js";
import { SnipBoundaryMessage } from "../../../src/tui/message-renderers/SnipBoundaryMessage.js";

describe("SnipBoundaryMessage rendering", () => {
  test("renders the compacted-conversation boundary independently of message payload", async () => {
    const output = await renderToString(
      <SnipBoundaryMessage message={{ subtype: "unexpected", content: "hidden" }} />,
      80,
    );

    expect(output).toContain("Earlier conversation snipped");
    expect(output).not.toContain("hidden");
  });
});
