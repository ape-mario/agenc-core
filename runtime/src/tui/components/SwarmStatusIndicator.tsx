import React from "react";

import { Box } from "../ink.js";
import ThemedText from "./design-system/ThemedText.js";

export type SwarmStatusPresentation = {
  readonly glyph: "◆" | "◇";
  readonly label: string;
  readonly color: "text" | "accent" | "warning";
  readonly bold: boolean;
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
    return { glyph: "◇", label: "swarm", color: "text", bold: false };
  }

  return {
    glyph: "◆",
    label: `swarm (${count})`,
    color: count >= 6 ? "warning" : "accent",
    bold: count >= 3 && count <= 5,
  };
}

/**
 * Activity uses the theme accent, with a warning tone for larger swarms.
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
      <ThemedText color={presentation.color} bold={presentation.bold} wrap="truncate-end">
        {presentation.label}
      </ThemedText>
    </Box>
  );
}
