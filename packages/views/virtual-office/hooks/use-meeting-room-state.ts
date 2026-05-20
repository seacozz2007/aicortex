"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { issueListOptions } from "@aicortex/core/issues/queries";
import { api } from "@aicortex/core/api";

const MEETING_LABEL = "meeting";

/** Query key factory for meeting room data. */
const meetingRoomKeys = {
  activeMeetings: (wsId: string) => ["meeting-room", "active", wsId] as const,
  recentComments: (issueId: string) =>
    ["meeting-room", "comments", issueId] as const,
};

/**
 * Detect active meetings (in_progress issues with "meeting" label)
 * and determine the current speaker from the most recent comment.
 */
export function useMeetingRoomState() {
  const wsId = useWorkspaceId();

  const { data: issues = [] } = useQuery({
    ...issueListOptions(wsId ?? ""),
    enabled: !!wsId,
  });

  const meetingIssues = useMemo(
    () =>
      issues.filter(
        (issue) =>
          issue.status === "in_progress" &&
          issue.labels?.some((l) => l.name === MEETING_LABEL),
      ),
    [issues],
  );

  const activeMeetingIds = meetingIssues.map((i) => i.id);

  const { data: allComments = [] } = useQuery({
    queryKey: meetingRoomKeys.activeMeetings(wsId ?? ""),
    queryFn: async () => {
      const results = await Promise.all(
        activeMeetingIds.map((id) => api.listComments(id)),
      );
      return results;
    },
    enabled: activeMeetingIds.length > 0,
  });

  const speakerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const comments of allComments) {
      if (comments.length > 0) {
        const last = comments[comments.length - 1];
        if (last) ids.add(last.author_id);
      }
    }
    return ids;
  }, [allComments]);

  return {
    speakerIds,
    activeMeetings: meetingIssues,
    hasActiveMeetings: meetingIssues.length > 0,
  };
}
