"use client";

import { useMemo } from "react";
import { FileText, Globe, Terminal } from "lucide-react";
import { useWorkspaceSlug } from "@aicortex/core/paths";
import { useArtifactBrowseFeature } from "@aicortex/core/config/features";
import { useWorkspaceExploreEnabled } from "@aicortex/core/workspace/hooks";
import { useTaskArtifacts } from "@aicortex/core/artifacts/queries";
import { cn } from "@aicortex/ui/lib/utils";
import type { DevSession } from "@aicortex/core/dev-studio";
import { useT } from "../../i18n";
import { isHtmlArtifact } from "../../chat/components/chat-artifact-url";
import { ChatTerminalPanel } from "../../chat/components/chat-terminal-panel";
import { ChatArtifactPanel } from "../../chat/components/chat-artifact-panel";
import type { MarkAnnotationAction, SelectedPreviewElement } from "../../design-studio/lib/preview-element";
import type { QueuedPreviewComment } from "../../design-studio/components/design-comment-queue-panel";
import { type PreviewCommentHandler } from "../../design-studio/components/design-html-preview";
import { useDesignPreviewSource } from "../../design-studio/components/design-preview-source-bar";
import { DesignToolsPreviewPanel } from "../../design-studio/components/design-tools-preview-panel";

export type DevToolsTab = "terminal" | "files" | "preview";

export function DevToolsSidebar({
  session,
  activeTab,
  onTabChange,
  lastTaskId,
  runtimeOnline = true,
  commentMode = false,
  onCommentModeChange,
  onSendToChat,
  onQueueComment,
  onPropertySave,
  onMarkAnnotation,
  sendDisabled = false,
  queuedComments = [],
  onRemoveQueuedComment,
  onClearQueuedComments,
  onSendQueue,
  queueSending = false,
}: {
  session: DevSession | null;
  activeTab: DevToolsTab;
  onTabChange: (tab: DevToolsTab) => void;
  lastTaskId: string | null;
  /** When false, defer artifact browse until the runtime daemon WS is connected. */
  runtimeOnline?: boolean;
  commentMode?: boolean;
  onCommentModeChange?: (enabled: boolean) => void;
  onSendToChat?: PreviewCommentHandler;
  onQueueComment?: PreviewCommentHandler;
  onPropertySave?: (element: SelectedPreviewElement, patch: string) => void;
  onMarkAnnotation?: (payload: {
    action: MarkAnnotationAction;
    note: string;
    imageFile?: File;
    extraFiles?: File[];
  }) => Promise<void>;
  sendDisabled?: boolean;
  queuedComments?: QueuedPreviewComment[];
  onRemoveQueuedComment?: (id: string) => void;
  onClearQueuedComments?: () => void;
  onSendQueue?: () => void;
  queueSending?: boolean;
}) {
  const { t } = useT("dev-studio");
  const workspaceSlug = useWorkspaceSlug() ?? "";
  const exploreEnabled = useWorkspaceExploreEnabled();
  const artifactBrowseEnabled = useArtifactBrowseFeature();

  const runtimeId = session?.runtime_id ?? undefined;
  const workDir = session?.work_dir ?? null;
  const taskId = lastTaskId;

  const { data: rootListing, isLoading: rootListingLoading } = useTaskArtifacts(
    taskId,
    "",
    artifactBrowseEnabled && !!taskId,
    { runtimeOnline },
  );

  const htmlEntries = useMemo(
    () =>
      (rootListing?.entries ?? [])
        .filter((entry) => !entry.is_dir && isHtmlArtifact(entry.path))
        .map((entry) => ({ path: entry.path, name: entry.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rootListing?.entries],
  );

  const previewSource = useDesignPreviewSource({
    sessionId: session?.id ?? "unknown",
    artifactEntry: "index.html",
    htmlEntries,
    htmlLoading: rootListingLoading,
    runtimeId,
    commentMode,
    storagePrefix: "dev-preview",
  });

  const canPreview = artifactBrowseEnabled && !!taskId && !!workspaceSlug && !!session;

  const tabs = useMemo(() => {
    const items: { id: DevToolsTab; label: string; icon: typeof Terminal }[] = [];
    if (canPreview) {
      items.push({
        id: "preview",
        label: t(($) => $.session.tabs_preview),
        icon: Globe,
      });
    }
    if (artifactBrowseEnabled && taskId) {
      items.push({
        id: "files",
        label: t(($) => $.session.tabs_files),
        icon: FileText,
      });
    }
    if (exploreEnabled && runtimeId) {
      items.push({
        id: "terminal",
        label: t(($) => $.session.tabs_terminal),
        icon: Terminal,
      });
    }
    return items;
  }, [artifactBrowseEnabled, canPreview, exploreEnabled, runtimeId, taskId, t]);

  if (tabs.length === 0) {
    return (
      <aside className="flex h-full min-h-0 min-w-0 flex-col bg-sidebar">
        <p className="px-3 py-4 text-xs text-muted-foreground">
          {exploreEnabled
            ? t(($) => $.tools.unavailable_no_runtime)
            : t(($) => $.tools.unavailable_explore)}
        </p>
      </aside>
    );
  }

  const tab = tabs.some((item) => item.id === activeTab) ? activeTab : tabs[0]!.id;

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col border-l border-border bg-sidebar">
      <div className="flex h-10 shrink-0 items-center border-b px-2">
        <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
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
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "terminal" && runtimeId && session && (
          <div className="min-h-0 flex-1">
            <ChatTerminalPanel
              chatSessionId={session.id}
              runtimeId={runtimeId}
              workDir={workDir ?? undefined}
              sessionTitle={session.title}
            />
          </div>
        )}
        {tab === "files" && taskId && (
          <div className="min-h-0 flex-1">
            <ChatArtifactPanel taskId={taskId} hasWorkDir={!!workDir || !!taskId} />
          </div>
        )}
        {tab === "preview" && canPreview && taskId && session && (
          <DesignToolsPreviewPanel
            taskId={taskId}
            workspaceSlug={workspaceSlug}
            runtimeId={runtimeId}
            htmlEntries={htmlEntries}
            htmlLoading={rootListingLoading}
            previewSource={previewSource}
            designEnabled={!!onCommentModeChange}
            commentMode={commentMode}
            onCommentModeChange={onCommentModeChange}
            sendDisabled={sendDisabled}
            onSendToChat={onSendToChat}
            onQueueComment={onQueueComment}
            onPropertySave={onPropertySave}
            onMarkAnnotation={onMarkAnnotation}
            queuedComments={queuedComments}
            onRemoveQueuedComment={onRemoveQueuedComment}
            onClearQueuedComments={onClearQueuedComments}
            onSendQueue={onSendQueue}
            queueSending={queueSending}
          />
        )}
      </div>
    </aside>
  );
}
