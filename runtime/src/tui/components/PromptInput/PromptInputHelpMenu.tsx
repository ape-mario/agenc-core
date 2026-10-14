import React from 'react';
import { Box, Text } from '../../ink.js';
import { getPlatform } from '../../../utils/platform.js';
import { isKeybindingCustomizationEnabled } from '../../keybindings/loadUserBindings.js';
import { useShortcutDisplay } from '../../keybindings/useShortcutDisplay.js';
import { getNewlineInstructions } from './utils.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import type { GlobalRuntimeState } from '../../../config/runtime-state-repository.js';

/** Below this width the two groups stack into one column. */
const NARROW_LAYOUT_BREAKPOINT = 100;
/** Width of the key column, so every action starts at the same place. */
const KEY_COLUMN_WIDTH = 24;
/** Width of the prefix group ("/  commands"). */
const PREFIX_GROUP_WIDTH = 30;

/**
 * Show a binding the way this keyboard labels it: "ctrl+o", "option+p" on
 * macOS (alt elsewhere), "ctrl+shift+-" for ctrl+_ .
 */
export function formatHelpKey(binding: string, platform: string = getPlatform()): string {
  if (binding === 'ctrl+_') return 'ctrl+shift+-';
  const optionName = platform === 'macos' ? 'option' : 'alt';
  return binding
    .split('+')
    .map(part => (part === 'meta' || part === 'alt' ? optionName : part))
    .join('+');
}

/** "shift + ⏎ for newline" style text from the newline helper, as key + action. */
function newlineKey(text: string): string {
  if (text.startsWith('shift')) return 'shift+enter';
  if (text.startsWith('\\')) return '\\ then enter';
  return '\\ then enter';
}

type Props = {
  dimColor?: boolean;
  fixedWidth?: boolean;
  gap?: number;
  paddingX?: number;
  runtimeState: Pick<
    GlobalRuntimeState,
    'shiftEnterKeyBindingInstalled' | 'hasUsedBackslashReturn'
  >;
};

type Row = { readonly key: string; readonly action: string };

function KeyRows({
  rows,
  dimColor,
  keyWidth,
}: {
  readonly rows: readonly Row[];
  readonly dimColor?: boolean;
  readonly keyWidth: number;
}): React.ReactNode {
  return (
    <Box flexDirection="column">
      {rows.map(row => (
        <Box key={`${row.key}:${row.action}`} flexDirection="row">
          <Box width={keyWidth} flexShrink={0}>
            <Text dimColor={dimColor}>{row.key}</Text>
          </Box>
          <Text dimColor wrap="truncate-end">{row.action}</Text>
        </Box>
      ))}
    </Box>
  );
}

export function PromptInputHelpMenu(props: Props): React.ReactNode {
  const { dimColor, gap, paddingX, runtimeState } = props;
  const { columns: terminalColumns } = useTerminalSize();
  const isNarrowLayout = terminalColumns < NARROW_LAYOUT_BREAKPOINT;
  const platform = getPlatform();
  const optionName = platform === 'macos' ? 'option' : 'alt';

  const transcript = useShortcutDisplay('app:toggleTranscript', 'Global', 'ctrl+o');
  const todos = useShortcutDisplay('app:toggleTodos', 'Global', 'ctrl+t');
  const undo = useShortcutDisplay('chat:undo', 'Chat', 'ctrl+_');
  const stash = useShortcutDisplay('chat:stash', 'Chat', 'ctrl+s');
  const cycleMode = useShortcutDisplay('chat:cycleMode', 'Chat', 'shift+tab');
  const modelPicker = useShortcutDisplay('chat:modelPicker', 'Chat', 'alt+p');
  const externalEditor = useShortcutDisplay('chat:externalEditor', 'Chat', 'ctrl+g');
  const imagePaste = useShortcutDisplay('chat:imagePaste', 'Chat', 'ctrl+v');

  // Both mode keys work; show both so a keyboard that eats one still has a way.
  const cycleModeKey = cycleMode === 'meta+m' || cycleMode === 'alt+m' || cycleMode === 'shift+tab'
    ? `shift+tab or ${optionName}+m`
    : formatHelpKey(cycleMode, platform);

  const prefixRows: Row[] = [
    { key: '/', action: 'commands' },
    { key: '!', action: 'run a shell command' },
    { key: '@', action: 'attach a file' },
    { key: '&', action: 'run in the background' },
  ];

  const keyRows: Row[] = [
    { key: cycleModeKey, action: 'change mode' },
    { key: newlineKey(getNewlineInstructions(runtimeState)), action: 'new line' },
    { key: 'esc esc', action: 'clear the prompt' },
    { key: formatHelpKey(stash, platform), action: 'set the prompt aside' },
    { key: formatHelpKey(externalEditor, platform), action: 'edit in your editor' },
    { key: formatHelpKey(imagePaste, platform), action: 'paste an image' },
    { key: formatHelpKey(modelPicker, platform), action: 'switch model' },
    { key: formatHelpKey(transcript, platform), action: 'show details' },
    { key: formatHelpKey(todos, platform), action: 'show tasks' },
    { key: formatHelpKey(undo, platform), action: 'undo' },
    ...(platform !== 'windows' ? [{ key: 'ctrl+z', action: 'suspend' }] : []),
  ];

  const footer = isKeybindingCustomizationEnabled() ? (
    <Text dimColor>/keybindings to change these keys</Text>
  ) : null;

  const prefixGroup = (
    <Box flexDirection="column" width={isNarrowLayout ? undefined : PREFIX_GROUP_WIDTH} flexShrink={0}>
      <Text dimColor>start a message with</Text>
      <KeyRows rows={prefixRows} dimColor={dimColor} keyWidth={4} />
    </Box>
  );
  const keyGroup = (
    <Box flexDirection="column">
      <Text dimColor>keys</Text>
      <KeyRows rows={keyRows} dimColor={dimColor} keyWidth={KEY_COLUMN_WIDTH} />
    </Box>
  );

  if (isNarrowLayout) {
    return (
      <Box paddingX={paddingX} flexDirection="column" gap={1}>
        {prefixGroup}
        {keyGroup}
        {footer}
      </Box>
    );
  }
  return (
    <Box paddingX={paddingX} flexDirection="column" gap={1}>
      <Box flexDirection="row" gap={gap ?? 4}>
        {prefixGroup}
        {keyGroup}
      </Box>
      {footer}
    </Box>
  );
}
