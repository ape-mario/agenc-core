import React from 'react'
import { describe, expect, test, vi } from 'vitest'

import { renderToString } from '../../../../src/utils/staticRender.js'
import { StreamingMarkdown } from '../../../../src/tui/components/markdown/Markdown.js'

vi.mock('bun:bundle', () => ({
  feature: () => false,
}))

vi.mock('../../../../src/tui/hooks/useSettings.js', () => ({
  useSettings: () => ({
    syntaxHighlightingDisabled: true,
  }),
}))

describe('StreamingMarkdown coverage', () => {
  test('renders stable and streaming blocks after stripping prompt XML tags', async () => {
    const output = await renderToString(
      <StreamingMarkdown>
        {[
          '# Stable heading',
          '',
          'Stable paragraph before the final block.',
          '',
          '<context>hidden context</context>',
          '',
          '- final item still streaming',
        ].join('\n')}
      </StreamingMarkdown>,
      80,
    )

    expect(output).toContain('Stable heading')
    expect(output).toContain('Stable paragraph before the final block.')
    expect(output).toContain('final item still streaming')
    expect(output).not.toContain('hidden context')
    expect(output).not.toContain('<context>')
  })
})
