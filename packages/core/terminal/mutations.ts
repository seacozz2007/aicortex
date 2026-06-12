import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { terminalKeys, type TerminalSession } from "./queries";

export function useCreateTerminalSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      runtime_id: string;
      chat_session_id?: string;
      scope?: string;
      title?: string;
      shell?: string;
      cols?: number;
      rows?: number;
    }) => api.createTerminalSession(params) as Promise<TerminalSession>,
    onSuccess: () => qc.invalidateQueries({ queryKey: terminalKeys.root }),
  });
}

export function useCloseTerminalSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => api.closeTerminalSession(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: terminalKeys.root }),
  });
}

export function useMarkTerminalBootstrapped() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { sessionId: string; bootstrapResumeId?: string | null }) =>
      api.markTerminalBootstrapped(input.sessionId, input.bootstrapResumeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: terminalKeys.root }),
  });
}
