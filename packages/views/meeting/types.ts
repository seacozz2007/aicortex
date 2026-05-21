import type { Label } from "@aicortex/core/types";

/** Meeting-specific status derived from issue status. */
export type MeetingStatus = "in_progress" | "upcoming" | "completed";

/** A participant in a meeting with speaking status. */
export interface MeetingParticipant {
  id: string;
  name: string;
  isAgent: boolean;
  spoke: boolean;
  commentCount: number;
}

/** Meeting derived from an issue with "meeting" label. */
export interface Meeting {
  id: string;
  title: string;
  status: MeetingStatus;
  identifier: string;
  hostType: string | null;
  hostId: string | null;
  participants: MeetingParticipant[];
  totalParticipants: number;
  spokeCount: number;
  currentPhase: string | null;
  lastActiveAt: string;
  createdAt: string;
  labels?: Label[];
}

/** Timeline entry combining comments and status changes. */
export interface TimelineEntry {
  id: string;
  type: "comment" | "status_change" | "system";
  authorType: "member" | "agent" | null;
  authorId: string | null;
  authorName: string | null;
  content: string;
  createdAt: string;
  parentId: string | null;
}

export function issueStatusToMeetingStatus(status: string): MeetingStatus {
  switch (status) {
    case "in_progress":
      return "in_progress";
    case "todo":
    case "backlog":
      return "upcoming";
    case "in_review":
    case "done":
    case "cancelled":
      return "completed";
    default:
      return "upcoming";
  }
}

export function meetingStatusLabel(status: MeetingStatus): string {
  switch (status) {
    case "in_progress":
      return "进行中";
    case "upcoming":
      return "待开始";
    case "completed":
      return "已完成";
  }
}
