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
 * AgenC's instruction file, for a Light session asked about instruction files.
 * The Light head leaves it out; loaded instruction files carry the same note
 * (prompts/live-instructions.ts).
 */
export const AGENC_INSTRUCTION_FILE =
  "AGENC.md is AgenC's instruction file. If one is loaded, its text appears in this prompt; do not search for it.";
