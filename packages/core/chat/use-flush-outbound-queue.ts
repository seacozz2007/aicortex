"use client";

import { useEffect, useRef } from "react";
import { useChatStore } from "./index";
import { EMPTY_OUTBOUND_QUEUE, type OutboundQueuedMessage } from "./outbound-queue";
import type { ChatPendingTask } from "../types";
import { createLogger } from "../logger";

const logger = createLogger("chat.outbound-queue");

/** Sends the next locally queued message once the session has no pending task. */
export function useFlushOutboundQueue({
  sessionId,
  pendingTask,
  flushItem,
}: {
  sessionId: string | null;
  pendingTask: ChatPendingTask | null | undefined;
  flushItem: (item: OutboundQueuedMessage) => Promise<void>;
}) {
  const queue = useChatStore((s) =>
    sessionId
      ? (s.outboundQueues[sessionId] ?? EMPTY_OUTBOUND_QUEUE)
      : EMPTY_OUTBOUND_QUEUE,
  );
  const dequeueOutbound = useChatStore((s) => s.dequeueOutbound);
  const enqueueOutbound = useChatStore((s) => s.enqueueOutbound);
  const flushingRef = useRef(false);

  useEffect(() => {
    if (!sessionId) return;
    if (pendingTask?.task_id) return;
    if (queue.length === 0) return;
    if (flushingRef.current) return;

    const item = queue[0]!;
    flushingRef.current = true;
    dequeueOutbound(sessionId, item.id);

    void flushItem(item)
      .catch((err) => {
        logger.error("flush.failed", err);
        enqueueOutbound(sessionId, item);
      })
      .finally(() => {
        flushingRef.current = false;
      });
  }, [
    sessionId,
    pendingTask?.task_id,
    queue.length,
    queue[0]?.id,
    flushItem,
    dequeueOutbound,
    enqueueOutbound,
  ]);
}
