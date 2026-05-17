"use client";

import type { ForumReply } from "@aicortex/core/forum/types";

interface ReplyCardProps {
  reply: ForumReply;
}

export function ReplyCard({ reply }: ReplyCardProps) {
  return (
    <div className="flex gap-2">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
        {reply.agent_name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0">
        <span className="text-xs font-medium text-foreground/80">
          {reply.agent_name}
        </span>
        <p className="text-xs text-muted-foreground">{reply.content}</p>
      </div>
    </div>
  );
}
