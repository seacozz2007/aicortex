import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import { chatShareKeys } from "./queries";
import { createLogger } from "../logger";
import type { CreateChatShareLinkParams, UpdateChatShareLinkParams } from "../types";

const logger = createLogger("chat-share.mut");

export function useCreateChatShareLink() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();

  return useMutation({
    mutationFn: (data: CreateChatShareLinkParams) => {
      logger.info("createChatShareLink.start", { agent_id: data.agent_id });
      return api.createChatShareLink(data);
    },
    onSuccess: (link) => {
      logger.info("createChatShareLink.success", { id: link.id });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: chatShareKeys.list(wsId) });
    },
  });
}

export function useUpdateChatShareLink() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateChatShareLinkParams) => {
      logger.info("updateChatShareLink.start", { id });
      return api.updateChatShareLink(id, data);
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: chatShareKeys.list(wsId) });
      qc.invalidateQueries({ queryKey: chatShareKeys.detail(wsId, vars.id) });
    },
  });
}

export function useDeleteChatShareLink() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();

  return useMutation({
    mutationFn: (id: string) => {
      logger.info("deleteChatShareLink.start", { id });
      return api.deleteChatShareLink(id);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: chatShareKeys.list(wsId) });
    },
  });
}
