import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  bindings: [
    {
      action: 'app:toggleTranscript',
      context: 'Global',
      chord: [{ key: 'o', ctrl: true }],
    },
  ],
  calls: [] as Array<{
    action: string
    context: string
    bindings: unknown[]
  }>,
  displayText: undefined as string | undefined,
}))

vi.mock('../../../src/tui/keybindings/loadUserBindings.js', () => ({
  loadKeybindingsSync: () => mocks.bindings,
}))

vi.mock('../../../src/tui/keybindings/resolver.js', () => ({
  getBindingDisplayText: (
    action: string,
    context: string,
    bindings: unknown[],
  ) => {
    mocks.calls.push({ action, context, bindings })
    return mocks.displayText
  },
}))

import { getShortcutDisplay } from '../../../src/tui/keybindings/shortcutFormat.js'

describe('getShortcutDisplay', () => {
  beforeEach(() => {
    mocks.calls = []
    mocks.displayText = undefined
  })

  test('returns the configured shortcut display text', () => {
    mocks.displayText = 'ctrl+o'

    expect(
      getShortcutDisplay('app:toggleTranscript', 'Global', 'fallback'),
    ).toBe('ctrl+o')
    expect(mocks.calls).toEqual([
      {
        action: 'app:toggleTranscript',
        context: 'Global',
        bindings: mocks.bindings,
      },
    ])
  })

  test('returns the fallback when the action has no binding', () => {
    expect(getShortcutDisplay('missing:action', 'Global', 'ctrl+x')).toBe(
      'ctrl+x',
    )
  })
})
