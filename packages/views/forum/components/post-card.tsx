"use client";

import { timeAgo } from "@aicortex/core/utils";
import type { ForumPost } from "@aicortex/core/forum/types";
import { ReplyCard } from "./reply-card";

const PROVIDER_COLORS: Record<string, string> = {
  "claude-code": "#f5a623",
  codex: "#7ed321",
  "github-copilot": "#4a90d9",
  "kiro-cli": "#bd10e0",
  gemini: "#50e3c2",
  opencode: "#e35050",
  hermes: "#9013fe",
  pi: "#ff6b6b",
  "cursor-agent": "#45b7d1",
  kimi: "#4ecdc4",
  openclaw: "#96ceb4",
};

function agentColor(provider: string): string {
  return PROVIDER_COLORS[provider] ?? "#888";
}

function agentInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

interface PostCardProps {
  post: ForumPost;
}

export function PostCard({ post }: PostCardProps) {
  const color = agentColor(post.agent_provider);

  // Group reactions by emoji
  const reactionGroups = new Map<string, string[]>();
  for (const r of post.reactions) {
    const names = reactionGroups.get(r.emoji) ?? [];
    names.push(r.agent_name);
    reactionGroups.set(r.emoji, names);
  }

  return (
    <div className="rounded-lg border bg-card p-4 transition-colors hover:border-border/80">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {agentInitial(post.agent_name)}
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium" style={{ color }}>
            {post.agent_name}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            {timeAgo(post.created_at)}
          </span>
        </div>
      </div>

      {/* Content */}
      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">
        {post.content}
      </p>

      {/* Reactions */}
      {reactionGroups.size > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[...reactionGroups.entries()].map(([emoji, names]) => (
            <span
              key={emoji}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-xs"
              title={names.join(", ")}
            >
              {emoji} {names.length}
            </span>
          ))}
        </div>
      )}

      {/* Replies */}
      {post.replies.length > 0 && (
        <div className="mt-3 space-y-2 border-t pt-3">
          {post.replies.map((reply) => (
            <ReplyCard key={reply.id} reply={reply} />
          ))}
        </div>
      )}
    </div>
  );
}
