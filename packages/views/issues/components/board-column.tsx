"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, EyeOff, MoreHorizontal, Plus, UserMinus } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@aicortex/ui/components/ui/tooltip";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Issue, IssueAssigneeType, IssueStatus } from "@aicortex/core/types";
import { Button } from "@aicortex/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@aicortex/ui/components/ui/dropdown-menu";
import { STATUS_CONFIG } from "@aicortex/core/issues/config";
import { useModalStore } from "@aicortex/core/modals";
import { useViewStoreApi } from "@aicortex/core/issues/stores/view-store-context";
import { StatusHeading } from "./status-heading";
import { DraggableBoardCard } from "./board-card";
import type { ChildProgress } from "./list-row";
import { useT } from "../../i18n";
import { ActorAvatar } from "../../common/actor-avatar";
import { AppLink } from "../../navigation";
import { useWorkspacePaths } from "@aicortex/core/paths";

export interface BoardColumnGroup {
  id: string;
  title: string;
  status?: IssueStatus;
  assigneeType?: IssueAssigneeType | null;
  assigneeId?: string | null;
  totalCount?: number;
  createData?: Record<string, unknown>;
}

/**
 * Group column issues into parent banners, children, and regular cards.
 */
function groupColumnIssues(
  issues: Issue[],
  childrenByParent: Map<string, Issue[]>,
): {
  parentIssues: Issue[];
  childrenByParentId: Map<string, Issue[]>;
  childIds: Set<string>;
  regularIssues: Issue[];
} {
  const parentIssues: Issue[] = [];
  const childrenByParentId = new Map<string, Issue[]>();
  const childIds = new Set<string>();

  for (const issue of issues) {
    if (childrenByParent.has(issue.id)) {
      // This is a parent issue — collect children that are in this column
      const kids = childrenByParent.get(issue.id)!.filter((c) => issues.some((i) => i.id === c.id));
      if (kids.length > 0) {
        parentIssues.push(issue);
        childrenByParentId.set(issue.id, kids);
        for (const kid of kids) childIds.add(kid.id);
      }
    }
  }

  const regularIssues = issues.filter((i) => !childrenByParent.has(i.id) && !childIds.has(i.id));

  return { parentIssues, childrenByParentId, childIds, regularIssues };
}

export function BoardColumn({
  group,
  issueIds,
  issueMap,
  childProgressMap,
  changeActionsMap,
  childrenByParent = new Map(),
  totalCount,
  footer,
  projectId,
}: {
  group: BoardColumnGroup;
  issueIds: string[];
  issueMap: Map<string, Issue>;
  childProgressMap?: Map<string, ChildProgress>;
  changeActionsMap?: Map<string, string[]>;
  childrenByParent?: Map<string, Issue[]>;
  totalCount?: number;
  footer?: ReactNode;
  /** When set, the per-column "+" pre-fills the project on the create form. */
  projectId?: string;
}) {
  const status = group.status;
  const cfg = status ? STATUS_CONFIG[status] : null;
  const { setNodeRef, isOver } = useDroppable({ id: group.id });
  const viewStoreApi = useViewStoreApi();
  const { t } = useT("issues");

  // Resolve IDs to Issue objects, preserving parent-provided order
  const resolvedIssues = useMemo(
    () =>
      issueIds.flatMap((id) => {
        const issue = issueMap.get(id);
        return issue ? [issue] : [];
      }),
    [issueIds, issueMap],
  );

  // Group issues by parent-child relationships
  const { parentIssues, childrenByParentId, regularIssues } = useMemo(
    () => groupColumnIssues(resolvedIssues, childrenByParent),
    [resolvedIssues, childrenByParent],
  );

  // All items for SortableContext: parent IDs + regular issue IDs (children are not sortable)
  const sortableIds = useMemo(
    () => [...parentIssues.map((p) => p.id), ...regularIssues.map((i) => i.id)],
    [parentIssues, regularIssues],
  );

  return (
    <div className={`flex w-[280px] shrink-0 flex-col rounded-xl ${cfg?.columnBg ?? "bg-muted/40"} p-2`}>
      <div className="mb-2 flex items-center justify-between px-1.5">
        <BoardGroupHeading group={group} count={totalCount ?? issueIds.length} />

        {/* Right: add + menu */}
        <div className="flex items-center gap-1">
          {status && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" className="rounded-full text-muted-foreground">
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => viewStoreApi.getState().hideStatus(status)}>
                  <EyeOff className="size-3.5" />
                  {t(($) => $.board.hide_column)}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full text-muted-foreground"
                  onClick={() => {
                    const data = {
                      ...(group.createData ?? {}),
                      ...(projectId ? { project_id: projectId } : {}),
                    };
                    useModalStore.getState().open("create-issue", data);
                  }}
                >
                  <Plus className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent>{t(($) => $.board.add_issue_tooltip)}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[200px] flex-1 space-y-2 overflow-y-auto rounded-lg p-1 transition-colors ${
          isOver ? "bg-accent/60" : ""
        }`}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {/* Parent issues as banners */}
          {parentIssues.map((parent) => (
            <BoardBanner
              key={parent.id}
              parent={parent}
              children={childrenByParentId.get(parent.id) ?? []}
              childProgress={childProgressMap?.get(parent.id)}
            />
          ))}
          {/* Regular issues as cards */}
          {regularIssues.map((issue) => (
            <DraggableBoardCard key={issue.id} issue={issue} childProgress={childProgressMap?.get(issue.id)} changeActions={changeActionsMap?.get(issue.id)} />
          ))}
        </SortableContext>
        {issueIds.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {t(($) => $.board.empty_column)}
          </p>
        )}
        {footer}
      </div>
    </div>
  );
}

/** Parent issue banner spanning the full column width */
function BoardBanner({
  parent,
  children,
  childProgress,
}: {
  parent: Issue;
  children: Issue[];
  childProgress?: ChildProgress;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const paths = useWorkspacePaths();
  const done = childProgress?.done ?? children.filter((c) => c.status === "done" || c.status === "cancelled").length;
  const total = childProgress?.total ?? children.length;

  return (
    <div className="rounded-lg border-[0.5px] border-border bg-card shadow-sm overflow-hidden">
      {/* Banner header */}
      <AppLink
        href={paths.issueDetail(parent.id)}
        className="flex items-center gap-2 px-3 py-2.5 hover:bg-accent/40 transition-colors"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setCollapsed((v) => !v);
          }}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? (
            <ChevronRight className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] text-muted-foreground">{parent.identifier}</span>
            <span className="truncate text-sm font-medium">{parent.title}</span>
          </div>
          {total > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums font-medium whitespace-nowrap">
                {done}/{total}
              </span>
            </div>
          )}
        </div>
      </AppLink>

      {/* Children */}
      {!collapsed && children.length > 0 && (
        <div className="border-t border-border/50 px-2 py-1.5 space-y-1">
          {children.map((child) => (
            <BoardSubCard key={child.id} child={child} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Compact sub-card for child issues inside a parent banner */
function BoardSubCard({ child }: { child: Issue }) {
  const paths = useWorkspacePaths();

  return (
    <AppLink
      href={paths.issueDetail(child.id)}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50 transition-colors group/subcard"
    >
      <span className="font-mono text-[10px] text-muted-foreground shrink-0">{child.identifier}</span>
      <span className="truncate flex-1 group-hover/subcard:text-foreground transition-colors">
        {child.title}
      </span>
      {child.assignee_type && child.assignee_id && (
        <ActorAvatar
          actorType={child.assignee_type}
          actorId={child.assignee_id}
          size={16}
        />
      )}
    </AppLink>
  );
}

function BoardGroupHeading({
  group,
  count,
}: {
  group: BoardColumnGroup;
  count: number;
}) {
  if (group.status) {
    return <StatusHeading status={group.status} count={count} />;
  }

  const actorIcon =
    group.assigneeType && group.assigneeId ? (
      <ActorAvatar
        actorType={group.assigneeType}
        actorId={group.assigneeId}
        size={18}
        showStatusDot={group.assigneeType === "agent"}
      />
    ) : (
      <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground">
        <UserMinus className="size-3.5" />
      </span>
    );

  return (
    <div className="flex min-w-0 items-center gap-2">
      {actorIcon}
      <span className="truncate text-sm font-medium" title={group.title}>
        {group.title}
      </span>
      <span className="shrink-0 rounded-full bg-background px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
        {count}
      </span>
    </div>
  );
}
