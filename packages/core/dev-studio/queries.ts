import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";
import type { DevSession, DevSettings } from "../types/dev";

export const devKeys = {
  all: (wsId: string) => ["dev", wsId] as const,
  sessions: (wsId: string) => [...devKeys.all(wsId), "sessions"] as const,
  projectSessions: (wsId: string, projectId: string) =>
    [...devKeys.all(wsId), "sessions", projectId] as const,
  session: (wsId: string, projectId: string, sessionId: string) =>
    [...devKeys.all(wsId), "session", projectId, sessionId] as const,
  settings: (wsId: string) => [...devKeys.all(wsId), "settings"] as const,
};

export function devSessionsOptions(wsId: string) {
  return queryOptions({
    queryKey: devKeys.sessions(wsId),
    queryFn: () => api.listDevSessions() as Promise<DevSession[]>,
    enabled: !!wsId,
    staleTime: 30_000,
    // Dev Studio mounts after other surfaces (Chat FAB, Agent tab) may have
    // already kicked off mark-read mutations; always reconcile on entry.
    refetchOnMount: "always",
  });
}

export function projectDevSessionsOptions(wsId: string, projectId: string) {
  return queryOptions({
    queryKey: devKeys.projectSessions(wsId, projectId),
    queryFn: () => api.listProjectDevSessions(projectId) as Promise<DevSession[]>,
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function devSessionOptions(wsId: string, projectId: string, sessionId: string) {
  return queryOptions({
    queryKey: devKeys.session(wsId, projectId, sessionId),
    queryFn: () => api.getDevSession(projectId, sessionId) as Promise<DevSession>,
    enabled: !!projectId && !!sessionId,
    staleTime: 30_000,
  });
}

export function devSettingsOptions(wsId: string) {
  return queryOptions({
    queryKey: devKeys.settings(wsId),
    queryFn: () => api.getDevSettings() as Promise<DevSettings>,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

export type { DevSession, DevSettings };
