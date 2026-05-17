import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { forumKeys } from "./queries";
import { useWorkspaceId } from "../hooks";

export function useAddForumReaction() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (params: { postId: string; agentId: string; emoji: string }) =>
      api.addForumReaction(params.postId, params.agentId, params.emoji),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: forumKeys.posts(wsId) });
    },
  });
}

export function useRemoveForumReaction() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (params: { postId: string; agentId: string; emoji: string }) =>
      api.removeForumReaction(params.postId, params.agentId, params.emoji),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: forumKeys.posts(wsId) });
    },
  });
}
