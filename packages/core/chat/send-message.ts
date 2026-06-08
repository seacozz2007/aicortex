import type { QueryClient } from "@tanstack/react-query";
import { api, isChatSessionNotFound } from "../api";
import { createLogger } from "../logger";
import type { Agent, ChatMessage, ChatPendingTask } from "../types";
import type { EnsureChatSessionOptions } from "./ensure-session";
import { invalidateStaleChatSession } from "./ensure-session";
import { chatKeys } from "./queries";
import { rollbackOptimisticChatSend } from "./rollback-optimistic-send";

const logger = createLogger("chat.send");

export interface SendChatMessageAttempt {
  sessionId: string;
  content: string;
  attachmentIds?: string[];
  optimistic: ChatMessage;
}

type EnsureSessionFn = (
  title: string,
  agent: Agent | null,
  opts?: EnsureChatSessionOptions,
) => Promise<string | null>;

/**
 * Sends a chat message, rolling back optimistic state on failure. On 404
 * (stale session id slipped through) clears the bad session, creates a fresh
 * one via ensureSession, and retries once.
 */
export async function sendChatMessageWithRecovery(
  qc: QueryClient,
  wsId: string,
  attempt: SendChatMessageAttempt,
  ensureSession: EnsureSessionFn,
  activeAgent: Agent,
  setActiveSession: (id: string | null) => void,
) {
  const post = (sessionId: string) =>
    api.sendChatMessage(sessionId, attempt.content, attempt.attachmentIds);

  const applySuccess = (sessionId: string, result: Awaited<ReturnType<typeof post>>) => {
    qc.setQueryData<ChatPendingTask>(chatKeys.pendingTask(sessionId), {
      task_id: result.task_id,
      status: "queued",
      created_at: result.created_at,
    });
    qc.invalidateQueries({ queryKey: chatKeys.messages(sessionId) });
  };

  try {
    const result = await post(attempt.sessionId);
    applySuccess(attempt.sessionId, result);
    return result;
  } catch (err) {
    rollbackOptimisticChatSend(qc, attempt.sessionId, attempt.optimistic.id);

    if (!isChatSessionNotFound(err)) {
      logger.error("sendChatMessage.error", { sessionId: attempt.sessionId, err });
      return null;
    }

    logger.warn("sendChatMessage.sessionNotFound.retry", {
      sessionId: attempt.sessionId,
    });
    invalidateStaleChatSession(qc, wsId, attempt.sessionId, setActiveSession);

    const retrySessionId = await ensureSession(attempt.content, activeAgent, {
      forceNew: true,
    });
    if (!retrySessionId || retrySessionId === attempt.sessionId) {
      logger.error("sendChatMessage.retryAborted", { sessionId: attempt.sessionId });
      return null;
    }

    const sentAt = new Date().toISOString();
    const retryOptimistic: ChatMessage = {
      ...attempt.optimistic,
      id: `optimistic-${Date.now()}`,
      chat_session_id: retrySessionId,
      created_at: sentAt,
    };
    qc.setQueryData<ChatMessage[]>(
      chatKeys.messages(retrySessionId),
      (old) => (old ? [...old, retryOptimistic] : [retryOptimistic]),
    );
    qc.setQueryData<ChatPendingTask>(chatKeys.pendingTask(retrySessionId), {
      task_id: `optimistic-${retryOptimistic.id}`,
      status: "queued",
      created_at: sentAt,
    });
    setActiveSession(retrySessionId);

    try {
      const result = await post(retrySessionId);
      applySuccess(retrySessionId, result);
      return result;
    } catch (retryErr) {
      rollbackOptimisticChatSend(qc, retrySessionId, retryOptimistic.id);
      logger.error("sendChatMessage.retryFailed", { sessionId: retrySessionId, err: retryErr });
      return null;
    }
  }
}
