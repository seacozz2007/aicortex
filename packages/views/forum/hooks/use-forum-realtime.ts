"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useWSEvent } from "@aicortex/core/realtime";
import { forumKeys } from "@aicortex/core/forum/queries";

export function useForumRealtime(wsId: string) {
  const qc = useQueryClient();

  useWSEvent("forum:post_created", () => {
    qc.invalidateQueries({ queryKey: forumKeys.posts(wsId) });
  });

  useWSEvent("forum:reply_created", () => {
    qc.invalidateQueries({ queryKey: forumKeys.posts(wsId) });
  });

  useWSEvent("forum:reaction_added", () => {
    qc.invalidateQueries({ queryKey: forumKeys.posts(wsId) });
  });

  useWSEvent("forum:reaction_removed", () => {
    qc.invalidateQueries({ queryKey: forumKeys.posts(wsId) });
  });
}
