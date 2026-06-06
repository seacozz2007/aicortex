"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Brain, Clock, ChevronDown, ChevronRight, Copy, Plus, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@aicortex/ui/components/ui/avatar";
import { Button } from "@aicortex/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@aicortex/ui/components/ui/collapsible";
import { useAutoScroll } from "@aicortex/ui/hooks/use-auto-scroll";
import { useScrollFade } from "@aicortex/ui/hooks/use-scroll-fade";
import type { ChatSharePublicInfo } from "@aicortex/core/types";
import type { UploadResult } from "@aicortex/core/hooks/use-file-upload";
import { ChatInput } from "../../chat/components/chat-input";
import { ChatBubble } from "../../chat/components/chat-bubble";
import { Markdown } from "../../common/markdown";
import { useT } from "../../i18n";

// ─── Types ────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  streaming?: boolean;
  thinking?: string;
  elapsedMs?: number;
  taskId?: string;
}

interface SessionInfo {
  id: string;
  title: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function getVisitorId(): string {
  const key = "aicortex_visitor_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

// ─── Component ────────────────────────────────────────────────────────────

interface ChatSharePublicViewProps {
  token: string;
  info: ChatSharePublicInfo;
  /** Backend API base URL for fetch calls (bypasses Next.js rewrite). */
  apiBase?: string;
}

export function ChatSharePublicView({ token, info, apiBase = "" }: ChatSharePublicViewProps) {
  const { t } = useT("chat-share");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = useState(false);

  // Session management (when allow_new_sessions)
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const visitorId = useMemo(() => getVisitorId(), []);
  const agentName = info.agent_name ?? t(($) => $.public.agent_default_name);

  useAutoScroll(scrollRef);
  const fadeStyle = useScrollFade(scrollRef);

  // ── Load / create session ───────────────────────────────────────────

  useEffect(() => {
    if (activeSessionId) return; // already initialized

    (async () => {
      try {
        if (info.allow_new_sessions) {
          // List existing sessions
          const res = await fetch(`${apiBase}/e/${token}/sessions?visitor_id=${visitorId}`);
          const data = await res.json();
          if (data.sessions?.length > 0) {
            setSessions(data.sessions);
            setActiveSessionId(data.sessions[0].id);
            return;
          }
        }
        // Create a session (first-time or single-session mode)
        const createRes = await fetch(`${apiBase}/e/${token}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visitor_id: visitorId }),
        });
        const createData = await createRes.json();
        if (createData.id) {
          setActiveSessionId(createData.id);
          if (info.allow_new_sessions) {
            setSessions([{ id: createData.id, title: "Chat" }]);
          }
        }
      } catch { /* ignore */ }
    })();
  }, [token, visitorId, info.allow_new_sessions, activeSessionId, apiBase]);

  // ── Load messages when session changes ──────────────────────────────

  useEffect(() => {
    if (!activeSessionId) return;
    setLoadingMessages(true);
    (async () => {
      try {
        const res = await fetch(`${apiBase}/e/${token}/sessions/${activeSessionId}/messages`);
        const data = await res.json();
        const msgs = (data.messages ?? []) as Array<{
          id: string; role: string; content: string; task_id?: string;
        }>;
        const filtered = msgs
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id,
            role: m.role === "assistant" ? "agent" : "user",
            content: m.content,
            taskId: m.task_id ?? undefined,
          })) as ChatMessage[];
        setMessages(filtered);
      } catch { /* ignore */ }
      setLoadingMessages(false);
    })();
  }, [token, activeSessionId, apiBase]);

  // ── WebSocket ──────────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (!activeSessionId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Use apiBase host for WebSocket (backend), not the Next.js dev server.
    const wsBase = apiBase
      ? apiBase.replace(/^http/, "ws")
      : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
    const ws = new WebSocket(`${wsBase}/e/${token}/ws`);
    wsRef.current = ws;

    ws.onopen = () => { setConnected(true); setReconnecting(false); };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type?: string; content?: string; message_type?: string;
          task_id?: string; elapsed_ms?: number;
        };
        switch (data.type) {
          case "task_message": {
            setIsRunning(true);
            const msgType = data.message_type ?? "text";
            const isThinking = msgType === "thinking" || msgType === "reasoning";
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (isThinking) {
                if (last?.role === "agent" && last.taskId === data.task_id) {
                  const u = [...prev];
                  u[u.length - 1] = { ...last, thinking: (last.thinking ?? "") + (data.content ?? "") };
                  return u;
                }
                return [...prev, { id: crypto.randomUUID(), role: "agent", content: "", thinking: data.content ?? "", streaming: true, taskId: data.task_id }];
              }
              if (last?.streaming && last.role === "agent" && last.taskId === data.task_id) {
                const u = [...prev];
                u[u.length - 1] = { ...last, content: last.content + (data.content ?? "") };
                return u;
              }
              return [...prev, { id: crypto.randomUUID(), role: "agent", content: data.content ?? "", streaming: true, taskId: data.task_id }];
            });
            break;
          }
          case "message": {
            setIsRunning(false);
            setMessages((prev) => {
              const u = [...prev];
              const last = u[u.length - 1];
              if (last?.streaming && last.role === "agent" && last.taskId === data.task_id) {
                u[u.length - 1] = { ...last, content: data.content ?? last.content, streaming: false, elapsedMs: data.elapsed_ms };
              } else {
                u.push({ id: crypto.randomUUID(), role: "agent", content: data.content ?? "", elapsedMs: data.elapsed_ms, taskId: data.task_id });
              }
              return u;
            });
            break;
          }
        }
      } catch { /* ignore */ }
    };
    ws.onclose = () => { setConnected(false); setIsRunning(false);
      if (!reconnectTimerRef.current) {
        setReconnecting(true);
        reconnectTimerRef.current = setTimeout(() => { reconnectTimerRef.current = null; connect(); }, 3000);
      }
    };
    ws.onerror = () => ws.close();
  }, [token, activeSessionId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // ── Send ───────────────────────────────────────────────────────────

  const handleSend = useCallback((content: string, attachmentIds?: string[]) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content }]);
    wsRef.current.send(JSON.stringify({
      visitor_id: visitorId,
      message: content,
      attachment_ids: attachmentIds ?? [],
    }));
  }, [visitorId]);

  const handleUpload = useCallback(async (file: File): Promise<UploadResult | null> => {
    if (!activeSessionId) return null;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("visitor_id", visitorId);
    const res = await fetch(`${apiBase}/e/${token}/upload`, { method: "POST", body: formData });
    if (!res.ok) return null;
    return res.json();
  }, [token, visitorId, activeSessionId]);

  const handleStop = useCallback(() => {
    wsRef.current?.close();
    setIsRunning(false);
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => { reconnectTimerRef.current = null; connect(); }, 500);
  }, [connect]);

  // ── Sessions ──────────────────────────────────────────────────────

  const handleCreateSession = async () => {
    try {
      const res = await fetch(`${apiBase}/e/${token}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitor_id: visitorId }),
      });
      const data = await res.json();
      if (data.id) {
        setSessions((prev) => [...prev, { id: data.id, title: "New Chat" }]);
        setActiveSessionId(data.id);
        setMessages([]);
      }
    } catch { /* ignore */ }
  };

  const toggleThinking = (id: string) => {
    setExpandedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
  }, []);

  const isActive = info.status === "active";
  if (!isActive) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium text-muted-foreground">
            {info.status === "expired" && t(($) => $.public.status_expired)}
            {info.status === "disabled" && t(($) => $.public.status_disabled)}
            {info.status === "max_reached" && t(($) => $.public.status_max_reached)}
            {info.status === "invalid" && t(($) => $.public.status_invalid)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="shrink-0 flex items-center gap-3 h-12 px-4 border-b bg-card">
        <Avatar className="h-7 w-7">
          {info.agent_avatar_url && <AvatarImage src={info.agent_avatar_url} />}
          <AvatarFallback>{agentName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{agentName}</p>
          {(!connected || reconnecting) && (
            <p className="text-xs text-muted-foreground">
              {reconnecting ? t(($) => $.public.reconnecting) : t(($) => $.public.disconnected)}
            </p>
          )}
        </div>
      </header>

      {/* Session Tabs (when allow_new_sessions) */}
      {info.allow_new_sessions && sessions.length > 0 && (
        <div className="shrink-0 flex items-center gap-1 px-4 py-1.5 border-b bg-muted/30 overflow-x-auto">
          {sessions.map((s) => (
            <Button
              key={s.id}
              variant={s.id === activeSessionId ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setActiveSessionId(s.id)}
            >
              <MessageSquare className="h-3 w-3 mr-1" />
              {s.title}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={handleCreateSession}
          >
            <Plus className="h-3 w-3 mr-1" />
            {t(($) => $.public.new_session)}
          </Button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={fadeStyle} className="flex-1 overflow-y-auto">
        {loadingMessages ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            {t(($) => $.public.loading)}
          </div>
        ) : (
          <div className="mx-auto w-full max-w-4xl px-5 py-4 space-y-4">
            {info.guide_message && !messages.some((m) => m.role === "agent") && (
              <ChatBubble role="agent" content={info.guide_message} />
            )}
            {messages.map((msg) => (
              <div key={msg.id} className="space-y-1.5">
                {msg.thinking && (
                  <Collapsible open={expandedThinking.has(msg.id)} onOpenChange={() => toggleThinking(msg.id)}>
                    <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      {expandedThinking.has(msg.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      <Brain className="h-3 w-3" />
                      <span>{t(($) => $.public.thinking)}</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-1.5 ml-6 pl-3 border-l-2 border-muted">
                      <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                        <Markdown>{msg.thinking}</Markdown>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
                {msg.content && <ChatBubble role={msg.role} content={msg.content} streaming={msg.streaming} />}
                {msg.role === "agent" && !msg.streaming && msg.content && (
                  <div className="flex items-center gap-2 ml-1 text-xs text-muted-foreground">
                    {msg.elapsedMs != null && msg.elapsedMs > 0 && (
                      <><Clock className="h-3 w-3" /><span>{formatElapsed(msg.elapsedMs)}</span></>
                    )}
                    <button type="button" className="inline-flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => handleCopy(msg.content)} title="Copy">
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onUploadFile={handleUpload}
        onStop={handleStop}
        isRunning={isRunning}
        disabled={!connected}
        agentName={agentName}
      />
    </div>
  );
}
