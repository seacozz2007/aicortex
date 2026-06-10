"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, FileText, Globe, Gavel, MessageSquare, Terminal } from "lucide-react";
import {
  useArtifactBrowseFeature,
  useDesignExportFeature,
  useDesignJuryFeature,
} from "@aicortex/core/config/features";
import { useWorkspaceExploreEnabled } from "@aicortex/core/workspace/hooks";
import type { ChatSession, ChatPendingTask, TaskMessagePayload } from "@aicortex/core/types";
import { buildDesignGenerationPreviewModel } from "@aicortex/core/design/generation-preview";
import { cn } from "@aicortex/ui/lib/utils";
import { useWorkspaceSlug } from "@aicortex/core/paths";
import { useTaskArtifacts } from "@aicortex/core/artifacts/queries";
import { api } from "@aicortex/core/api";
import { useT } from "../../i18n";
import { ChatArtifactPanel } from "../../chat/components/chat-artifact-panel";
import { ChatTerminalPanel } from "../../chat/components/chat-terminal-panel";
import type { MarkAnnotationAction, SelectedPreviewElement } from "../lib/preview-element";
import type { QueuedPreviewComment } from "./design-comment-queue-panel";
import { DesignHtmlPreview, type PreviewCommentHandler } from "./design-html-preview";
import { isHtmlArtifact } from "../../chat/components/chat-artifact-url";
import { DesignQuestionsPanel } from "./design-questions-panel";
import type { QuestionForm } from "../../chat/lib/question-form-parser";
import {
  buildTunnelPreviewURL,
  DesignPreviewSourceBar,
  useDesignPreviewSource,
} from "./design-preview-source-bar";
import { DesignGenerationPreview } from "./design-generation-preview";

export type DesignToolsTab = "questions" | "preview" | "files" | "terminal" | "export";

const DEFAULT_TAB_ORDER: DesignToolsTab[] = [
  "preview",
  "questions",
  "files",
  "terminal",
  "export",
];

function resolveDefaultTab(
  tabs: { id: DesignToolsTab }[],
  preferred?: DesignToolsTab | null,
  preferQuestions = false,
): DesignToolsTab {
  if (preferred && tabs.some((item) => item.id === preferred)) {
    return preferred;
  }
  const order = preferQuestions
    ? (["questions", ...DEFAULT_TAB_ORDER.filter((id) => id !== "questions")] as DesignToolsTab[])
    : DEFAULT_TAB_ORDER;
  for (const id of order) {
    if (tabs.some((item) => item.id === id)) {
      return id;
    }
  }
  return tabs[0]!.id;
}

export function DesignToolsSidebar({
  session,
  projectId,
  commentMode = false,
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
  onExport,
  exportPending = false,
  onJury,
  juryPending = false,
  pendingQuestionForm,
  preferredTab,
  onPreferredTabApplied,
  onFormSubmit,
  pendingTask,
  taskMessages = [],
  hasPriorCompletedRun = false,
}: {
  session: ChatSession | null;
  projectId?: string;
  pendingTask?: ChatPendingTask | null;
  taskMessages?: readonly TaskMessagePayload[];
  hasPriorCompletedRun?: boolean;
  commentMode?: boolean;
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
  onExport?: (format: string) => void;
  exportPending?: boolean;
  onJury?: () => void;
  juryPending?: boolean;
  pendingQuestionForm?: QuestionForm | null;
  preferredTab?: DesignToolsTab | null;
  onPreferredTabApplied?: () => void;
  onFormSubmit?: (text: string) => void;
}) {
  const { t } = useT("design");
  const workspaceSlug = useWorkspaceSlug() ?? "";
  const artifactEnabled = useArtifactBrowseFeature();
  const exploreEnabled = useWorkspaceExploreEnabled();
  const exportEnabled = useDesignExportFeature();
  const juryEnabled = useDesignJuryFeature();
  const runtimeId = session?.runtime_id;
  const taskId = session?.last_task_id;
  const workDir = session?.work_dir;
  const artifactEntry = (session as { artifact_entry?: string })?.artifact_entry ?? "index.html";

  const [tab, setTab] = useState<DesignToolsTab>("preview");
  const tabUserSelectedRef = useRef(false);
  const sessionId = session?.id;

  const selectTab = (next: DesignToolsTab, userInitiated = false) => {
    if (userInitiated) {
      tabUserSelectedRef.current = true;
    }
    setTab(next);
  };

  const { data: rootListing, isLoading: rootListingLoading } = useTaskArtifacts(
    taskId ?? null,
    "",
    artifactEnabled && !!taskId,
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
    artifactEntry,
    htmlEntries,
    htmlLoading: rootListingLoading,
    runtimeId,
    commentMode,
  });

  const generationPreview = useMemo(
    () =>
      buildDesignGenerationPreviewModel({
        pendingTask,
        taskMessages,
        hasPreviewHtml: htmlEntries.length > 0,
        hasPriorCompletedRun,
      }),
    [pendingTask, taskMessages, htmlEntries.length, hasPriorCompletedRun],
  );

  const showGenerationStage = Boolean(generationPreview) && !pendingQuestionForm;

  const tabs = useMemo(() => {
    const result: {
      id: DesignToolsTab;
      label: string;
      icon: typeof Globe;
      notify?: boolean;
    }[] = [];
    if (pendingQuestionForm) {
      result.push({
        id: "questions",
        label: t(($) => $.tools.tabs.questions),
        icon: MessageSquare,
        notify: true,
      });
    }
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
    if (exploreEnabled && runtimeId) {
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
  }, [artifactEnabled, exploreEnabled, exportEnabled, pendingQuestionForm, runtimeId, taskId, t]);

  useEffect(() => {
    tabUserSelectedRef.current = false;
    setTab("preview");
  }, [sessionId]);

  useEffect(() => {
    if (preferredTab && tabs.some((item) => item.id === preferredTab)) {
      selectTab(preferredTab, true);
      onPreferredTabApplied?.();
    }
  }, [preferredTab, tabs, onPreferredTabApplied]);

  useEffect(() => {
    if (!pendingQuestionForm) return;
    tabUserSelectedRef.current = false;
    selectTab("questions");
  }, [pendingQuestionForm?.id]);

  useEffect(() => {
    if (tabs.length === 0) return;
    if (!tabs.some((item) => item.id === tab)) {
      selectTab(resolveDefaultTab(tabs, null, !!pendingQuestionForm));
      return;
    }
    if (
      pendingQuestionForm &&
      !tabUserSelectedRef.current &&
      tabs.some((item) => item.id === "questions") &&
      tab !== "questions"
    ) {
      selectTab("questions");
      return;
    }
    if (
      !pendingQuestionForm &&
      !tabUserSelectedRef.current &&
      tabs.some((item) => item.id === "preview") &&
      tab !== "preview" &&
      tab !== "questions"
    ) {
      selectTab("preview");
    }
  }, [tabs, tab, pendingQuestionForm]);

  if (showGenerationStage && generationPreview) {
    return (
      <aside className="flex h-full min-h-0 min-w-0 flex-col">
        <DesignGenerationPreview model={generationPreview} />
      </aside>
    );
  }

  if (tabs.length === 0) {
    return (
      <aside className="flex h-full min-h-0 min-w-0 flex-col bg-sidebar">
        <p className="px-3 py-4 text-xs text-muted-foreground">{t(($) => $.tools.unavailable)}</p>
      </aside>
    );
  }

  const canDesignPreview = artifactEnabled && !!taskId && !!workspaceSlug;

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
                onClick={() => selectTab(item.id, true)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                  tab === item.id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {item.label}
                {item.notify ? (
                  <span className="size-1.5 rounded-full bg-destructive" aria-hidden />
                ) : null}
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

      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "questions" && pendingQuestionForm && onFormSubmit && (
          <DesignQuestionsPanel form={pendingQuestionForm} onSubmit={onFormSubmit} />
        )}
        {tab === "preview" && canDesignPreview && taskId && session && (
          <>
            <DesignPreviewSourceBar
              sessionId={session.id}
              artifactEntry={artifactEntry}
              htmlEntries={htmlEntries}
              htmlLoading={rootListingLoading}
              runtimeId={runtimeId}
              workspaceSlug={workspaceSlug}
              commentMode={commentMode}
              mode={previewSource.mode}
              onModeChange={previewSource.setMode}
              selectedHtmlPath={previewSource.selectedHtmlPath}
              onHtmlPathChange={previewSource.setSelectedHtmlPath}
              selectedPort={previewSource.selectedPort}
              onPortChange={previewSource.setSelectedPort}
            />
            {previewSource.mode === "file" && previewSource.effectiveHtmlPath ? (
              <div className="min-h-0 flex-1">
                <DesignHtmlPreview
                  path={previewSource.effectiveHtmlPath}
                  taskId={taskId}
                  workspaceSlug={workspaceSlug}
                  commentMode={commentMode}
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
              </div>
            ) : previewSource.mode === "tunnel" &&
              runtimeId &&
              previewSource.selectedPort != null ? (
              <div className="flex min-h-0 flex-1 flex-col bg-muted/20">
                <div className="flex shrink-0 items-center justify-end border-b px-2 py-1">
                  <a
                    href={buildTunnelPreviewURL(
                      runtimeId,
                      previewSource.selectedPort,
                      workspaceSlug,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                    title={t(($) => $.preview.open_external)}
                  >
                    <ExternalLink className="size-3.5" />
                    {t(($) => $.preview.open_external)}
                  </a>
                </div>
                <iframe
                  key={buildTunnelPreviewURL(
                    runtimeId,
                    previewSource.selectedPort,
                    workspaceSlug,
                  )}
                  title={t(($) => $.preview.frame_title)}
                  src={buildTunnelPreviewURL(
                    runtimeId,
                    previewSource.selectedPort,
                    workspaceSlug,
                  )}
                  className="min-h-0 flex-1 bg-background"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              </div>
            ) : (
              <p className="p-4 text-xs text-muted-foreground">
                {previewSource.mode === "tunnel"
                  ? t(($) => $.preview.no_ports)
                  : t(($) => $.preview.no_html)}
              </p>
            )}
          </>
        )}
        {tab === "preview" && !canDesignPreview && (
          <p className="p-4 text-xs text-muted-foreground">
            {t(($) => $.tools.unavailable)}
          </p>
        )}
        {tab === "files" && (
          <ChatArtifactPanel
            taskId={taskId}
            hasWorkDir={!!workDir || !!taskId}
            htmlPreview={false}
            markdownPreview
            selectFileHint={t(($) => $.tools.files.select_file)}
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
            {taskId && workspaceSlug && projectId && session && (
              <div className="grid gap-2">
                {(["html", "zip", "pdf", "pptx"] as const).map((format) => (
                  <a
                    key={format}
                    href={api.designExportDownloadPath(projectId, session.id, format, workspaceSlug)}
                    className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-accent"
                  >
                    <Download className="size-3.5" />
                    {t(($) => $.tools[`download_${format}` as keyof typeof $.tools] as string)}
                  </a>
                ))}
              </div>
            )}
            {onExport && (
              <button
                type="button"
                disabled={exportPending}
                onClick={() => onExport("zip")}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-brand px-3 py-2 text-xs text-brand-foreground disabled:opacity-50"
              >
                <Download className="size-3.5" />
                {t(($) => $.session.export)}
              </button>
            )}
            {juryEnabled && onJury && (
              <button
                type="button"
                disabled={juryPending}
                onClick={onJury}
                className="flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-accent disabled:opacity-50"
              >
                <Gavel className="size-3.5" />
                {juryPending ? t(($) => $.tools.jury_pending) : t(($) => $.tools.start_jury)}
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
