"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Monitor, MessageSquare } from "lucide-react";
import { Button } from "@aicortex/ui/components/ui/button";
import { Input } from "@aicortex/ui/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@aicortex/ui/components/ui/avatar";
import type { EndUserPublicSession } from "@aicortex/core/types";
import { HtmlRenderFrame } from "./HtmlRenderFrame";
import { useT } from "../../i18n";

interface EndUserChatViewProps {
  session: EndUserPublicSession;
  token: string;
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

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  htmlContent?: string;
  streaming?: boolean;
}

export function EndUserChatView({ session, token }: EndUserChatViewProps) {
  const { t } = useT("enduser");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    (session.history ?? []).map((m) => ({ id: m.id, role: m.role, content: m.content, htmlContent: m.html_content }))
  );
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [currentHtml, setCurrentHtml] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"chat" | "html">("chat");

  const visitorId = useMemo(() => getVisitorId(), []);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const hasHtml = currentHtml != null && currentHtml !== "";

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/e/${token}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setReconnecting(false);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type?: string;
          content?: string;
          html_content?: string;
          html_updated?: string;
        };

        if (data.type === "stream") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.streaming) {
              const updated = [...prev];
              updated[updated.length - 1] = { ...last, content: last.content + (data.content ?? "") };
              return updated;
            }
            return [...prev, { id: crypto.randomUUID(), role: "agent", content: data.content ?? "", streaming: true }];
          });
        } else if (data.type === "message") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.streaming) {
              const updated = [...prev];
              updated[updated.length - 1] = { ...last, content: data.content ?? "", streaming: false };
              return updated;
            }
            return [...prev, { id: crypto.randomUUID(), role: "agent", content: data.content ?? "" }];
          });
        }

        if (data.html_updated != null) {
          setCurrentHtml(data.html_updated);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (!reconnectTimerRef.current) {
        setReconnecting(true);
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [token]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: trimmed }]);
    wsRef.current.send(JSON.stringify({ visitor_id: visitorId, message: trimmed }));
    setInput("");
    inputRef.current?.focus();
  }, [input, visitorId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const agentName = session.session?.agent_name ?? t(($) => $.public.agent_default_name);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b">
        <Avatar className="h-8 w-8">
          {session.session?.agent_avatar_url && <AvatarImage src={session.session.agent_avatar_url} />}
          <AvatarFallback>{agentName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium">{agentName}</p>
          {(!connected || reconnecting) && (
            <p className="text-xs text-muted-foreground">
              {reconnecting ? t(($) => $.public.reconnecting) : t(($) => $.public.disconnected)}
            </p>
          )}
        </div>
      </div>

      {/* Mobile tab switcher */}
      {hasHtml && (
        <div className="md:hidden flex border-b">
          <button
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium ${mobileTab === "chat" ? "border-b-2 border-primary" : "text-muted-foreground"}`}
            onClick={() => setMobileTab("chat")}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {t(($) => $.public.chat_tab)}
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium ${mobileTab === "html" ? "border-b-2 border-primary" : "text-muted-foreground"}`}
            onClick={() => setMobileTab("html")}
          >
            <Monitor className="h-3.5 w-3.5" />
            {t(($) => $.public.html_tab)}
          </button>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 min-h-0 flex">
        {/* Chat column */}
        <div className={`flex-1 min-w-0 flex flex-col ${hasHtml ? (mobileTab !== "chat" ? "hidden md:flex" : "flex") : "flex"} ${hasHtml ? "md:border-r" : ""}`}>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {session.session?.guide_message && !messages.some((m) => m.role === "agent") && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-lg px-3 py-1.5 bg-muted text-sm text-muted-foreground">
                  {session.session.guide_message}
                </div>
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}>
                  {msg.content}
                  {msg.streaming && <span className="inline-block w-1.5 h-4 bg-current animate-pulse ml-0.5 align-text-bottom" />}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t p-3">
            <div className="flex items-center gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t(($) => $.public.input_placeholder)}
                disabled={!connected}
                className="flex-1"
              />
              <Button size="icon" onClick={handleSend} disabled={!connected || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* HTML render column */}
        {hasHtml && (
          <div className={`flex-1 min-w-0 ${mobileTab !== "html" ? "hidden md:block" : "block"}`}>
            <HtmlRenderFrame html={currentHtml} />
          </div>
        )}

        {/* Empty HTML placeholder */}
        {!hasHtml && (
          <div className="hidden md:flex flex-1 items-center justify-center border-l">
            <p className="text-sm text-muted-foreground px-4 text-center">
              {t(($) => $.public.no_html_yet)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
