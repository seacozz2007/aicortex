"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { getCurrentSlug } from "@aicortex/core/platform";
import {
  terminalSessionListOptions,
  useCloseTerminalSession,
  useCreateTerminalSession,
  type TerminalSession,
} from "@aicortex/core/terminal";
import { TerminalPanel } from "../../explore/components/terminal-panel";
import { useWS } from "@aicortex/core/realtime";
import { useT } from "../../i18n";

const TERMINAL_STORAGE_KEY = "aicortex:chat:terminal-session";

function terminalStorageKey(chatSessionId: string): string {
  const slug = getCurrentSlug();
  return slug
    ? `${TERMINAL_STORAGE_KEY}:${slug}:${chatSessionId}`
    : `${TERMINAL_STORAGE_KEY}:${chatSessionId}`;
}

function pickTerminalSession(
  sessions: TerminalSession[],
  chatSessionId: string,
  runtimeId: string,
): TerminalSession | null {
  const storedId = localStorage.getItem(terminalStorageKey(chatSessionId));
  if (storedId) {
    const stored = sessions.find(
      (s) =>
        s.id === storedId &&
        s.runtime_id === runtimeId &&
        s.status !== "closed",
    );
    if (stored) return stored;
    localStorage.removeItem(terminalStorageKey(chatSessionId));
  }
  return (
    sessions.find(
      (s) =>
        s.runtime_id === runtimeId &&
        (s.status === "active" || s.status === "detached"),
    ) ?? null
  );
}

export function ChatTerminalPanel({
  chatSessionId,
  runtimeId,
  workDir,
  sessionTitle,
  bootstrapCommand,
}: {
  chatSessionId: string;
  runtimeId: string;
  workDir?: string;
  sessionTitle?: string;
  /** Shell command sent once after the terminal attaches (e.g. cd to work_dir). */
  bootstrapCommand?: string;
}) {
  const { t } = useT("chat");
  const wsId = useWorkspaceId();
  const { data: sessions = [], isLoading } = useQuery(terminalSessionListOptions(wsId));
  const createSession = useCreateTerminalSession();
  const closeSession = useCloseTerminalSession();
  const { send } = useWS();
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(false);
  const bootingRef = useRef(false);

  const connectTerminal = useCallback(
    async (forceCreate = false) => {
      if (bootingRef.current) return;
      bootingRef.current = true;
      setBooting(true);
      setError(null);

      try {
        if (!forceCreate) {
          const existing = pickTerminalSession(sessions, chatSessionId, runtimeId);
          if (existing) {
            setTerminalSessionId(existing.id);
            localStorage.setItem(terminalStorageKey(chatSessionId), existing.id);
            return;
          }
        } else {
          localStorage.removeItem(terminalStorageKey(chatSessionId));
        }

        const created = await createSession.mutateAsync({
          runtime_id: runtimeId,
          title: sessionTitle
            ? t(($) => $.tools_sidebar.terminal.session_title, { title: sessionTitle })
            : t(($) => $.tools_sidebar.terminal.session_title_default),
          cols: 80,
          rows: 24,
        });
        setTerminalSessionId(created.id);
        localStorage.setItem(terminalStorageKey(chatSessionId), created.id);
      } catch {
        setError(t(($) => $.tools_sidebar.terminal.start_error));
        setTerminalSessionId(null);
      } finally {
        bootingRef.current = false;
        setBooting(false);
      }
    },
    [chatSessionId, runtimeId, sessionTitle, sessions, createSession, t],
  );

  useEffect(() => {
    setTerminalSessionId(null);
    setError(null);
  }, [chatSessionId, runtimeId]);

  useEffect(() => {
    if (!chatSessionId || !runtimeId || isLoading) return;
    if (terminalSessionId) {
      const stillValid = sessions.some(
        (s) =>
          s.id === terminalSessionId &&
          s.runtime_id === runtimeId &&
          s.status !== "closed",
      );
      if (stillValid) return;
      setTerminalSessionId(null);
    }
    void connectTerminal();
  }, [chatSessionId, runtimeId, isLoading, sessions, terminalSessionId, connectTerminal]);

  const handleDetach = useCallback(() => {
    localStorage.removeItem(terminalStorageKey(chatSessionId));
    setTerminalSessionId(null);
    setError(t(($) => $.tools_sidebar.terminal.closed));
  }, [chatSessionId, t]);

  const handleClose = useCallback(() => {
    if (!terminalSessionId) return;
    closeSession.mutate(terminalSessionId);
    localStorage.removeItem(terminalStorageKey(chatSessionId));
    setTerminalSessionId(null);
  }, [terminalSessionId, chatSessionId, closeSession]);

  const handleRetry = useCallback(() => {
    void connectTerminal(true);
  }, [connectTerminal]);

  useEffect(() => {
    if (!terminalSessionId || !bootstrapCommand?.trim()) return;
    const payload = `${bootstrapCommand.trim()}\n`;
    const bytes = new TextEncoder().encode(payload);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    send({
      type: "terminal:data",
      payload: { session_id: terminalSessionId, data: btoa(binary) },
    });
  }, [terminalSessionId, bootstrapCommand, send]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b px-2 py-1.5">
        <div className="min-w-0 text-[11px] text-muted-foreground">
          {workDir ? (
            <p className="truncate">
              {t(($) => $.tools_sidebar.terminal.work_dir_hint, { path: workDir })}
            </p>
          ) : (
            <p>{t(($) => $.tools_sidebar.terminal.hint)}</p>
          )}
        </div>
        {terminalSessionId && (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title={t(($) => $.tools_sidebar.terminal.reconnect_tooltip)}
            >
              <RotateCcw className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title={t(($) => $.tools_sidebar.terminal.close_tooltip)}
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 bg-[#1a1b26]">
        {booting || isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t(($) => $.tools_sidebar.terminal.connecting)}
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="text-xs text-destructive">{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
            >
              {t(($) => $.tools_sidebar.terminal.retry)}
            </button>
          </div>
        ) : terminalSessionId ? (
          <TerminalPanel
            key={terminalSessionId}
            sessionId={terminalSessionId}
            onDetach={handleDetach}
          />
        ) : null}
      </div>
    </div>
  );
}
