import { afterEach, describe, expect, test, vi } from 'vitest'

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

vi.mock('../../../../src/utils/messageQueueManager.js', async () => {
  const actual = await vi.importActual<typeof import('../../../../src/utils/messageQueueManager.js')>(
    '../../../../src/utils/messageQueueManager.js',
  )
  return actual
})

import {
  getCommandQueueSnapshot,
  resetCommandQueueForTesting,
} from '../../../../src/utils/messageQueueManager.js'
import { applyBusyInputSubmissionPolicy } from '../../../../src/tui/components/PromptInput/PromptInput.js'

describe('PromptInput busy bash coverage', () => {
  afterEach(() => {
    resetCommandQueueForTesting()
  })

  test('swallows empty bash submissions while busy without queueing or clearing input state', () => {
    const addNotification = vi.fn()
    const setInput = vi.fn()
    const setCursorOffset = vi.fn()
    const clearBuffer = vi.fn()
    const resetHistory = vi.fn()
    const onModeChange = vi.fn()

    expect(
      applyBusyInputSubmissionPolicy({
        isLoading: true,
        mode: 'bash',
        input: ' \n\t ',
        addNotification,
        setInput,
        setCursorOffset,
        clearBuffer,
        resetHistory,
        onModeChange,
      }),
    ).toBe(true)

    expect(getCommandQueueSnapshot()).toEqual([])
    expect(addNotification).not.toHaveBeenCalled()
    expect(setInput).not.toHaveBeenCalled()
    expect(setCursorOffset).not.toHaveBeenCalled()
    expect(clearBuffer).not.toHaveBeenCalled()
    expect(resetHistory).not.toHaveBeenCalled()
    expect(onModeChange).not.toHaveBeenCalled()
  })
})
