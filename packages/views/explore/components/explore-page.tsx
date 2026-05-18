"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Terminal, X, Circle } from "lucide-react";
import { terminalSessionListOptions, useCloseTerminalSession, useTerminalStore, type TerminalSession } from "@aicortex/core/terminal";
import { TerminalPanel } from "./terminal-panel";
import { NewSessionDialog } from "./new-session-dialog";

export function ExplorePage() {
  const { data: sessions = [] } = useQuery(terminalSessionListOptions());
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const setActiveSession = useTerminalStore((s) => s.setActiveSession);
  const closeSession = useCloseTerminalSession();
  const [showNewDialog, setShowNewDialog] = useState(false);

  const activeSessions = sessions.filter((s) => s.status !== "closed");
  const closedSessions = sessions.filter((s) => s.status === "closed");
  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* Session list */}
      <div className="w-64 shrink-0 border-r flex flex-col">
        <div className="flex items-center justify-between p-3 border-b">
          <h2 className="text-sm font-medium">Sessions</h2>
          <button
            type="button"
            onClick={() => setShowNewDialog(true)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs bg-brand text-brand-foreground hover:bg-brand/90"
          >
            <Plus className="size-3" />
            New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {activeSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
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
                  isActive={session.id === activeSessionId}
                  onClick={() => setActiveSession(session.id)}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Terminal area */}
      <div className="flex-1 flex flex-col min-w-0">
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
  isActive,
  onClick,
  onClose,
}: {
  session: TerminalSession;
  isActive: boolean;
  onClick: () => void;
  onClose?: () => void;
}) {
  const statusColor = session.status === "active" ? "text-green-500" : session.status === "detached" ? "text-yellow-500" : "text-muted-foreground";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-md px-2 py-1.5 text-sm group flex items-center gap-2 ${
        isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50 text-muted-foreground"
      }`}
    >
      <Circle className={`size-2 fill-current ${statusColor}`} />
      <span className="flex-1 truncate">{session.title || "Terminal"}</span>
      {onClose && session.status !== "closed" && (
        <X
          className="size-3 opacity-0 group-hover:opacity-100 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        />
      )}
    </button>
  );
}
