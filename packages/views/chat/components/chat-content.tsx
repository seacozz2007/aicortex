"use client";

import { useMemo } from "react";
import { Markdown } from "../../common/markdown";
import { splitOnQuestionForms, parseSubmittedAnswers, type QuestionForm } from "../lib/question-form-parser";
import { QuestionFormView } from "./question-form-view";
import { ChevronRight } from "lucide-react";
import { useT } from "../../i18n";

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
  hideForms = false,
  onFormSubmit,
  onOpenQuestionsPanel,
  nextUserContent,
}: {
  content: string;
  /** When true, embedded forms show a submit button and accept input. */
  interactive?: boolean;
  /** When true, forms render as a compact card pointing to the studio panel. */
  hideForms?: boolean;
  /** Fires when a form is submitted, with the formatted prose answer. */
  onFormSubmit?: (text: string) => void;
  /** Opens the design studio Questions panel (when hideForms is true). */
  onOpenQuestionsPanel?: () => void;
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
          if (hideForms && !submitted) {
            return (
              <QuestionFormRedirectCard
                key={`cf-${i}`}
                form={seg.form}
                onOpen={onOpenQuestionsPanel}
              />
            );
          }
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

function QuestionFormRedirectCard({
  form,
  onOpen,
}: {
  form: QuestionForm;
  onOpen?: () => void;
}) {
  const { t } = useT("chat");
  const Wrapper = onOpen ? "button" : "div";
  return (
    <Wrapper
      type={onOpen ? "button" : undefined}
      onClick={onOpen}
      className="question-form-redirect group"
    >
      <div className="flex items-start gap-3">
        <span className="question-form-icon" aria-hidden>?</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold tracking-tight">
            {form.title || t(($) => $.question_form.studio_card_title)}
          </div>
          {form.description ? (
            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground/90 line-clamp-1">
              {form.description}
            </p>
          ) : (
            <p className="mt-0.5 text-[12px] text-muted-foreground/90">
              {t(($) => $.question_form.studio_redirect)}
            </p>
          )}
        </div>
        {onOpen ? (
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
        ) : null}
      </div>
    </Wrapper>
  );
}
