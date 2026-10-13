import { createContext, useContext } from "react";

/**
 * The effort the session runs at, for the status line ("high effort"). Null
 * when the model has no effort levels. App resolves it because only App knows
 * the session's provider; the status line just shows it.
 */
export const StatusEffortContext = createContext<string | null>(null);

export function useStatusEffort(): string | null {
  return useContext(StatusEffortContext);
}

/** Resident usage shared by /context and the footer; null until known. */
export const StatusContextUsageContext = createContext<number | null>(null);
export function useStatusContextUsage(): number | null {
  return useContext(StatusContextUsageContext);
}
