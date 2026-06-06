import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const chatShareKeys = {
  all: (wsId: string) => ["chat-share", wsId] as const,
  list: (wsId: string) => [...chatShareKeys.all(wsId), "list"] as const,
  detail: (wsId: string, id: string) => [...chatShareKeys.all(wsId), "detail", id] as const,
};

export function chatShareLinksOptions(wsId: string) {
  return queryOptions({
    queryKey: chatShareKeys.list(wsId),
    queryFn: () => api.listChatShareLinks(),
    staleTime: 30_000,
  });
}

export function chatShareLinkOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: chatShareKeys.detail(wsId, id),
    queryFn: () => api.getChatShareLink(id),
    enabled: !!id,
    staleTime: 30_000,
  });
}
