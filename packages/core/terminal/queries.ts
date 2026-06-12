import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const TERMINAL_SCOPES = {
  DEFAULT: "default",
  CLI_MAIN: "cli-main",
} as const;

export type TerminalScope = (typeof TERMINAL_SCOPES)[keyof typeof TERMINAL_SCOPES];

export interface TerminalSession {
  id: string;
  workspace_id: string;
  runtime_id: string;
  user_id: string;
  chat_session_id?: string | null;
  scope: string;
  bootstrapped: boolean;
  title: string;
  status: "active" | "detached" | "closed";
  shell: string;
  cols: number;
  rows: number;
  created_at: string;
  closed_at?: string;
  last_attached_at: string;
}

export interface TerminalSessionListFilters {
  chat_session_id?: string;
  scope?: string;
}

export const terminalKeys = {
  root: ["terminal-sessions"] as const,
  all: (wsId: string) => ["terminal-sessions", wsId] as const,
  list: (wsId: string, filters?: TerminalSessionListFilters) =>
    [...terminalKeys.all(wsId), "list", filters ?? {}] as const,
};

export function terminalSessionListOptions(
  wsId: string,
  filters?: TerminalSessionListFilters,
) {
  return queryOptions({
    queryKey: terminalKeys.list(wsId, filters),
    queryFn: () => api.listTerminalSessions(filters) as Promise<TerminalSession[]>,
    enabled: !!wsId,
  });
}

export function findTerminalSessionForContext(
  sessions: TerminalSession[],
  input: {
    chatSessionId: string;
    runtimeId: string;
    scope?: string;
  },
): TerminalSession | null {
  const scope = input.scope ?? TERMINAL_SCOPES.DEFAULT;
  return (
    sessions.find(
      (session) =>
        session.chat_session_id === input.chatSessionId &&
        session.scope === scope &&
        session.runtime_id === input.runtimeId &&
        session.status !== "closed",
    ) ?? null
  );
}
