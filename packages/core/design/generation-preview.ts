import type { ChatPendingTask, TaskMessagePayload } from "../types";

export type GenerationStepStatus = "pending" | "running" | "succeeded" | "failed";

export type GenerationStepId = "understand" | "generate" | "prepare";

export interface GenerationPreviewStep {
  id: GenerationStepId;
  status: GenerationStepStatus;
}

export interface GenerationPreviewModel {
  phase: "generating" | "failed";
  steps: GenerationPreviewStep[];
  detailLabel: string | null;
  /** Active step label for the substatus pill while generating. */
  activeStepId: GenerationStepId | null;
}

const WRITE_LIKE_TOOL_RE = /^(write|edit|multi_edit|multiedit|bash|exec)$/i;

function toolTargetName(input: Record<string, unknown> | undefined): string | null {
  if (!input) return null;
  const raw = input.file_path ?? input.filePath ?? input.path ?? input.file;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const segments = raw.trim().split(/[\\/]/);
  return segments[segments.length - 1] || raw.trim();
}

function truncateActivity(text: string, max = 80): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

/** Derive OD-style understand → generate → prepare steps from live task messages. */
export function deriveDesignGenerationSteps(input: {
  taskMessages: readonly TaskMessagePayload[];
  hasPreviewHtml: boolean;
  failed: boolean;
}): GenerationPreviewStep[] {
  const hasText = input.taskMessages.some(
    (m) =>
      (m.type === "text" || m.type === "thinking") &&
      (m.content?.trim().length ?? 0) > 0,
  );
  const hasToolUse = input.taskMessages.some((m) => m.type === "tool_use");
  const hasWriteLikeTool = input.taskMessages.some(
    (m) =>
      m.type === "tool_use" &&
      typeof m.tool === "string" &&
      WRITE_LIKE_TOOL_RE.test(m.tool),
  );

  let understand: GenerationStepStatus = "running";
  if (input.failed && !hasText && !hasToolUse) {
    understand = "failed";
  } else if (hasText || hasToolUse) {
    understand = "succeeded";
  }

  let generate: GenerationStepStatus = "pending";
  if (understand === "succeeded") generate = "running";
  if (hasWriteLikeTool) generate = "succeeded";
  if (input.failed && understand === "succeeded" && !hasWriteLikeTool) {
    generate = "failed";
  }

  let prepare: GenerationStepStatus = "pending";
  if (generate === "succeeded") prepare = "running";
  if (input.hasPreviewHtml) prepare = "succeeded";
  if (input.failed && generate === "succeeded" && !input.hasPreviewHtml) {
    prepare = "failed";
  }

  return [
    { id: "understand", status: understand },
    { id: "generate", status: generate },
    { id: "prepare", status: prepare },
  ];
}

function generationDetailLabel(taskMessages: readonly TaskMessagePayload[]): string | null {
  for (let i = taskMessages.length - 1; i >= 0; i -= 1) {
    const event = taskMessages[i]!;
    if (
      event.type === "tool_use" &&
      typeof event.tool === "string" &&
      WRITE_LIKE_TOOL_RE.test(event.tool)
    ) {
      const target = toolTargetName(event.input);
      if (target) return target;
    }
  }
  for (let i = taskMessages.length - 1; i >= 0; i -= 1) {
    const event = taskMessages[i]!;
    if (event.type === "thinking" && event.content?.trim()) {
      return truncateActivity(event.content);
    }
  }
  return null;
}

function isActivePendingTask(task: ChatPendingTask | null | undefined): boolean {
  if (!task?.task_id || task.task_id.startsWith("optimistic-")) return false;
  return (
    task.status === "running" ||
    task.status === "dispatched" ||
    task.status === "queued"
  );
}

/** True once a prior assistant turn finished — i.e. this is a follow-up edit. */
export function hasPriorCompletedDesignRun(input: {
  messages: readonly { role: string; task_id: string | null }[];
  pendingTaskId?: string | null;
}): boolean {
  const pending =
    input.pendingTaskId && !input.pendingTaskId.startsWith("optimistic-")
      ? input.pendingTaskId
      : null;
  return input.messages.some(
    (message) =>
      message.role === "assistant" &&
      !!message.task_id &&
      !message.task_id.startsWith("optimistic-") &&
      message.task_id !== pending,
  );
}

function activeStepId(steps: GenerationPreviewStep[]): GenerationStepId | null {
  const running = steps.find((step) => step.status === "running");
  if (running) return running.id;
  const visible = steps.filter((step) => step.status !== "pending");
  return visible[visible.length - 1]?.id ?? null;
}

/** Build preview overlay model — null when the live HTML preview should take over. */
export function buildDesignGenerationPreviewModel(input: {
  pendingTask: ChatPendingTask | null | undefined;
  taskMessages: readonly TaskMessagePayload[];
  hasPreviewHtml: boolean;
  /** When true, a prior assistant turn already produced previewable output. */
  hasPriorCompletedRun?: boolean;
}): GenerationPreviewModel | null {
  const failed = input.pendingTask?.status === "failed";
  const active = isActivePendingTask(input.pendingTask);

  if (!active && !failed) return null;

  // Follow-up edits keep the live preview visible — only the initial bootstrap
  // uses the full-screen generation stage (OD parity).
  if (input.hasPriorCompletedRun && !failed) return null;

  // Seeded example templates may exist before the agent writes — keep the
  // generation stage until the run finishes, matching OD's preview gate.
  const previewReady = input.hasPreviewHtml && !active;
  if (previewReady) return null;

  const steps = deriveDesignGenerationSteps({
    taskMessages: input.taskMessages,
    hasPreviewHtml: previewReady,
    failed,
  });

  return {
    phase: failed ? "failed" : "generating",
    steps,
    detailLabel: active ? generationDetailLabel(input.taskMessages) : null,
    activeStepId: active ? activeStepId(steps) : null,
  };
}
