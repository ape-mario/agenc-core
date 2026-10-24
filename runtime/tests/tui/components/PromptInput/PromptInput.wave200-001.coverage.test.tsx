import { describe, expect, test, vi } from 'vitest'

vi.mock('bun:bundle', () => ({
  feature: () => false,
}))

vi.mock('../../../../src/utils/config.js', () => ({
  getRuntimeState: () => ({}),
  updateRuntimeState: () => {},
}))

vi.mock('../../../../src/tui/history/history.js', () => ({
  formatImageRef: () => '',
  formatPastedTextRef: () => '',
  getPastedTextRefNumLines: () => 0,
  parseReferences: () => [],
}))

import { calculatePromptMaxVisibleLines } from '../../../../src/tui/components/PromptInput/PromptInput.js'

describe('PromptInput fullscreen sizing coverage', () => {
  test('normalizes non-finite terminal rows to the minimum fullscreen input budget', () => {
    expect(calculatePromptMaxVisibleLines(Number.POSITIVE_INFINITY, true)).toBe(1)
    expect(calculatePromptMaxVisibleLines(Number.NaN, true)).toBe(1)
  })
})
