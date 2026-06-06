/**
 * Parser for inline <question-form>...</question-form> blocks the agent
 * emits to ask the user a structured set of clarifying questions.
 *
 * Body must be JSON. Example:
 *
 *   <question-form id="discovery" title="Quick brief">
 *   {
 *     "questions": [
 *       { "id": "platform", "label": "Platform", "type": "radio",
 *         "options": ["Mobile (iOS/Android)", "Desktop web", "Responsive"],
 *         "required": true },
 *       { "id": "audience", "label": "Primary audience", "type": "text",
 *         "placeholder": "e.g. SaaS buyers" }
 *     ]
 *   }
 *   </question-form>
 *
 * Splits a final assistant text payload into ordered segments — prose +
 * forms — so the chat bubble can render the form inline.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QuestionType =
  | "radio"
  | "checkbox"
  | "select"
  | "text"
  | "textarea";

export interface FormOption {
  label: string;
  value: string;
  description?: string;
}

export interface FormQuestion {
  id: string;
  label: string;
  type: QuestionType;
  options?: FormOption[];
  placeholder?: string;
  required?: boolean;
  help?: string;
  defaultValue?: string | string[];
  /** Only applies when `type === 'checkbox'`. Caps the number of selected options. */
  maxSelections?: number;
}

export interface QuestionForm {
  id: string;
  title: string;
  description?: string;
  questions: FormQuestion[];
  submitLabel?: string;
}

export type FormSegment =
  | { kind: "text"; text: string }
  | { kind: "form"; form: QuestionForm; raw: string };

// ---------------------------------------------------------------------------
// Regex
// ---------------------------------------------------------------------------

const OPEN_RE = /<(question-form|ask-question)\b([^>]*)>/i;

// ---------------------------------------------------------------------------
// splitOnQuestionForms
// ---------------------------------------------------------------------------

export function splitOnQuestionForms(input: string): FormSegment[] {
  const out: FormSegment[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    const slice = input.slice(cursor);
    const m = OPEN_RE.exec(slice);
    if (!m) {
      out.push({ kind: "text", text: slice });
      break;
    }
    const tagName = (m[1] ?? "question-form").toLowerCase();
    const closeTag = `</${tagName}>`;
    const openStart = cursor + m.index;
    const openEnd = openStart + m[0].length;
    const closeIdx = findCloseTag(input, openEnd, closeTag);
    if (closeIdx === -1) {
      // Unterminated — leave the rest as prose so we don't swallow it.
      out.push({ kind: "text", text: slice });
      break;
    }
    if (openStart > cursor) {
      out.push({ kind: "text", text: input.slice(cursor, openStart) });
    }
    const body = input.slice(openEnd, closeIdx);
    const attrs = parseAttrs(m[2] ?? "");
    const form = tryParseForm(body, attrs);
    const blockEnd = closeIdx + closeTag.length;
    if (form) {
      out.push({ kind: "form", form, raw: input.slice(openStart, blockEnd) });
    } else {
      // Malformed — keep raw text so the user can still see it.
      out.push({ kind: "text", text: input.slice(openStart, blockEnd) });
    }
    cursor = blockEnd;
  }
  return out;
}

// ---------------------------------------------------------------------------
// hasUnterminatedQuestionForm
// ---------------------------------------------------------------------------

/** True when a question-form open tag is present but its close tag hasn't
 *  streamed in yet. Used to suppress raw markup during streaming. */
export function hasUnterminatedQuestionForm(input: string): boolean {
  let cursor = 0;
  while (cursor < input.length) {
    const slice = input.slice(cursor);
    const m = OPEN_RE.exec(slice);
    if (!m) break;
    const tagName = (m[1] ?? "question-form").toLowerCase();
    const closeTag = `</${tagName}>`;
    const openEnd = cursor + m.index + m[0].length;
    const closeIdx = findCloseTag(input, openEnd, closeTag);
    if (closeIdx === -1) return true;
    cursor = closeIdx + closeTag.length;
  }
  return false;
}

// ---------------------------------------------------------------------------
// findFirstQuestionForm
// ---------------------------------------------------------------------------

export function findFirstQuestionForm(
  input: string,
): { form: QuestionForm; raw: string } | null {
  for (const seg of splitOnQuestionForms(input)) {
    if (seg.kind === "form") return { form: seg.form, raw: seg.raw };
  }
  return null;
}

// ---------------------------------------------------------------------------
// formatFormAnswers — format user answers as a prose user message
// ---------------------------------------------------------------------------

export function formatFormAnswers(
  form: QuestionForm,
  answers: Record<string, string | string[]>,
): string {
  const lines: string[] = [];
  lines.push(`[form answers — ${form.id}]`);
  for (const q of form.questions) {
    const v = answers[q.id];
    let display: string;
    if (Array.isArray(v)) {
      display =
        v.length > 0
          ? v.map((val) => formOptionDisplayForValue(q, val)).join(", ")
          : "(skipped)";
    } else if (typeof v === "string") {
      display =
        v.trim().length > 0
          ? formOptionDisplayForValue(q, v.trim())
          : "(skipped)";
    } else {
      display = "(skipped)";
    }
    lines.push(`- ${q.label}: ${display}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// parseSubmittedAnswers — reverse formatFormAnswers for history rendering
// ---------------------------------------------------------------------------

export function parseSubmittedAnswers(
  form: QuestionForm,
  userMessageContent: string,
): Record<string, string | string[]> | null {
  const lines = userMessageContent.split("\n").map((l) => l.trim());
  if (lines.length === 0) return null;
  const header = lines[0] ?? "";
  if (!/^\[form answers/i.test(header)) return null;

  const answers: Record<string, string | string[]> = {};
  const labelToId = new Map<string, string>();
  for (const q of form.questions) labelToId.set(q.label.toLowerCase(), q.id);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = /^[-*]\s*([^:]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const labelKey = m[1]!.trim().toLowerCase();
    const rawValue = m[2]!.trim();
    const id = labelToId.get(labelKey);
    if (!id) continue;
    const q = form.questions.find((x) => x.id === id);
    if (!q) continue;

    if (q.type === "checkbox") {
      answers[id] = rawValue
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.toLowerCase() !== "(skipped)")
        .map((s) => formOptionValueForLabel(q, parseSubmittedOptionToken(s)));
    } else {
      answers[id] =
        rawValue.toLowerCase() === "(skipped)"
          ? ""
          : formOptionValueForLabel(q, parseSubmittedOptionToken(rawValue));
    }
  }
  return Object.keys(answers).length > 0 ? answers : null;
}

// ---------------------------------------------------------------------------
// Helpers for option label/value resolution
// ---------------------------------------------------------------------------

export function formOptionLabelForValue(
  question: Pick<FormQuestion, "options">,
  value: string,
): string {
  const match = question.options?.find(
    (opt) => opt.value === value || opt.label === value,
  );
  return match?.label ?? value;
}

export function formOptionValueForLabel(
  question: Pick<FormQuestion, "options">,
  labelOrValue: string,
): string {
  const match = question.options?.find(
    (opt) => opt.value === labelOrValue || opt.label === labelOrValue,
  );
  return match?.value ?? labelOrValue;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function findCloseTag(
  input: string,
  from: number,
  closeTag: string,
): number {
  const closeLower = closeTag.toLowerCase();
  const tagLen = closeTag.length;
  const maxStart = input.length - tagLen;
  for (let i = from; i <= maxStart; i++) {
    if (input.slice(i, i + tagLen).toLowerCase() === closeLower) {
      return i;
    }
  }
  return -1;
}

function parseAttrs(raw: string): Record<string, string> {
  const re = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    out[m[1] as string] = (m[2] ?? m[3] ?? "") as string;
  }
  return out;
}

function tryParseForm(
  body: string,
  attrs: Record<string, string>,
): QuestionForm | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  // Allow the JSON to be wrapped in a fenced ```json block
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let data: unknown;
  try {
    data = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const rawQuestions = Array.isArray(obj.questions) ? obj.questions : null;
  if (!rawQuestions) return null;

  const questions: FormQuestion[] = [];
  rawQuestions.forEach((q, i) => {
    const mapped = mapRawQuestion(q, i);
    if (mapped) questions.push(mapped);
  });
  if (questions.length === 0) return null;

  const id =
    attrs.id ?? (typeof obj.id === "string" ? obj.id : "discovery");
  const title =
    attrs.title ??
    (typeof obj.title === "string" ? obj.title : "A few quick questions");
  const description =
    typeof obj.description === "string" ? obj.description : undefined;
  const submitLabel =
    typeof obj.submitLabel === "string" ? obj.submitLabel : undefined;

  return {
    id,
    title,
    questions,
    ...(description ? { description } : {}),
    ...(submitLabel ? { submitLabel } : {}),
  };
}

function mapRawQuestion(
  q: unknown,
  index: number,
): FormQuestion | null {
  if (!q || typeof q !== "object") return null;
  const qo = q as Record<string, unknown>;
  const id =
    typeof qo.id === "string" && qo.id.trim().length > 0
      ? qo.id.trim()
      : `q${index + 1}`;
  const label = typeof qo.label === "string" ? qo.label : id;
  const type = normalizeType(qo.type);
  const options = parseOptions(qo.options);
  const placeholder =
    typeof qo.placeholder === "string" ? qo.placeholder : undefined;
  const help = typeof qo.help === "string" ? qo.help : undefined;
  const required = qo.required === true;
  const maxSelections =
    typeof qo.maxSelections === "number" &&
    Number.isInteger(qo.maxSelections) &&
    qo.maxSelections > 0
      ? qo.maxSelections
      : undefined;
  const defaultValue = parseDefaultValue(qo, options);

  return {
    id,
    label,
    type,
    ...(options ? { options } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(help ? { help } : {}),
    ...(required ? { required } : {}),
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(maxSelections !== undefined && type === "checkbox"
      ? { maxSelections }
      : {}),
  };
}

function normalizeType(raw: unknown): QuestionType {
  if (typeof raw !== "string") return "text";
  const lower = raw.toLowerCase().trim();
  if (lower === "radio" || lower === "single" || lower === "choice")
    return "radio";
  if (lower === "checkbox" || lower === "multi" || lower === "multiple")
    return "checkbox";
  if (lower === "select" || lower === "dropdown") return "select";
  if (lower === "textarea" || lower === "long" || lower === "paragraph")
    return "textarea";
  return "text";
}

function parseOptions(raw: unknown): FormOption[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const options = raw
    .map(parseOption)
    .filter((opt): opt is FormOption => opt !== null);
  return options.length > 0 ? options : undefined;
}

function parseOption(raw: unknown): FormOption | null {
  if (typeof raw === "string") {
    const label = raw.trim();
    return label.length > 0 ? { label, value: label } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const label =
    typeof obj.label === "string" ? obj.label.trim() : "";
  if (label.length === 0) return null;
  const value =
    typeof obj.value === "string" && obj.value.trim().length > 0
      ? obj.value.trim()
      : label;
  const description =
    typeof obj.description === "string" && obj.description.trim().length > 0
      ? obj.description.trim()
      : undefined;
  return { label, value, ...(description ? { description } : {}) };
}

function parseDefaultValue(
  question: Record<string, unknown>,
  options: FormOption[] | undefined,
): string | string[] | undefined {
  const raw =
    typeof question.defaultValue === "string" ||
    Array.isArray(question.defaultValue)
      ? question.defaultValue
      : typeof question.default === "string"
        ? question.default
        : undefined;
  if (typeof raw === "string")
    return formOptionValueForLabel({ options }, raw);
  if (Array.isArray(raw)) {
    return raw
      .filter((v): v is string => typeof v === "string")
      .map((v) => formOptionValueForLabel({ options }, v));
  }
  return undefined;
}

function formOptionDisplayForValue(
  question: Pick<FormQuestion, "options">,
  value: string,
): string {
  const match = question.options?.find(
    (opt) => opt.value === value || opt.label === value,
  );
  if (!match) return value;
  if (match.value === match.label) return match.label;
  return `${match.label} [value: ${match.value}]`;
}

function parseSubmittedOptionToken(raw: string): string {
  const match = /\s+\[value:\s*([^\]]+)\]\s*$/i.exec(raw);
  if (!match) return raw.trim();
  return match[1]!.trim();
}
