/**
 * Product-help attachment producer (Light sessions only).
 *
 * Light resends its head on every model call, so built-in help that only a
 * few user messages need stays out of it. When the root human message of the
 * current turn asks how to undo, revert, roll back or restore work, the
 * producer sends the undo paths (/rewind checkpoints, their limits, Git
 * history) once, on the turn's first request. The retention ledger anchors the
 * reminder before that message and replays it in place on every later
 * request, so the cached prefix never moves and the text is not sent twice.
 *
 * Standard and lean heads keep the undo paths in their static head
 * (prompts/product-help.ts).
 *
 * @module
 */

import type { LLMMessage } from "../../llm/types.js";
import { AGENC_UNDO_PATHS } from "../product-help.js";
import type { AttachmentProducer } from "./orchestrator.js";

/**
 * Undo, revert and restore wording, in English and a few common languages.
 * A false match costs one short reminder; a miss leaves the model without the
 * /rewind facts for that answer.
 */
const UNDO_REQUEST =
  /\b(?:undo(?:ne|ing)?|rewind|revert(?:ed|ing|s)?|restor(?:e|ed|es|ing)|roll(?:ed|ing)?[ -]?back|rollbacks?|checkpoints?|take (?:it|that|this|them) back|go(?:ing)? back to (?:a |an |the )?(?:previous|earlier|older|last|prior|original)|(?:previous|earlier|older|prior) version|back out|get (?:my|the) (?:old|previous|original) (?:code|files?|version|changes?) back|reset (?:my|the|your|all|these|those) (?:changes|edits|work|files?|code))\b|\/rewind|rückgängig|deshacer|annuler|desfazer|annulla|元に戻|撤销|撤回|되돌리/iu;

/** Whether `text` asks about undoing or restoring work. */
export function asksAboutUndo(text: string): boolean {
  return UNDO_REQUEST.test(text);
}

function contains(messages: readonly LLMMessage[], needle: string): boolean {
  return messages.some((message) => {
    if (typeof message.content === "string") return message.content.includes(needle);
    return message.content.some((part) =>
      (part as { type?: string }).type === "text" &&
      ((part as { text?: string }).text ?? "").includes(needle));
  });
}

export const productHelpProducer: AttachmentProducer = async (opts) => {
  if (opts.lightMode !== true) return [];
  // Only the human's own message decides; a synthetic follow-up or a
  // delegated child turn carries no root-human text for this turn.
  const provenance = opts.turnProvenance;
  const root = provenance?.rootHumanTurn;
  if (provenance === undefined || root === null || root === undefined ||
      root.turnId !== provenance.turnId) {
    return [];
  }
  if (!asksAboutUndo(root.text)) return [];
  // Already in front of the model: retained from an earlier request or turn.
  if (contains(opts.messages, AGENC_UNDO_PATHS)) return [];
  return [{ kind: "product_help", topic: "undo" }];
};
