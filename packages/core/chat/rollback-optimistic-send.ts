import type { QueryClient } from "@tanstack/react-query";
import { chatKeys } from "./queries";
import type { ChatMessage, ChatPendingTask } from "../types";

/** Clears optimistic queued state when sendChatMessage fails. */
export function rollbackOptimisticChatSend(
  qc: QueryClient,
  sessionId: string,
  optimisticMessageId: string,
  opts?: { preservePending?: boolean },
) {
  if (!opts?.preservePending) {
    qc.setQueryData(chatKeys.pendingTask(sessionId), {});
  } else {
    qc.setQueryData<ChatPendingTask>(
      chatKeys.pendingTask(sessionId),
      (old) => {
        if (!old?.queued_count || old.queued_count <= 0) return old ?? {};
        return { ...old, queued_count: old.queued_count - 1 };
      },
    );
  }
  qc.setQueryData<ChatMessage[]>(chatKeys.messages(sessionId), (old) =>
    old?.filter((m) => m.id !== optimisticMessageId),
  );
}
