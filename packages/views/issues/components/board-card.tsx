"use client";

import { useCallback, memo } from "react";
import { AppLink } from "../../navigation";
import { useSortable, defaultAnimateLayoutChanges } from "@dnd-kit/sortable";
import type { AnimateLayoutChanges } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import type { Issue, UpdateIssueRequest } from "@aicortex/core/types";
import { CalendarDays } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ActorAvatar } from "../../common/actor-avatar";
import { useUpdateIssue } from "@aicortex/core/issues/mutations";
import { useWorkspacePaths } from "@aicortex/core/paths";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { projectListOptions } from "@aicortex/core/projects/queries";
import { ProjectIcon } from "../../projects/components/project-icon";
import { PriorityIcon } from "./priority-icon";
import { PriorityPicker, AssigneePicker, DueDatePicker } from "./pickers";
import { PRIORITY_CONFIG } from "@aicortex/core/issues/config";
import { useViewStore } from "@aicortex/core/issues/stores/view-store-context";
import { ProgressRing } from "./progress-ring";
import type { ChildProgress } from "./list-row";
import { IssueActionsContextMenu } from "../actions";
import { LabelChip } from "../../labels/label-chip";
import { useT } from "../../i18n";

// Status-based card tinting — gives each status a subtle distinct look
const STATUS_CARD_STYLE: Record<string, string> = {
  backlog: "bg-card opacity-70",
  todo: "bg-card",
  in_progress: "bg-card border-l-2 border-l-warning",
  in_review: "bg-card border-l-2 border-l-success",
  done: "bg-card/60 opacity-75 border-l-2 border-l-info",
  blocked: "bg-card border-l-2 border-l-destructive",
  cancelled: "bg-card opacity-50",
};

const CHANGE_LABEL: Record<string, { label: string; color: string }> = {
  status_changed: { label: "Status", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  priority_changed: { label: "Priority", color: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  assignee_changed: { label: "Assignee", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  title_changed: { label: "Title", color: "bg-green-500/10 text-green-600 dark:text-green-400" },
  due_date_changed: { label: "Due date", color: "bg-pink-500/10 text-pink-600 dark:text-pink-400" },
  description_updated: { label: "Description", color: "bg-teal-500/10 text-teal-600 dark:text-teal-400" },
};

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function descriptionPreview(markdown: string): string {
  return markdown
    .replace(/!file\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]+/g, "")
    .replace(/^[\s>#]+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stops event from bubbling to Link/drag handlers */
function PickerWrapper({ children }: { children: React.ReactNode }) {
  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  return (
    <div onClick={stop} onMouseDown={stop} onPointerDown={stop}>
      {children}
    </div>
  );
}

export const BoardCardContent = memo(function BoardCardContent({
  issue,
  editable = false,
  childProgress,
  changeActions,
}: {
  issue: Issue;
  editable?: boolean;
  childProgress?: ChildProgress;
  changeActions?: string[];
}) {
  const { t } = useT("issues");
  const storeProperties = useViewStore((s) => s.cardProperties);
  const priorityCfg = PRIORITY_CONFIG[issue.priority];
  const wsId = useWorkspaceId();
  const { data: projects = [] } = useQuery({
    ...projectListOptions(wsId),
    enabled: storeProperties.project && !!issue.project_id,
  });
  const project = issue.project_id ? projects.find((p) => p.id === issue.project_id) : undefined;
  const labels = issue.labels ?? [];

  const updateIssueMutation = useUpdateIssue();
  const handleUpdate = useCallback(
    (updates: Partial<UpdateIssueRequest>) => {
      updateIssueMutation.mutate(
        { id: issue.id, ...updates },
        { onError: () => toast.error(t(($) => $.card.update_failed)) },
      );
    },
    [issue.id, updateIssueMutation, t],
  );

  const showPriority = storeProperties.priority;
  const showDescription = storeProperties.description && issue.description;
  const showAssignee = storeProperties.assignee && issue.assignee_type && issue.assignee_id;
  const showDueDate = storeProperties.dueDate && issue.due_date;
  const showProject = storeProperties.project && project;
  const showChildProgress = storeProperties.childProgress && childProgress;
  const showLabels = storeProperties.labels && labels.length > 0;

  const statusCardStyle = STATUS_CARD_STYLE[issue.status] ?? "";

  return (
    <div className={`rounded-lg border-[0.5px] border-border py-3 px-2.5 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] transition-all duration-200 group-hover/card:-translate-y-0.5 group-hover/card:shadow-[0_8px_16px_-4px_rgba(0,0,0,0.12),0_2px_4px_0_rgba(0,0,0,0.08)] group-hover/card:border-accent group-hover/card:bg-accent group-data-[popup-open]/card:border-accent group-data-[popup-open]/card:bg-accent ${statusCardStyle}`}>
      {/* Row 1: Identifier */}
      <p className="font-mono text-xs text-muted-foreground">{issue.identifier}</p>

      {/* Row 2: Title */}
      <p className="mt-1 text-sm font-medium leading-snug line-clamp-2">
        {issue.title}
      </p>

      {/* Change indicators for the Recent page */}
      {changeActions && changeActions.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1 flex-wrap">
          {changeActions.slice(0, 3).map((action) => {
            const cfg = CHANGE_LABEL[action];
            if (!cfg) return null;
            return (
              <span
                key={action}
                className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${cfg.color}`}
              >
                {cfg.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Sub-issue progress + project + labels */}
      {(showChildProgress || showProject || showLabels) && (
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          {showChildProgress && (
            <div className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-1.5 py-0.5">
              <ProgressRing done={childProgress!.done} total={childProgress!.total} size={14} />
              <span className="text-[11px] text-muted-foreground tabular-nums font-medium">
                {childProgress!.done}/{childProgress!.total}
              </span>
            </div>
          )}
          {showProject && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground max-w-[160px]">
              <ProjectIcon project={project} size="sm" />
              <span className="truncate">{project!.title}</span>
            </span>
          )}
          {showLabels && labels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </div>
      )}

      {showDescription && (() => {
        const preview = descriptionPreview(issue.description!);
        if (!preview) return null;
        return (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
            {preview}
          </p>
        );
      })()}

      {/* Row 3: Assignee, priority badge, due date */}
      {(showAssignee || showPriority || showDueDate) && (
        <div className="mt-3 flex items-center gap-2">
          {showAssignee &&
            (editable ? (
              <PickerWrapper>
                <AssigneePicker
                  assigneeType={issue.assignee_type}
                  assigneeId={issue.assignee_id}
                  onUpdate={handleUpdate}
                  trigger={
                    <ActorAvatar
                      actorType={issue.assignee_type!}
                      actorId={issue.assignee_id!}
                      size={22}
                      enableHoverCard
                    />
                  }
                />
              </PickerWrapper>
            ) : (
              <ActorAvatar
                actorType={issue.assignee_type!}
                actorId={issue.assignee_id!}
                size={22}
                enableHoverCard
              />
            ))}
          {showPriority &&
            (editable ? (
              <PickerWrapper>
                <PriorityPicker
                  priority={issue.priority}
                  onUpdate={handleUpdate}
                  trigger={
                    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${priorityCfg.badgeBg} ${priorityCfg.badgeText}`}>
                      <PriorityIcon priority={issue.priority} className="h-3 w-3" inheritColor />
                      {t(($) => $.priority[issue.priority])}
                    </span>
                  }
                />
              </PickerWrapper>
            ) : (
              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${priorityCfg.badgeBg} ${priorityCfg.badgeText}`}>
                <PriorityIcon priority={issue.priority} className="h-3 w-3" inheritColor />
                {priorityCfg.label}
              </span>
            ))}
          {showDueDate && (
            <div className="ml-auto">
              {editable ? (
                <PickerWrapper>
                  <DueDatePicker
                    dueDate={issue.due_date}
                    onUpdate={handleUpdate}
                    trigger={
                      <span
                        className={`flex items-center gap-1 text-xs ${
                          new Date(issue.due_date!) < new Date()
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        <CalendarDays className="size-3" />
                        {formatDate(issue.due_date!)}
                      </span>
                    }
                  />
                </PickerWrapper>
              ) : (
                <span
                  className={`flex items-center gap-1 text-xs ${
                    new Date(issue.due_date!) < new Date()
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  <CalendarDays className="size-3" />
                  {formatDate(issue.due_date!)}
                </span>
              )}
            </div>
          )}
        </div>
      )}
      {/* Agent working indicator — indeterminate progress bar */}
      {issue.status === "in_progress" && issue.assignee_type === "agent" && (
        <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-nav-progress-sweep rounded-full bg-brand" />
        </div>
      )}
    </div>
  );
});

export const animateLayoutChanges: AnimateLayoutChanges = (args) => {
  const { isSorting, wasDragging } = args;
  if (isSorting || wasDragging) return false;
  return defaultAnimateLayoutChanges(args);
};

export const DraggableBoardCard = memo(function DraggableBoardCard({ issue, childProgress, changeActions }: { issue: Issue; childProgress?: ChildProgress; changeActions?: string[] }) {
  const p = useWorkspacePaths();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: issue.id,
    data: { status: issue.status },
    animateLayoutChanges,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <IssueActionsContextMenu issue={issue}>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`group/card ${isDragging ? "opacity-30" : ""}`}
      >
        <AppLink
          href={p.issueDetail(issue.id)}
          className={`group block transition-colors ${isDragging ? "pointer-events-none" : ""}`}
        >
          <BoardCardContent issue={issue} editable childProgress={childProgress} changeActions={changeActions} />
        </AppLink>
      </div>
    </IssueActionsContextMenu>
  );
});
