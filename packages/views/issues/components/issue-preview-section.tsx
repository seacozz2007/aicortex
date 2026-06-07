"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ExternalLink, FileText, Loader2 } from "lucide-react";
import { useIssuePreviewFeature } from "@aicortex/core/config/features";
import { issueKeys } from "@aicortex/core/issues/queries";
import { api } from "@aicortex/core/api";
import type { IssueArtifact } from "@aicortex/core/types";
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

interface IssuePreviewSectionProps {
  issueId: string;
}

export function IssuePreviewSection({ issueId }: IssuePreviewSectionProps) {
  const { t } = useT("issues");
  const enabled = useIssuePreviewFeature();
  const workspaceSlug = useWorkspaceSlug();
  const [open, setOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: artifacts = [], isLoading } = useQuery({
    queryKey: issueKeys.artifacts(issueId),
    queryFn: () => api.listIssueArtifacts(issueId),
    enabled,
    staleTime: 30_000,
    // Daemon scans workdirs after complete — poll briefly until artifacts land.
    refetchInterval: (query) =>
      (query.state.data?.length ?? 0) > 0 ? false : 5_000,
  });

  if (!enabled) {
    return null;
  }

  const active =
    artifacts.find((a) => a.id === selectedId) ?? artifacts[0] ?? null;
  const previewURL =
    active && workspaceSlug
      ? buildArtifactRawURL(active.task_id, active.rel_path, workspaceSlug)
      : null;

  return (
    <div>
      <button
        type="button"
        className={`mb-2 flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-accent/70 ${open ? "" : "text-muted-foreground hover:text-foreground"}`}
        onClick={() => setOpen(!open)}
      >
        {t(($) => $.issue_preview.section)}
        <ChevronRight
          className={`!size-3 shrink-0 stroke-[2.5] text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-2 pl-2">
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t(($) => $.issue_preview.loading)}
            </div>
          ) : artifacts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t(($) => $.issue_preview.empty)}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {artifacts.map((item) => (
                  <ArtifactChip
                    key={item.id}
                    item={item}
                    active={active?.id === item.id}
                    onSelect={() => setSelectedId(item.id)}
                  />
                ))}
              </div>

              {previewURL && (
                <div className="overflow-hidden rounded-md border bg-muted/20">
                  <div className="flex items-center justify-end gap-2 border-b px-2 py-1">
                    <a
                      href={previewURL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {t(($) => $.issue_preview.open_new_tab)}
                    </a>
                  </div>
                  <iframe
                    key={active.id}
                    title={t(($) => $.issue_preview.frame_title)}
                    src={previewURL}
                    className="h-56 w-full bg-background"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ArtifactChip({
  item,
  active,
  onSelect,
}: {
  item: IssueArtifact;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-left text-[11px] transition-colors ${
        active
          ? "border-primary/40 bg-primary/5 text-foreground"
          : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
      }`}
    >
      <FileText className="h-3 w-3 shrink-0" />
      <span className="truncate">{item.title || item.rel_path}</span>
    </button>
  );
}
