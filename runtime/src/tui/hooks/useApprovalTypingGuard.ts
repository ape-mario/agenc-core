import { useCallback, useRef, useState } from "react";
import type { Key } from "../ink.js";
import type { InputEvent } from "../ink/events/input-event.js";

export const APPROVAL_TYPING_QUIET_MS = 500;

/** Keep typing and paste bursts out of the permission decision shortcuts. */
export function useApprovalTypingGuard(typedConfirmation = false) {
  const lastTyping = useRef(Number.NEGATIVE_INFINITY);
  const [waiting, setWaiting] = useState(false);
  const blockTyping = useCallback((input: string, key: Key, event: InputEvent): boolean => {
    // Deliberate cancellation remains available even in a typing burst.
    if (key.escape || (key.ctrl && input === "c")) return false;
    const now = performance.now();
    const printable = input.length > 0 && !key.ctrl && !key.meta && !key.super &&
      !/[\u0000-\u001f\u007f]/u.test(input);
    const shortcut = /^[123]$/u.test(input);
    const paste = event.keypress.isPasted;
    // The whole stdin batch is visible before its first key is dispatched.
    // Thus an unmarked paste beginning with "1" cannot approve prematurely.
    const textBurst = (event.textInBatch?.length ?? 0) > 1;
    if (paste || textBurst || (printable && !shortcut) || now - lastTyping.current < APPROVAL_TYPING_QUIET_MS) {
      lastTyping.current = now;
      setWaiting(true);
      // Destructive cards still require their exact confirmation word. Allow
      // editing that word, but Enter must be a separate, deliberate gesture.
      if (typedConfirmation && !key.return) return false;
      event.stopImmediatePropagation();
      return true;
    }
    if (waiting) setWaiting(false);
    return false;
  }, [typedConfirmation, waiting]);
  return { waiting, blockTyping };
}
