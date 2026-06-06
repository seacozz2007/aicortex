"use client";

import { useState, useMemo } from "react";
import type { QuestionForm, FormOption } from "../lib/question-form-parser";
import { formatFormAnswers, formOptionValueForLabel } from "../lib/question-form-parser";
import { useT } from "../../i18n";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface QuestionFormViewProps {
  form: QuestionForm;
  /** Whether the user can still submit answers. Disable for streaming or
   *  when the assistant turn is no longer the most recent. */
  interactive: boolean;
  /** Pre-existing answers from a follow-up user message that started with
   *  "[form answers — <id>]". When set the form renders in a locked state
   *  showing what the user picked. */
  submittedAnswers?: Record<string, string | string[]>;
  /** Fires when the user clicks the submit button. The first argument is the
   *  formatted prose user message; the second is the raw answers map. */
  onSubmit?: (text: string, answers: Record<string, string | string[]>) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuestionFormView({
  form,
  interactive,
  submittedAnswers,
  onSubmit,
}: QuestionFormViewProps) {
  const { t } = useT("chat");
  const initial = useMemo(
    () => buildInitialState(form, submittedAnswers),
    [form, submittedAnswers],
  );
  const [answers, setAnswers] = useState<Record<string, string | string[]>>(initial);
  const locked = !interactive || submittedAnswers !== undefined;
  const currentAnswers = submittedAnswers ?? answers;

  function update(id: string, value: string | string[]) {
    if (locked) return;
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function toggleCheckbox(id: string, option: string, maxSelections?: number) {
    if (locked) return;
    setAnswers((prev) => {
      const current = Array.isArray(prev[id]) ? (prev[id] as string[]) : [];
      const has = current.includes(option);
      if (!has && maxSelections !== undefined && current.length >= maxSelections) return prev;
      const next = has ? current.filter((v) => v !== option) : [...current, option];
      return { ...prev, [id]: next };
    });
  }

  function handleSubmit() {
    if (locked || !onSubmit || !ready) return;
    onSubmit(formatFormAnswers(form, currentAnswers), currentAnswers);
  }

  // Per-question checkbox selection caps
  const withinSelectionLimits = form.questions.every((q) => {
    if (q.type !== "checkbox" || q.maxSelections === undefined) return true;
    const v = currentAnswers[q.id];
    return !Array.isArray(v) || v.length <= q.maxSelections;
  });
  // Required fields must be non-empty
  const requiredAnswered = form.questions.every((q) => {
    if (q.required !== true) return true;
    const v = currentAnswers[q.id];
    if (Array.isArray(v)) return v.length > 0;
    return typeof v === "string" && v.trim().length > 0;
  });
  const ready = withinSelectionLimits && requiredAnswered;

  return (
    <div
      className={`question-form${locked ? " question-form-locked" : ""}`}
      data-form-id={form.id}
    >
      <div className="question-form-head">
        <span className="question-form-icon" aria-hidden>?</span>
        <div className="question-form-titles">
          <div className="question-form-title">{form.title}</div>
          {form.description ? (
            <div className="question-form-desc">{form.description}</div>
          ) : null}
        </div>
        {locked ? (
          <span className="question-form-pill">
            {t(($) => $.question_form.answered)}
          </span>
        ) : null}
      </div>

      <div className="question-form-body">
        {form.questions.map((q) => {
          const value = currentAnswers[q.id];
          return (
            <div key={q.id} className="qf-field">
              <label className="qf-label">
                <span>{q.label}</span>
                {q.required ? (
                  <span className="qf-required" aria-label={t(($) => $.question_form.required)}>
                    *
                  </span>
                ) : null}
              </label>
              {q.help ? <div className="qf-help">{q.help}</div> : null}

              {/* radio */}
              {q.type === "radio" && q.options ? (
                <div className="qf-options" role="radiogroup" aria-label={q.label}>
                  {q.options.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={value === opt.value}
                      disabled={locked}
                      title={opt.description}
                      className={`qf-chip${value === opt.value ? " qf-chip-on" : ""}`}
                      onClick={() => update(q.id, opt.value)}
                    >
                      <OptionCopy option={opt} />
                    </button>
                  ))}
                </div>
              ) : null}

              {/* checkbox */}
              {q.type === "checkbox" && q.options ? (
                <div className="qf-options" role="group" aria-label={q.label}>
                  {q.options.map((opt) => {
                    const arr = Array.isArray(value) ? value : [];
                    const on = arr.includes(opt.value);
                    const maxed =
                      q.maxSelections !== undefined &&
                      !on &&
                      arr.length >= q.maxSelections;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        disabled={locked || maxed}
                        title={opt.description}
                        className={`qf-chip${on ? " qf-chip-on" : ""}${maxed ? " qf-chip-disabled" : ""}`}
                        onClick={() =>
                          toggleCheckbox(q.id, opt.value, q.maxSelections)
                        }
                      >
                        <OptionCopy option={opt} />
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {/* select */}
              {q.type === "select" && q.options ? (
                <select
                  className="qf-select"
                  value={typeof value === "string" ? value : ""}
                  disabled={locked}
                  onChange={(e) => update(q.id, e.target.value)}
                >
                  <option value="" disabled>
                    {q.placeholder ?? t(($) => $.question_form.choose)}
                  </option>
                  {q.options.map((opt) => (
                    <option
                      key={opt.value}
                      value={opt.value}
                      title={opt.description}
                    >
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : null}

              {/* text */}
              {q.type === "text" ? (
                <input
                  type="text"
                  className="qf-input"
                  value={typeof value === "string" ? value : ""}
                  placeholder={q.placeholder}
                  disabled={locked}
                  onChange={(e) => update(q.id, e.target.value)}
                />
              ) : null}

              {/* textarea */}
              {q.type === "textarea" ? (
                <textarea
                  className="qf-textarea"
                  value={typeof value === "string" ? value : ""}
                  placeholder={q.placeholder}
                  disabled={locked}
                  rows={3}
                  onChange={(e) => update(q.id, e.target.value)}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="question-form-foot">
        {locked ? (
          <span className="qf-locked-note">
            {submittedAnswers
              ? t(($) => $.question_form.locked_submitted)
              : t(($) => $.question_form.locked_prev)}
          </span>
        ) : (
          <span className="qf-hint">{t(($) => $.question_form.hint)}</span>
        )}
        {!locked ? (
          <button
            type="button"
            className="qf-submit-btn"
            onClick={handleSubmit}
            disabled={!ready}
            title={
              ready
                ? t(($) => $.question_form.submit_title)
                : t(($) => $.question_form.submit_disabled_title)
            }
          >
            {form.submitLabel ?? t(($) => $.question_form.submit_default)}
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function OptionCopy({ option }: { option: FormOption }) {
  return (
    <span className="qf-chip-copy">
      <span>{option.label}</span>
      {option.description ? (
        <span className="qf-chip-desc">{option.description}</span>
      ) : null}
    </span>
  );
}

function buildInitialState(
  form: QuestionForm,
  submitted: Record<string, string | string[]> | undefined,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const q of form.questions) {
    if (submitted && submitted[q.id] !== undefined) {
      out[q.id] = canonicalizeValue(q, submitted[q.id]!);
      continue;
    }
    if (q.defaultValue !== undefined) {
      out[q.id] = canonicalizeValue(q, q.defaultValue);
      continue;
    }
    if (q.type === "checkbox") {
      out[q.id] = [];
    } else {
      out[q.id] = "";
    }
  }
  return out;
}

function canonicalizeValue(
  q: { options?: FormOption[] },
  value: string | string[],
): string | string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => formOptionValueForLabel(q, entry));
  }
  return formOptionValueForLabel(q, value);
}
