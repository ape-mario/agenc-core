/**
 * Bundled `agenc-memory` skill: the memory rules (what to save, the
 * one-fact-per-file format, the MEMORY.md index, recall) for a session whose
 * system prompt carries only a short memory pointer (compact presentation,
 * memory/memdir.ts buildCompactMemoryInstructionLines). Pure data, registered
 * from `bundledSkills.ts`; the text is imported when the skill runs, so this
 * module adds no import edge back into the memory code at startup.
 *
 * @module
 */

import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/index.mjs";
import type { BundledSkillDefinition } from "../bundledSkills.js";

/** Not "memory": that name is the /memory command. */
export const MEMORY_SKILL_NAME = "agenc-memory";

export const MEMORY_SKILL: BundledSkillDefinition = {
  name: MEMORY_SKILL_NAME,
  description: "Rules and file format for saving, updating, forgetting and recalling AgenC memories.",
  whenToUse:
    "The user asks you to remember, update, forget or recall something, or states a lasting preference, correction or project fact.",
  userInvocable: false,
  async getPromptForCommand(): Promise<ContentBlockParam[]> {
    const { buildMemorySkillGuide } = await import("../../memory/memdir.js");
    return [{ type: "text", text: buildMemorySkillGuide() }];
  },
};
