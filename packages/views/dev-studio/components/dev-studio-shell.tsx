"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, PanelRight, Send, Terminal } from "lucide-react";
import {
  devSessionOptions,
  devSessionsOptions,
  devSettingsOptions,
  emptyProjectSessionLayout,
  mergeSessionLayout,
  upsertDevSessionInCache,
  useCreateDevSession,
  useDeleteDevSession,
  useDevStudioStore,
} from "@aicortex/core/dev-studio";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { useWorkspacePaths } from "@aicortex/core/paths";
import { projectListOptions } from "@aicortex/core/projects/queries";
import { agentListOptions } from "@aicortex/core/workspace/queries";
import {
  chatKeys,
  chatMessagesOptions,
  pendingChatTaskOptions,
} from "@aicortex/core/chat/queries";
import {
  useMarkChatSessionRead,
} from "@aicortex/core/chat/mutations";
import { sendChatMessageWithRecovery } from "@aicortex/core/chat/send-message";
import { shouldEnqueueOutbound, type OutboundQueuedMessage } from "@aicortex/core/chat/outbound-queue";
import { useFlushOutboundQueue } from "@aicortex/core/chat/use-flush-outbound-queue";
import { useAgentPresenceDetail } from "@aicortex/core/agents";
import { useFileUpload } from "@aicortex/core/hooks/use-file-upload";
import { api } from "@aicortex/core/api";
import type { DevSession } from "@aicortex/core/dev-studio";
import type { Agent, ChatMessage, ChatPendingTask } from "@aicortex/core/types";
import { cn } from "@aicortex/ui/lib/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@aicortex/ui/components/ui/resizable";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@aicortex/ui/components/ui/sheet";
import { Button } from "@aicortex/ui/components/ui/button";
import { useNavigation } from "../../navigation";
import { useT } from "../../i18n";
import { ChatMessageList, ChatMessageSkeleton } from "../../chat/components/chat-message-list";
import { ChatInput } from "../../chat/components/chat-input";
import { OfflineBanner } from "../../chat/components/offline-banner";
import { ActorAvatar } from "../../common/actor-avatar";
import { DevProjectSessionSidebar } from "./dev-project-session-sidebar";
import { DevToolsSidebar, type DevToolsTab } from "./dev-tools-sidebar";
import { DevProjectPicker } from "./dev-project-picker";
import { DevAgentPicker } from "./dev-agent-picker";

function devOpenedProjectsKey(wsId: string) {
  return `aicortex:dev:opened-projects:${wsId}`;
}

function devSessionLayoutKey(wsId: string) {
  return `aicortex:dev:session-layout:${wsId}`;
}

export function DevStudioShell() {
  const { t } = useT("dev-studio");
  const wsId = useWorkspaceId();
  const p = useWorkspacePaths();
  const qc = useQueryClient();
  const { searchParams, replace } = useNavigation();

  const projectId = searchParams.get("project");
  const sessionId = searchParams.get("session");

  const sidebarOpen = useDevStudioStore((s) => s.sidebarOpen);
  const toolsOpen = useDevStudioStore((s) => s.toolsOpen);
  const toolsTab = useDevStudioStore((s) => s.toolsTab);
  const openedProjectIds = useDevStudioStore((s) => s.openedProjectIds);
  const sessionLayoutByProject = useDevStudioStore((s) => s.sessionLayoutByProject);
  const openProject = useDevStudioStore((s) => s.openProject);
  const setOpenedProjectIds = useDevStudioStore((s) => s.setOpenedProjectIds);
  const setSessionLayoutByProject = useDevStudioStore((s) => s.setSessionLayoutByProject);
  const setProjectSessionLayout = useDevStudioStore((s) => s.setProjectSessionLayout);
  const setSidebarOpen = useDevStudioStore((s) => s.setSidebarOpen);
  const setToolsOpen = useDevStudioStore((s) => s.setToolsOpen);
  const setToolsTab = useDevStudioStore((s) => s.setToolsTab);

  const { data: sessions = [] } = useQuery(devSessionsOptions(wsId));
  const sessionMissingFromList =
    !!sessionId && !sessions.some((s) => s.id === sessionId);
  const { data: fetchedSession } = useQuery({
    ...devSessionOptions(wsId, projectId ?? "", sessionId ?? ""),
    enabled: !!wsId && !!projectId && !!sessionId && sessionMissingFromList,
  });
  const sidebarSessions = useMemo(() => {
    if (!fetchedSession || sessions.some((s) => s.id === fetchedSession.id)) {
      return sessions;
    }
    return [fetchedSession, ...sessions];
  }, [sessions, fetchedSession]);
  const { data: projects = [] } = useQuery(projectListOptions(wsId));
  const { data: devSettings } = useQuery(devSettingsOptions(wsId));
  const { data: agents = [] } = useQuery(agentListOptions(wsId));

  const sessionFingerprint = useMemo(
    () =>
      sessions
        .map((s) => `${s.id}:${s.project_id}:${s.updated_at}:${s.has_unread ? 1 : 0}`)
        .sort()
        .join("|"),
    [sessions],
  );

  const sessionProjectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const session of sessions) ids.add(session.project_id);
    return Array.from(ids).sort();
  }, [sessions]);

  const currentSession = useMemo(
    () =>
      sessionId
        ? (sidebarSessions.find((s) => s.id === sessionId) ??
          fetchedSession ??
          null)
        : null,
    [sessionId, sidebarSessions, fetchedSession],
  );

  const availableAgents = useMemo(
    () => agents.filter((a) => !a.archived_at),
    [agents],
  );

  const [draftAgentId, setDraftAgentId] = useState<string | null>(null);
  const userPickedAgent = useRef(false);

  useEffect(() => {
    if (sessionId || userPickedAgent.current) return;
    const configured = devSettings?.default_dev_agent_id;
    if (configured && availableAgents.some((a) => a.id === configured)) {
      setDraftAgentId(configured);
      return;
    }
    if (availableAgents.length > 0) {
      const fallbackId = availableAgents[0]?.id;
      if (fallbackId) {
        setDraftAgentId((current) => current ?? fallbackId);
      }
    }
  }, [availableAgents, devSettings?.default_dev_agent_id, sessionId]);

  const draftAgent = useMemo(
    () => (draftAgentId ? availableAgents.find((a) => a.id === draftAgentId) ?? null : null),
    [availableAgents, draftAgentId],
  );

  const sessionAgent = useMemo(
    () =>
      currentSession
        ? availableAgents.find((a) => a.id === currentSession.agent_id) ?? null
        : null,
    [availableAgents, currentSession],
  );

  const activeAgent: Agent | null = sessionId ? sessionAgent : draftAgent;

  const handleDraftAgentSelect = useCallback((agent: Agent) => {
    userPickedAgent.current = true;
    setDraftAgentId(agent.id);
  }, []);

  const { data: rawMessages, isLoading: messagesLoading } = useQuery(
    chatMessagesOptions(sessionId ?? ""),
  );
  const messages = sessionId ? rawMessages ?? [] : [];
  const showSkeleton = !!sessionId && messagesLoading;

  const { data: pendingTask } = useQuery(pendingChatTaskOptions(sessionId ?? ""));
  const pendingTaskId = pendingTask?.task_id ?? null;

  const lastTaskId = useMemo(() => {
    if (pendingTaskId && !pendingTaskId.startsWith("optimistic-")) return pendingTaskId;
    if (currentSession?.last_task_id) return currentSession.last_task_id;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role === "assistant" && m.task_id && !m.task_id.startsWith("optimistic-")) {
        return m.task_id;
      }
    }
    return null;
  }, [currentSession?.last_task_id, messages, pendingTaskId]);

  const createSession = useCreateDevSession(wsId, projectId ?? "");
  const deleteSession = useDeleteDevSession(wsId);
  const markRead = useMarkChatSessionRead();
  const { uploadWithToast } = useFileUpload(api);

  const [composer, setComposer] = useState("");
  const [creating, setCreating] = useState(false);
  const [projectSheetOpen, setProjectSheetOpen] = useState(false);
  const [openedProjectsHydrated, setOpenedProjectsHydrated] = useState(false);
  const [sessionLayoutHydrated, setSessionLayoutHydrated] = useState(false);

  useEffect(() => {
    if (!wsId) return;
    setOpenedProjectsHydrated(false);
    setSessionLayoutHydrated(false);
    try {
      const raw = localStorage.getItem(devOpenedProjectsKey(wsId));
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed) && parsed.every((id) => typeof id === "string")) {
          setOpenedProjectIds(parsed);
        }
      }
      const layoutRaw = localStorage.getItem(devSessionLayoutKey(wsId));
      if (layoutRaw) {
        const parsed = JSON.parse(layoutRaw) as unknown;
        if (parsed && typeof parsed === "object") {
          setSessionLayoutByProject(parsed as typeof sessionLayoutByProject);
        }
      }
    } catch {
      // ignore corrupt storage
    }
    setOpenedProjectsHydrated(true);
    setSessionLayoutHydrated(true);
  }, [wsId, setOpenedProjectIds, setSessionLayoutByProject]);

  useEffect(() => {
    if (!wsId || !openedProjectsHydrated) return;
    localStorage.setItem(devOpenedProjectsKey(wsId), JSON.stringify(openedProjectIds));
  }, [wsId, openedProjectIds, openedProjectsHydrated]);

  useEffect(() => {
    if (!wsId || !sessionLayoutHydrated) return;
    localStorage.setItem(devSessionLayoutKey(wsId), JSON.stringify(sessionLayoutByProject));
  }, [wsId, sessionLayoutByProject, sessionLayoutHydrated]);

  useEffect(() => {
    if (sessions.length === 0) return;
    const byProject = new Map<string, DevSession[]>();
    for (const session of sessions) {
      const list = byProject.get(session.project_id) ?? [];
      list.push(session);
      byProject.set(session.project_id, list);
    }
    setSessionLayoutByProject((current) => {
      let changed = false;
      const next = { ...current };
      for (const [pid, projectSessions] of byProject) {
        const merged = mergeSessionLayout(
          projectSessions,
          next[pid] ?? emptyProjectSessionLayout(),
        );
        const prev = next[pid];
        if (
          !prev ||
          merged.order.join(",") !== prev.order.join(",") ||
          merged.pinned.join(",") !== prev.pinned.join(",")
        ) {
          next[pid] = merged;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [sessionFingerprint, setSessionLayoutByProject]);

  useEffect(() => {
    if (projectId) openProject(projectId);
  }, [projectId, openProject]);

  useEffect(() => {
    for (const pid of sessionProjectIds) {
      openProject(pid);
    }
  }, [sessionProjectIds, openProject]);

  const presenceDetail = useAgentPresenceDetail(wsId, currentSession?.agent_id ?? draftAgent?.id);
  const availability =
    presenceDetail === "loading" ? undefined : presenceDetail?.availability;

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "aicortex_dev_studio_layout",
    storage: typeof window === "undefined" ? undefined : localStorage,
  });

  const navigateTo = useCallback(
    (nextProjectId: string | null, nextSessionId: string | null) => {
      const params = new URLSearchParams();
      if (nextProjectId) params.set("project", nextProjectId);
      if (nextSessionId) params.set("session", nextSessionId);
      const qs = params.toString();
      const target = qs ? `${p.dev()}?${qs}` : p.dev();
      const currentProject = searchParams.get("project");
      const currentSession = searchParams.get("session");
      if (currentProject === (nextProjectId ?? null) && currentSession === (nextSessionId ?? null)) {
        return;
      }
      replace(target);
    },
    [p, replace, searchParams],
  );

  const handleOpenProject = useCallback(
    (id: string) => {
      openProject(id);
      setProjectSheetOpen(false);
      navigateTo(id, null);
    },
    [navigateTo, openProject],
  );

  const handleArchiveSession = useCallback(
    (session: DevSession) => {
      if (sessionId === session.id) {
        navigateTo(session.project_id, null);
      }
      deleteSession.mutate(session.id);
    },
    [deleteSession, navigateTo, sessionId],
  );

  useEffect(() => {
    if (sessionId && currentSession && projectId !== currentSession.project_id) {
      navigateTo(currentSession.project_id, sessionId);
    }
  }, [sessionId, currentSession, projectId, navigateTo]);

  useEffect(() => {
    if (sessionId) {
      void markRead.mutateAsync(sessionId).catch(() => {});
    }
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps -- once per session open, like design studio

  const performSend = useCallback(
    async (targetSessionId: string, content: string, attachmentIds?: string[]) => {
      if (!activeAgent) return;
      const sentAt = new Date().toISOString();
      const optimistic: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        chat_session_id: targetSessionId,
        role: "user",
        content,
        task_id: null,
        created_at: sentAt,
      };
      qc.setQueryData<ChatMessage[]>(chatKeys.messages(targetSessionId), (old) =>
        old ? [...old, optimistic] : [optimistic],
      );
      qc.setQueryData<ChatPendingTask>(chatKeys.pendingTask(targetSessionId), {
        task_id: `optimistic-${optimistic.id}`,
        status: "queued",
        created_at: sentAt,
      });

      await sendChatMessageWithRecovery(
        qc,
        wsId,
        { sessionId: targetSessionId, content, attachmentIds, optimistic },
        async () => targetSessionId,
        activeAgent,
        () => {},
      );
    },
    [activeAgent, qc, wsId],
  );

  const handleSend = useCallback(
    async (content: string, attachmentIds?: string[]) => {
      if (!activeAgent) return;

      if (!sessionId) {
        if (!projectId || !content.trim()) return;
        setCreating(true);
        try {
          const session = await createSession.mutateAsync({
            title: content.trim().slice(0, 80),
            brief: content.trim(),
            agent_id: draftAgentId ?? undefined,
          });
          upsertDevSessionInCache(qc, wsId, session);
          navigateTo(projectId, session.id);
          setComposer("");
          await performSend(session.id, content.trim(), attachmentIds);
        } finally {
          setCreating(false);
        }
        return;
      }

      const existingPending = qc.getQueryData<ChatPendingTask>(chatKeys.pendingTask(sessionId));
      if (shouldEnqueueOutbound(existingPending, 0)) {
        return;
      }
      await performSend(sessionId, content, attachmentIds);
    },
    [createSession, activeAgent, draftAgentId, navigateTo, performSend, projectId, qc, sessionId],
  );

  useFlushOutboundQueue({
    sessionId,
    pendingTask,
    flushItem: useCallback(
      async (item: OutboundQueuedMessage) => {
        if (!sessionId) return;
        await performSend(sessionId, item.content, item.attachmentIds);
      },
      [performSend, sessionId],
    ),
  });

  const handleStop = useCallback(() => {
    if (!pendingTaskId || !sessionId) return;
    qc.setQueryData(chatKeys.pendingTask(sessionId), {});
    qc.invalidateQueries({ queryKey: chatKeys.messages(sessionId) });
    api.cancelTaskById(pendingTaskId).catch(() => {});
  }, [pendingTaskId, sessionId, qc]);

  const handleUploadFile = useCallback(
    async (file: File) => {
      if (!sessionId) return null;
      return uploadWithToast(file, { chatSessionId: sessionId });
    },
    [sessionId, uploadWithToast],
  );

  const hasMessages = messages.length > 0 || !!pendingTaskId;

  const chatMain = (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Terminal className="size-4 shrink-0 text-brand" />
          <span className="min-w-0 truncate text-sm font-medium">
            {currentSession?.title ??
              (projectId
                ? projects.find((item) => item.id === projectId)?.title
                : t(($) => $.shell.title))}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setToolsOpen(!toolsOpen)}
          className={cn(
            "rounded-md p-1.5 transition-colors hover:bg-accent hover:text-foreground",
            toolsOpen ? "bg-accent text-foreground" : "text-muted-foreground",
          )}
          title={t(($) => $.shell.toggle_tools)}
        >
          <PanelRight className="size-4" />
        </button>
      </div>

      {showSkeleton ? (
        <ChatMessageSkeleton />
      ) : sessionId && hasMessages ? (
        <>
          <ChatMessageList
            messages={messages}
            pendingTask={pendingTask}
            availability={availability}
            onFormSubmit={handleSend}
          />
          <OfflineBanner agentName={activeAgent?.name} availability={availability} />
          <ChatInput
            onSend={handleSend}
            onUploadFile={handleUploadFile}
            onStop={handleStop}
            isRunning={!!pendingTaskId}
            disabled={!activeAgent}
            agentName={activeAgent?.name}
            leftAdornment={
              sessionAgent ? (
                <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground">
                  <ActorAvatar actorType="agent" actorId={sessionAgent.id} size={16} showStatusDot />
                  <span className="max-w-[120px] truncate">{sessionAgent.name}</span>
                </span>
              ) : (
                <DevAgentPicker
                  agents={availableAgents}
                  selectedAgent={draftAgent}
                  onSelect={handleDraftAgentSelect}
                  disabled={creating || createSession.isPending}
                />
              )
            }
          />
        </>
      ) : (
        <>
          <div className="flex flex-1 flex-col items-center justify-center px-6">
            <div className="w-full max-w-2xl">
              <div className="mb-6 text-center">
                <MessageSquare className="mx-auto size-10 text-muted-foreground/30" />
                <h1 className="mt-3 font-serif text-2xl font-semibold tracking-tight">
                  {projectId
                    ? t(($) => $.shell.empty_project_title)
                    : t(($) => $.shell.empty_title)}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {projectId
                    ? t(($) => $.shell.empty_project_subtitle)
                    : t(($) => $.shell.empty_subtitle)}
                </p>
              </div>
              {projectId ? (
                <div className="rounded-2xl border bg-card shadow-sm">
                  <textarea
                    className="min-h-[120px] w-full resize-none rounded-t-2xl bg-transparent px-5 py-4 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (composer.trim() && draftAgent) void handleSend(composer.trim());
                      }
                    }}
                    placeholder={t(($) => $.hub.composer_placeholder)}
                  />
                  <div className="flex items-center justify-between border-t px-3 py-2.5">
                    <DevAgentPicker
                      agents={availableAgents}
                      selectedAgent={draftAgent}
                      onSelect={handleDraftAgentSelect}
                      disabled={creating || createSession.isPending}
                      size="md"
                    />
                    <Button
                      size="sm"
                      disabled={!composer.trim() || !draftAgent || creating || createSession.isPending}
                      onClick={() => void handleSend(composer.trim())}
                      className="rounded-full px-4"
                    >
                      <Send className="size-3.5" />
                      {t(($) => $.hub.start_session)}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-center">
                  <Button onClick={() => setProjectSheetOpen(true)}>
                    {t(($) => $.shell.open_project)}
                  </Button>
                </div>
              )}
            </div>
          </div>
          {sessionId && (
            <ChatInput
              onSend={handleSend}
              onUploadFile={handleUploadFile}
              isRunning={false}
              disabled={!activeAgent}
              agentName={activeAgent?.name}
            />
          )}
        </>
      )}
    </main>
  );

  return (
    <div className="flex h-full min-h-0">
      <DevProjectSessionSidebar
        projects={projects}
        sessions={sidebarSessions}
        openedProjectIds={openedProjectIds}
        sessionLayoutByProject={sessionLayoutByProject}
        selectedProjectId={projectId}
        activeSessionId={sessionId}
        sidebarOpen={sidebarOpen}
        deletePending={deleteSession.isPending}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onSelectProject={(id) => {
          openProject(id);
          navigateTo(id, null);
        }}
        onSelectSession={(pid, sid) => navigateTo(pid, sid)}
        onNewSession={(id) => {
          openProject(id);
          navigateTo(id, null);
        }}
        onOpenProject={() => setProjectSheetOpen(true)}
        onSessionLayoutChange={setProjectSessionLayout}
        onArchiveSession={handleArchiveSession}
      />

      <div className="flex min-h-0 min-w-0 flex-1">
        {toolsOpen ? (
          <ResizablePanelGroup
            orientation="horizontal"
            className="min-h-0 flex-1"
            defaultLayout={defaultLayout}
            onLayoutChanged={onLayoutChanged}
          >
            <ResizablePanel defaultSize={58} minSize={35}>
              {chatMain}
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={42} minSize={25}>
              <DevToolsSidebar
                session={currentSession ?? null}
                activeTab={toolsTab}
                onTabChange={(tab: DevToolsTab) => setToolsTab(tab)}
                lastTaskId={lastTaskId}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          chatMain
        )}
      </div>

      <Sheet open={projectSheetOpen} onOpenChange={setProjectSheetOpen}>
        <SheetContent side="left" className="w-full max-w-lg p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle>{t(($) => $.shell.open_project)}</SheetTitle>
          </SheetHeader>
          <DevProjectPicker
            embedded
            onSelectProject={handleOpenProject}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
