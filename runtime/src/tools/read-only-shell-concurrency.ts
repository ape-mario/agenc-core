import { inspectReadOnlyCommand } from "../permissions/readonly-inspection.js";

/**
 * Whether an exec_command call may run alongside the other calls of the same
 * model response.
 *
 * Only a literal read-only inspection qualifies: one command from the fixed
 * inspection table with validated flags, and no expansion, pipe, redirect,
 * chaining, shell profile, TTY, background run, escalation or detach. That is
 * the classification that routes the call to the read-only fast path. Such a
 * call cannot change files, processes or the network, so running it next to
 * other read-only calls cannot change any call's result. Every other command
 * stays exclusive: it starts only when nothing else runs and keeps the order
 * the model submitted it in. Results are recorded in submission order either
 * way (StreamingToolExecutor).
 */
export function execCommandRunsConcurrently(
  args: Readonly<Record<string, unknown>>,
  cwd: string,
): boolean {
  if (args.detach === true || args.dangerouslyDisableSandbox === true) return false;
  return inspectReadOnlyCommand("exec_command", args, cwd, {
    enforceWorkspaceBoundary: false,
  }).allowed;
}
