"use client";

import { useMemo } from "react";
import { Markdown } from "../../common/markdown";
import { splitOnQuestionForms, parseSubmittedAnswers } from "../lib/question-form-parser";
import { QuestionFormView } from "./question-form-view";

/**
 * Shared content renderer that detects <question-form> blocks in agent
 * output and renders them as interactive form components alongside the
 * surrounding markdown prose.
 *
 * Used by both ChatBubble (for the public EndUser view) and the main
 * chat-message-list (AssistantMessage).
 */
export function ChatContent({
  content,
  interactive = false,
  onFormSubmit,
  nextUserContent,
}: {
  content: string;
  /** When true, embedded forms show a submit button and accept input. */
  interactive?: boolean;
  /** Fires when a form is submitted, with the formatted prose answer. */
  onFormSubmit?: (text: string) => void;
  /** Content of the NEXT user message, used to hydrate submitted form state. */
  nextUserContent?: string;
}) {
  const segments = useMemo(() => {
    const segs = splitOnQuestionForms(content);
    if (segs.every((s) => s.kind === "text")) return null;
    return segs;
  }, [content]);

  // Fast path: no forms
  if (!segments) {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        <Markdown>{content}</Markdown>
      </div>
    );
  }

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          return seg.text.trim() ? (
            <div
              key={`ct-${i}`}
              className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
            >
              <Markdown>{seg.text}</Markdown>
            </div>
          ) : null;
        }
        if (seg.kind === "form") {
          const submitted = nextUserContent
            ? parseSubmittedAnswers(seg.form, nextUserContent) ?? undefined
            : undefined;
          return (
            <QuestionFormView
              key={`cf-${i}`}
              form={seg.form}
              interactive={interactive}
              submittedAnswers={submitted}
              onSubmit={
                interactive
                  ? (text) => onFormSubmit?.(text)
                  : undefined
              }
            />
          );
        }
        return null;
      })}
    </>
  );
}
