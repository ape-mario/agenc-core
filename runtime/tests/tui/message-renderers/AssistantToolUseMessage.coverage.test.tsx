import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { Tool } from '../../../src/tools/Tool.js'
import type { AgenCToolUseBlockParam } from '../../../src/types/message.js'
import { renderToString } from '../../../src/utils/staticRender.js'
import { AssistantToolUseMessage } from '../../../src/tui/message-renderers/AssistantToolUseMessage.js'

const appStateMock = vi.hoisted(() => ({
  pendingWorkerRequest: undefined as undefined | { toolUseId: string },
  toolPermissionContext: {
    mode: 'default',
    strippedDangerousRules: undefined as undefined | Record<string, unknown>,
  },
}))

vi.mock('../../../src/utils/classifierApprovalsHook.js', () => ({
  useIsClassifierChecking: () => false,
}))

vi.mock('../../../src/tui/hooks/useTerminalSize.js', () => ({
  useTerminalSize: () => ({ columns: 80, rows: 24 }),
}))

vi.mock('../../../src/tui/state/AppState.js', () => ({
  useAppStateMaybeOutsideOfProvider: (
    selector: (state: typeof appStateMock) => unknown,
  ) => selector(appStateMock),
}))

vi.mock('../../../src/tui/ink.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/tui/ink.js')>(
    '../../../src/tui/ink.js',
  )
  return {
    ...actual,
    useTheme: () => ['dark'],
  }
})

describe('AssistantToolUseMessage queued rendering coverage', () => {
  it('renders queued detail while summarizing empty tool-use text from input', async () => {
    const param: AgenCToolUseBlockParam = {
      type: 'tool_use',
      id: 'toolu_queued_search',
      name: 'Search',
      input: { query: 'queued lookup', ignored: 'not shown' },
    }
    const tool = {
      name: 'Search',
      inputSchema: {
        safeParse: (input: unknown) => ({ success: true, data: input }),
      },
      userFacingName: () => 'Search',
      renderToolUseMessage: () => '',
      renderToolUseQueuedMessage: () => 'Queued behind active tool work',
    } as unknown as Tool
    const output = await renderToString(
      <AssistantToolUseMessage
        param={param}
        addMargin={false}
        tools={[tool]}
        commands={[]}
        verbose={false}
        inProgressToolUseIDs={new Set()}
        progressMessagesForMessage={[]}
        shouldAnimate={false}
        shouldShowDot={false}
        lookups={{
          resolvedToolUseIDs: new Set<string>(),
          erroredToolUseIDs: new Set<string>(),
        } as never}
      />,
      80,
    )

    expect(output).toContain('Search')
    expect(output).toContain('queued lookup')
    expect(output).toContain('Queued behind active tool work')
    expect(output).not.toContain('not shown')
    expect(output).not.toContain('Running')
  })
})
