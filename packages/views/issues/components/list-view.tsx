"use client";

import { useMemo, useState, useCallback } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { Accordion } from "@base-ui/react/accordion";
import { Tooltip, TooltipTrigger, TooltipContent } from "@aicortex/ui/components/ui/tooltip";
import { Button } from "@aicortex/ui/components/ui/button";
import type { Issue, IssueStatus } from "@aicortex/core/types";
import { useLoadMoreByStatus } from "@aicortex/core/issues/mutations";
import type { MyIssuesFilter } from "@aicortex/core/issues/queries";
import { useModalStore } from "@aicortex/core/modals";
import { useViewStore } from "@aicortex/core/issues/stores/view-store-context";
import { useIssueSelectionStore } from "@aicortex/core/issues/stores/selection-store";
import { sortIssues } from "../utils/sort";
import { StatusHeading } from "./status-heading";
import { ListRow, type ChildProgress } from "./list-row";
import { InfiniteScrollSentinel } from "./infinite-scroll-sentinel";
import { useT } from "../../i18n";

const EMPTY_PROGRESS_MAP = new Map<string, ChildProgress>();

const STATUS_BORDER_COLOR: Record<string, string> = {
  backlog: "border-l-muted-foreground/40",
  todo: "border-l-muted-foreground/40",
  in_progress: "border-l-warning",
  in_review: "border-l-success",
  done: "border-l-info",
  blocked: "border-l-destructive",
  cancelled: "border-l-muted-foreground/40",
};

interface TreeDisplayItem {
  issue: Issue;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  collapsedCount: number;
  childProgress?: ChildProgress;
  isLastChild: boolean;
}

function buildTreeItems(
  issues: Issue[],
  childProgressMap: Map<string, ChildProgress>,
  collapsedParents: Set<string>,
): { items: TreeDisplayItem[]; childProgressByIssue: Map<string, ChildProgress> } {
  // Build parent → children from the issue list
  const childrenByParent = new Map<string, Issue[]>();
  for (const issue of issues) {
    if (issue.parent_issue_id) {
      const kids = childrenByParent.get(issue.parent_issue_id) ?? [];
      kids.push(issue);
      childrenByParent.set(issue.parent_issue_id, kids);
    }
  }

  const parentIds = new Set(childrenByParent.keys());
  const childIds = new Set<string>();
  for (const kids of childrenByParent.values()) {
    for (const kid of kids) childIds.add(kid.id);
  }

  const items: TreeDisplayItem[] = [];
  const childProgressByIssue = new Map<string, ChildProgress>();

  for (const issue of issues) {
    const progress = childProgressMap.get(issue.id);
    if (progress) childProgressByIssue.set(issue.id, progress);

    if (parentIds.has(issue.id)) {
      // Parent issue
      const children = childrenByParent.get(issue.id)!;
      const collapsed = collapsedParents.has(issue.id);
      items.push({
        issue,
        depth: 0,
        hasChildren: true,
        collapsed,
        collapsedCount: children.length,
        isLastChild: false,
        childProgress: progress,
      });
      if (!collapsed) {
        for (let idx = 0; idx < children.length; idx++) {
          const child = children[idx]!;
          const childProg = childProgressMap.get(child.id);
          if (childProg) childProgressByIssue.set(child.id, childProg);
          items.push({
            issue: child,
            depth: 1,
            hasChildren: false,
            collapsed: false,
            collapsedCount: 0,
            isLastChild: idx === children.length - 1,
            childProgress: childProg,
          });
        }
      }
    } else if (!childIds.has(issue.id)) {
      // Regular issue (not a parent, not a child)
      items.push({
        issue,
        depth: 0,
        hasChildren: false,
        collapsed: false,
        collapsedCount: 0,
        isLastChild: false,
        childProgress: progress,
      });
    }
    // Children of parents are already handled above
  }

  return { items, childProgressByIssue };
}

export function ListView({
  issues,
  visibleStatuses,
  childProgressMap = EMPTY_PROGRESS_MAP,
  changeActionsMap,
  myIssuesScope,
  myIssuesFilter,
  projectId,
}: {
  issues: Issue[];
  visibleStatuses: IssueStatus[];
  childProgressMap?: Map<string, ChildProgress>;
  changeActionsMap?: Map<string, string[]>;
  /** When set, per-status load-more targets the scoped cache instead of the workspace one. */
  myIssuesScope?: string;
  myIssuesFilter?: MyIssuesFilter;
  /** When set, the per-section "+" pre-fills the project on the create form. */
  projectId?: string;
}) {
  const sortBy = useViewStore((s) => s.sortBy);
  const sortDirection = useViewStore((s) => s.sortDirection);
  const listCollapsedStatuses = useViewStore(
    (s) => s.listCollapsedStatuses
  );
  const toggleListCollapsed = useViewStore(
    (s) => s.toggleListCollapsed
  );

  const issuesByStatus = useMemo(() => {
    const map = new Map<IssueStatus, Issue[]>();
    for (const status of visibleStatuses) {
      const filtered = issues.filter((i) => i.status === status);
      map.set(status, sortIssues(filtered, sortBy, sortDirection));
    }
    return map;
  }, [issues, visibleStatuses, sortBy, sortDirection]);

  const expandedStatuses = useMemo(
    () =>
      visibleStatuses.filter(
        (s) => !listCollapsedStatuses.includes(s)
      ),
    [visibleStatuses, listCollapsedStatuses]
  );

  const myIssuesOpts = myIssuesScope
    ? { scope: myIssuesScope, filter: myIssuesFilter ?? {} }
    : undefined;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-2">
      <Accordion.Root
        multiple
        className="space-y-1"
        value={expandedStatuses}
        onValueChange={(value: string[]) => {
          for (const status of visibleStatuses) {
            const wasExpanded = expandedStatuses.includes(status);
            const isExpanded = value.includes(status);
            if (wasExpanded !== isExpanded) {
              toggleListCollapsed(status as IssueStatus);
            }
          }
        }}
      >
        {visibleStatuses.map((status) => (
          <StatusAccordionItem
            key={status}
            status={status}
            issues={issuesByStatus.get(status) ?? []}
            childProgressMap={childProgressMap}
            changeActionsMap={changeActionsMap}
            myIssuesOpts={myIssuesOpts}
            projectId={projectId}
          />
        ))}
      </Accordion.Root>
    </div>
  );
}

function StatusAccordionItem({
  status,
  issues,
  childProgressMap,
  changeActionsMap,
  myIssuesOpts,
  projectId,
}: {
  status: IssueStatus;
  issues: Issue[];
  childProgressMap: Map<string, ChildProgress>;
  changeActionsMap?: Map<string, string[]>;
  myIssuesOpts?: { scope: string; filter: MyIssuesFilter };
  projectId?: string;
}) {
  const { t } = useT("issues");
  const selectedIds = useIssueSelectionStore((s) => s.selectedIds);
  const select = useIssueSelectionStore((s) => s.select);
  const deselect = useIssueSelectionStore((s) => s.deselect);
  const { loadMore, hasMore, isLoading, total } = useLoadMoreByStatus(
    status,
    myIssuesOpts,
  );

  // Tree collapse state for parent issues in the list view
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(() => new Set());
  const toggleTreeCollapse = useCallback((parentId: string) => {
    setCollapsedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }, []);

  const { items } = useMemo(
    () => buildTreeItems(issues, childProgressMap, collapsedParents),
    [issues, childProgressMap, collapsedParents],
  );

  const issueIds = items.map((i) => i.issue.id);
  const selectedCount = issueIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = issueIds.length > 0 && selectedCount === issueIds.length;
  const someSelected = selectedCount > 0;

  return (
    <Accordion.Item value={status}>
      <Accordion.Header className={`group/header flex h-10 items-center rounded-lg border-l-3 bg-muted/20 transition-colors hover:bg-accent/30 ${STATUS_BORDER_COLOR[status] ?? "border-l-muted-foreground/40"}`}>
        <div className="pl-3 flex items-center">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected && !allSelected;
            }}
            onChange={() => {
              if (allSelected) {
                deselect(issueIds);
              } else {
                select(issueIds);
              }
            }}
            className="cursor-pointer accent-primary"
          />
        </div>
        <Accordion.Trigger className="group/trigger flex flex-1 items-center gap-2 px-2 h-full text-left outline-none">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-aria-expanded/trigger:rotate-90" />
          <StatusHeading status={status} count={total} />
        </Accordion.Trigger>
        <div className="pr-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full text-muted-foreground opacity-0 group-hover/header:opacity-100 transition-opacity"
                  onClick={() =>
                    useModalStore
                      .getState()
                      .open("create-issue", { status, ...(projectId ? { project_id: projectId } : {}) })
                  }
                />
              }
            >
              <Plus className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{t(($) => $.list.add_issue_tooltip)}</TooltipContent>
          </Tooltip>
        </div>
      </Accordion.Header>
      <Accordion.Panel className="pt-1">
        {items.length > 0 ? (
          <>
            {items.map((item, i) => (
              <div key={item.issue.id} className="animate-list-item" style={{ "--stagger-index": i } as React.CSSProperties}>
                <ListRow
                  issue={item.issue}
                  childProgress={item.childProgress}
                  depth={item.depth}
                  hasChildren={item.hasChildren}
                  collapsed={item.collapsed}
                  isLastChild={item.isLastChild}
                  collapsedCount={item.collapsedCount}
                  changeActions={changeActionsMap?.get(item.issue.id)}
                  onToggleCollapse={
                    item.hasChildren
                      ? () => toggleTreeCollapse(item.issue.id)
                      : undefined
                  }
                />
              </div>
            ))}
            {hasMore && (
              <InfiniteScrollSentinel onVisible={loadMore} loading={isLoading} />
            )}
          </>
        ) : (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {t(($) => $.list.empty_status)}
          </p>
        )}
      </Accordion.Panel>
    </Accordion.Item>
  );
}
