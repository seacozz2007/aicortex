import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, isChatSessionNotFound } from "../api";
import { useWorkspaceId } from "../hooks";
import type { Agent, ChatSession } from "../types";
import { useCreateChatSession } from "./mutations";
import { chatKeys } from "./queries";
import { useChatStore } from "./index";

export interface EnsureChatSessionOptions {
  /** Skip reuse of activeSessionId — used after a send 404 proved it stale. */
  forceNew?: boolean;
}

/** Drop a session id from client state when the server no longer has it. */
export function invalidateStaleChatSession(
  qc: ReturnType<typeof useQueryClient>,
  wsId: string,
  sessionId: string,
  setActiveSession: (id: string | null) => void,
) {
  setActiveSession(null);
  qc.setQueryData<ChatSession[]>(chatKeys.sessions(wsId), (old) =>
    old?.filter((s) => s.id !== sessionId),
  );
  void qc.invalidateQueries({ queryKey: chatKeys.sessions(wsId) });
}

/**
 * Returns a stable session id for sending a message. Always confirms an
 * existing activeSessionId with the server before reuse — the sessions query
 * uses staleTime: Infinity and can outlive DB resets.
 */
export function useEnsureChatSession() {
  const wsId = useWorkspaceId();
  const qc = useQueryClient();
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const selectedProjectId = useChatStore((s) => s.selectedProjectId);
  const createSession = useCreateChatSession();
  const sessionPromiseRef = useRef<Promise<string | null> | null>(null);

  const verifySessionExists = useCallback(
    async (sessionId: string): Promise<boolean> => {
      try {
        await api.getChatSession(sessionId);
        return true;
      } catch (err) {
        if (isChatSessionNotFound(err)) {
          invalidateStaleChatSession(qc, wsId, sessionId, setActiveSession);
          return false;
        }
        throw err;
      }
    },
    [qc, setActiveSession, wsId],
  );

  const createNewSession = useCallback(
    async (titleSeed: string, activeAgent: Agent): Promise<string | null> => {
      try {
        const session = await createSession.mutateAsync({
          agent_id: activeAgent.id,
          title: titleSeed.slice(0, 50),
          ...(selectedProjectId ? { project_id: selectedProjectId } : {}),
        });
        return session.id;
      } catch {
        return null;
      }
    },
    [createSession, selectedProjectId],
  );

  return useCallback(
    async (
      titleSeed: string,
      activeAgent: Agent | null,
      opts?: EnsureChatSessionOptions,
    ): Promise<string | null> => {
      if (!activeAgent) return null;

      if (opts?.forceNew) {
        sessionPromiseRef.current = null;
        return createNewSession(titleSeed, activeAgent);
      }

      let sessionId = useChatStore.getState().activeSessionId;
      if (sessionId) {
        const exists = await verifySessionExists(sessionId);
        if (!exists) sessionId = null;
      }
      if (sessionId) return sessionId;

      if (sessionPromiseRef.current) return sessionPromiseRef.current;

      const promise = createNewSession(titleSeed, activeAgent).finally(() => {
        sessionPromiseRef.current = null;
      });
      sessionPromiseRef.current = promise;
      return promise;
    },
    [createNewSession, verifySessionExists],
  );
}
