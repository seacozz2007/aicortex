import type { ChatPendingTask } from "../types";

/** True when a task is actively executing (not merely waiting in queue). */
export function isPendingTaskInFlight(
  pending: ChatPendingTask | null | undefined,
): boolean {
  if (!pending?.task_id) return false;
  if (pending.task_id.startsWith("optimistic-")) return false;
  return pending.status === "running" || pending.status === "dispatched";
}

/** True when a follow-up send should join the queue instead of replacing pending state. */
export function shouldQueueChatFollowUp(
  pending: ChatPendingTask | null | undefined,
): boolean {
  if (!pending?.task_id) return false;
  return !pending.task_id.startsWith("optimistic-");
}

/** Merge server/optimistic enqueue into pending-task cache without clobbering a running task. */
export function mergePendingTaskOnEnqueue(
  old: ChatPendingTask | undefined,
  incoming: ChatPendingTask,
): ChatPendingTask {
  if (isPendingTaskInFlight(old)) {
    return {
      ...old!,
      queued_count: (old?.queued_count ?? 0) + 1,
    };
  }
  if (
    old?.task_id &&
    old.status === "queued" &&
    !old.task_id.startsWith("optimistic-") &&
    old.task_id !== incoming.task_id
  ) {
    return {
      ...old,
      queued_count: (old.queued_count ?? 0) + 1,
    };
  }
  return {
    task_id: incoming.task_id,
    status: incoming.status ?? "queued",
    created_at: incoming.created_at ?? old?.created_at,
    queued_count: old?.queued_count ?? incoming.queued_count ?? 0,
  };
}
