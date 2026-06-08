import type { AgentTask } from "../types";

/** Design Studio tasks are chat-backed but should appear on agent surfaces. */
export function isDesignStudioTask(task: AgentTask): boolean {
  return task.kind === "design" || !!task.design_mode;
}

/**
 * Tasks that belong on agent list/detail activity surfaces.
 * Regular chat tasks stay in the chat UI; design studio tasks are included.
 */
export function isAgentActivityTask(task: AgentTask): boolean {
  if (isDesignStudioTask(task)) return true;
  return !task.chat_session_id;
}
