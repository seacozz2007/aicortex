"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RotateCcw, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@aicortex/core/hooks";
import {
  findTerminalSessionForContext,
  terminalSessionListOptions,
  TERMINAL_SCOPES,
  useCloseTerminalSession,
  useCreateTerminalSession,
  useMarkTerminalBootstrapped,
  type TerminalSession,
} from "@aicortex/core/terminal";
import {
  appendTerminalDetectBuffer,
  extractAgentSessionIdFromTerminalOutput,
  needsTerminalBootstrap,
} from "@aicortex/core/agents";
import { TerminalPanel } from "../../explore/components/terminal-panel";
import { useWS } from "@aicortex/core/realtime";
import { useT } from "../../i18n";

function encodeTerminalPayload(command: string): string {
  const normalized = command.replace(/\r?\n$/, "");
  const payload = `${normalized}\r\n`;
  const bytes = new TextEncoder().encode(payload);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function sendTerminalInput(
  send: (message: { type: "terminal:data"; payload: { session_id: string; data: string } }) => void,
  sessionId: string,
  command: string,
) {
  send({
    type: "terminal:data",
    payload: { session_id: sessionId, data: encodeTerminalPayload(command) },
  });
}

async function sendTerminalCommands(
  send: (message: { type: "terminal:data"; payload: { session_id: string; data: string } }) => void,
  sessionId: string,
  commands: string[],
  delayMs = 200,
) {
  for (const command of commands) {
    sendTerminalInput(send, sessionId, command);
    if (commands.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export function ChatTerminalPanel({
  chatSessionId,
  runtimeId,
  workDir,
  sessionTitle,
  bootstrapCommand,
  bootstrapCommands,
  resumeSessionId,
  injectCommand,
  injectKey,
  terminalScope = TERMINAL_SCOPES.DEFAULT,
  compactHeader = false,
  syncAgentSessionProvider,
  knownAgentSessionId,
  onAgentSessionDetected,
  reconnectKey,
}: {
  chatSessionId: string;
  runtimeId: string;
  workDir?: string;
  sessionTitle?: string;
  bootstrapCommands?: string[];
  bootstrapCommand?: string;
  /** Agent session id for `--resume` (or provider equivalent) on bootstrap. */
  resumeSessionId?: string | null;
  injectCommand?: string | null;
  injectKey?: number;
  terminalScope?: string;
  compactHeader?: boolean;
  /** When set, scan terminal output and report newly observed agent session ids. */
  syncAgentSessionProvider?: string | null;
  knownAgentSessionId?: string | null;
  onAgentSessionDetected?: (agentSessionId: string) => void;
  /** Increment to force-close and recreate the bound terminal (Dev CLI resync). */
  reconnectKey?: number;
}) {
  const { t } = useT("chat");
  const wsId = useWorkspaceId();
  const listFilters = useMemo(
    () => ({ chat_session_id: chatSessionId, scope: terminalScope }),
    [chatSessionId, terminalScope],
  );
  const { data: sessions = [], isLoading } = useQuery(
    terminalSessionListOptions(wsId, listFilters),
  );
  const createSession = useCreateTerminalSession();
  const closeSession = useCloseTerminalSession();
  const markBootstrapped = useMarkTerminalBootstrapped();
  const { send, subscribe } = useWS();
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(false);
  const bootingRef = useRef(false);
  const lastInjectKeyRef = useRef<number | null>(null);
  const lastBootstrapKeyRef = useRef<string | null>(null);
  const lastReconnectKeyRef = useRef(0);
  const [terminalAttached, setTerminalAttached] = useState(false);
  const [ptyRecreated, setPtyRecreated] = useState(false);
  const terminalDetectBufferRef = useRef("");
  const lastSyncedAgentSessionRef = useRef<string | null>(null);
  const detectTimerRef = useRef<number | null>(null);

  const normalizedResumeSessionId = resumeSessionId?.trim() || null;
  const normalizedKnownAgentSessionId = knownAgentSessionId?.trim() || null;

  const reportAgentSessionId = useCallback(
    (agentSessionId: string) => {
      const trimmed = agentSessionId.trim();
      if (!trimmed || !onAgentSessionDetected) return;
      if (trimmed === lastSyncedAgentSessionRef.current) return;
      if (trimmed === normalizedKnownAgentSessionId) return;
      lastSyncedAgentSessionRef.current = trimmed;
      onAgentSessionDetected(trimmed);
    },
    [normalizedKnownAgentSessionId, onAgentSessionDetected],
  );

  const boundSession = useMemo(
    () =>
      findTerminalSessionForContext(sessions, {
        chatSessionId,
        runtimeId,
        scope: terminalScope,
      }),
    [sessions, chatSessionId, runtimeId, terminalScope],
  );

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === terminalSessionId) ?? boundSession,
    [sessions, terminalSessionId, boundSession],
  );

  useEffect(() => {
    const unsub = subscribe("terminal:close" as any, (payload: any) => {
      if (payload?.session_id !== terminalSessionId) return;
      setTerminalSessionId(null);
      setError(t(($) => $.tools_sidebar.terminal.closed));
    });
    return unsub;
  }, [subscribe, terminalSessionId, t]);

  useEffect(() => {
    const unsub = subscribe("terminal:attached" as any, (payload: any) => {
      if (payload?.session_id !== terminalSessionId) return;
      setPtyRecreated(payload?.pty_recreated === true);
      setTerminalAttached(true);
    });
    return unsub;
  }, [subscribe, terminalSessionId]);

  const connectTerminal = useCallback(
    async (forceCreate = false) => {
      if (bootingRef.current) return;
      bootingRef.current = true;
      setBooting(true);
      setError(null);

      try {
        if (!forceCreate) {
          const existing = findTerminalSessionForContext(sessions, {
            chatSessionId,
            runtimeId,
            scope: terminalScope,
          });
          if (existing) {
            setTerminalSessionId(existing.id);
            return;
          }
        } else {
          const existing = findTerminalSessionForContext(sessions, {
            chatSessionId,
            runtimeId,
            scope: terminalScope,
          });
          if (existing) {
            await closeSession.mutateAsync(existing.id);
          }
        }

        const created = await createSession.mutateAsync({
          runtime_id: runtimeId,
          chat_session_id: chatSessionId,
          scope: terminalScope,
          title: sessionTitle
            ? t(($) => $.tools_sidebar.terminal.session_title, { title: sessionTitle })
            : t(($) => $.tools_sidebar.terminal.session_title_default),
          cols: 80,
          rows: 24,
        });
        setTerminalSessionId(created.id);
      } catch {
        setError(t(($) => $.tools_sidebar.terminal.start_error));
        setTerminalSessionId(null);
      } finally {
        bootingRef.current = false;
        setBooting(false);
      }
    },
    [
      chatSessionId,
      runtimeId,
      sessionTitle,
      sessions,
      createSession,
      closeSession,
      t,
      terminalScope,
    ],
  );

  useEffect(() => {
    setTerminalSessionId(null);
    setError(null);
    setTerminalAttached(false);
    setPtyRecreated(false);
    terminalDetectBufferRef.current = "";
    lastSyncedAgentSessionRef.current = null;
    lastInjectKeyRef.current = null;
    lastBootstrapKeyRef.current = null;
  }, [chatSessionId, runtimeId, terminalScope]);

  useEffect(() => {
    setTerminalAttached(false);
    setPtyRecreated(false);
    terminalDetectBufferRef.current = "";
    lastBootstrapKeyRef.current = null;
  }, [terminalSessionId]);

  useEffect(() => {
    lastSyncedAgentSessionRef.current = normalizedKnownAgentSessionId;
  }, [normalizedKnownAgentSessionId, chatSessionId]);

  useEffect(() => {
    if (!onAgentSessionDetected || !terminalSessionId) return;
    const unsub = subscribe("terminal:data" as any, (payload: any) => {
      if (payload?.session_id !== terminalSessionId || typeof payload?.data !== "string") return;
      try {
        const text = new TextDecoder().decode(
          Uint8Array.from(atob(payload.data), (c) => c.charCodeAt(0)),
        );
        terminalDetectBufferRef.current = appendTerminalDetectBuffer(
          terminalDetectBufferRef.current,
          text,
        );
        if (detectTimerRef.current != null) {
          window.clearTimeout(detectTimerRef.current);
        }
        detectTimerRef.current = window.setTimeout(() => {
          const detected = extractAgentSessionIdFromTerminalOutput(
            syncAgentSessionProvider,
            terminalDetectBufferRef.current,
          );
          if (detected) reportAgentSessionId(detected);
        }, 1500);
      } catch {
        /* ignore decode errors */
      }
    });
    return () => {
      unsub();
      if (detectTimerRef.current != null) {
        window.clearTimeout(detectTimerRef.current);
        detectTimerRef.current = null;
      }
    };
  }, [
    subscribe,
    terminalSessionId,
    onAgentSessionDetected,
    syncAgentSessionProvider,
    reportAgentSessionId,
  ]);

  useEffect(() => {
    if (!chatSessionId || !runtimeId || isLoading) return;
    if (terminalSessionId) {
      const stillValid = sessions.some(
        (session: TerminalSession) =>
          session.id === terminalSessionId &&
          session.runtime_id === runtimeId &&
          session.status !== "closed",
      );
      if (stillValid) return;
      setTerminalSessionId(null);
    }
    void connectTerminal();
  }, [chatSessionId, runtimeId, isLoading, sessions, terminalSessionId, connectTerminal]);

  const handleDetach = useCallback(() => {
    setTerminalSessionId(null);
    setError(t(($) => $.tools_sidebar.terminal.closed));
  }, [t]);

  const handleClose = useCallback(() => {
    if (!terminalSessionId) return;
    closeSession.mutate(terminalSessionId);
    setTerminalSessionId(null);
  }, [terminalSessionId, closeSession]);

  const handleRetry = useCallback(() => {
    void connectTerminal(true);
  }, [connectTerminal]);

  useEffect(() => {
    if (reconnectKey == null || reconnectKey === 0 || reconnectKey === lastReconnectKeyRef.current) {
      return;
    }
    lastReconnectKeyRef.current = reconnectKey;
    void connectTerminal(true);
  }, [reconnectKey, connectTerminal]);

  const shouldBootstrap = useMemo(() => {
    if (!activeSession) return false;
    return needsTerminalBootstrap({
      bootstrapped: activeSession.bootstrapped,
      ptyRecreated,
    });
  }, [activeSession, ptyRecreated]);

  useEffect(() => {
    if (!terminalSessionId || !terminalAttached || !shouldBootstrap) return;

    const commands =
      bootstrapCommands?.map((command) => command.trim()).filter(Boolean) ??
      (bootstrapCommand?.trim() ? [bootstrapCommand.trim()] : []);
    if (commands.length === 0) return;

    const bootstrapKey = `${terminalSessionId}:${normalizedResumeSessionId ?? ""}:${commands.join("\0")}:${ptyRecreated}`;
    if (lastBootstrapKeyRef.current === bootstrapKey) return;
    lastBootstrapKeyRef.current = bootstrapKey;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void sendTerminalCommands(send, terminalSessionId, commands).then(() => {
        if (cancelled) return;
        markBootstrapped.mutate({
          sessionId: terminalSessionId,
          bootstrapResumeId: normalizedResumeSessionId,
        });
        if (normalizedResumeSessionId) {
          reportAgentSessionId(normalizedResumeSessionId);
        }
      });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    terminalSessionId,
    terminalAttached,
    shouldBootstrap,
    normalizedResumeSessionId,
    ptyRecreated,
    bootstrapCommand,
    bootstrapCommands,
    send,
    markBootstrapped,
    reportAgentSessionId,
  ]);

  useEffect(() => {
    if (!terminalSessionId || injectKey == null || !injectCommand?.trim()) return;
    if (lastInjectKeyRef.current === injectKey) return;
    lastInjectKeyRef.current = injectKey;
    sendTerminalInput(send, terminalSessionId, injectCommand.trim());
  }, [terminalSessionId, injectCommand, injectKey, send]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compactHeader ? (
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
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#1a1b26]">
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
            onAttached={() => setTerminalAttached(true)}
          />
        ) : null}
      </div>
    </div>
  );
}
