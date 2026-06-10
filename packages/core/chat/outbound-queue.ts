import type { ChatPendingTask } from "../types";

export interface OutboundQueuedMessage {
  id: string;
  content: string;
  attachmentIds?: string[];
  createdAt: string;
}

/** Stable fallback for zustand selectors — never return a fresh `[]` from getSnapshot. */
export const EMPTY_OUTBOUND_QUEUE: OutboundQueuedMessage[] = [];

/** True when a new send should join the local outbound queue instead of sending immediately. */
export function shouldEnqueueOutbound(
  pending: ChatPendingTask | null | undefined,
  localQueueLength = 0,
): boolean {
  if (localQueueLength > 0) return true;
  return !!pending?.task_id;
}

export function chatQueuePreviewText(content: string, maxLen = 160): string {
  const plain = content
    .replace(/!\[[^\]]*]\([^)]+\)/g, "[image]")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?/g, "").trim())
    .replace(/[#*_>`~|-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen)}…`;
}
