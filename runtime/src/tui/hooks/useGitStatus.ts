import { useEffect, useRef, useState } from 'react';
import { useTerminalFocus } from '../ink.js';
import { useStatusTurnBusy } from '../context/statusEffortContext.js';
import { probeGitStatus, type GitStatus } from '../git-status.js';
import type { AgenCBridgeSession } from '../session-types.js';

export type GitStatusSession = Pick<AgenCBridgeSession, 'cwd' | 'sessionConfiguration' | 'eventLog' | 'subscribeToEvents'>;
const REFRESH_MS = 30_000;

function isToolCompletion(event: unknown): boolean {
  if (!event || typeof event !== 'object') return false;
  const record = event as { type?: string; msg?: { type?: string } };
  const type = record.msg?.type ?? record.type;
  return type === 'tool_result' || type === 'tool_call_completed' ||
    type === 'exec_command_end' || type === 'mcp_tool_call_end' || type === 'patch_apply_end';
}

/** No input subscription. Coalesce busy refreshes into one follow-up after the probe. */
export function useGitStatus(cwd: string, enabled: boolean, session?: GitStatusSession): GitStatus | null {
  const focused = useTerminalFocus();
  const turnBusy = useStatusTurnBusy();
  const [snapshot, setSnapshot] = useState<{ cwd: string; status: GitStatus | null } | null>(null);
  const refreshRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let running = false;
    let dirty = false;
    const refresh = () => {
      if (cancelled) return;
      if (running) { dirty = true; return; }
      running = true;
      void probeGitStatus(cwd).then(status => {
        if (!cancelled) setSnapshot({ cwd, status });
      }).finally(() => {
        running = false;
        if (dirty && !cancelled) { dirty = false; refresh(); }
      });
    };
    refreshRef.current = refresh;
    const onEvent = (event: unknown) => { if (isToolCompletion(event)) refresh(); };
    const unsubscribeLog = session?.eventLog?.subscribe(onEvent);
    const unsubscribeEvents = session?.subscribeToEvents?.(onEvent);
    const interval = setInterval(refresh, REFRESH_MS);
    interval.unref?.();
    return () => {
      cancelled = true;
      refreshRef.current = null;
      clearInterval(interval);
      unsubscribeLog?.();
      unsubscribeEvents?.();
    };
  }, [cwd, enabled, session]);
  useEffect(() => { refreshRef.current?.(); }, [cwd, enabled, session, focused, turnBusy]);
  return enabled && snapshot?.cwd === cwd ? snapshot.status : null;
}
