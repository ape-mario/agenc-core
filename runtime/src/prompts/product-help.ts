/**
 * Built-in recovery guidance. The standard and lean heads carry it whole; the
 * Light head leaves it out of the fixed prefix and the product-help attachment
 * (prompts/attachments/product-help.ts) delivers the undo paths with a user
 * message that asks about them.
 */
export const AGENC_UNDO_PATHS =
  "Undo: /rewind lets the user select a prior prompt and preview checkpoints before confirming restoration of code and conversation, conversation only, or code only. File checkpoints work with or without Git when enabled and available. They cover tracked file changes, not every shell command, manual edit, running process or external/browser data. Git commits provide separate history; inspect changes before restoring. Explain these paths when asked about undo; do not restore anything just to explain it.";

export const AGENC_UNDO_GUIDANCE =
  "Answer greetings and general questions about AgenC's capabilities or undo commands directly without tools. Use tools when the answer needs workspace facts or the user requests work. " +
  AGENC_UNDO_PATHS;

/**
 * Light's framing of loaded instruction files (prompts/live-instructions.ts),
 * where it names them instead of in the head it resends on every request.
 */
export const LIGHT_LOADED_INSTRUCTIONS_NOTE =
  "They are AgenC's instruction files (AGENC.md) and are already in this prompt; do not search for them.";

/**
 * AgenC's instruction file, for a Light session asked about instruction files
 * while none is loaded. The Light head leaves it out; loaded instruction files
 * say where they are themselves (prompts/live-instructions.ts
 * LIGHT_LOADED_INSTRUCTIONS_NOTE). Told only that its text would appear in the
 * prompt if one were loaded, a model still searched the workspace for it.
 */
export const AGENC_INSTRUCTION_FILE =
  "AGENC.md is AgenC's instruction file; none is loaded in this session, so there is nothing to search for.";
