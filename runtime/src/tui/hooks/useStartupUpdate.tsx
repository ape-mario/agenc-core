import React from "react";
import { isAutoUpdaterDisabled } from "../../utils/config.js";
import type { ConfigStore } from "../../config/store.js";
import type { ToolJSXArgs } from "../tool-jsx-state.js";

// A process can remount its TUI (for example /resume). Check once per launch.
let launchCheck: Promise<import("../../commands/update-menu.js").UpdateCheck | null> | undefined;
export function useStartupUpdate({ safe, setToolJSX, configStore }: {
  safe: boolean;
  configStore: ConfigStore;
  setToolJSX: (value: ToolJSXArgs | null) => void;
}) {
  const safeRef = React.useRef(safe);
  safeRef.current = safe;
  React.useEffect(() => {
    if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI || isAutoUpdaterDisabled(configStore.current())) return;
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
        if (!active || hasSkippedUpdate(checked.latestVersion, configStore.stateRepository)) return;
        const showWhenIdle = () => {
          if (!active || isAutoUpdaterDisabled(configStore.current())) return;
          if (!safeRef.current || Date.now() - lastKey < 1200) {
            timer = setTimeout(showWhenIdle, 250); return;
          }
          // Consume the launch result before the popup can remount this hook.
          launchCheck = Promise.resolve(null);
          setToolJSX({ isLocalJSXCommand: true, shouldHidePromptInput: true,
            jsx: <UpdateMenu checked={checked} startup stateRepository={configStore.stateRepository} close={() => setToolJSX({ jsx: null, shouldHidePromptInput: false, clearLocalJSX: true })} /> });
        };
        showWhenIdle();
      }).catch(() => {});
    }, 0);
    return () => { active = false; if (timer) clearTimeout(timer); process.stdin.off("data", onKey); };
  }, [setToolJSX, configStore]);
}
