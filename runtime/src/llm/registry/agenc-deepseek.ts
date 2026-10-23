/** Historical model identities retained for saved-session metadata. */
export const AGENC_DEEPSEEK_MODEL = "deepseek/deepseek-v4-flash-0731";
export const AGENC_DEEPSEEK_V41_MODEL = "deepseek/deepseek-v4.1-flash";
/** Dated generation id that can occur in historical session usage. */
export const AGENC_DEEPSEEK_V41_GENERATION = "deepseek/deepseek-v4.1-flash-20260910";
export function isAgenCDeepSeekModel(model: string | undefined): boolean {
  return model === AGENC_DEEPSEEK_MODEL || model === AGENC_DEEPSEEK_V41_MODEL;
}

// Native levels published for this exact model. Medium is a legacy alias
// for High, not a distinct reasoning level to offer in the selector.
export const AGENC_DEEPSEEK_REASONING_LEVELS = ["low", "high", "max"] as const;
