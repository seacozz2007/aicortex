"use client";

import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { ChevronRight, ListTodo } from "lucide-react";
import type { UpdateIssueRequest } from "@aicortex/core/types";
import { Skeleton } from "@aicortex/ui/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useIssueViewStore, useClearFiltersOnWorkspaceChange } from "@aicortex/core/issues/stores/view-store";
import type { TimeRange } from "@aicortex/core/issues/stores/view-store";
import { useIssuesScopeStore } from "@aicortex/core/issues/stores/issues-scope-store";
import { ViewStoreProvider } from "@aicortex/core/issues/stores/view-store-context";
import { filterIssues } from "../utils/filter";
import { BOARD_STATUSES } from "@aicortex/core/issues/config";
import { useCurrentWorkspace } from "@aicortex/core/paths";
import { WorkspaceAvatar } from "../../workspace/workspace-avatar";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { issueAssigneeGroupsOptions, issueListOptions, childIssueProgressOptions, type AssigneeGroupedIssuesFilter } from "@aicortex/core/issues/queries";
import { useUpdateIssue } from "@aicortex/core/issues/mutations";
import { useIssueSelectionStore } from "@aicortex/core/issues/stores/selection-store";
import { PageHeader } from "../../layout/page-header";
import { IssuesHeader } from "./issues-header";
import { BoardView } from "./board-view";
import { ListView } from "./list-view";
import { BatchActionToolbar } from "./batch-action-toolbar";
import { useT } from "../../i18n";

export function IssuesPage() {
  const { t } = useT("issues");
  const wsId = useWorkspaceId();

  const workspace = useCurrentWorkspace();
  const scope = useIssuesScopeStore((s) => s.scope);
  const viewMode = useIssueViewStore((s) => s.viewMode);
  const grouping = useIssueViewStore((s) => s.grouping);
  const statusFilters = useIssueViewStore((s) => s.statusFilters);
  const priorityFilters = useIssueViewStore((s) => s.priorityFilters);
  const assigneeFilters = useIssueViewStore((s) => s.assigneeFilters);
  const includeNoAssignee = useIssueViewStore((s) => s.includeNoAssignee);
  const creatorFilters = useIssueViewStore((s) => s.creatorFilters);
  const projectFilters = useIssueViewStore((s) => s.projectFilters);
  const includeNoProject = useIssueViewStore((s) => s.includeNoProject);
  const labelFilters = useIssueViewStore((s) => s.labelFilters);
  const timeRange = useIssueViewStore((s) => s.timeRange);
  const timeSortBy = useIssueViewStore((s) => s.timeSortBy);
  const usesAssigneeBoard = viewMode === "board" && grouping === "assignee";

  const assigneeGroupFilter = useMemo<AssigneeGroupedIssuesFilter>(() => {
    const filter: AssigneeGroupedIssuesFilter = {
      statuses: statusFilters.length > 0 ? statusFilters : [...BOARD_STATUSES],
      priorities: priorityFilters,
      assignee_filters: assigneeFilters,
      include_no_assignee: includeNoAssignee,
      creator_filters: creatorFilters,
      project_ids: projectFilters,
      include_no_project: includeNoProject,
      label_ids: labelFilters,
    };
    if (scope === "members") filter.assignee_types = ["member"];
    if (scope === "agents") filter.assignee_types = ["agent", "squad"];
    return filter;
  }, [assigneeFilters, creatorFilters, includeNoAssignee, includeNoProject, labelFilters, priorityFilters, projectFilters, scope, statusFilters]);

  const assigneeGroupsOptions = issueAssigneeGroupsOptions(wsId, assigneeGroupFilter);
  const statusIssuesQuery = useQuery({
    ...issueListOptions(wsId),
    enabled: !usesAssigneeBoard,
  });
  const assigneeGroupsQuery = useQuery({
    ...assigneeGroupsOptions,
    enabled: usesAssigneeBoard,
  });
  const allIssues = useMemo(
    () => statusIssuesQuery.data ?? [],
    [statusIssuesQuery.data],
  );
  const assigneeIssues = useMemo(
    () => assigneeGroupsQuery.data?.groups.flatMap((group) => group.issues) ?? [],
    [assigneeGroupsQuery.data],
  );
  const loading = usesAssigneeBoard
    ? assigneeGroupsQuery.isLoading
    : statusIssuesQuery.isLoading;

  // Clear filter state when switching between workspaces (URL-driven).
  useClearFiltersOnWorkspaceChange(useIssueViewStore, wsId);

  useEffect(() => {
    useIssueSelectionStore.getState().clear();
  }, [viewMode, scope]);

  // Scope pre-filter: narrow by assignee type
  const scopedIssues = useMemo(() => {
    if (scope === "members")
      return allIssues.filter((i) => i.assignee_type === "member");
    if (scope === "agents")
      return allIssues.filter((i) => i.assignee_type === "agent" || i.assignee_type === "squad");
    return allIssues;
  }, [allIssues, scope]);

  const headerIssues = usesAssigneeBoard ? assigneeIssues : scopedIssues;

  const issues = useMemo(
    () => filterIssues(scopedIssues, { statusFilters, priorityFilters, assigneeFilters, includeNoAssignee, creatorFilters, projectFilters, includeNoProject, labelFilters }),
    [scopedIssues, statusFilters, priorityFilters, assigneeFilters, includeNoAssignee, creatorFilters, projectFilters, includeNoProject, labelFilters],
  );

  // Time range filter (client-side)
  const TIME_RANGE_MS: Record<TimeRange, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "3d": 3 * 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "all": Infinity,
  };
  const timeFilteredIssues = useMemo(() => {
    if (timeRange === "all") return issues;
    const cutoff = Date.now() - TIME_RANGE_MS[timeRange];
    return issues.filter((i) => new Date(i.updated_at).getTime() > cutoff);
  }, [issues, timeRange]);

  // Apply timeSortBy override when the filter-bar sort is active
  const displayIssues = useMemo(() => {
    // timeSortBy updated_at (default) — keep existing order (updated_at DESC when
    // time-filtering, otherwise whatever the display sort says).
    if (timeSortBy === "updated_at") return timeFilteredIssues;
    // For non-default time sorts, sort here to override display sort.
    const sorted = [...timeFilteredIssues].sort((a, b) => {
      if (timeSortBy === "created_at") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (timeSortBy === "priority") {
        const PRIORITY_RANK: Record<string, number> = {
          urgent: 0, high: 1, medium: 2, low: 3, none: 4,
        };
        return (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
      }
      return 0;
    });
    return sorted;
  }, [timeFilteredIssues, timeSortBy]);

  // Fetch sub-issue progress from the backend so counts are accurate
  // regardless of client-side pagination or filtering of done issues.
  const { data: childProgressMap = new Map() } = useQuery(childIssueProgressOptions(wsId));

  const visibleStatuses = useMemo(() => {
    if (statusFilters.length > 0)
      return BOARD_STATUSES.filter((s) => statusFilters.includes(s));
    return BOARD_STATUSES;
  }, [statusFilters]);

  const hiddenStatuses = useMemo(() => {
    return BOARD_STATUSES.filter((s) => !visibleStatuses.includes(s));
  }, [visibleStatuses]);

  const updateIssueMutation = useUpdateIssue();
  const handleMoveIssue = useCallback(
    (issueId: string, updates: Pick<UpdateIssueRequest, "status" | "assignee_type" | "assignee_id" | "position">) => {
      updateIssueMutation.mutate(
        { id: issueId, ...updates },
        { onError: () => toast.error(t(($) => $.page.move_failed)) },
      );
    },
    [updateIssueMutation, t],
  );

  if (loading) {
    return (
      <div className="flex flex-1 min-h-0 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex h-12 shrink-0 items-center justify-between px-4">
          <div className="flex items-center gap-1">
            <Skeleton className="h-8 w-14 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-16 rounded-md" />
          </div>
          <div className="flex items-center gap-1">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
        {viewMode === "list" ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 gap-4 overflow-x-auto p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex min-w-52 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Header 1: Workspace breadcrumb */}
      <PageHeader className="gap-1.5">
        <WorkspaceAvatar name={workspace?.name ?? "W"} size="sm" />
        <span className="text-sm text-muted-foreground">
          {workspace?.name ?? t(($) => $.page.breadcrumb_workspace_fallback)}
        </span>
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
        <span className="text-sm font-medium">{t(($) => $.page.breadcrumb_title)}</span>
      </PageHeader>

      <ViewStoreProvider store={useIssueViewStore}>
        {/* Header 2: Scope tabs + filters */}
        <IssuesHeader scopedIssues={headerIssues} />

        {/* Content: scrollable */}
        {headerIssues.length === 0 ? (
          <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-2 text-muted-foreground">
            <ListTodo className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm">{t(($) => $.page.empty_title)}</p>
            <p className="text-xs">{t(($) => $.page.empty_hint)}</p>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            {viewMode === "board" ? (
              <BoardView
                issues={usesAssigneeBoard ? assigneeIssues : displayIssues}
                assigneeGroups={usesAssigneeBoard ? assigneeGroupsQuery.data?.groups : undefined}
                assigneeGroupQueryKey={usesAssigneeBoard ? assigneeGroupsOptions.queryKey : undefined}
                assigneeGroupFilter={usesAssigneeBoard ? assigneeGroupFilter : undefined}
                visibleStatuses={visibleStatuses}
                hiddenStatuses={hiddenStatuses}
                onMoveIssue={handleMoveIssue}
                childProgressMap={childProgressMap}
              />
            ) : (
              <ListView issues={displayIssues} visibleStatuses={visibleStatuses} childProgressMap={childProgressMap} />
            )}
          </div>
        )}
        {viewMode === "list" && <BatchActionToolbar />}
      </ViewStoreProvider>
    </div>
  );
}
