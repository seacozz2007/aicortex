"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Globe, MessageSquare, Terminal } from "lucide-react";
import {
  useArtifactBrowseFeature,
  useDesignExportFeature,
} from "@aicortex/core/config/features";
import type { ChatSession } from "@aicortex/core/types";
import { cn } from "@aicortex/ui/lib/utils";
import { useWorkspaceSlug } from "@aicortex/core/paths";
import { useTaskArtifacts } from "@aicortex/core/artifacts/queries";
import { useT } from "../../i18n";
import { ChatArtifactPanel } from "../../chat/components/chat-artifact-panel";
import { ChatTerminalPanel } from "../../chat/components/chat-terminal-panel";
import { ChatWebPanel } from "../../chat/components/chat-web-panel";
import { DesignHtmlPreview } from "./design-html-preview";
import { buildArtifactRawURL } from "../../chat/components/chat-artifact-url";

type DesignToolsTab = "preview" | "files" | "terminal" | "export";

export function DesignToolsSidebar({
  session,
  commentMode = false,
  onComment,
  onExport,
  exportPending = false,
}: {
  session: ChatSession | null;
  commentMode?: boolean;
  onComment?: (elementId: string, note: string) => void;
  onExport?: () => void;
  exportPending?: boolean;
}) {
  const { t } = useT("design");
  const workspaceSlug = useWorkspaceSlug() ?? "";
  const artifactEnabled = useArtifactBrowseFeature();
  const exportEnabled = useDesignExportFeature();
  const runtimeId = session?.runtime_id;
  const taskId = session?.last_task_id;
  const workDir = session?.work_dir;
  const artifactEntry = (session as { artifact_entry?: string })?.artifact_entry ?? "index.html";

  const [tab, setTab] = useState<DesignToolsTab>("preview");

  const { data: rootListing } = useTaskArtifacts(
    taskId ?? null,
    "",
    artifactEnabled && !!taskId,
  );

  const previewPath = useMemo(() => {
    const entries = rootListing?.entries ?? [];
    const entryName = artifactEntry.split("/").pop() ?? artifactEntry;
    const exact = entries.find((e) => !e.is_dir && e.name === entryName);
    if (exact) return exact.path;
    const index = entries.find(
      (e) => !e.is_dir && e.name.toLowerCase() === "index.html",
    );
    if (index) return index.path;
    const html = entries.find(
      (e) => !e.is_dir && e.name.toLowerCase().endsWith(".html"),
    );
    return html?.path ?? artifactEntry;
  }, [artifactEntry, rootListing?.entries]);

  const tabs = useMemo(() => {
    const result: { id: DesignToolsTab; label: string; icon: typeof Globe }[] = [];
    if (artifactEnabled && taskId) {
      result.push({
        id: "preview",
        label: t(($) => $.tools.tabs.preview),
        icon: Globe,
      });
    }
    if (artifactEnabled) {
      result.push({
        id: "files",
        label: t(($) => $.tools.tabs.files),
        icon: FileText,
      });
    }
    if (runtimeId) {
      result.push({
        id: "terminal",
        label: t(($) => $.tools.tabs.terminal),
        icon: Terminal,
      });
    }
    if (exportEnabled) {
      result.push({
        id: "export",
        label: t(($) => $.tools.tabs.export),
        icon: Download,
      });
    }
    return result;
  }, [artifactEnabled, exportEnabled, runtimeId, taskId, t]);

  useEffect(() => {
    if (tabs.length === 0) return;
    if (!tabs.some((item) => item.id === tab)) {
      setTab(tabs[0]!.id);
    }
  }, [tabs, tab]);

  if (tabs.length === 0) {
    return (
      <aside className="flex h-full min-h-0 min-w-0 flex-col bg-sidebar">
        <p className="px-3 py-4 text-xs text-muted-foreground">{t(($) => $.tools.unavailable)}</p>
      </aside>
    );
  }

  const canDesignPreview = artifactEnabled && !!taskId && !!workspaceSlug;

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col bg-sidebar">
      <div className="flex h-10 shrink-0 items-center border-b px-2">
        <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                  tab === item.id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
        {tab === "preview" && canDesignPreview && (
          <span
            className={cn(
              "ml-1 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px]",
              commentMode ? "bg-brand/15 text-brand" : "text-muted-foreground",
            )}
            title={t(($) => $.preview.comment_mode_hint)}
          >
            <MessageSquare className="size-3" />
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {tab === "preview" && canDesignPreview && taskId && (
          <DesignHtmlPreview
            path={previewPath}
            taskId={taskId}
            workspaceSlug={workspaceSlug}
            commentMode={commentMode}
            onComment={onComment}
          />
        )}
        {tab === "preview" && !canDesignPreview && (
          <div className="p-4">
            <ChatWebPanel
              runtimeId={runtimeId}
              taskId={taskId}
              hasWorkDir={!!workDir || !!taskId}
            />
          </div>
        )}
        {tab === "files" && (
          <ChatArtifactPanel
            taskId={taskId}
            hasWorkDir={!!workDir || !!taskId}
          />
        )}
        {tab === "terminal" && runtimeId && session && (
          <ChatTerminalPanel
            chatSessionId={session.id}
            runtimeId={runtimeId}
            workDir={workDir}
            sessionTitle={session.title}
            bootstrapCommand={workDir ? `cd ${JSON.stringify(workDir)}` : undefined}
          />
        )}
        {tab === "export" && (
          <div className="space-y-3 p-4">
            <p className="text-xs text-muted-foreground">{t(($) => $.tools.export_hint)}</p>
            {taskId && workspaceSlug && (
              <a
                href={buildArtifactRawURL(taskId, previewPath, workspaceSlug)}
                download={previewPath.split("/").pop() ?? "index.html"}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-accent"
              >
                <Download className="size-3.5" />
                {t(($) => $.tools.download_html)}
              </a>
            )}
            {onExport && (
              <button
                type="button"
                disabled={exportPending}
                onClick={onExport}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-brand px-3 py-2 text-xs text-brand-foreground disabled:opacity-50"
              >
                <Download className="size-3.5" />
                {t(($) => $.session.export)}
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
