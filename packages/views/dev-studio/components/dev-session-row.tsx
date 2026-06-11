"use client";

import { Archive, GripVertical, Pin } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@aicortex/ui/lib/utils";
import type { DevSession } from "@aicortex/core/dev-studio";
import { useT } from "../../i18n";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function DevSessionRow({
  session,
  projectId,
  isActive,
  isPinned,
  onSelect,
  onTogglePin,
  onArchive,
}: {
  session: DevSession;
  projectId: string;
  isActive: boolean;
  isPinned: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
  onArchive: () => void;
}) {
  const { t } = useT("dev-studio");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: session.id,
    data: { projectId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/session flex items-center gap-0.5 rounded-md pr-1 text-sm transition-colors hover:bg-accent",
        isActive && "bg-accent font-medium text-foreground",
        isDragging && "opacity-50",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1 text-muted-foreground/50 opacity-0 transition-opacity hover:text-muted-foreground group-hover/session:opacity-100 active:cursor-grabbing"
        aria-label={t(($) => $.shell.session_drag_aria)}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-0.5 text-left"
      >
        <span className="min-w-0 flex-1 truncate">
          {session.title || t(($) => $.shell.untitled_session)}
        </span>
        {session.has_unread && (
          <span className="size-1.5 shrink-0 rounded-full bg-brand group-hover/session:hidden" />
        )}
        <span className="shrink-0 text-[10px] text-muted-foreground group-hover/session:hidden">
          {formatRelativeTime(session.updated_at)}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/session:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          className={cn(
            "rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground",
            isPinned && "text-foreground",
          )}
          aria-label={
            isPinned
              ? t(($) => $.shell.session_unpin_aria)
              : t(($) => $.shell.session_pin_aria)
          }
          title={
            isPinned
              ? t(($) => $.shell.session_unpin_aria)
              : t(($) => $.shell.session_pin_aria)
          }
        >
          <Pin className={cn("size-3.5", isPinned && "fill-current")} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onArchive();
          }}
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={t(($) => $.shell.session_archive_aria)}
          title={t(($) => $.shell.session_archive_aria)}
        >
          <Archive className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
