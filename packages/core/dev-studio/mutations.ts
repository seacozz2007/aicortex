import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CreateDevSessionRequest, DevSession, DevSettings } from "../types/dev";
import { upsertDevSessionInCache } from "./cache";
import { devKeys } from "./queries";

export function useCreateDevSession(wsId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDevSessionRequest) => {
      if (!projectId) throw new Error("project_id required");
      return api.createDevSession(projectId, data) as Promise<DevSession>;
    },
    onSuccess: (session) => {
      upsertDevSessionInCache(qc, wsId, session);
    },
  });
}

export function useUpdateDevSettings(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { default_dev_agent_id: string }) =>
      api.updateDevSettings(data) as Promise<DevSettings>,
    onSuccess: (settings) => {
      qc.setQueryData(devKeys.settings(wsId), settings);
    },
  });
}

export function useDeleteDevSession(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => api.deleteChatSession(sessionId),
    onMutate: async (sessionId) => {
      await qc.cancelQueries({ queryKey: devKeys.sessions(wsId) });
      const prev = qc.getQueryData<DevSession[]>(devKeys.sessions(wsId));
      qc.setQueryData<DevSession[]>(devKeys.sessions(wsId), (old) =>
        old?.filter((s) => s.id !== sessionId),
      );
      return { prev };
    },
    onError: (_err, _sessionId, ctx) => {
      if (ctx?.prev) qc.setQueryData(devKeys.sessions(wsId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: devKeys.sessions(wsId) });
    },
  });
}

export function useSyncDevAgentSession(wsId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      sessionId: string;
      agent_session_id: string;
      runtime_id: string;
    }) =>
      api.syncDevAgentSession(projectId, input.sessionId, {
        agent_session_id: input.agent_session_id,
        runtime_id: input.runtime_id,
      }) as Promise<DevSession>,
    onSuccess: (session) => {
      upsertDevSessionInCache(qc, wsId, session);
    },
  });
}
