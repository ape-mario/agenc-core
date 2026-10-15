import React from 'react';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stripAnsi from 'strip-ansi';
import { GitStatusChrome } from '../../../src/tui/components/GitStatusLine.js';
import { FullscreenLayout } from '../../../src/tui/components/FullscreenLayout.js';
import { createRoot } from '../../../src/tui/ink/root.js';
import { Text } from '../../../src/tui/ink.js';
import { AppStoreContext, getDefaultAppState } from '../../../src/tui/state/AppState.js';
import { createStore } from '../../../src/tui/state/store.js';
import { FullscreenModeProvider } from '../../../src/tui/context/fullscreenModeContext.js';
import { StatusTurnBusyContext } from '../../../src/tui/context/statusEffortContext.js';
import TerminalFocusContext from '../../../src/tui/ink/components/TerminalFocusContext.js';
import { probeGitStatus, type GitStatus } from '../../../src/tui/git-status.js';
import type { GitStatusSession } from '../../../src/tui/hooks/useGitStatus.js';

vi.mock('../../../src/tui/git-status.js', () => ({ probeGitStatus: vi.fn() }));
const probe = vi.mocked(probeGitStatus);
const clean = { branch: 'unique-branch', changed: 0, ahead: 0, behind: 0 };
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

async function mount() {
  const stdout = Object.assign(new PassThrough(), { columns: 100, rows: 24 });
  const stdin = Object.assign(new PassThrough(), { isTTY: true, ref() {}, unref() {}, setRawMode() {} });
  let output = '';
  stdout.on('data', chunk => { output += chunk.toString(); });
  const root = await createRoot({ patchConsole: false, stdout: stdout as unknown as NodeJS.WriteStream, stdin: stdin as unknown as NodeJS.ReadStream });
  const store = createStore(getDefaultAppState());
  const listeners = new Set<(event: unknown) => void>();
  const logListeners = new Set<(event: unknown) => void>();
  const session: GitStatusSession = {
    cwd: '/session/repo',
    subscribeToEvents(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    eventLog: { subscribe(cb) { logListeners.add(cb); return () => { logListeners.delete(cb); }; } },
  };
  const render = (busy = false, focused = true, text = 'composer', currentSession = session) => root.render(
    <AppStoreContext.Provider value={store}>
      <TerminalFocusContext.Provider value={{ isTerminalFocused: focused, terminalFocusState: focused ? 'focused' : 'blurred' }}>
        <StatusTurnBusyContext value={busy}>
          <FullscreenModeProvider enabled>
            <FullscreenLayout scrollable={<Text>transcript</Text>} bottom={<>
              <GitStatusChrome session={currentSession} /><Text>{text}</Text>
            </>} />
          </FullscreenModeProvider>
        </StatusTurnBusyContext>
      </TerminalFocusContext.Provider>
    </AppStoreContext.Provider>,
  );
  const frame = () => {
    const end = output.lastIndexOf('\x1b[?2026l');
    const start = output.lastIndexOf('\x1b[?2026h', end);
    return stripAnsi(output.slice(start, end));
  };
  return { render, frame, store, session, listeners, logListeners,
    emit(event: unknown) { for (const cb of listeners) cb(event); },
    close() { root.unmount(); stdin.end(); stdout.end(); },
  };
}

describe('live git composer chrome', () => {
  it('hides old repo data on cwd changes and ignores a late result after unmount', async () => {
    probe.mockResolvedValueOnce(clean);
    let finish!: (status: GitStatus | null) => void;
    probe.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const app = await mount();
    try {
      app.render(); await vi.waitFor(() => expect(app.frame()).toContain('unique-branch'));
      app.render(false, true, 'other composer', { ...app.session, cwd: '/other/repo' });
      await vi.waitFor(() => expect(probe).toHaveBeenLastCalledWith('/other/repo'));
      await vi.waitFor(() => expect(app.frame()).not.toContain('unique-branch'));
    } finally { app.close(); }
    finish({ ...clean, branch: 'late-result' });
    await Promise.resolve();
    expect(app.frame()).not.toContain('late-result');
    expect(app.listeners.size).toBe(0);
  });

  it('keeps first paint async, renders once above the composer, and leaves the footer without the branch', async () => {
    let finish!: (status: GitStatus | null) => void;
    probe.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const app = await mount();
    try {
      app.render();
      await vi.waitFor(() => expect(app.frame()).toContain('composer'));
      expect(app.frame()).not.toContain('unique-branch');
      finish(clean);
      await vi.waitFor(() => expect(app.frame()).toContain('unique-branch'));
      const frame = app.frame();
      expect(frame.match(/unique-branch/g)).toHaveLength(1);
      expect(frame.indexOf('unique-branch')).toBeLessThan(frame.indexOf('composer'));
      expect(frame.indexOf('composer')).toBeLessThan(frame.indexOf('asks first'));
      expect(probe).toHaveBeenCalledWith('/session/repo');
    } finally { app.close(); }
  });
  it('refreshes on tool, shell/turn, focus and interval boundaries, never on composer edits', async () => {
    probe.mockResolvedValue(clean);
    const app = await mount();
    try {
      app.render(); await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(app.frame()).toContain('unique-branch'));
      app.render(false, true, 'typing');
      await vi.waitFor(() => expect(app.frame()).toContain('typing'));
      expect(probe).toHaveBeenCalledTimes(1);
      app.emit({ type: 'assistant_text_delta' });
      expect(probe).toHaveBeenCalledTimes(1);
      app.emit({ type: 'tool_call_completed' });
      await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(2));
      app.emit({ msg: { type: 'exec_command_end' } });
      await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(3));
      for (const cb of app.logListeners) cb({ type: 'tool_result' });
      await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(4));
      app.render(true); await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(5));
      app.render(false); await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(6));
      app.render(false, false); await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(7));
      app.render(false, true); await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(8));
      vi.useFakeTimers();
      // The interval was installed with real timers, so re-enable the setting to install it here.
      app.store.setState(state => ({ ...state, settings: { ...state.settings, tui: { ...state.settings.tui, gitStatusEnabled: false } } }));
      await vi.advanceTimersByTimeAsync(100);
      app.store.setState(state => ({ ...state, settings: { ...state.settings, tui: { ...state.settings.tui, gitStatusEnabled: true } } }));
      await vi.advanceTimersByTimeAsync(100);
      const before = probe.mock.calls.length;
      await vi.advanceTimersByTimeAsync(30_000);
      expect(probe.mock.calls.length).toBe(before + 1);
    } finally { app.close(); }
  });
  it('coalesces tool completions during a probe and hides errors and the disabled setting', async () => {
    let finish!: (status: GitStatus | null) => void;
    probe.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    probe.mockResolvedValue(null);
    const app = await mount();
    try {
      app.render(); await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(1));
      for (let i = 0; i < 5; i++) app.emit({ type: 'tool_call_completed' });
      expect(probe).toHaveBeenCalledTimes(1);
      finish(clean);
      await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(app.frame()).not.toContain('unique-branch'));
      app.store.setState(state => ({ ...state, settings: { ...state.settings, tui: { ...state.settings.tui, gitStatusEnabled: false } } }));
      await vi.waitFor(() => expect(app.listeners.size).toBe(0));
      expect(app.logListeners.size).toBe(0);
      app.emit({ type: 'tool_call_completed' });
      expect(probe).toHaveBeenCalledTimes(2);
    } finally { app.close(); }
    expect(app.listeners.size).toBe(0);
    expect(app.logListeners.size).toBe(0);
  });
});
