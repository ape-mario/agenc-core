/**
 * The note `clampGenericToolResult` leaves where it cut a long result:
 * "… +63 more lines (ctrl+o for the full result)". Readers that summarize a
 * result count the hidden lines from it and never show it as text.
 */
const CLAMP_MARKER_RE = /^… \+(\d+) more (lines|characters) \(ctrl\+o for the full result\)$/u;

export function clampMarkerLine(hidden: number, unit: "lines" | "characters"): string {
  return `… +${hidden} more ${unit} (ctrl+o for the full result)`;
}

/** The hidden count when a line is a clamp marker, else null. */
export function parseClampMarker(
  line: string,
): { readonly hidden: number; readonly unit: "lines" | "characters" } | null {
  const match = CLAMP_MARKER_RE.exec(line.trim());
  if (match === null) return null;
  return { hidden: Number(match[1]), unit: match[2] as "lines" | "characters" };
}

/** Decode protocol envelopes for display only. The model and journal keep them. */
export function readableToolError(raw: unknown, depth = 0): string {
  if (depth > 4) return "Tool execution failed";
  if (Array.isArray(raw)) {
    return raw.map(part => readableToolError(part, depth + 1)).join(" ");
  }
  if (raw !== null && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    for (const key of ["error", "message", "content", "text"]) {
      if (Object.hasOwn(record, key) && record[key] !== undefined) {
        return readableToolError(record[key], depth + 1);
      }
    }
    const label = (value: unknown): string | undefined => {
      if (typeof value !== "string" && typeof value !== "number") return undefined;
      return String(value).replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || undefined;
    };
    const kind = label(record.kind);
    const code = label(record.code);
    const details = [kind, code === undefined ? undefined : `code ${code}`].filter(Boolean);
    return details.length > 0 ? `Tool execution failed (${details.join(", ")})` : "Tool execution failed";
  }
  if (typeof raw !== "string") return "Tool execution failed";
  const trimmed = raw.trim();
  if (/^[\[{]/.test(trimmed) && !trimmed.startsWith("[exec ")) {
    try { return readableToolError(JSON.parse(trimmed), depth + 1); }
    catch { return "Tool execution failed"; }
  }
  return raw;
}

/**
 * One readable line from a raw tool error: drops the tag wrappers the model
 * protocol uses (`<tool_use_error>`), machine prefixes such as
 * `InputValidationError: shell_workspace_file_write_disallowed:`, the
 * `exec_command error` header and the `[exec exit_code=1 …]` trailer, and
 * leads with the exit code when there is one.
 */
export function summarizeToolError(raw: string): string {
  raw = readableToolError(raw);
  const exit = /\[exec exit_code=(-?\d+)[^\]]*\]/.exec(raw);
  const lines = raw
    .replace(/<\/?(?:tool_use_error|tool-error|tool-error-name)>/g, "")
    .replace(/\[exec exit_code=[^\]]*\]/g, "")
    .split("\n")
    .map((line) =>
      line
        .replace(/\bInputValidationError:\s*/g, "")
        .replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+){2,}:\s*/g, "")
        .trim(),
    )
    .filter(
      (line) =>
        line.length > 0 &&
        !/^[\w.]+ error$/.test(line) &&
        !line.startsWith("Received raw arguments:") &&
        parseClampMarker(line) === null,
    );
  // A shell failure ends with its reason; any other error reads as one
  // sentence ("spawn_agent failed … `description` was provided").
  if (exit !== null) {
    const reason = lines.at(-1) ?? "";
    return reason.length > 0 ? `exit ${exit[1]}, ${reason}` : `exit ${exit[1]}`;
  }
  const message = lines.join(" ").replace(/\s+/g, " ");
  return message.length > 0 ? message : "failed";
}

/** Decode historical/synthetic result envelopes before displaying an error. */
export function unwrapToolError(raw: string): string {
  return readableToolError(raw);
}

/** Whether text still carries raw tool-error wrappers. */
export function looksLikeRawToolError(text: string): boolean {
  return text.includes("<tool_use_error>") || /\[exec exit_code=-?\d+/.test(text) || unwrapToolError(text) !== text;
}
