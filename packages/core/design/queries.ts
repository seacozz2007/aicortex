import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";
import type { DesignSession } from "../types/design";

export interface DesignSettings {
  default_design_agent_id?: string;
}

export const designKeys = {
  all: (wsId: string, projectId: string) => ["design", wsId, projectId] as const,
  sessions: (wsId: string, projectId: string) =>
    [...designKeys.all(wsId, projectId), "sessions"] as const,
  session: (wsId: string, projectId: string, sessionId: string) =>
    [...designKeys.all(wsId, projectId), "session", sessionId] as const,
  designSystems: (wsId: string, projectId: string) =>
    [...designKeys.all(wsId, projectId), "design-systems"] as const,
  settings: (wsId: string) => ["design", wsId, "settings"] as const,
};

export function designSessionsOptions(wsId: string, projectId: string) {
  return queryOptions({
    queryKey: designKeys.sessions(wsId, projectId),
    queryFn: () => api.listDesignSessions(projectId),
    enabled: !!projectId,
    staleTime: Infinity,
  });
}

export function designSessionOptions(wsId: string, projectId: string, sessionId: string) {
  return queryOptions({
    queryKey: designKeys.session(wsId, projectId, sessionId),
    queryFn: () => api.getDesignSession(projectId, sessionId),
    enabled: !!projectId && !!sessionId,
    staleTime: Infinity,
  });
}

export function designSystemResourcesOptions(wsId: string, projectId: string) {
  return queryOptions({
    queryKey: designKeys.designSystems(wsId, projectId),
    queryFn: () => api.listDesignSystemResources(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

export function designSettingsOptions(wsId: string) {
  return queryOptions({
    queryKey: designKeys.settings(wsId),
    queryFn: () => api.getDesignSettings(),
    staleTime: 60_000,
  });
}

export type { DesignSession };
