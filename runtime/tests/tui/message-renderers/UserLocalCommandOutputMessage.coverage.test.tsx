import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { DIAMOND_OPEN } from '../../../src/constants/figures.js'
import { renderToString } from '../../../src/utils/staticRender.js'
import { UserLocalCommandOutputMessage } from '../../../src/tui/message-renderers/UserLocalCommandOutputMessage.js'

vi.mock('bun:bundle', () => ({
  feature: () => false,
}))

vi.mock('../../../src/tui/hooks/useSettings.js', () => ({
  useSettings: () => ({
    syntaxHighlightingDisabled: true,
  }),
}))

describe('UserLocalCommandOutputMessage coverage', () => {
  it('renders launch-style stdout and ordinary stderr output', async () => {
    const output = await renderToString(
      <UserLocalCommandOutputMessage
        content={[
          '<local-command-stdout>',
          `  ${DIAMOND_OPEN} sync local job \u00b7 running`,
          '    started worker   ',
          '</local-command-stdout>',
          '<local-command-stderr>',
          '  warning: stderr is preserved  ',
          '</local-command-stderr>',
        ].join('\n')}
      />,
      { columns: 120, rows: 10 },
    )

    expect(output).toContain(`${DIAMOND_OPEN} sync local job \u00b7 running`)
    expect(output).toMatch(/\u23bf\s+started worker/)
    expect(output).toMatch(/\u23bf\s+warning: stderr is preserved/)
  })
})
