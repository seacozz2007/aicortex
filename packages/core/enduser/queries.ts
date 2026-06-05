import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const endUserKeys = {
  all: (wsId: string) => ["enduser", wsId] as const,
  sessions: (wsId: string) => [...endUserKeys.all(wsId), "sessions"] as const,
  session: (wsId: string, id: string) => [...endUserKeys.all(wsId), "session", id] as const,
  messages: (sessionId: string) => ["enduser", "messages", sessionId] as const,
  publicSession: (token: string) => ["enduser", "public", token] as const,
};

export function endUserSessionsOptions(wsId: string) {
  return queryOptions({
    queryKey: endUserKeys.sessions(wsId),
    queryFn: () => api.listEndUserSessions({ workspace_id: wsId }),
    staleTime: 30_000,
  });
}

export function endUserSessionOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: endUserKeys.session(wsId, id),
    queryFn: () => api.getEndUserSession(id),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function endUserMessagesOptions(sessionId: string) {
  return queryOptions({
    queryKey: endUserKeys.messages(sessionId),
    queryFn: () => api.listEndUserMessages(sessionId),
    enabled: !!sessionId,
    staleTime: 30_000,
  });
}

export function endUserPublicSessionOptions(token: string) {
  return queryOptions({
    queryKey: endUserKeys.publicSession(token),
    queryFn: () => api.getEndUserPublicSession(token),
    enabled: !!token,
    retry: false,
    staleTime: 30_000,
  });
}
