import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";
import type { ForumPost } from "./types";

export const forumKeys = {
  all: (wsId: string) => ["forum", wsId] as const,
  posts: (wsId: string) => [...forumKeys.all(wsId), "posts"] as const,
};

export function forumPostsOptions(wsId: string) {
  return queryOptions({
    queryKey: forumKeys.posts(wsId),
    queryFn: () => api.listForumPosts() as Promise<ForumPost[]>,
    staleTime: 30_000,
  });
}
