"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useIssueViewStore, type TimeRange, type TimeSortBy } from "@aicortex/core/issues/stores/view-store";

/**
 * Syncs the issues view store's timeRange / timeSortBy state with URL search
 * params (`since` and `sort`). On mount, any present search params override
 * the persisted store values. On store changes, the URL is updated via
 * shallow replace so the state survives refresh / share.
 */
export function IssuesUrlSync() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const applied = useRef(false);

  // On mount: read URL params → hydrate store (only once)
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;

    const since = searchParams.get("since");
    const sort = searchParams.get("sort");

    if (since && ["24h", "3d", "7d", "30d", "all"].includes(since)) {
      useIssueViewStore.getState().setTimeRange(since as TimeRange);
    }
    if (sort && ["updated_at", "created_at", "priority"].includes(sort)) {
      useIssueViewStore.getState().setTimeSortBy(sort as TimeSortBy);
    }
  }, [searchParams]);

  // Subscribe to store changes → update URL
  useEffect(() => {
    const unsub = useIssueViewStore.subscribe((state) => {
      const params = new URLSearchParams();
      if (state.timeRange !== "all") {
        params.set("since", state.timeRange);
      }
      if (state.timeSortBy !== "updated_at") {
        params.set("sort", state.timeSortBy);
      }
      const qs = params.toString();
      const newUrl = qs ? `${pathname}?${qs}` : pathname;
      router.replace(newUrl, { scroll: false });
    });
    return unsub;
  }, [pathname, router]);

  return null;
}
