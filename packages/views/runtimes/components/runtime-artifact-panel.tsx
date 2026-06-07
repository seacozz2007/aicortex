"use client";

import { useMemo, useState } from "react";
import { ChevronRight, FileText, Folder, Loader2 } from "lucide-react";
import { useArtifactBrowseFeature } from "@aicortex/core/config/features";
import {
  useRuntimeArtifactSources,
  useTaskArtifacts,
} from "@aicortex/core/artifacts/queries";
import type { ArtifactEntry } from "@aicortex/core/types";
import { useWorkspaceSlug } from "@aicortex/core/paths";
import { useT } from "../../i18n";

function buildArtifactRawURL(
  taskId: string,
  relPath: string,
  workspaceSlug: string,
): string {
  const params = new URLSearchParams({ workspace_slug: workspaceSlug });
  const trimmed = relPath.replace(/^\/+/, "");
  return `/api/tasks/${taskId}/artifacts/raw/${trimmed}?${params.toString()}`;
}

function isPreviewable(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".html") || lower.endsWith(".htm");
}

export function RuntimeArtifactPanel({ runtimeId }: { runtimeId: string }) {
  const { t } = useT("runtimes");
  const enabled = useArtifactBrowseFeature();
  const workspaceSlug = useWorkspaceSlug();
  const { data: sources = [], isLoading } = useRuntimeArtifactSources(
    runtimeId,
    enabled,
  );
  const [taskId, setTaskId] = useState<string | null>(null);
  const [cwd, setCwd] = useState("");
  const [previewPath, setPreviewPath] = useState<string | null>(null);

  const activeTaskId = taskId ?? sources[0]?.task_id ?? null;
  const { data: listing, isLoading: listingLoading } = useTaskArtifacts(
    activeTaskId,
    cwd,
    enabled && !!activeTaskId,
  );

  const breadcrumbs = useMemo(() => {
    if (!cwd) return [];
    return cwd.split("/").filter(Boolean);
  }, [cwd]);

  if (!enabled) {
    return null;
  }

  const previewURL =
    activeTaskId && previewPath && workspaceSlug && isPreviewable(previewPath)
      ? buildArtifactRawURL(activeTaskId, previewPath, workspaceSlug)
      : null;

  const navigateTo = (path: string) => {
    setCwd(path);
    setPreviewPath(null);
  };

  const openEntry = (entry: ArtifactEntry) => {
    if (entry.is_dir) {
      navigateTo(entry.path);
      return;
    }
    if (isPreviewable(entry.path)) {
      setPreviewPath(entry.path);
    }
  };

  return (
    <div className="rounded-lg border">
      <div className="border-b px-4 py-2.5">
        <span className="text-xs font-semibold">{t(($) => $.artifacts.title)}</span>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(($) => $.artifacts.hint)}
        </p>
      </div>

      <div className="space-y-3 p-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t(($) => $.artifacts.loading_sources)}
          </div>
        ) : sources.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t(($) => $.artifacts.empty_sources)}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sources.map((source) => (
              <button
                key={source.task_id}
                type="button"
                onClick={() => {
                  setTaskId(source.task_id);
                  setCwd("");
                  setPreviewPath(null);
                }}
                className={`rounded-md border px-2.5 py-1 text-left text-xs transition-colors ${
                  activeTaskId === source.task_id
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50"
                }`}
              >
                <div className="font-medium">{source.label}</div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {source.task_id.slice(0, 8)}
                </div>
              </button>
            ))}
          </div>
        )}

        {activeTaskId && (
          <div className="rounded-md border">
            <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2 text-[11px] text-muted-foreground">
              <button
                type="button"
                className="hover:text-foreground"
                onClick={() => navigateTo("")}
              >
                /
              </button>
              {breadcrumbs.map((part, index) => {
                const path = breadcrumbs.slice(0, index + 1).join("/");
                return (
                  <span key={path} className="inline-flex items-center gap-1">
                    <ChevronRight className="h-3 w-3" />
                    <button
                      type="button"
                      className="hover:text-foreground"
                      onClick={() => navigateTo(path)}
                    >
                      {part}
                    </button>
                  </span>
                );
              })}
            </div>

            {listingLoading ? (
              <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t(($) => $.artifacts.loading_files)}
              </div>
            ) : (
              <div className="max-h-48 overflow-auto">
                {(listing?.entries ?? []).map((entry) => (
                  <button
                    key={entry.path}
                    type="button"
                    onClick={() => openEntry(entry)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/50"
                  >
                    {entry.is_dir ? (
                      <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    {!entry.is_dir && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {entry.size}
                      </span>
                    )}
                  </button>
                ))}
                {(listing?.entries?.length ?? 0) === 0 && (
                  <p className="px-3 py-4 text-xs text-muted-foreground">
                    {t(($) => $.artifacts.empty_dir)}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {previewURL && (
          <div className="overflow-hidden rounded-md border bg-muted/20">
            <iframe
              title={t(($) => $.artifacts.preview_frame_title)}
              src={previewURL}
              className="h-72 w-full bg-background"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
        )}
      </div>
    </div>
  );
}
