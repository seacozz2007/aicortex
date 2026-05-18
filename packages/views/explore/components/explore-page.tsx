"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Terminal, X, Circle, PanelLeftClose, PanelLeftOpen, Pencil } from "lucide-react";
import { terminalSessionListOptions, useCloseTerminalSession, useTerminalStore, type TerminalSession } from "@aicortex/core/terminal";
import { runtimeListOptions } from "@aicortex/core/runtimes/queries";
import { useCurrentWorkspace } from "@aicortex/core/paths";
import { api } from "@aicortex/core/api";
import { useQueryClient } from "@tanstack/react-query";
import { TerminalPanel } from "./terminal-panel";
import { NewSessionDialog } from "./new-session-dialog";

export function ExplorePage() {
  const workspace = useCurrentWorkspace();
  const { data: sessions = [] } = useQuery({
    ...terminalSessionListOptions(workspace?.id ?? ""),
    enabled: !!workspace?.id,
  });
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const setActiveSession = useTerminalStore((s) => s.setActiveSession);
  const closeSession = useCloseTerminalSession();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { data: runtimes = [] } = useQuery({
    ...runtimeListOptions(workspace?.id ?? ""),
    enabled: !!workspace?.id,
  });

  const runtimeMap = Object.fromEntries(runtimes.map((r) => [r.id, r.name]));

  const activeSessions = sessions.filter((s) => s.status !== "closed");
  const closedSessions = sessions.filter((s) => s.status === "closed");
  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* Collapsible session list */}
      {sidebarOpen && (
        <div className="w-64 shrink-0 border-r flex flex-col">
          <div className="flex items-center justify-between p-3 border-b">
            <h2 className="text-sm font-medium">Sessions</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowNewDialog(true)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs bg-brand text-brand-foreground hover:bg-brand/90"
              >
                <Plus className="size-3" />
                New
              </button>
              <button type="button" onClick={() => setSidebarOpen(false)} className="p-1 rounded hover:bg-accent text-muted-foreground">
                <PanelLeftClose className="size-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {activeSessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                runtimeName={runtimeMap[session.runtime_id]}
                isActive={session.id === activeSessionId}
                onClick={() => setActiveSession(session.id)}
                onClose={() => closeSession.mutate(session.id)}
              />
            ))}
            {closedSessions.length > 0 && (
              <>
                <div className="text-xs text-muted-foreground px-2 pt-3 pb-1">Closed</div>
                {closedSessions.slice(0, 5).map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    runtimeName={runtimeMap[session.runtime_id]}
                    isActive={session.id === activeSessionId}
                    onClick={() => setActiveSession(session.id)}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Terminal area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!sidebarOpen && (
          <div className="flex items-center gap-2 px-2 py-1 border-b shrink-0">
            <button type="button" onClick={() => setSidebarOpen(true)} className="p-1 rounded hover:bg-accent text-muted-foreground">
              <PanelLeftOpen className="size-4" />
            </button>
            <span className="text-xs text-muted-foreground truncate">
              {activeSession?.title || "Terminal"}
            </span>
          </div>
        )}
        {activeSessionId && activeSession && activeSession.status !== "closed" ? (
          <TerminalPanel
            key={activeSessionId}
            sessionId={activeSessionId}
            onDetach={() => setActiveSession(null)}
          />
        ) : activeSessionId && activeSession?.status === "closed" ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-3">
              <Terminal className="size-12 mx-auto opacity-30" />
              <p className="text-sm">This session has been closed</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-3">
              <Terminal className="size-12 mx-auto opacity-30" />
              <p className="text-sm">Select a session or create a new one</p>
            </div>
          </div>
        )}
      </div>

      {showNewDialog && (
        <NewSessionDialog
          onClose={() => setShowNewDialog(false)}
          onCreated={(id) => {
            setActiveSession(id);
            setShowNewDialog(false);
          }}
        />
      )}
    </div>
  );
}

function SessionItem({
  session,
  runtimeName,
  isActive,
  onClick,
  onClose,
}: {
  session: TerminalSession;
  runtimeName?: string;
  isActive: boolean;
  onClick: () => void;
  onClose?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(session.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const statusColor = session.status === "active" ? "text-green-500" : session.status === "detached" ? "text-yellow-500" : "text-muted-foreground";

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleRename = async () => {
    setEditing(false);
    if (title === session.title) return;
    try {
      await api.updateTerminalSession(session.id, { title });
    } catch { /* ignore */ }
    qc.invalidateQueries({ queryKey: ["terminal-sessions"] });
  };

  if (editing) {
    return (
      <div className="px-2 py-1">
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setTitle(session.title); setEditing(false); } }}
          className="w-full rounded border bg-background px-1.5 py-0.5 text-sm"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-md px-2 py-1.5 text-sm group flex items-start gap-2 ${
        isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50 text-muted-foreground"
      }`}
    >
      <Circle className={`size-2 mt-1.5 shrink-0 fill-current ${statusColor}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="truncate">{session.title || "Terminal"}</span>
          <Pencil
            className="size-3 opacity-0 group-hover:opacity-100 shrink-0 hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          />
        </div>
        {runtimeName && (
          <div className="text-[11px] text-muted-foreground truncate">{runtimeName}</div>
        )}
      </div>
      {onClose && session.status !== "closed" && (
        <X
          className="size-3 mt-1 shrink-0 opacity-0 group-hover:opacity-100 hover:text-destructive"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        />
      )}
    </button>
  );
}
