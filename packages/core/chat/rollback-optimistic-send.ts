import type { QueryClient } from "@tanstack/react-query";
import { chatKeys } from "./queries";
import type { ChatMessage } from "../types";

/** Clears optimistic queued state when sendChatMessage fails. */
export function rollbackOptimisticChatSend(
  qc: QueryClient,
  sessionId: string,
  optimisticMessageId: string,
) {
  qc.setQueryData(chatKeys.pendingTask(sessionId), {});
  qc.setQueryData<ChatMessage[]>(chatKeys.messages(sessionId), (old) =>
    old?.filter((m) => m.id !== optimisticMessageId),
  );
}
