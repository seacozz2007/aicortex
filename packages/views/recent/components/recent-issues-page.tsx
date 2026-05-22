"use client";

import { useMemo } from "react";
import { ChevronRight, Clock } from "lucide-react";
import { Skeleton } from "@aicortex/ui/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useCurrentWorkspace } from "@aicortex/core/paths";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { issueListOptions } from "@aicortex/core/issues/queries";
import { PageHeader } from "../../layout/page-header";
import { WorkspaceAvatar } from "../../workspace/workspace-avatar";
import { ListView } from "../../issues/components/list-view";
import { BoardView } from "../../issues/components/board-view";
import { useIssueViewStore, useClearFiltersOnWorkspaceChange } from "@aicortex/core/issues/stores/view-store";
import { ViewStoreProvider } from "@aicortex/core/issues/stores/view-store-context";
import { BOARD_STATUSES } from "@aicortex/core/issues/config";
import { useIssueSelectionStore } from "@aicortex/core/issues/stores/selection-store";
import { childIssueProgressOptions } from "@aicortex/core/issues/queries";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function RecentIssuesPage() {
  const workspace = useCurrentWorkspace();
  const wsId = useWorkspaceId();
  const viewMode = useIssueViewStore((s) => s.viewMode);

  useClearFiltersOnWorkspaceChange(useIssueViewStore, wsId);

  useIssueSelectionStore.getState().clear();

  const { data: allIssues = [], isLoading } = useQuery({
    ...issueListOptions(wsId),
  });

  const recentIssues = useMemo(() => {
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    return allIssues
      .filter((i) => new Date(i.updated_at).getTime() > cutoff)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [allIssues]);

  const { data: childProgressMap = new Map() } = useQuery(childIssueProgressOptions(wsId));

  if (isLoading) {
    return (
      <div className="flex flex-1 min-h-0 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex flex-1 min-h-0 gap-4 overflow-x-auto p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <PageHeader className="gap-1.5">
        <WorkspaceAvatar name={workspace?.name ?? "W"} size="sm" />
        <span className="text-sm text-muted-foreground">
          {workspace?.name ?? "Workspace"}
        </span>
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
        <span className="text-sm font-medium">Recent</span>
      </PageHeader>

      <div className="flex items-center gap-2 px-4 h-10 border-b text-xs text-muted-foreground">
        <Clock className="size-3" />
        <span>Issues updated in the last 7 days</span>
      </div>

      <ViewStoreProvider store={useIssueViewStore}>
        {recentIssues.length === 0 ? (
          <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Clock className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm">No recently updated issues</p>
            <p className="text-xs">Issues updated in the last 7 days will appear here.</p>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            {viewMode === "board" ? (
              <BoardView
                issues={recentIssues}
                visibleStatuses={BOARD_STATUSES}
                hiddenStatuses={[]}
                onMoveIssue={() => {}}
                childProgressMap={childProgressMap}
              />
            ) : (
              <ListView
                issues={recentIssues}
                visibleStatuses={BOARD_STATUSES}
                childProgressMap={childProgressMap}
              />
            )}
          </div>
        )}
      </ViewStoreProvider>
    </div>
  );
}
