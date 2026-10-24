import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const state = {
    bindings: [{ bindings: [], context: 'Global' }],
    getBindingDisplayText: vi.fn(),
    loadKeybindingsSync: vi.fn(),
  }

  state.loadKeybindingsSync.mockImplementation(() => state.bindings)

  return state
})

vi.mock('../../../src/tui/keybindings/loadUserBindings.js', () => ({
  loadKeybindingsSync: mocks.loadKeybindingsSync,
}))

vi.mock('../../../src/tui/keybindings/resolver.js', () => ({
  getBindingDisplayText: mocks.getBindingDisplayText,
}))

import { getShortcutDisplay } from '../../../src/tui/keybindings/shortcutFormat.js'

describe('getShortcutDisplay', () => {
  beforeEach(() => {
    mocks.getBindingDisplayText.mockReset()
    mocks.loadKeybindingsSync.mockClear()
  })

  test('returns the configured shortcut display text when available', () => {
    mocks.getBindingDisplayText.mockReturnValue('shift+tab')

    expect(getShortcutDisplay('chat:cycleMode', 'Chat', 'tab')).toBe(
      'shift+tab',
    )
    expect(mocks.loadKeybindingsSync).toHaveBeenCalledOnce()
    expect(mocks.getBindingDisplayText).toHaveBeenCalledWith(
      'chat:cycleMode',
      'Chat',
      mocks.bindings,
    )
  })

  test('returns the fallback display text when no binding resolves', () => {
    mocks.getBindingDisplayText.mockReturnValue(undefined)

    expect(getShortcutDisplay('app:toggleTranscript', 'Global', 'ctrl+o')).toBe(
      'ctrl+o',
    )
    expect(mocks.loadKeybindingsSync).toHaveBeenCalledOnce()
    expect(mocks.getBindingDisplayText).toHaveBeenCalledWith(
      'app:toggleTranscript',
      'Global',
      mocks.bindings,
    )
  })
})
