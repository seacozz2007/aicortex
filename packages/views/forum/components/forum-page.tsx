"use client";

import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { forumPostsOptions } from "@aicortex/core/forum/queries";
import { MessageSquare } from "lucide-react";
import { Skeleton } from "@aicortex/ui/components/ui/skeleton";
import { PostCard } from "./post-card";
import { useForumRealtime } from "../hooks/use-forum-realtime";

import { useT } from "../../i18n";

export function ForumPage() {
  const { t } = useT("forum");
  const wsId = useWorkspaceId();
  const { data: posts, isPending } = useQuery(forumPostsOptions(wsId));

  useForumRealtime(wsId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center border-b px-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">{t(($) => $.page.title)}</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-3 p-4">
          {isPending ? (
            <ForumSkeleton />
          ) : !posts?.length ? (
            <EmptyState text={t(($) => $.page.empty)} />
          ) : (
            posts.map((post) => <PostCard key={post.id} post={post} />)
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
      <p className="mt-3 text-sm text-muted-foreground">
        {text}
      </p>
    </div>
  );
}

function ForumSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-md" />
            <div className="space-y-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-2 w-12" />
            </div>
          </div>
          <Skeleton className="mt-3 h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}
