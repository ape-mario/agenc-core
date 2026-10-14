import React from "react";
import { isAutoUpdaterDisabled } from "../../utils/config.js";
import type { ToolJSXArgs } from "../tool-jsx-state.js";

// A process can remount its TUI (for example /resume). Check once per launch.
let launchCheck: Promise<import("../../commands/update-menu.js").UpdateCheck | null> | undefined;
export function useStartupUpdate({ safe, setToolJSX }: {
  safe: boolean;
  setToolJSX: (value: ToolJSXArgs | null) => void;
}) {
  const safeRef = React.useRef(safe);
  safeRef.current = safe;
  React.useEffect(() => {
    if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI || isAutoUpdaterDisabled()) return;
    let active = true;
    let lastKey = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = () => { lastKey = Date.now(); };
    process.stdin.on("data", onKey);
    // Start after the first committed screen; never await this in boot.
    timer = setTimeout(() => {
      launchCheck ??= import("../../bin/update-cli.js")
        .then(({ checkAgenCUpdate }) => checkAgenCUpdate(undefined, { manifestTimeoutMs: 3000 }))
        .catch(() => null);
      void launchCheck.then(async checked => {
        if (!active || !checked?.updateAvailable) return;
        const { UpdateMenu, hasSkippedUpdate } = await import("../../commands/update-menu.js");
        if (!active || hasSkippedUpdate(checked.latestVersion)) return;
        const showWhenIdle = () => {
          if (!active || isAutoUpdaterDisabled()) return;
          if (!safeRef.current || Date.now() - lastKey < 1200) {
            timer = setTimeout(showWhenIdle, 250); return;
          }
          // Consume the launch result before the popup can remount this hook.
          launchCheck = Promise.resolve(null);
          setToolJSX({ isLocalJSXCommand: true, shouldHidePromptInput: true,
            jsx: <UpdateMenu checked={checked} startup close={() => setToolJSX({ jsx: null, shouldHidePromptInput: false, clearLocalJSX: true })} /> });
        };
        showWhenIdle();
      }).catch(() => {});
    }, 0);
    return () => { active = false; if (timer) clearTimeout(timer); process.stdin.off("data", onKey); };
  }, [setToolJSX]);
}
