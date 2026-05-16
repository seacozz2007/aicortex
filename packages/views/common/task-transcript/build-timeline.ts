import type { TaskMessagePayload } from "@aicortex/core/types/events";
import { redactSecrets } from "./redact";

/** A unified timeline entry: tool calls, thinking, text, and errors in chronological order. */
export interface TimelineItem {
  seq: number;
  type: "tool_use" | "tool_result" | "thinking" | "text" | "error";
  tool?: string;
  content?: string;
  input?: Record<string, unknown>;
  output?: string;
}

/** Build a chronologically ordered timeline from raw task messages. */
export function buildTimeline(msgs: TaskMessagePayload[]): TimelineItem[] {
  const sorted = [...msgs].sort((a, b) => a.seq - b.seq);
  const items: TimelineItem[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const msg = sorted[i]!;
    const content = msg.content ? redactSecrets(msg.content) : msg.content;
    const output = msg.output ? redactSecrets(msg.output) : msg.output;

    // Filter empty messages: no content, no input, no output, no tool.
    if (isEmpty(msg)) continue;

    // Merge consecutive tool_use + tool_result with the same tool name.
    if (msg.type === "tool_use") {
      const next = sorted[i + 1];
      if (next && next.type === "tool_result" && next.tool === msg.tool) {
        // Merge into a single tool_use item with output attached.
        items.push({
          seq: msg.seq,
          type: "tool_use",
          tool: msg.tool,
          content,
          input: msg.input,
          output: next.output ? redactSecrets(next.output) : next.output,
        });
        i++; // skip the tool_result
        continue;
      }
    }

    items.push({
      seq: msg.seq,
      type: msg.type,
      tool: msg.tool,
      content,
      input: msg.input,
      output,
    });
  }

  return items;
}

function isEmpty(msg: TaskMessagePayload): boolean {
  const hasContent = msg.content && msg.content.trim().length > 0;
  const hasOutput = msg.output && msg.output.trim().length > 0;
  const hasInput = msg.input && Object.keys(msg.input).length > 0;
  const hasTool = msg.tool && msg.tool.trim().length > 0;
  return !hasContent && !hasOutput && !hasInput && !hasTool;
}
