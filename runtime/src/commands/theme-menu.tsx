import React from "react";

import { TUI_THEME_SETTINGS } from "../config/schema.js";
import { Box, useInput, usePreviewTheme, useThemeSetting } from "../tui/ink.js";
import ThemedBox from "../tui/components/design-system/ThemedBox.js";
import ThemedText from "../tui/components/design-system/ThemedText.js";
import { DiffInline, Msg } from "../tui/components/v2/primitives.js";
import { useModalOrTerminalSize } from "../tui/context/modalContext.js";
import { resolveAgenCTuiGlyphMode, selectAgenCTuiGlyphs } from "../tui/glyphs.js";
import { useTerminalSize } from "../tui/hooks/useTerminalSize.js";
import type { ThemeSetting } from "../utils/theme.js";
import { themeSettingNote } from "../utils/themeSetting.js";
import { openLocalJsxCommand } from "./local-jsx-command.js";
import { nextMenuIndex, previousMenuIndex } from "./menu-navigation.js";
import type { SlashCommandContext } from "./types.js";

interface ThemeMenuSaveResult {
  /** Close the picker. False keeps it open to show `message`. */
  readonly close: boolean;
  readonly message?: string;
}

const NAME_WIDTH = Math.max(...TUI_THEME_SETTINGS.map((setting) => setting.length)) + 2;
/** The muted gray band under the highlighted row, as in the slash picker redesign. */
const ACTIVE_ROW_COLOR = "lineSoft";
/** Border, title row, one row per theme, and the hint row under a blank one. */
const LIST_ROWS = 2 + 1 + TUI_THEME_SETTINGS.length + 2;
/** The sample under the list: a blank row, its label, two messages, two diff lines. */
const SAMPLE_ROWS = 6;

/**
 * A few transcript rows drawn with the real message and diff components, so
 * the highlighted theme can be judged while the picker covers the transcript.
 */
function ThemeSample(): React.ReactNode {
  return (
    <Box flexDirection="column" marginTop={1}>
      <ThemedText color="inactive">preview</ThemedText>
      <Msg role="user">Fix the login redirect</Msg>
      <Msg role="agenc">Done. The redirect keeps the page you came from.</Msg>
      <DiffInline
        compact
        file="src/auth.ts"
        lines={[
          { kind: "rem", oldLine: "12", code: 'return redirect("/")' },
          { kind: "add", newLine: "12", code: "return redirect(next)" },
        ]}
      />
    </Box>
  );
}

/**
 * The /theme picker. Moving the selection previews that theme on the whole
 * screen; Enter saves it and closes; Esc, or any other way the picker
 * closes, puts back the theme that was showing.
 */
function ThemeMenuView({
  onSave,
  onDone,
}: {
  readonly onSave: (setting: ThemeSetting) => Promise<ThemeMenuSaveResult>;
  readonly onDone: () => void;
}): React.ReactNode {
  const saved = useThemeSetting();
  const preview = usePreviewTheme();
  const previewRef = React.useRef(preview);
  previewRef.current = preview;
  const [activeIndex, setActiveIndex] = React.useState(() =>
    Math.max(0, TUI_THEME_SETTINGS.indexOf(saved))
  );
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const choice = TUI_THEME_SETTINGS[activeIndex] ?? saved;
  const viewport = useModalOrTerminalSize(useTerminalSize());
  const glyphs = selectAgenCTuiGlyphs();
  const marker = resolveAgenCTuiGlyphMode() === "ascii" ? ">" : "›";

  React.useEffect(() => {
    previewRef.current.setPreviewTheme(choice);
  }, [choice]);
  // A preview never outlives the picker. After a save the saved theme is
  // already the choice, so ending the preview changes nothing on screen.
  React.useEffect(() => () => {
    previewRef.current.cancelPreview();
  }, []);

  useInput((input, key) => {
    if (busy) return;
    if (key.escape || input === "q") {
      onDone();
      return;
    }
    if (key.upArrow || input === "k") {
      setMessage(null);
      setActiveIndex((index) => previousMenuIndex(index, TUI_THEME_SETTINGS.length));
      return;
    }
    if (key.downArrow || input === "j") {
      setMessage(null);
      setActiveIndex((index) => nextMenuIndex(index, TUI_THEME_SETTINGS.length));
      return;
    }
    if (key.return) {
      if (choice === saved) {
        onDone();
        return;
      }
      setBusy(true);
      void onSave(choice).then(
        (result) => {
          if (result.close) {
            onDone();
            return;
          }
          setMessage(result.message ?? null);
          setBusy(false);
        },
        (error: unknown) => {
          setMessage(error instanceof Error ? error.message : String(error));
          setBusy(false);
        },
      );
    }
  });

  // The picker paints its own surface, so the list stays readable while a
  // theme meant for the other kind of terminal is previewed.
  return (
    <ThemedBox
      flexDirection="column"
      borderStyle="single"
      borderColor="text"
      backgroundColor="surfaceBackground"
      paddingX={1}
    >
      <Box flexDirection="row">
        <ThemedText color="inactive" bold>THEME</ThemedText>
        <Box flexGrow={1} />
        <ThemedText color="inactive">
          {busy ? "saving" : `${TUI_THEME_SETTINGS.length} themes`}
        </ThemedText>
      </Box>
      {TUI_THEME_SETTINGS.map((setting, index) => {
        const active = index === activeIndex;
        return (
          <ThemedBox
            key={setting}
            flexDirection="row"
            backgroundColor={active ? ACTIVE_ROW_COLOR : undefined}
          >
            <Box width={2} flexShrink={0}>
              <ThemedText color="text" bold>{active ? marker : " "}</ThemedText>
            </Box>
            <Box width={NAME_WIDTH} flexShrink={0}>
              <ThemedText color={active ? "text" : "text2"} bold={active} wrap="truncate-end">
                {setting}
              </ThemedText>
            </Box>
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              <ThemedText color={active ? "text2" : "inactive"} wrap="truncate-end">
                {themeSettingNote(setting, saved)}
              </ThemedText>
            </Box>
          </ThemedBox>
        );
      })}
      {/* Drawn only when it fits, so a short terminal keeps the hint row. */}
      {viewport.rows >= LIST_ROWS + SAMPLE_ROWS + (message === null ? 0 : 2)
        ? <ThemeSample />
        : null}
      {message !== null ? (
        <Box marginTop={1}>
          <ThemedText color="warning" wrap="wrap">{message}</ThemedText>
        </Box>
      ) : null}
      <Box flexDirection="row" marginTop={1}>
        <ThemedText color="inactive">{`${glyphs.arrowUp}${glyphs.arrowDown} preview`}</ThemedText>
        <Box flexGrow={1} />
        <ThemedText color="inactive">
          {`${glyphs.enter} save ${glyphs.separator} esc cancel`}
        </ThemedText>
      </Box>
    </ThemedBox>
  );
}

export function openThemeMenu(
  ctx: SlashCommandContext,
  onSave: (setting: ThemeSetting) => Promise<ThemeMenuSaveResult>,
): boolean {
  return openLocalJsxCommand(ctx, (close) => (
    <ThemeMenuView onSave={onSave} onDone={close} />
  ));
}
