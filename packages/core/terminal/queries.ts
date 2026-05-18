import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export interface TerminalSession {
  id: string;
  workspace_id: string;
  runtime_id: string;
  user_id: string;
  title: string;
  status: "active" | "detached" | "closed";
  shell: string;
  cols: number;
  rows: number;
  created_at: string;
  closed_at?: string;
  last_attached_at: string;
}

export const terminalKeys = {
  root: ["terminal-sessions"] as const,
  all: (wsId: string) => ["terminal-sessions", wsId] as const,
  list: (wsId: string) => [...terminalKeys.all(wsId), "list"] as const,
};

export function terminalSessionListOptions(wsId: string) {
  return queryOptions({
    queryKey: terminalKeys.list(wsId),
    queryFn: () => api.listTerminalSessions() as Promise<TerminalSession[]>,
  });
}
