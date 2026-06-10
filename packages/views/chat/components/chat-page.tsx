"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { MessageSquare, Plus, Trash2, Pencil, Check, X, FolderKanban, ChevronDown, PanelLeftClose, PanelLeftOpen, PanelRight } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aicortex/ui/components/ui/dropdown-menu";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { agentListOptions, memberListOptions } from "@aicortex/core/workspace/queries";
import { projectListOptions } from "@aicortex/core/projects/queries";
import {
  chatSessionsOptions,
  chatMessagesOptions,
  pendingChatTaskOptions,
  chatKeys,
} from "@aicortex/core/chat/queries";
import {
  useDeleteChatSession,
  useMarkChatSessionRead,
  useUpdateChatSession,
} from "@aicortex/core/chat/mutations";
import { useChatStore } from "@aicortex/core/chat";
import { useEnsureChatSession } from "@aicortex/core/chat/ensure-session";
import { sendChatMessageWithRecovery } from "@aicortex/core/chat/send-message";
import { shouldEnqueueOutbound, type OutboundQueuedMessage } from "@aicortex/core/chat/outbound-queue";
import { useFlushOutboundQueue } from "@aicortex/core/chat/use-flush-outbound-queue";
import { useStaleChatSessionGuard } from "@aicortex/core/chat/stale-session-guard";
import { useAgentPresenceDetail, useWorkspaceAgentAvailability } from "@aicortex/core/agents";
import { useFileUpload } from "@aicortex/core/hooks/use-file-upload";
import { useAuthStore } from "@aicortex/core/auth";
import { api } from "@aicortex/core/api";
import { createLogger } from "@aicortex/core/logger";

const apiLogger = createLogger("chat.api");
import {
  useArtifactBrowseFeature,
  useRuntimeTunnelFeature,
} from "@aicortex/core/config/features";
import { useWorkspaceExploreEnabled } from "@aicortex/core/workspace/hooks";
import { getCurrentSlug } from "@aicortex/core/platform";
import { canAssignAgent } from "@aicortex/views/issues/components";
import type { Agent, ChatSession, ChatMessage, ChatPendingTask } from "@aicortex/core/types";
import { cn } from "@aicortex/ui/lib/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@aicortex/ui/components/ui/resizable";
import { useT } from "../../i18n";
import { ActorAvatar } from "../../common/actor-avatar";
import { ChatMessageList, ChatMessageSkeleton } from "./chat-message-list";
import { ChatInput } from "./chat-input";
import { OfflineBanner } from "./offline-banner";
import { NoAgentBanner } from "./no-agent-banner";
import {
  ContextAnchorButton,
  ContextAnchorCard,
  buildAnchorMarkdown,
  useRouteAnchorCandidate,
} from "./context-anchor";
import { ChatToolsSidebar } from "./chat-tools-sidebar";

const TOOLS_SIDEBAR_STORAGE_KEY = "aicortex:chat:tools-sidebar-open";

function toolsSidebarStorageKey() {
  const slug = getCurrentSlug();
  return slug ? `${TOOLS_SIDEBAR_STORAGE_KEY}:${slug}` : TOOLS_SIDEBAR_STORAGE_KEY;
}

function readToolsSidebarOpen(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(toolsSidebarStorageKey()) === "true";
}

export function ChatPage() {
  const { t } = useT("chat");
  const wsId = useWorkspaceId();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const selectedAgentId = useChatStore((s) => s.selectedAgentId);
  const selectedProjectId = useChatStore((s) => s.selectedProjectId);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const setSelectedAgentId = useChatStore((s) => s.setSelectedAgentId);
  const setSelectedProjectId = useChatStore((s) => s.setSelectedProjectId);

  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const { data: sessions = [] } = useQuery(chatSessionsOptions(wsId));
  useStaleChatSessionGuard(activeSessionId);
  const { data: projects = [] } = useQuery(projectListOptions(wsId));
  const { data: rawMessages, isLoading: messagesLoading } = useQuery(
    chatMessagesOptions(activeSessionId ?? ""),
  );
  const messages = activeSessionId ? rawMessages ?? [] : [];
  const showSkeleton = !!activeSessionId && messagesLoading;

  const { data: pendingTask } = useQuery(
    pendingChatTaskOptions(activeSessionId ?? ""),
  );
  const pendingTaskId = pendingTask?.task_id ?? null;

  const currentSession = activeSessionId
    ? sessions.find((s) => s.id === activeSessionId)
    : null;
  const isSessionArchived = currentSession?.status === "archived";

  const deleteSession = useDeleteChatSession();
  const markRead = useMarkChatSessionRead();
  const updateSession = useUpdateChatSession();

  const currentMember = members.find((m) => m.user_id === user?.id);
  const availableAgents = agents.filter(
    (a) => !a.archived_at && canAssignAgent(a, user?.id, currentMember?.role),
  );
  const activeAgent =
    availableAgents.find((a) => a.id === selectedAgentId) ??
    availableAgents.find((a) => a.id === currentSession?.agent_id) ??
    availableAgents[0] ??
    null;

  const agentAvailability = useWorkspaceAgentAvailability();
  const noAgent = agentAvailability === "none";

  const presenceDetail = useAgentPresenceDetail(wsId, activeAgent?.id);
  const availability =
    presenceDetail === "loading" ? undefined : presenceDetail?.availability;

  // Auto mark-as-read
  const currentHasUnread = currentSession?.has_unread ?? false;
  useEffect(() => {
    if (!activeSessionId || !currentHasUnread) return;
    markRead.mutate(activeSessionId);
  }, [activeSessionId, currentHasUnread, markRead]);

  // Close the floating chat window when this page is active
  useEffect(() => {
    useChatStore.getState().setOpen(false);
  }, []);

  // Focus-mode anchor
  const { candidate: anchorCandidate } = useRouteAnchorCandidate(wsId);
  const { uploadWithToast } = useFileUpload(api);

  const ensureSession = useEnsureChatSession();

  // File upload
  const handleUploadFile = useCallback(
    async (file: File) => {
      const sessionId = await ensureSession("", activeAgent);
      if (!sessionId) return null;
      qc.setQueryData<ChatMessage[]>(
        chatKeys.messages(sessionId),
        (old) => old ?? [],
      );
      setActiveSession(sessionId);
      return uploadWithToast(file, { chatSessionId: sessionId });
    },
    [ensureSession, uploadWithToast, qc, setActiveSession],
  );

  // Send message
  const performSend = useCallback(
    async (sessionId: string, finalContent: string, attachmentIds?: string[]) => {
      if (!activeAgent) return;

      const sentAt = new Date().toISOString();
      const optimistic: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        chat_session_id: sessionId,
        role: "user",
        content: finalContent,
        task_id: null,
        created_at: sentAt,
      };
      qc.setQueryData<ChatMessage[]>(chatKeys.messages(sessionId), (old) =>
        old ? [...old, optimistic] : [optimistic],
      );
      qc.setQueryData<ChatPendingTask>(chatKeys.pendingTask(sessionId), {
        task_id: `optimistic-${optimistic.id}`,
        status: "queued",
        created_at: sentAt,
      });
      setActiveSession(sessionId);

      await sendChatMessageWithRecovery(
        qc,
        wsId,
        { sessionId, content: finalContent, attachmentIds, optimistic },
        ensureSession,
        activeAgent,
        setActiveSession,
      );
    },
    [activeAgent, ensureSession, qc, setActiveSession, wsId],
  );

  const handleSend = useCallback(
    async (content: string, attachmentIds?: string[]) => {
      try {
        if (!activeAgent) return;

        const focusOn = useChatStore.getState().focusMode;
        const finalContent = focusOn && anchorCandidate
          ? `${buildAnchorMarkdown(anchorCandidate)}\n\n${content}`
          : content;

        const sessionId = await ensureSession(finalContent, activeAgent);
        if (!sessionId) return;

        const existingPending = qc.getQueryData<ChatPendingTask>(
          chatKeys.pendingTask(sessionId),
        );
        const localQueue = useChatStore.getState().outboundQueues[sessionId] ?? [];
        if (shouldEnqueueOutbound(existingPending, localQueue.length)) {
          useChatStore.getState().enqueueOutbound(sessionId, {
            id: crypto.randomUUID(),
            content: finalContent,
            attachmentIds,
          });
          setActiveSession(sessionId);
          return;
        }

        await performSend(sessionId, finalContent, attachmentIds);
      } catch (err) {
        apiLogger.error("handleSend.failed", err);
      }
    },
    [activeAgent, anchorCandidate, ensureSession, performSend, qc, setActiveSession],
  );

  useFlushOutboundQueue({
    sessionId: activeSessionId,
    pendingTask,
    flushItem: useCallback(
      async (item: OutboundQueuedMessage) => {
        if (!activeSessionId) return;
        await performSend(activeSessionId, item.content, item.attachmentIds);
      },
      [activeSessionId, performSend],
    ),
  });

  // Stop task
  const handleStop = useCallback(() => {
    if (!pendingTaskId || !activeSessionId) return;
    qc.setQueryData(chatKeys.pendingTask(activeSessionId), {});
    qc.invalidateQueries({ queryKey: chatKeys.messages(activeSessionId) });
    api.cancelTaskById(pendingTaskId).catch(() => {});
  }, [pendingTaskId, activeSessionId, qc]);

  const handleNewChat = () => setActiveSession(null);

  const handleSelectAgent = (agent: Agent) => {
    if (activeAgent && agent.id === activeAgent.id) return;
    setSelectedAgentId(agent.id);
    setActiveSession(null);
  };

  const handleDelete = (id: string) => {
    deleteSession.mutate(id);
    if (activeSessionId === id) setActiveSession(null);
  };

  const handleRename = (id: string, title: string) => {
    updateSession.mutate({ sessionId: id, title });
  };

  const activeSessions = useMemo(() => sessions.filter((s) => s.status === "active"), [sessions]);
  const archivedSessions = useMemo(() => sessions.filter((s) => s.status === "archived"), [sessions]);
  const hasMessages = messages.length > 0 || !!pendingTaskId;
  const [sessionListOpen, setSessionListOpen] = useState(true);
  const artifactBrowseEnabled = useArtifactBrowseFeature();
  const runtimeTunnelEnabled = useRuntimeTunnelFeature();
  const exploreEnabled = useWorkspaceExploreEnabled();
  const canUseTools =
    artifactBrowseEnabled ||
    runtimeTunnelEnabled ||
    (exploreEnabled && !!currentSession?.runtime_id);
  const [toolsSidebarOpen, setToolsSidebarOpen] = useState(readToolsSidebarOpen);
  const { defaultLayout: toolsLayout, onLayoutChanged: onToolsLayoutChanged } = useDefaultLayout({
    id: "aicortex_chat_tools_layout",
  });
  const showToolsSidebar = canUseTools && toolsSidebarOpen;

  useEffect(() => {
    if (!canUseTools) return;
    localStorage.setItem(toolsSidebarStorageKey(), String(toolsSidebarOpen));
  }, [toolsSidebarOpen, canUseTools]);

  const activeSessionTitle =
    currentSession?.title ||
    (activeSessionId ? t(($) => $.session_history.untitled) : t(($) => $.window.untitled));

  const chatMain = (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
        <div className="flex min-w-0 items-center gap-2">
          {!sessionListOpen && (
            <button
              type="button"
              onClick={() => setSessionListOpen(true)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title={t(($) => $.session_list.expand_tooltip)}
            >
              <PanelLeftOpen className="size-4" />
            </button>
          )}
          {(!sessionListOpen || activeSessionId) && (
            <span className="min-w-0 truncate text-sm text-muted-foreground">
              {activeSessionTitle}
            </span>
          )}
        </div>
        {canUseTools && (
          <button
            type="button"
            onClick={() => setToolsSidebarOpen((open) => !open)}
            className={cn(
              "rounded-md p-1.5 transition-colors hover:bg-accent hover:text-foreground",
              toolsSidebarOpen ? "bg-accent text-foreground" : "text-muted-foreground",
            )}
            title={t(($) => $.tools_sidebar.toggle_tooltip)}
          >
            <PanelRight className="size-4" />
          </button>
        )}
      </div>
      {showSkeleton ? (
        <ChatMessageSkeleton />
      ) : hasMessages ? (
        <>
          <ChatMessageList
            messages={messages}
            pendingTask={pendingTask}
            availability={availability}
            onFormSubmit={handleSend}
          />
          {noAgent ? (
            <NoAgentBanner />
          ) : (
            <OfflineBanner agentName={activeAgent?.name} availability={availability} />
          )}
          <ChatInput
            onSend={handleSend}
            onUploadFile={handleUploadFile}
            onStop={handleStop}
            isRunning={!!pendingTaskId}
            disabled={isSessionArchived}
            noAgent={noAgent}
            agentName={activeAgent?.name}
            topSlot={<ContextAnchorCard />}
            leftAdornment={
              <AgentPicker
                agents={availableAgents}
                activeAgent={activeAgent}
                onSelect={handleSelectAgent}
              />
            }
            rightAdornment={<ContextAnchorButton />}
          />
        </>
      ) : (
        <>
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <MessageSquare className="mx-auto size-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">
                {activeAgent ? t(($) => $.empty_state.chat_with_name, { name: activeAgent.name }) : t(($) => $.empty_state.select_agent)}
              </p>
            </div>
          </div>
          {noAgent ? (
            <NoAgentBanner />
          ) : (
            <OfflineBanner agentName={activeAgent?.name} availability={availability} />
          )}
          <ChatInput
            onSend={handleSend}
            onUploadFile={handleUploadFile}
            isRunning={false}
            noAgent={noAgent}
            agentName={activeAgent?.name}
            topSlot={<ContextAnchorCard />}
            leftAdornment={
              <>
                <AgentPicker
                  agents={availableAgents}
                  activeAgent={activeAgent}
                  onSelect={handleSelectAgent}
                />
                {!activeSessionId && (
                  <ProjectPicker
                    projects={projects}
                    selectedProjectId={selectedProjectId}
                    onSelect={setSelectedProjectId}
                  />
                )}
              </>
            }
            rightAdornment={<ContextAnchorButton />}
          />
        </>
      )}
    </main>
  );

  return (
    <div className="flex h-full min-h-0">
      {/* Left: Session list */}
      {sessionListOpen && (
        <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar">
          <div className="flex h-12 items-center justify-between border-b px-4">
            <h2 className="text-sm font-medium">{t(($) => $.window.chats)}</h2>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={handleNewChat}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title={t(($) => $.window.new_chat_tooltip)}
              >
                <Plus className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setSessionListOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title={t(($) => $.session_list.collapse_tooltip)}
              >
                <PanelLeftClose className="size-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                <MessageSquare className="size-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">{t(($) => $.window.no_previous)}</p>
              </div>
            ) : (
              <div className="p-2 space-y-0.5">
                {activeSessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    agents={agents}
                    projects={projects}
                    isActive={session.id === activeSessionId}
                    onSelect={() => setActiveSession(session.id)}
                    onDelete={() => handleDelete(session.id)}
                    onRename={(title) => handleRename(session.id, title)}
                  />
                ))}
                {archivedSessions.length > 0 && (
                  <>
                    <p className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground">
                      {t(($) => $.window.archived_group, { count: archivedSessions.length })}
                    </p>
                    {archivedSessions.map((session) => (
                      <SessionItem
                        key={session.id}
                        session={session}
                        agents={agents}
                        projects={projects}
                        isActive={session.id === activeSessionId}
                        onSelect={() => setActiveSession(session.id)}
                        onDelete={() => handleDelete(session.id)}
                        onRename={(title) => handleRename(session.id, title)}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Center + optional resizable tools sidebar */}
      <div className="flex min-h-0 min-w-0 flex-1">
        {showToolsSidebar ? (
          <ResizablePanelGroup
            orientation="horizontal"
            className="min-h-0 flex-1"
            defaultLayout={toolsLayout}
            onLayoutChanged={onToolsLayoutChanged}
          >
            <ResizablePanel id="chat" minSize="20%">
              {chatMain}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="tools"
              defaultSize="42%"
              minSize={360}
              maxSize="80%"
              groupResizeBehavior="preserve-pixel-size"
            >
              <ChatToolsSidebar session={currentSession ?? null} />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          chatMain
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function AgentPicker({
  agents,
  activeAgent,
  onSelect,
}: {
  agents: Agent[];
  activeAgent: Agent | null;
  onSelect: (agent: Agent) => void;
}) {
  const { t } = useT("chat");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md px-1.5 py-1 -ml-1 cursor-pointer outline-none transition-colors hover:bg-accent aria-expanded:bg-accent">
        {activeAgent ? (
          <>
            <ActorAvatar actorType="agent" actorId={activeAgent.id} size={22} showStatusDot />
            <span className="text-xs font-medium max-w-24 truncate">{activeAgent.name}</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">{t(($) => $.window.select_agent)}</span>
        )}
        <ChevronDown className="size-2.5 text-muted-foreground shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="max-h-60 w-auto max-w-56">
        <DropdownMenuGroup>
          {agents.map((agent) => (
            <DropdownMenuItem
              key={agent.id}
              onClick={() => onSelect(agent)}
              className="flex items-center gap-2"
            >
              <ActorAvatar actorType="agent" actorId={agent.id} size={20} showStatusDot />
              <span className="truncate flex-1 text-sm">{agent.name}</span>
              {agent.id === activeAgent?.id && <Check className="size-3.5 text-brand shrink-0" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectPicker({
  projects,
  selectedProjectId,
  onSelect,
}: {
  projects: { id: string; title: string }[];
  selectedProjectId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { t } = useT("chat");
  const active = projects.find((p) => p.id === selectedProjectId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 rounded-md px-1.5 py-1 cursor-pointer outline-none transition-colors hover:bg-accent aria-expanded:bg-accent text-xs text-muted-foreground">
        <FolderKanban className="size-3" />
        <span className="max-w-20 truncate">{active?.title ?? t(($) => $.window.no_project)}</span>
        <ChevronDown className="size-2.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="max-h-60 w-auto max-w-56">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onSelect(null)}>
            <span className="text-muted-foreground">{t(($) => $.window.no_project)}</span>
            {!selectedProjectId && <Check className="size-3.5 text-muted-foreground ml-auto" />}
          </DropdownMenuItem>
          {projects.map((project) => (
            <DropdownMenuItem key={project.id} onClick={() => onSelect(project.id)} className="flex items-center gap-2">
              <span className="truncate flex-1">{project.title}</span>
              {project.id === selectedProjectId && <Check className="size-3.5 text-brand shrink-0" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SessionItem({
  session,
  agents,
  projects,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: {
  session: ChatSession;
  agents: Agent[];
  projects: { id: string; title: string }[];
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}) {
  const { t } = useT("chat");
  const agent = agents.find((a) => a.id === session.agent_id);
  const project = session.project_id ? projects.find((p) => p.id === session.project_id) : null;
  const time = getRelativeTime(session.updated_at || session.created_at, t);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(session.title);

  const commitRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== session.title) onRename(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 rounded-lg px-3 py-2 bg-accent">
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditing(false); }}
          onBlur={commitRename}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <button type="button" onClick={commitRename} className="p-0.5 text-success"><Check className="size-3" /></button>
        <button type="button" onClick={() => setEditing(false)} className="p-0.5 text-muted-foreground"><X className="size-3" /></button>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter") onSelect(); }}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent cursor-pointer",
        isActive && "bg-accent"
      )}
    >
      {agent && <ActorAvatar actorType="agent" actorId={agent.id} size={20} />}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{session.title || t(($) => $.session_history.untitled)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {project ? `${project.title} · ` : ""}{time}
        </p>
      </div>
      {session.has_unread && (
        <span className="size-1.5 shrink-0 rounded-full bg-brand" />
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setEditing(true); setEditValue(session.title); }}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Pencil className="size-3" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}

function getRelativeTime(iso: string, t: (...args: any[]) => any): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t(($: any) => $.session_history.time.just_now);
  if (mins < 60) return t(($: any) => $.session_history.time.minutes, { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t(($: any) => $.session_history.time.hours, { count: hours });
  const days = Math.floor(hours / 24);
  return t(($: any) => $.session_history.time.days, { count: days });
}
