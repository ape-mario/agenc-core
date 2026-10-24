import { PassThrough } from 'node:stream'

import React from 'react'
import stripAnsi from 'strip-ansi'
import { describe, expect, test, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; props: Record<string, unknown> }>,
  features: new Set<string>(),
  reset() {
    harness.calls = []
    harness.features = new Set()
  },
}))

vi.mock('bun:bundle', () => ({
  feature: (name: string) => harness.features.has(name),
}))

vi.mock('../../../src/services/compact/snipProjection.js', () => ({
  isSnipBoundaryMessage: (message: { readonly subtype?: string }) =>
    message.subtype === 'snip_boundary',
}))

vi.mock('../../../src/services/compact/snipCompact.js', () => ({
  isSnipMarkerMessage: (message: { readonly subtype?: string }) =>
    message.subtype === 'snip_marker',
}))

vi.mock('../../../src/tui/message-renderers/SnipBoundaryMessage.js', async () => {
  const ReactModule = await import('react')
  const { Text } = await import('../../../src/tui/ink.js')
  return {
    SnipBoundaryMessage: (props: Record<string, unknown>) => {
      harness.calls.push({ name: 'SnipBoundaryMessage', props })
      return ReactModule.createElement(Text, null, 'snip boundary')
    },
  }
})

vi.mock('../../../src/tui/components/Message.renderers.js', async () => {
  const renderer = (name: string) => (props: Record<string, unknown>) => {
    harness.calls.push({ name, props })
    return null
  }

  return {
    AdvisorMessage: renderer('AdvisorMessage'),
    AssistantRedactedThinkingMessage: renderer('AssistantRedactedThinkingMessage'),
    AssistantTextMessage: renderer('AssistantTextMessage'),
    AssistantThinkingMessage: renderer('AssistantThinkingMessage'),
    AssistantToolUseMessage: renderer('AssistantToolUseMessage'),
    AttachmentMessage: renderer('AttachmentMessage'),
    CollapsedReadSearchContent: renderer('CollapsedReadSearchContent'),
    CompactBoundaryMessage: renderer('CompactBoundaryMessage'),
    CompactSummary: renderer('CompactSummary'),
    ExpandShellOutputProvider: ({ children }: { readonly children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    GroupedToolUseContent: renderer('GroupedToolUseContent'),
    OffscreenFreeze: ({ children }: { readonly children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    SystemTextMessage: renderer('SystemTextMessage'),
    UserImageMessage: renderer('UserImageMessage'),
    UserTextMessage: renderer('UserTextMessage'),
    UserToolResultMessage: renderer('UserToolResultMessage'),
  }
})

import { createRoot } from '../../../src/tui/ink/root.js'
import { Box } from '../../../src/tui/ink.js'
import type { Props } from '../../../src/tui/components/Message.js'
import { Message } from '../../../src/tui/components/Message.js'

function createStreams(): {
  stdout: PassThrough
  stdin: PassThrough & {
    isTTY: boolean
    ref: () => void
    setRawMode: (mode: boolean) => void
    unref: () => void
  }
} {
  const stdout = new PassThrough()
  const stdin = new PassThrough() as PassThrough & {
    isTTY: boolean
    ref: () => void
    setRawMode: (mode: boolean) => void
    unref: () => void
  }
  stdin.isTTY = true
  stdin.ref = () => {}
  stdin.setRawMode = () => {}
  stdin.unref = () => {}
  stdout.resume()
  return { stdin, stdout }
}

async function sleep(ms = 25): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

function baseProps(message: Props['message']): Props {
  return {
    addMargin: false,
    commands: [],
    inProgressToolUseIDs: new Set(),
    isStatic: false,
    isTranscriptMode: false,
    lookups: {
      erroredToolUseIDs: new Set(),
      resolvedToolUseIDs: new Set(),
    },
    message,
    progressMessagesForMessage: [],
    shouldAnimate: false,
    shouldShowDot: false,
    tools: [] as never,
    verbose: false,
  } as Props
}

describe('Message HISTORY_SNIP coverage', () => {
  test('renders snip boundaries and suppresses snip markers when the feature is enabled', async () => {
    harness.reset()
    harness.features.add('HISTORY_SNIP')

    const messages = [
      { subtype: 'snip_boundary', type: 'system', uuid: 'snip-boundary' },
      { subtype: 'snip_marker', type: 'system', uuid: 'snip-marker' },
    ] as Array<Props['message']>

    let output = ''
    const { stdin, stdout } = createStreams()
    stdout.on('data', chunk => {
      output += chunk.toString()
    })
    const root = await createRoot({
      patchConsole: false,
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
    })

    root.render(
      <Box flexDirection="column">
        {messages.map(message => (
          <Message key={message.uuid} {...baseProps(message)} message={message} />
        ))}
      </Box>,
    )
    await sleep()

    try {
      expect(stripAnsi(output)).toContain('snip boundary')
      expect(harness.calls).toHaveLength(1)
      expect(harness.calls[0]).toMatchObject({
        name: 'SnipBoundaryMessage',
        props: { message: messages[0] },
      })
    } finally {
      root.unmount()
      stdin.end()
      stdout.end()
      await sleep()
    }
  })
})
