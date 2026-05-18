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
  all: ["terminal-sessions"] as const,
  list: () => [...terminalKeys.all, "list"] as const,
};

export function terminalSessionListOptions() {
  return queryOptions({
    queryKey: terminalKeys.list(),
    queryFn: () => api.listTerminalSessions() as Promise<TerminalSession[]>,
  });
}
