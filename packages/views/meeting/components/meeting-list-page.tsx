"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { useWorkspacePaths } from "@aicortex/core/paths";
import { AppLink } from "../../navigation";
import { issueListOptions } from "@aicortex/core/issues/queries";
import {
  issueStatusToMeetingStatus,
  meetingStatusLabel,
  type Meeting,
  type MeetingStatus,
} from "../types";
import { Search, Calendar, Users, Clock } from "lucide-react";
import { cn } from "@aicortex/ui/lib/utils";

const MEETING_LABEL = "meeting";

const STATUS_ORDER: MeetingStatus[] = ["in_progress", "upcoming", "completed"];

function MeetingCard({ meeting }: { meeting: Meeting }) {
  const paths = useWorkspacePaths();

  const statusColor = {
    in_progress:
      "border-l-green-500 bg-green-50 dark:bg-green-950/20",
    upcoming: "border-l-blue-500 bg-blue-50 dark:bg-blue-950/20",
    completed:
      "border-l-gray-400 bg-gray-50 dark:bg-gray-900/20",
  }[meeting.status];

  const progressLabel =
    meeting.totalParticipants > 0
      ? `${meeting.spokeCount}/${meeting.totalParticipants}`
      : "-";

  return (
    <AppLink
      href={paths.meetingDetail(meeting.id)}
      className={cn(
        "group block rounded-lg border border-border border-l-4 p-4 shadow-sm transition-all hover:shadow-md",
        statusColor,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {meeting.title}
            </h3>
            {meeting.identifier && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {meeting.identifier}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" />
              {progressLabel} spoke
            </span>
            {meeting.currentPhase && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                {meeting.currentPhase}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3" />
              {new Date(meeting.lastActiveAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
            meeting.status === "in_progress" &&
              "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
            meeting.status === "upcoming" &&
              "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
            meeting.status === "completed" &&
              "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
          )}
        >
          {meetingStatusLabel(meeting.status)}
        </span>
      </div>
    </AppLink>
  );
}

function EmptyState({ search }: { search: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Calendar className="mb-3 size-10 text-muted-foreground/50" />
      {search ? (
        <p className="text-sm text-muted-foreground">
          No meetings found for &ldquo;{search}&rdquo;
        </p>
      ) : (
        <>
          <h3 className="text-sm font-medium text-foreground">
            No meetings yet
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Meetings are created when an issue with the &ldquo;meeting&rdquo;
            label is added.
          </p>
        </>
      )}
    </div>
  );
}

function MeetingSection({
  status,
  meetings,
}: {
  status: MeetingStatus;
  meetings: Meeting[];
}) {
  if (meetings.length === 0) return null;

  const sectionStyle = {
    in_progress: {
      badge: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    },
    upcoming: {
      badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    },
    completed: {
      badge: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    },
  }[status];

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            sectionStyle.badge,
          )}
        >
          {meetingStatusLabel(status)}
        </span>
        <span className="text-xs text-muted-foreground">
          {meetings.length}
        </span>
      </div>
      <div className="space-y-2">
        {meetings.map((m) => (
          <MeetingCard key={m.id} meeting={m} />
        ))}
      </div>
    </section>
  );
}

export function MeetingListPage() {
  const [search, setSearch] = useState("");

  const wsId = useWorkspaceId();
  const { data: issues = [], isPending } = useQuery({
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

  const grouped = useMemo(() => {
    const groups: Record<string, Meeting[]> = {
      in_progress: [],
      upcoming: [],
      completed: [],
    };
    const q = search.toLowerCase();
    for (const issue of meetingIssues) {
      if (q && !issue.title.toLowerCase().includes(q)) continue;
      groups[issueStatusToMeetingStatus(issue.status)]?.push({
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
      });
    }
    return groups as Record<MeetingStatus, Meeting[]>;
  }, [meetingIssues, search]);

  const totalCount =
    grouped.in_progress.length +
    grouped.upcoming.length +
    grouped.completed.length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Meetings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View and manage all meetings in this workspace.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search meetings..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      {isPending ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          Loading meetings...
        </div>
      ) : totalCount === 0 ? (
        <EmptyState search={search} />
      ) : (
        <div className="space-y-8">
          {STATUS_ORDER.map((status) => (
            <MeetingSection
              key={status}
              status={status}
              meetings={grouped[status]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
