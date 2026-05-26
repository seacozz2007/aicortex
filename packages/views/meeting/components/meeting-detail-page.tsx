"use client";

import { useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { useNavigation } from "../../navigation";
import { useActorName } from "@aicortex/core/workspace/hooks";
import { issueDetailOptions } from "@aicortex/core/issues/queries";
import { api } from "@aicortex/core/api";
import type { Comment } from "@aicortex/core/types";
import {
  issueStatusToMeetingStatus,
  meetingStatusLabel,
  type MeetingParticipant,
} from "../types";
import { meetingKeys, deriveParticipants } from "../hooks/use-meetings";
import {
  ArrowLeft,
  MessageSquare,
  Users,
  Clock,
  Calendar,
  Bot,
  User,
  Tag,
} from "lucide-react";
import { cn } from "@aicortex/ui/lib/utils";
import { ReadonlyContent } from "../../editor";

function ParticipantBadge({
  participant,
  isLatestSpeaker,
  isHost,
  onClick,
}: {
  participant: MeetingParticipant;
  isLatestSpeaker: boolean;
  isHost: boolean;
  onClick: () => void;
}) {
  const hasSpoken = participant.spoke && participant.commentCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-all",
        hasSpoken
          ? "text-foreground hover:bg-brand/10"
          : "text-muted-foreground/50 hover:bg-accent/30",
        isLatestSpeaker &&
          "bg-brand/[0.06] ring-1 ring-brand/20",
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          hasSpoken
            ? isLatestSpeaker
              ? "bg-brand text-white"
              : participant.isAgent
                ? "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400"
                : "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
            : "bg-muted text-muted-foreground/40",
        )}
      >
        {participant.isAgent ? (
          <Bot className="size-3.5" />
        ) : (
          <User className="size-3.5" />
        )}
      </div>

      {/* Name */}
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          hasSpoken ? "font-medium" : "font-normal",
        )}
      >
        {participant.name}
        {isHost && (
          <span className="ml-1.5 rounded bg-brand/10 px-1 py-0.5 text-[10px] font-medium text-brand">
            Host
          </span>
        )}
      </span>

      {/* Comment count badge */}
      {hasSpoken && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
          <MessageSquare className="size-3" />
          {participant.commentCount}
        </span>
      )}
    </button>
  );
}

function ParticipantSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-2.5 rounded-lg px-3 py-2">
      <div className="size-7 rounded-full bg-muted" />
      <div className="h-3 flex-1 rounded bg-muted" />
    </div>
  );
}

function CommentBubble({
  comment,
  participant,
}: {
  comment: Comment;
  participant: MeetingParticipant | undefined;
}) {
  const isAgent = participant?.isAgent ?? comment.author_type === "agent";
  const name = participant?.name ?? "Unknown";

  return (
    <div
      className={cn(
        "flex gap-3",
        isAgent ? "flex-row" : "flex-row-reverse",
      )}
    >
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          isAgent
            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
        )}
      >
        {isAgent ? (
          <Bot className="size-3.5" />
        ) : (
          <User className="size-3.5" />
        )}
      </div>
      <div
        className={cn(
          "max-w-[75%] rounded-lg px-3 py-2 text-sm",
          isAgent
            ? "rounded-tl-sm bg-purple-50 text-foreground dark:bg-purple-950/20"
            : "rounded-tr-sm bg-accent text-foreground",
        )}
      >
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">{name}</span>
          <span className="text-[10px] text-muted-foreground">
            {new Date(comment.created_at).toLocaleTimeString()}
          </span>
        </div>
        <ReadonlyContent content={comment.content} />
      </div>
    </div>
  );
}

export function MeetingDetailPage({ id }: { id: string }) {
  const wsId = useWorkspaceId();
  const { back } = useNavigation();
  const { getActorName } = useActorName();
  const timelineRef = useRef<HTMLDivElement>(null);

  const { data: issue, isPending: issueLoading, error, refetch } = useQuery({
    ...issueDetailOptions(wsId ?? "", id),
    enabled: !!wsId,
  });

  const { data: comments = [] } = useQuery({
    queryKey: meetingKeys.comments(id),
    queryFn: () => api.listComments(id),
    enabled: true,
  });

  const participants = useMemo(() => {
    if (!issue) return [];
    return deriveParticipants(issue, comments, getActorName);
  }, [issue, comments, getActorName]);

  // The participant who made the most recent comment
  const latestSpeakerId = useMemo(() => {
    if (comments.length === 0) return null;
    return comments[comments.length - 1]?.author_id ?? null;
  }, [comments]);

  // Host = issue assignee
  const hostId = issue?.assignee_id;

  // Auto-scroll to bottom when new comments arrive (meeting in progress)
  useEffect(() => {
    if (issue?.status === "in_progress" && timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [comments.length, issue?.status]);

  // Scroll to a participant's first comment
  const scrollToParticipant = (participantId: string) => {
    const firstComment = comments.find((c) => c.author_id === participantId);
    if (firstComment) {
      const el = document.getElementById(`comment-${firstComment.id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  if (error && !issue) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>Failed to load meeting</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent/80"
        >
          Retry
        </button>
      </div>
    );
  }

  if (issueLoading || !issue) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading meeting...
      </div>
    );
  }

  const meetingStatus = issueStatusToMeetingStatus(issue.status);
  const isInProgress = meetingStatus === "in_progress";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={back}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold text-foreground">
              {issue.title}
            </h1>
            {issue.identifier && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {issue.identifier}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                isInProgress &&
                  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                meetingStatus === "upcoming" &&
                  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                meetingStatus === "completed" &&
                  "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
              )}
            >
              {meetingStatusLabel(meetingStatus)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3" />
              {new Date(issue.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Body: timeline + info panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Timeline */}
        <div
          ref={timelineRef}
          className="flex-1 overflow-y-auto px-4 py-4"
        >
          {comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-sm text-muted-foreground">
              <MessageSquare className="mb-2 size-8 opacity-50" />
              <p>No discussion yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => {
                const participant = participants.find(
                  (p) => p.id === comment.author_id,
                );
                return (
                  <div key={comment.id} id={`comment-${comment.id}`}>
                    <CommentBubble
                      comment={comment}
                      participant={participant}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info Panel */}
        <div className="w-72 shrink-0 border-l border-border overflow-y-auto p-4">
          {/* Meeting Info */}
          <div className="mb-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Info
            </h3>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="size-3.5" />
                <span>
                  {isInProgress ? "In progress" : meetingStatusLabel(meetingStatus)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="size-3.5" />
                <span>
                  Created {new Date(issue.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare className="size-3.5" />
                <span>{comments.length} comments</span>
              </div>
            </div>
          </div>

          {/* Participants */}
          <div className="mb-5">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Users className="size-3.5" />
              <span>Participants</span>
              <span className="ml-auto font-normal text-muted-foreground/60">
                {participants.filter((p) => p.spoke).length}/{participants.length}
              </span>
            </h3>
            <div className="space-y-0.5">
              {participants.length === 0 ? (
                <>
                  <ParticipantSkeleton />
                  <ParticipantSkeleton />
                </>
              ) : (
                participants.map((p) => (
                  <ParticipantBadge
                    key={p.id}
                    participant={p}
                    isLatestSpeaker={p.id === latestSpeakerId}
                    isHost={p.id === hostId}
                    onClick={() => scrollToParticipant(p.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Labels */}
          {issue.labels && issue.labels.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Tag className="size-3.5" />
                  <span>Labels</span>
                </div>
              </h3>
              <div className="flex flex-wrap gap-1">
                {issue.labels.map((label) => (
                  <span
                    key={label.id}
                    className="rounded-full bg-accent px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
