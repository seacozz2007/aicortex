import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CreateDesignSessionRequest, DesignSession } from "../types/design";
import { designKeys } from "./queries";
import type { DesignSettings } from "./queries";

export function useCreateDesignSession(wsId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDesignSessionRequest) =>
      api.createDesignSession(projectId, data),
    onSuccess: (session: DesignSession) => {
      qc.setQueryData<DesignSession[]>(designKeys.sessions(wsId, projectId), (prev) =>
        prev ? [session, ...prev] : [session],
      );
    },
  });
}

export function useExportDesignSession(projectId: string) {
  return useMutation({
    mutationFn: ({ sessionId, format }: { sessionId: string; format?: string }) =>
      api.exportDesignSession(projectId, sessionId, format),
  });
}

export function useStartDesignJury(projectId: string) {
  return useMutation({
    mutationFn: ({ sessionId, rounds }: { sessionId: string; rounds?: number }) =>
      api.startDesignJury(projectId, sessionId, rounds),
  });
}

export function useUpdateDesignSettings(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { default_design_agent_id: string }) =>
      api.updateDesignSettings(data),
    onSuccess: (settings: DesignSettings) => {
      qc.setQueryData(designKeys.settings(wsId), settings);
    },
  });
}
