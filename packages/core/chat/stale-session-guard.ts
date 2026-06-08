import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorStatus, isChatSessionNotFound } from "../api";
import { useWorkspaceId } from "../hooks";
import { invalidateStaleChatSession } from "./ensure-session";
import { chatKeys, chatMessagesOptions, pendingChatTaskOptions } from "./queries";
import { useChatStore } from "./index";

/**
 * Clears a persisted activeSessionId when the server no longer has that
 * session (404 on session/messages/pending-task). Runs on mount and when
 * dependent queries fail so stale localStorage ids cannot block sending.
 */
export function useStaleChatSessionGuard(sessionId: string | null) {
  const wsId = useWorkspaceId();
  const qc = useQueryClient();
  const setActiveSession = useChatStore((s) => s.setActiveSession);

  const messagesQuery = useQuery({
    ...chatMessagesOptions(sessionId ?? ""),
    enabled: !!sessionId,
    retry: (_count, err) => apiErrorStatus(err) !== 404,
  });
  const pendingQuery = useQuery({
    ...pendingChatTaskOptions(sessionId ?? ""),
    enabled: !!sessionId,
    retry: (_count, err) => apiErrorStatus(err) !== 404,
  });

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    void api.getChatSession(sessionId).catch((err) => {
      if (cancelled || !isChatSessionNotFound(err)) return;
      invalidateStaleChatSession(qc, wsId, sessionId, setActiveSession);
    });

    return () => {
      cancelled = true;
    };
  }, [qc, sessionId, setActiveSession, wsId]);

  useEffect(() => {
    if (!sessionId) return;

    const stale =
      (messagesQuery.isError && isChatSessionNotFound(messagesQuery.error)) ||
      (pendingQuery.isError && isChatSessionNotFound(pendingQuery.error));

    if (!stale) return;

    invalidateStaleChatSession(qc, wsId, sessionId, setActiveSession);
    qc.removeQueries({ queryKey: chatKeys.messages(sessionId) });
    qc.removeQueries({ queryKey: chatKeys.pendingTask(sessionId) });
  }, [
    messagesQuery.error,
    messagesQuery.isError,
    pendingQuery.error,
    pendingQuery.isError,
    qc,
    sessionId,
    setActiveSession,
    wsId,
  ]);
}
