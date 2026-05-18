"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Plus, Trash2, Pencil, Check, X, FolderKanban, ChevronDown } from "lucide-react";
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
  useCreateChatSession,
  useDeleteChatSession,
  useMarkChatSessionRead,
  useUpdateChatSession,
} from "@aicortex/core/chat/mutations";
import { useChatStore } from "@aicortex/core/chat";
import { useAgentPresenceDetail, useWorkspaceAgentAvailability } from "@aicortex/core/agents";
import { useFileUpload } from "@aicortex/core/hooks/use-file-upload";
import { useAuthStore } from "@aicortex/core/auth";
import { api } from "@aicortex/core/api";
import { canAssignAgent } from "@aicortex/views/issues/components";
import type { Agent, ChatSession, ChatMessage, ChatPendingTask } from "@aicortex/core/types";
import { cn } from "@aicortex/ui/lib/utils";
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

  const createSession = useCreateChatSession();
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

  // Lazy session creation
  const sessionPromiseRef = useRef<Promise<string | null> | null>(null);
  const ensureSession = useCallback(
    async (titleSeed: string): Promise<string | null> => {
      if (activeSessionId) return activeSessionId;
      if (!activeAgent) return null;
      if (sessionPromiseRef.current) return sessionPromiseRef.current;

      const promise = (async () => {
        try {
          const session = await createSession.mutateAsync({
            agent_id: activeAgent.id,
            title: titleSeed.slice(0, 50),
            ...(selectedProjectId ? { project_id: selectedProjectId } : {}),
          });
          return session.id;
        } finally {
          sessionPromiseRef.current = null;
        }
      })();
      sessionPromiseRef.current = promise;
      return promise;
    },
    [activeSessionId, activeAgent, createSession, selectedProjectId],
  );

  // File upload
  const handleUploadFile = useCallback(
    async (file: File) => {
      const sessionId = await ensureSession("");
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
  const handleSend = useCallback(
    async (content: string, attachmentIds?: string[]) => {
      if (!activeAgent) return;

      const focusOn = useChatStore.getState().focusMode;
      const finalContent = focusOn && anchorCandidate
        ? `${buildAnchorMarkdown(anchorCandidate)}\n\n${content}`
        : content;

      const sessionId = await ensureSession(finalContent);
      if (!sessionId) return;

      const sentAt = new Date().toISOString();
      const optimistic: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        chat_session_id: sessionId,
        role: "user",
        content: finalContent,
        task_id: null,
        created_at: sentAt,
      };
      qc.setQueryData<ChatMessage[]>(
        chatKeys.messages(sessionId),
        (old) => (old ? [...old, optimistic] : [optimistic]),
      );
      qc.setQueryData<ChatPendingTask>(chatKeys.pendingTask(sessionId), {
        task_id: `optimistic-${optimistic.id}`,
        status: "queued",
        created_at: sentAt,
      });
      setActiveSession(sessionId);

      const result = await api.sendChatMessage(sessionId, finalContent, attachmentIds);
      qc.setQueryData<ChatPendingTask>(chatKeys.pendingTask(sessionId), {
        task_id: result.task_id,
        status: "queued",
        created_at: result.created_at,
      });
      qc.invalidateQueries({ queryKey: chatKeys.messages(sessionId) });
    },
    [activeAgent, anchorCandidate, ensureSession, qc, setActiveSession],
  );

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

  return (
    <div className="flex h-full min-h-0">
      {/* Left: Session list */}
      <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex h-12 items-center justify-between border-b px-4">
          <h2 className="text-sm font-medium">{t(($) => $.window.chats)}</h2>
          <button
            type="button"
            onClick={handleNewChat}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="新建会话"
          >
            <Plus className="size-4" />
          </button>
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

      {/* Right: Chat area */}
      <main className="flex min-w-0 flex-1 flex-col bg-background">
        {showSkeleton ? (
          <ChatMessageSkeleton />
        ) : hasMessages ? (
          <>
            <ChatMessageList
              messages={messages}
              pendingTask={pendingTask}
              availability={availability}
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
