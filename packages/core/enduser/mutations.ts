import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import { endUserKeys } from "./queries";
import { createLogger } from "../logger";
import type { EndUserSession, CreateEndUserSessionRequest, UpdateEndUserSessionRequest } from "../types";

const logger = createLogger("enduser.mut");

export function useCreateEndUserSession() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();

  return useMutation({
    mutationFn: (data: CreateEndUserSessionRequest) =>
      api.createEndUserSession(data),
    onSuccess: (session) => {
      logger.info("createEndUserSession.success", { sessionId: session.id });
    },
    onError: (err) => {
      logger.error("createEndUserSession.error", err);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: endUserKeys.sessions(wsId) });
    },
  });
}

export function useUpdateEndUserSession() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateEndUserSessionRequest) =>
      api.updateEndUserSession(id, data),
    onMutate: async ({ id, ...data }) => {
      await qc.cancelQueries({ queryKey: endUserKeys.sessions(wsId) });

      const prevSessions = qc.getQueryData<EndUserSession[]>(endUserKeys.sessions(wsId));

      const patch = (old?: EndUserSession[]) =>
        old?.map((s) => (s.id === id ? { ...s, ...data } : s));
      qc.setQueryData<EndUserSession[]>(endUserKeys.sessions(wsId), patch);

      return { prevSessions };
    },
    onError: (err, vars, ctx) => {
      logger.error("updateEndUserSession.error", { sessionId: vars.id, err });
      if (ctx?.prevSessions) qc.setQueryData(endUserKeys.sessions(wsId), ctx.prevSessions);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: endUserKeys.sessions(wsId) });
    },
  });
}

export function useDeleteEndUserSession() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();

  return useMutation({
    mutationFn: (sessionId: string) => api.deleteEndUserSession(sessionId),
    onMutate: async (sessionId) => {
      await qc.cancelQueries({ queryKey: endUserKeys.sessions(wsId) });

      const prevSessions = qc.getQueryData<EndUserSession[]>(endUserKeys.sessions(wsId));

      const drop = (old?: EndUserSession[]) => old?.filter((s) => s.id !== sessionId);
      qc.setQueryData<EndUserSession[]>(endUserKeys.sessions(wsId), drop);

      return { prevSessions };
    },
    onError: (err, sessionId, ctx) => {
      logger.error("deleteEndUserSession.error", { sessionId, err });
      if (ctx?.prevSessions) qc.setQueryData(endUserKeys.sessions(wsId), ctx.prevSessions);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: endUserKeys.sessions(wsId) });
    },
  });
}

export function useRegenerateEndUserToken() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();

  return useMutation({
    mutationFn: (sessionId: string) => api.regenerateEndUserToken(sessionId),
    onSuccess: (result) => {
      logger.info("regenerateEndUserToken.success", { token: result.token });
    },
    onError: (err) => {
      logger.error("regenerateEndUserToken.error", err);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: endUserKeys.sessions(wsId) });
    },
  });
}
