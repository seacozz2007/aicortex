"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@aicortex/core/hooks";
import {
  issueListOptions,
  issueDetailOptions,
} from "@aicortex/core/issues/queries";
import { api } from "@aicortex/core/api";
import type { Comment, Issue } from "@aicortex/core/types";
import {
  issueStatusToMeetingStatus,
  type Meeting,
  type MeetingParticipant,
} from "../types";

/** TanStack Query key factory for comments. */
export const meetingKeys = {
  comments: (issueId: string) => ["meeting", "comments", issueId] as const,
  details: (wsId: string, issueId: string) =>
    ["meeting", "details", wsId, issueId] as const,
};

const MEETING_LABEL = "meeting";

/**
 * Filter issues that have the "meeting" label.
 * Returns all meetings in the workspace grouped by derived status.
 */
export function useMeetings() {
  const wsId = useWorkspaceId();
  const { data: issues = [], isPending, error } = useQuery({
    ...issueListOptions(wsId ?? ""),
    enabled: !!wsId,
  });

  const meetingIssues = useMemo(
    () =>
      issues.filter((issue) =>
        issue.labels?.some((l) => l.name === MEETING_LABEL),
      ),
    [issues],
  );

  const meetings = useMemo(() => {
    return meetingIssues.map((issue) => issueToMeeting(issue));
  }, [meetingIssues]);

  const grouped = useMemo(() => {
    const groups: Record<string, Meeting[]> = {
      in_progress: [],
      upcoming: [],
      completed: [],
    };
    for (const m of meetings) {
      groups[m.status]?.push(m);
    }
    return groups as Record<Meeting["status"], Meeting[]>;
  }, [meetings]);

  return { meetings, grouped, isPending, error };
}

/**
 * Fetch a single meeting detail with comments for timeline.
 */
export function useMeetingDetail(id: string | undefined) {
  const wsId = useWorkspaceId();
  const { data: issue, isPending: issueLoading } = useQuery({
    ...issueDetailOptions(wsId ?? "", id ?? ""),
    enabled: !!wsId && !!id,
  });

  const { data: comments = [], isPending: commentsLoading } = useQuery({
    queryKey: meetingKeys.comments(id ?? ""),
    queryFn: () => (id ? api.listComments(id) : []),
    enabled: !!id,
  });

  const meeting = useMemo(
    () => (issue ? issueToMeetingWithComments(issue, comments) : null),
    [issue, comments],
  );

  return {
    meeting,
    comments,
    isPending: issueLoading || commentsLoading,
  };
}

/**
 * Search meetings by title across all status groups.
 */
export function useFilteredMeetings(search: string) {
  const { grouped, isPending } = useMeetings();

  const filtered = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    const filter = (m: Meeting) => m.title.toLowerCase().includes(q);
    return {
      in_progress: grouped.in_progress.filter(filter),
      upcoming: grouped.upcoming.filter(filter),
      completed: grouped.completed.filter(filter),
    };
  }, [grouped, search]);

  return { grouped: filtered, isPending };
}

function issueToMeeting(issue: Issue): Meeting {
  return {
    id: issue.id,
    title: issue.title,
    status: issueStatusToMeetingStatus(issue.status),
    identifier: issue.identifier,
    participants: [],
    totalParticipants: 0,
    spokeCount: 0,
    currentPhase:
      issue.status === "in_progress"
        ? "Discussion"
        : issue.status === "done"
          ? "Completed"
          : null,
    lastActiveAt: issue.updated_at,
    createdAt: issue.created_at,
    labels: issue.labels,
  };
}

function issueToMeetingWithComments(
  issue: Issue,
  comments: Comment[],
): Meeting {
  const participants = deriveParticipants(issue, comments);
  return {
    ...issueToMeeting(issue),
    participants,
    totalParticipants: participants.length,
    spokeCount: participants.filter((p) => p.spoke).length,
  };
}

function deriveParticipants(
  issue: Issue,
  comments: Comment[],
): MeetingParticipant[] {
  const authorMap = new Map<
    string,
    { name: string; isAgent: boolean; count: number }
  >();

  if (issue.assignee_id) {
    authorMap.set(issue.assignee_id, {
      name: issue.assignee_id,
      isAgent: issue.assignee_type === "agent",
      count: 0,
    });
  }

  for (const c of comments) {
    const existing = authorMap.get(c.author_id);
    if (existing) {
      existing.count++;
    } else {
      authorMap.set(c.author_id, {
        name: c.author_id,
        isAgent: c.author_type === "agent",
        count: 1,
      });
    }
  }

  return Array.from(authorMap.entries()).map(([id, data]) => ({
    id,
    name: data.name,
    isAgent: data.isAgent,
    spoke: data.count > 0,
    commentCount: data.count,
  }));
}
