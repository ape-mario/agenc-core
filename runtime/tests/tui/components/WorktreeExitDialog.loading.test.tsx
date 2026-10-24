import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { renderToString } from '../../../src/utils/staticRender.js'
import { WorktreeExitLoadingState } from '../../../src/tui/components/WorktreeExitDialog.js'

vi.mock('bun:bundle', () => ({
  feature: () => false,
}))

vi.mock('../../../src/tui/components/spinner/Spinner.js', () => ({
  Spinner: () => null,
}))

describe('WorktreeExitLoadingState', () => {
  it('renders visible progress while worktree status is loading', async () => {
    const output = await renderToString(<WorktreeExitLoadingState />, 80)

    expect(output).toContain('Checking worktree...')
  })
})
