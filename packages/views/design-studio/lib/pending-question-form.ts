import type { ChatMessage } from "@aicortex/core/types";
import type { ChatTimelineItem } from "@aicortex/core/chat";
import {
  findFirstQuestionForm,
  hasUnterminatedQuestionForm,
  type QuestionForm,
} from "../../chat/lib/question-form-parser";

function isFormAnswer(content: string | undefined): boolean {
  if (!content) return false;
  return content.trimStart().startsWith("[form answers");
}

function textFromTimeline(items: ChatTimelineItem[]): string {
  return items
    .filter((item) => item.type === "text")
    .map((item) => item.content ?? "")
    .join("");
}

export function findLatestPendingQuestionForm(
  messages: ChatMessage[],
  liveTimeline?: ChatTimelineItem[],
): { form: QuestionForm; sourceMessageId?: string } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    const next = messages[i + 1];
    if (isFormAnswer(next?.content)) continue;
    const found = findFirstQuestionForm(msg.content);
    if (found) {
      return { form: found.form, sourceMessageId: msg.id };
    }
  }

  if (liveTimeline && liveTimeline.length > 0) {
    const liveText = textFromTimeline(liveTimeline);
    if (liveText && !hasUnterminatedQuestionForm(liveText)) {
      const found = findFirstQuestionForm(liveText);
      if (found) return { form: found.form };
    }
  }

  return null;
}
