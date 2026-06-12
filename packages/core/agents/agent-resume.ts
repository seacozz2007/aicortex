/** Resume pointer fields shared by chat / dev session API responses. */
export type AgentSessionResumeFields = {
  /** Primary resume pointer from chat_session.session_id (daemon-owned). */
  agent_session_id?: string | null;
  /** Runtime that produced agent_session_id; must match active runtime to resume. */
  runtime_id?: string | null;
  /** Fallback from the most recent task with a session_id in this chat session. */
  last_task_agent_session_id?: string | null;
};

/**
 * Resolve the agent session id to pass to interactive CLI `--resume` (or equivalent),
 * mirroring daemon claim logic: primary pointer when runtime matches, else last-task fallback.
 */
export function resolveAgentResumeId(
  session: AgentSessionResumeFields,
  activeRuntimeId: string | null | undefined,
): string | null {
  const runtimeId = activeRuntimeId?.trim();
  if (!runtimeId) return null;

  const sessionRuntimeId = session.runtime_id?.trim() ?? "";
  if (sessionRuntimeId !== "" && sessionRuntimeId !== runtimeId) {
    return null;
  }

  const primary = session.agent_session_id?.trim();
  if (primary) return primary;

  const fallback = session.last_task_agent_session_id?.trim();
  if (fallback) return fallback;

  return null;
}

export function needsTerminalBootstrap(input: {
  bootstrapped: boolean;
  ptyRecreated: boolean;
}): boolean {
  if (!input.bootstrapped) return true;
  return input.ptyRecreated;
}
