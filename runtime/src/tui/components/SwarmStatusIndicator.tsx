import React from "react";

import { Box } from "../ink.js";
import ThemedText from "./design-system/ThemedText.js";

export type SwarmStatusPresentation = {
  readonly glyph: "◆" | "◇";
  readonly label: string;
};

/**
 * Keep the swarm-mode signal compact and human-readable. A filled diamond
 * means agents are active; the outline means swarm mode is ready but idle.
 */
export function swarmStatusPresentation(
  runningAgents: number,
): SwarmStatusPresentation {
  const count = Number.isFinite(runningAgents)
    ? Math.max(0, Math.trunc(runningAgents))
    : 0;

  if (count === 0) {
    return { glyph: "◇", label: "swarm" };
  }

  return {
    glyph: "◆",
    label: `${count} ${count === 1 ? "agent" : "agents"}`,
  };
}

/**
 * Match the effort segment: plain primary ink. Activity is carried by the
 * label's count; the footer needs no extra glyph.
 */
export function SwarmStatusIndicator({
  runningAgents,
}: {
  readonly runningAgents: number;
}): React.ReactElement {
  const presentation = swarmStatusPresentation(runningAgents);

  return (
    <Box flexDirection="row" flexShrink={0}>
      <ThemedText color="inactive" wrap="truncate-end">
        {" · "}
      </ThemedText>
      <ThemedText color="text" wrap="truncate-end">
        {presentation.label}
      </ThemedText>
    </Box>
  );
}
