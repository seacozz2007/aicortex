"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare, PanelRight } from "lucide-react";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { useWorkspacePaths, useWorkspaceSlug } from "@aicortex/core/paths";
import { api } from "@aicortex/core/api";
import {
  chatMessagesOptions,
  pendingChatTaskOptions,
  chatKeys,
  chatSessionsOptions,
  taskMessagesOptions,
} from "@aicortex/core/chat/queries";
import { useMarkChatSessionRead } from "@aicortex/core/chat/mutations";
import { useAgentPresenceDetail } from "@aicortex/core/agents";
import {
  designSessionOptions,
  designSessionsOptions,
  designKeys,
} from "@aicortex/core/design/queries";
import { useExportDesignSession, useStartDesignJury } from "@aicortex/core/design/mutations";
import {
  useArtifactBrowseFeature,
  useDesignExportFeature,
  useDesignJuryFeature,
  useRuntimeTunnelFeature,
} from "@aicortex/core/config/features";
import { getCurrentSlug } from "@aicortex/core/platform";
import type { ChatMessage, DesignSession, TaskMessagePayload } from "@aicortex/core/types";
import type { ChatTimelineItem } from "@aicortex/core/chat";
import { cn } from "@aicortex/ui/lib/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@aicortex/ui/components/ui/resizable";
import { AppLink } from "../../navigation";
import { useT } from "../../i18n";
import { ChatMessageList, ChatMessageSkeleton } from "../../chat/components/chat-message-list";
import { ChatInput } from "../../chat/components/chat-input";
import { DesignToolsSidebar, type DesignToolsTab } from "./design-tools-sidebar";
import type { QueuedPreviewComment } from "./design-comment-queue-panel";
import { findLatestPendingQuestionForm } from "../lib/pending-question-form";

const TOOLS_SIDEBAR_STORAGE_KEY = "aicortex:design:tools-sidebar-open";

function toolsSidebarStorageKey() {
  const slug = getCurrentSlug();
  return slug ? `${TOOLS_SIDEBAR_STORAGE_KEY}:${slug}` : TOOLS_SIDEBAR_STORAGE_KEY;
}

function readToolsSidebarOpen(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(toolsSidebarStorageKey());
  return stored === null ? true : stored === "true";
}

export function DesignStudioSession({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string;
}) {
  const { t } = useT("design");
  const wsId = useWorkspaceId();
  const workspaceSlug = useWorkspaceSlug() ?? "";
  const p = useWorkspacePaths();
  const qc = useQueryClient();
  const markRead = useMarkChatSessionRead();
  const exportSession = useExportDesignSession(projectId);
  const startJury = useStartDesignJury(projectId);

  const artifactBrowseEnabled = useArtifactBrowseFeature();
  const runtimeTunnelEnabled = useRuntimeTunnelFeature();
  const exportEnabled = useDesignExportFeature();
  const juryEnabled = useDesignJuryFeature();

  const { data: session } = useQuery(designSessionOptions(wsId, projectId, sessionId));
  const { data: chatSessions = [] } = useQuery(chatSessionsOptions(wsId));
  const { data: sessions = [] } = useQuery(designSessionsOptions(wsId, projectId));
  const { data: rawMessages, isLoading: messagesLoading } = useQuery(
    chatMessagesOptions(sessionId),
  );
  const messages = rawMessages ?? [];
  const { data: pendingTask } = useQuery(pendingChatTaskOptions(sessionId));

  const pendingTaskId = pendingTask?.task_id;
  const pendingAlreadyPersisted =
    !!pendingTaskId &&
    messages.some((m) => m.role === "assistant" && m.task_id === pendingTaskId);
  const showLiveTimeline =
    !!pendingTaskId &&
    !pendingAlreadyPersisted &&
    !pendingTaskId.startsWith("optimistic-");
  const { data: liveTaskMessages } = useQuery({
    ...taskMessagesOptions(pendingTaskId ?? ""),
    enabled: showLiveTimeline,
  });
  const liveTimeline: ChatTimelineItem[] = useMemo(
    () =>
      (liveTaskMessages ?? []).map(
        (m: TaskMessagePayload): ChatTimelineItem => ({
          seq: m.seq,
          type: m.type,
          tool: m.tool,
          content: m.content,
          input: m.input,
          output: m.output,
        }),
      ),
    [liveTaskMessages],
  );

  const pendingQuestionForm = useMemo(
    () => findLatestPendingQuestionForm(messages, liveTimeline),
    [messages, liveTimeline],
  );

  const [toolsOpen, setToolsOpen] = useState(readToolsSidebarOpen);
  const [preferredToolsTab, setPreferredToolsTab] = useState<DesignToolsTab | null>(null);
  const [commentMode, setCommentMode] = useState(false);
  const [commentNote, setCommentNote] = useState<string | null>(null);
  const [previewAttachmentIds, setPreviewAttachmentIds] = useState<string[]>([]);
  const [queuedComments, setQueuedComments] = useState<QueuedPreviewComment[]>([]);
  const [queueSending, setQueueSending] = useState(false);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "aicortex_design_studio_layout",
    storage: typeof window === "undefined" ? undefined : localStorage,
  });

  const currentSession = session as DesignSession | undefined;
  const liveChatSession = chatSessions.find((s) => s.id === sessionId);

  const chatSessionForTools = useMemo(() => {
    if (!currentSession && !liveChatSession) return null;
    const taskId =
      liveChatSession?.last_task_id ??
      currentSession?.last_task_id ??
      pendingTask?.task_id ??
      undefined;
    return {
      ...(currentSession ?? liveChatSession!),
      session_kind: "design" as const,
      work_dir: liveChatSession?.work_dir ?? currentSession?.work_dir,
      last_task_id: taskId?.startsWith("optimistic-") ? undefined : taskId,
      runtime_id: liveChatSession?.runtime_id ?? currentSession?.runtime_id,
    };
  }, [currentSession, liveChatSession, pendingTask?.task_id]);

  const presenceDetail = useAgentPresenceDetail(wsId, currentSession?.agent_id);
  const availability =
    presenceDetail === "loading" ? undefined : presenceDetail?.availability;

  const canUseTools =
    artifactBrowseEnabled ||
    runtimeTunnelEnabled ||
    !!chatSessionForTools?.runtime_id;

  const showToolsSidebar = toolsOpen && (canUseTools || !!pendingQuestionForm);

  useEffect(() => {
    if (sessionId) {
      void markRead.mutateAsync(sessionId).catch(() => {});
    }
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pendingQuestionForm) return;
    setToolsOpen(true);
    localStorage.setItem(toolsSidebarStorageKey(), "true");
    setPreferredToolsTab("questions");
  }, [pendingQuestionForm?.form.id]);

  useEffect(() => {
    if (!commentMode) return;
    setToolsOpen(true);
    localStorage.setItem(toolsSidebarStorageKey(), "true");
    setPreferredToolsTab("preview");
  }, [commentMode]);

  const openQuestionsPanel = useCallback(() => {
    setToolsOpen(true);
    localStorage.setItem(toolsSidebarStorageKey(), "true");
    setPreferredToolsTab("questions");
  }, []);

  const handleSend = useCallback(
    async (content: string, attachmentIds?: string[]) => {
      const commentBlocks = [
        commentNote ? `[Comment on element]\n${commentNote}` : null,
        queuedComments.length
          ? `[Comment queue]\n${queuedComments.map((item) => `[${item.elementId}] ${item.note}`).join("\n\n")}`
          : null,
      ].filter(Boolean);
      const finalContent =
        commentBlocks.length > 0
          ? `${content}\n\n${commentBlocks.join("\n\n")}`
          : content;
      const mergedAttachmentIds = [
        ...(attachmentIds ?? []),
        ...previewAttachmentIds,
      ];
      setCommentNote(null);
      setPreviewAttachmentIds([]);
      setQueuedComments([]);
      const result = await api.sendChatMessage(
        sessionId,
        finalContent,
        mergedAttachmentIds.length > 0 ? mergedAttachmentIds : undefined,
      );
      qc.invalidateQueries({ queryKey: chatKeys.messages(sessionId) });
      qc.invalidateQueries({ queryKey: chatKeys.pendingTask(sessionId) });
      qc.invalidateQueries({ queryKey: designSessionsOptions(wsId, projectId).queryKey });
      qc.invalidateQueries({ queryKey: designKeys.session(wsId, projectId, sessionId) });
      return result;
    },
    [commentNote, previewAttachmentIds, projectId, qc, queuedComments, sessionId, wsId],
  );

  const handleExport = useCallback(
    async (format: string) => {
      const result = await exportSession.mutateAsync({ sessionId, format });
      const url =
        result.download_urls?.[format] ??
        result.download_url ??
        api.designExportDownloadPath(projectId, sessionId, format, workspaceSlug);
      window.open(url, "_blank");
    },
    [exportSession, projectId, sessionId, workspaceSlug],
  );

  const handleJury = useCallback(async () => {
    await startJury.mutateAsync({ sessionId, rounds: 3 });
    qc.invalidateQueries({ queryKey: chatKeys.messages(sessionId) });
    qc.invalidateQueries({ queryKey: chatKeys.pendingTask(sessionId) });
  }, [qc, sessionId, startJury]);

  const formatPreviewComment = useCallback(
    (element: { id: string }, note: string) => `[${element.id}] ${note}`,
    [],
  );

  const handlePreviewComment = useCallback(
    async (element: { id: string }, note: string, images?: File[]) => {
      setCommentNote(formatPreviewComment(element, note));
      if (images?.length) {
        const uploaded = await Promise.all(
          images.map((file) =>
            api.uploadFile(file, { chatSessionId: sessionId }).catch(() => null),
          ),
        );
        const ids = uploaded.flatMap((item) => (item ? [item.id] : []));
        if (ids.length > 0) {
          setPreviewAttachmentIds((prev) => [...prev, ...ids]);
        }
      }
    },
    [formatPreviewComment, sessionId],
  );

  const handleQueuePreviewComment = useCallback(
    (element: { id: string }, note: string) => {
      setQueuedComments((prev) => [
        ...prev,
        {
          id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          elementId: element.id,
          note: note.trim(),
        },
      ]);
    },
    [],
  );

  const handlePropertySave = useCallback((_element: { id: string }, patch: string) => {
    setCommentNote(patch);
  }, []);

  const handleSendQueue = useCallback(async () => {
    if (queuedComments.length === 0 || queueSending) return;
    setQueueSending(true);
    try {
      await handleSend(t(($) => $.session.queue_send_message));
    } finally {
      setQueueSending(false);
    }
  }, [handleSend, queueSending, queuedComments.length, t]);

  const openStudioPreview = useCallback(() => {
    setToolsOpen(true);
    localStorage.setItem(toolsSidebarStorageKey(), "true");
    setPreferredToolsTab("preview");
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
        <AppLink
          href={p.projectDesign(projectId)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t(($) => $.session.back)}
        </AppLink>
        <span className="text-sm font-medium truncate">{currentSession?.title}</span>
        <div className="ml-auto flex items-center gap-2">
          {(canUseTools || pendingQuestionForm) && (
            <>
              <button
                type="button"
                onClick={() => setCommentMode((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent",
                  commentMode && "bg-brand/15 text-brand border-brand/40",
                )}
              >
                <MessageSquare className="size-3.5" />
                {t(($) => $.session.comment_mode)}
              </button>
              <button
                type="button"
                onClick={() => {
                  setToolsOpen((v) => {
                    const next = !v;
                    localStorage.setItem(toolsSidebarStorageKey(), String(next));
                    return next;
                  });
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent",
                  toolsOpen && "bg-accent",
                )}
              >
                <PanelRight className="size-3.5" />
                {t(($) => $.session.studio_panel)}
              </button>
            </>
          )}
        </div>
      </header>

      {commentMode && !showToolsSidebar ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-brand/10 px-4 py-2 text-xs">
          <span>{t(($) => $.session.comment_preview_hint)}</span>
          <button
            type="button"
            onClick={openStudioPreview}
            className="shrink-0 rounded-md border border-brand/40 bg-background px-2 py-1 text-xs hover:bg-accent"
          >
            {t(($) => $.session.open_preview_panel)}
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 flex-col border-r md:flex">
          <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
            {t(($) => $.session.sessions)}
          </div>
          <ul className="flex-1 overflow-auto p-2 space-y-1">
            {sessions.map((s) => (
              <li key={s.id}>
                <AppLink
                  href={p.projectDesignSession(projectId, s.id)}
                  className={cn(
                    "block rounded-md px-2 py-1.5 text-sm truncate",
                    s.id === sessionId ? "bg-accent font-medium" : "hover:bg-accent/60",
                  )}
                >
                  {s.title}
                </AppLink>
              </li>
            ))}
          </ul>
        </aside>

        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <ResizablePanel defaultSize={showToolsSidebar ? 55 : 100} minSize={35}>
            <div className="flex h-full min-h-0 flex-col">
              {messagesLoading ? (
                <ChatMessageSkeleton />
              ) : (
                <ChatMessageList
                  messages={messages as ChatMessage[]}
                  pendingTask={pendingTask}
                  availability={availability}
                  hideQuestionForms={!!pendingQuestionForm}
                  onOpenQuestionsPanel={openQuestionsPanel}
                  onFormSubmit={(text) => void handleSend(text)}
                />
              )}
              <ChatInput
                onSend={handleSend}
                isRunning={!!pendingTask?.task_id}
                disabled={!currentSession}
              />
              {commentNote && (
                <div className="border-t bg-muted/40 px-4 py-2 text-xs">
                  {t(($) => $.session.comment_prefix)} {commentNote}
                  <button
                    type="button"
                    className="ml-2 underline"
                    onClick={() => {
                      setCommentNote(null);
                      setPreviewAttachmentIds([]);
                    }}
                  >
                    {t(($) => $.session.clear_comment)}
                  </button>
                </div>
              )}
              {queuedComments.length > 0 && (
                <div className="border-t bg-muted/40 px-4 py-2 text-xs">
                  {t(($) => $.session.queue_prefix, { count: queuedComments.length })}
                  <button
                    type="button"
                    className="ml-2 underline"
                    onClick={() => setQueuedComments([])}
                  >
                    {t(($) => $.session.clear_comment)}
                  </button>
                </div>
              )}
            </div>
          </ResizablePanel>

          {showToolsSidebar && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={45} minSize={25}>
                <DesignToolsSidebar
                  session={chatSessionForTools}
                  projectId={projectId}
                  commentMode={commentMode}
                  onComment={handlePreviewComment}
                  onQueueComment={handleQueuePreviewComment}
                  onPropertySave={handlePropertySave}
                  queuedComments={queuedComments}
                  onRemoveQueuedComment={(id) =>
                    setQueuedComments((prev) => prev.filter((item) => item.id !== id))
                  }
                  onClearQueuedComments={() => setQueuedComments([])}
                  onSendQueue={() => void handleSendQueue()}
                  queueSending={queueSending}
                  onExport={exportEnabled ? (format) => void handleExport(format) : undefined}
                  exportPending={exportSession.isPending}
                  onJury={juryEnabled ? () => void handleJury() : undefined}
                  juryPending={startJury.isPending}
                  pendingQuestionForm={pendingQuestionForm?.form}
                  preferredTab={preferredToolsTab}
                  onPreferredTabApplied={() => setPreferredToolsTab(null)}
                  onFormSubmit={(text) => void handleSend(text)}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
