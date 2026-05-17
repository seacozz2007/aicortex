"use client";

import { useEffect, useMemo } from "react";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { agentListOptions } from "@aicortex/core/workspace/queries";
import { chatSessionsOptions } from "@aicortex/core/chat/queries";
import { useDeleteChatSession } from "@aicortex/core/chat/mutations";
import { useChatStore } from "@aicortex/core/chat";
import type { ChatSession, Agent } from "@aicortex/core/types";
import { cn } from "@aicortex/ui/lib/utils";
import { ActorAvatar } from "../../common/actor-avatar";

/**
 * Full-page chat view. Reuses the existing ChatWindow (rendered via the
 * dashboard layout's `extra` slot) by forcing it open + expanded on mount.
 * This page adds a persistent left sidebar with the session list.
 */
export function ChatPage() {
  const wsId = useWorkspaceId();
  const setOpen = useChatStore((s) => s.setOpen);
  const setExpanded = useChatStore((s) => s.setExpanded);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const setActiveSession = useChatStore((s) => s.setActiveSession);

  const { data: sessions = [] } = useQuery(chatSessionsOptions(wsId));
  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const deleteSession = useDeleteChatSession();

  // Force chat window open + expanded when this page mounts
  useEffect(() => {
    setOpen(true);
    setExpanded(true);
    return () => {
      // Collapse back when leaving the page
      setExpanded(false);
    };
  }, [setOpen, setExpanded]);

  const activeSessions = useMemo(() => sessions.filter((s) => s.status === "active"), [sessions]);
  const archivedSessions = useMemo(() => sessions.filter((s) => s.status === "archived"), [sessions]);

  const handleNewChat = () => {
    setActiveSession(null);
  };

  const handleDelete = (id: string) => {
    deleteSession.mutate(id);
    if (activeSessionId === id) setActiveSession(null);
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Left: Session list */}
      <aside className="flex w-72 shrink-0 flex-col border-r bg-card">
        <div className="flex h-12 items-center justify-between border-b px-4">
          <h2 className="text-sm font-medium">会话</h2>
          <button
            type="button"
            onClick={handleNewChat}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <MessageSquare className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">暂无会话</p>
              <p className="text-xs text-muted-foreground">点击 + 开始新对话</p>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {activeSessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  agents={agents}
                  isActive={session.id === activeSessionId}
                  onSelect={() => setActiveSession(session.id)}
                  onDelete={() => handleDelete(session.id)}
                />
              ))}
              {archivedSessions.length > 0 && (
                <>
                  <p className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground">已归档</p>
                  {archivedSessions.map((session) => (
                    <SessionItem
                      key={session.id}
                      session={session}
                      agents={agents}
                      isActive={session.id === activeSessionId}
                      onSelect={() => setActiveSession(session.id)}
                      onDelete={() => handleDelete(session.id)}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Right: ChatWindow renders here via the dashboard layout's `extra` slot.
          It's already open+expanded, filling the remaining space. We just need
          this empty area so the layout doesn't collapse. */}
      <main className="flex-1" />
    </div>
  );
}

function SessionItem({
  session,
  agents,
  isActive,
  onSelect,
  onDelete,
}: {
  session: ChatSession;
  agents: Agent[];
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const agent = agents.find((a) => a.id === session.agent_id);
  const time = getRelativeTime(session.updated_at || session.created_at);

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
        <p className="truncate font-medium">{session.title || "Untitled"}</p>
        <p className="truncate text-xs text-muted-foreground">{time}</p>
      </div>
      {session.has_unread && (
        <span className="size-1.5 shrink-0 rounded-full bg-brand" />
      )}
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

function getRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}
