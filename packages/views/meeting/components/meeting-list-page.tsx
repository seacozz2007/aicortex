"use client";

import { useState } from "react";
import { Dialog as DialogRoot } from "@aicortex/ui/components/ui/dialog";
import { useWorkspacePaths } from "@aicortex/core/paths";
import { useActorName } from "@aicortex/core/workspace/hooks";
import { AppLink } from "../../navigation";
import {
  meetingStatusLabel,
  type Meeting,
  type MeetingStatus,
} from "../types";
import { useFilteredMeetings } from "../hooks/use-meetings";
import { Search, Calendar, Users, Plus } from "lucide-react";
import { cn } from "@aicortex/ui/lib/utils";
import { NewMeetingDialog } from "./new-meeting-dialog";
import { ActorAvatar } from "../../common/actor-avatar";

const STATUS_ORDER: MeetingStatus[] = ["in_progress", "upcoming", "completed"];

function MeetingCard({ meeting }: { meeting: Meeting }) {
  const paths = useWorkspacePaths();
  const { getActorName } = useActorName();

  const hostName =
    meeting.hostType && meeting.hostId
      ? getActorName(meeting.hostType, meeting.hostId)
      : null;

  const timeLabel = new Date(meeting.lastActiveAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <AppLink
      href={paths.meetingDetail(meeting.id)}
      className="group block rounded-lg border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md"
    >
      {/* Top row: status badge + identifier */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
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
        {meeting.identifier && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {meeting.identifier}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="mb-3 truncate text-sm font-semibold text-foreground">
        {meeting.title}
      </h3>

      {/* Bottom row: host, participants, time */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {/* Host */}
        {hostName && (
          <span className="inline-flex items-center gap-1.5">
            <ActorAvatar
              actorType={meeting.hostType!}
              actorId={meeting.hostId!}
              size={14}
            />
            <span className="truncate">{hostName}</span>
          </span>
        )}

        {/* Participants */}
        <span className="inline-flex items-center gap-1">
          <Users className="size-3.5" />
          {meeting.totalParticipants > 0
            ? `${meeting.totalParticipants} participants`
            : "No participants"}
        </span>

        {/* Time */}
        <span className="inline-flex items-center gap-1">
          <Calendar className="size-3.5" />
          {timeLabel}
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
            Create a new meeting to get started.
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
      {/* Responsive grid: 1 col on mobile, 2 cols on tablet/desktop */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {meetings.map((m) => (
          <MeetingCard key={m.id} meeting={m} />
        ))}
      </div>
    </section>
  );
}

export function MeetingListPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { grouped, isPending } = useFilteredMeetings(search);

  const totalCount =
    grouped.in_progress.length +
    grouped.upcoming.length +
    grouped.completed.length;

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Meetings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              View and manage all meetings in this workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand/90 transition-colors cursor-pointer shrink-0"
          >
            <Plus className="size-4" />
            New Meeting
          </button>
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

      {/* New Meeting Dialog */}
      {dialogOpen && (
        <DialogRoot open onOpenChange={(v) => { if (!v) setDialogOpen(false); }}>
          <NewMeetingDialog onClose={() => setDialogOpen(false)} />
        </DialogRoot>
      )}
    </>
  );
}
