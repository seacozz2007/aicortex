import { describe, it, expect } from "vitest";
import {
  splitOnQuestionForms,
  hasUnterminatedQuestionForm,
  findFirstQuestionForm,
  formatFormAnswers,
  parseSubmittedAnswers,
  formOptionValueForLabel,
  formOptionLabelForValue,
} from "./question-form-parser";

// ─── splitOnQuestionForms ───────────────────────────────────────────────

describe("splitOnQuestionForms", () => {
  it("returns a single text segment for plain content", () => {
    const result = splitOnQuestionForms("Hello, how can I help?");
    expect(result).toEqual([
      { kind: "text", text: "Hello, how can I help?" },
    ]);
  });

  it("extracts a simple form with radio options", () => {
    const input = [
      "Let me ask a few questions.",
      '<question-form id="discovery" title="Brief">',
      "{",
      '  "questions": [',
      '    {"id": "platform", "label": "Platform", "type": "radio",',
      '     "options": ["Mobile", "Desktop", "Responsive"], "required": true}',
      "  ]",
      "}",
      "</question-form>",
      "After you answer, I'll get started.",
    ].join("\n");

    const result = splitOnQuestionForms(input);
    expect(result).toHaveLength(3);
    expect(result[0]!.kind).toBe("text");
    expect(result[1]!.kind).toBe("form");
    expect(result[2]!.kind).toBe("text");

    const form = (result[1] as { kind: "form"; form: any }).form;
    expect(form.id).toBe("discovery");
    expect(form.title).toBe("Brief");
    expect(form.questions).toHaveLength(1);
    expect(form.questions[0]!.type).toBe("radio");
    expect(form.questions[0]!.required).toBe(true);
  });

  it("parses all question types", () => {
    const input = [
      '<question-form>',
      "{",
      '  "questions": [',
      '    {"id": "q1", "label": "Radio", "type": "radio", "options": ["A", "B"]},',
      '    {"id": "q2", "label": "Check", "type": "checkbox", "options": ["X", "Y"], "maxSelections": 2},',
      '    {"id": "q3", "label": "Dropdown", "type": "select", "options": ["P", "Q"]},',
      '    {"id": "q4", "label": "Text", "type": "text", "placeholder": "Type here"},',
      '    {"id": "q5", "label": "Long", "type": "textarea"}',
      "  ]",
      "}",
      "</question-form>",
    ].join("\n");

    const result = splitOnQuestionForms(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.kind).toBe("form");
    const form = (result[0] as any).form;
    expect(form.questions).toHaveLength(5);
    expect(form.questions[0]!.type).toBe("radio");
    expect(form.questions[1]!.type).toBe("checkbox");
    expect(form.questions[1]!.maxSelections).toBe(2);
    expect(form.questions[2]!.type).toBe("select");
    expect(form.questions[3]!.type).toBe("text");
    expect(form.questions[4]!.type).toBe("textarea");
  });

  it("alias types are normalized", () => {
    const input = [
      '<question-form>',
      "{",
      '  "questions": [',
      '    {"id": "q1", "label": "Q", "type": "single"},',
      '    {"id": "q2", "label": "Q", "type": "multi"},',
      '    {"id": "q3", "label": "Q", "type": "dropdown"},',
      '    {"id": "q4", "label": "Q", "type": "paragraph"}',
      "  ]",
      "}",
      "</question-form>",
    ].join("\n");

    const result = splitOnQuestionForms(input);
    const form = (result[0] as any).form;
    expect(form.questions[0]!.type).toBe("radio");
    expect(form.questions[1]!.type).toBe("checkbox");
    expect(form.questions[2]!.type).toBe("select");
    expect(form.questions[3]!.type).toBe("textarea");
  });

  it("reads id and title from JSON body when attributes absent", () => {
    const input = [
      "<question-form>",
      "{",
      '  "id": "from-body",',
      '  "title": "From Body",',
      '  "questions": [{"id": "q", "label": "Q", "type": "text"}]',
      "}",
      "</question-form>",
    ].join("\n");

    const result = splitOnQuestionForms(input);
    const form = (result[0] as any).form;
    expect(form.id).toBe("from-body");
    expect(form.title).toBe("From Body");
  });

  it("handles JSON wrapped in fenced code block", () => {
    const input = [
      '<question-form id="x" title="T">',
      "```json",
      '{ "questions": [{"id": "q", "label": "Q", "type": "text"}] }',
      "```",
      "</question-form>",
    ].join("\n");

    const result = splitOnQuestionForms(input);
    expect(result[0]!.kind).toBe("form");
  });

  it("accepts ask-question as an alias tag", () => {
    const input = [
      '<ask-question id="x" title="T">',
      '{ "questions": [{"id": "q", "label": "Q", "type": "text"}] }',
      "</ask-question>",
    ].join("\n");

    const result = splitOnQuestionForms(input);
    expect(result[0]!.kind).toBe("form");
  });

  it("leaves malformed JSON as text", () => {
    const input = [
      '<question-form>',
      "not valid json at all",
      "</question-form>",
    ].join("\n");

    const result = splitOnQuestionForms(input);
    // The block is kept as text since the JSON can't be parsed
    expect(result[0]!.kind).toBe("text");
  });

  it("leaves unterminated form as text", () => {
    const input = '<question-form id="x">{"questions":[1,2,3]}';
    const result = splitOnQuestionForms(input);
    expect(result[0]!.kind).toBe("text");
  });

  it("handles option objects with value/label/description", () => {
    const input = [
      '<question-form>',
      "{",
      '  "questions": [',
      '    {"id": "q", "label": "Q", "type": "radio", "options": [',
      '      {"label": "Mobile", "value": "mobile", "description": "iOS and Android apps"},',
      '      {"label": "Desktop", "value": "desktop"}',
      "    ]}",
      "  ]",
      "}",
      "</question-form>",
    ].join("\n");

    const result = splitOnQuestionForms(input);
    const form = (result[0] as any).form;
    expect(form.questions[0]!.options).toHaveLength(2);
    expect(form.questions[0]!.options![0]!.value).toBe("mobile");
    expect(form.questions[0]!.options![0]!.description).toBe("iOS and Android apps");
  });

  it("parses defaultValue (and alias 'default')", () => {
    const input = [
      '<question-form>',
      "{",
      '  "questions": [',
      '    {"id": "q", "label": "Q", "type": "radio", "options": ["A", "B"], "default": "A"}',
      "  ]",
      "}",
      "</question-form>",
    ].join("\n");

    const result = splitOnQuestionForms(input);
    const form = (result[0] as any).form;
    expect(form.questions[0]!.defaultValue).toBe("A");
  });
});

// ─── hasUnterminatedQuestionForm ─────────────────────────────────────────

describe("hasUnterminatedQuestionForm", () => {
  it("returns false for plain text", () => {
    expect(hasUnterminatedQuestionForm("Hello")).toBe(false);
  });

  it("returns true when open tag has no close", () => {
    expect(hasUnterminatedQuestionForm('<question-form id="x">{"q":1}')).toBe(true);
  });

  it("returns false when tag is properly closed", () => {
    expect(
      hasUnterminatedQuestionForm(
        '<question-form id="x">{"questions":[{"id":"q","label":"Q","type":"text"}]}</question-form>',
      ),
    ).toBe(false);
  });
});

// ─── findFirstQuestionForm ───────────────────────────────────────────────

describe("findFirstQuestionForm", () => {
  it("returns null for plain text", () => {
    expect(findFirstQuestionForm("Hello")).toBeNull();
  });

  it("returns the first form", () => {
    const result = findFirstQuestionForm(
      '<question-form id="x" title="T">{"questions":[{"id":"q","label":"Q","type":"text"}]}</question-form>',
    );
    expect(result).not.toBeNull();
    expect(result!.form.id).toBe("x");
  });
});

// ─── formatFormAnswers / parseSubmittedAnswers roundtrip ─────────────────

describe("formatFormAnswers and parseSubmittedAnswers", () => {
  it("roundtrips radio, select, text, textarea answers", () => {
    const form = {
      id: "test",
      title: "Test",
      questions: [
        {
          id: "platform",
          label: "Platform",
          type: "radio" as const,
          options: [
            { label: "Mobile", value: "mobile" },
            { label: "Desktop", value: "desktop" },
          ],
        },
        {
          id: "notes",
          label: "Notes",
          type: "textarea" as const,
        },
      ],
    };

    const answers = { platform: "mobile", notes: "No special requirements" };
    const formatted = formatFormAnswers(form, answers);
    expect(formatted).toContain("[form answers — test]");
    expect(formatted).toContain("- Platform: Mobile [value: mobile]");
    expect(formatted).toContain("- Notes: No special requirements");

    // Parse back
    const parsed = parseSubmittedAnswers(form, formatted);
    expect(parsed).not.toBeNull();
    expect(parsed!["platform"]).toBe("mobile");
    expect(parsed!["notes"]).toBe("No special requirements");
  });

  it("roundtrips checkbox answers", () => {
    const form = {
      id: "test",
      title: "Test",
      questions: [
        {
          id: "features",
          label: "Features",
          type: "checkbox" as const,
          options: [
            { label: "Auth", value: "auth" },
            { label: "Payments", value: "payments" },
            { label: "Search", value: "search" },
          ],
        },
      ],
    };

    const answers = { features: ["auth", "search"] };
    const formatted = formatFormAnswers(form, answers);
    expect(formatted).toContain("- Features: Auth [value: auth], Search [value: search]");

    const parsed = parseSubmittedAnswers(form, formatted);
    expect(parsed).not.toBeNull();
    expect(parsed!["features"]).toEqual(["auth", "search"]);
  });

  it("handles skipped answers", () => {
    const form = {
      id: "test",
      title: "Test",
      questions: [{ id: "q", label: "Q", type: "text" as const }],
    };

    const formatted = formatFormAnswers(form, { q: "" });
    expect(formatted).toContain("- Q: (skipped)");
  });

  it("returns null for non-form-answer user messages", () => {
    const form = {
      id: "test",
      title: "Test",
      questions: [{ id: "q", label: "Q", type: "text" as const }],
    };
    expect(parseSubmittedAnswers(form, "Hello, can you help?")).toBeNull();
  });
});

// ─── option helpers ──────────────────────────────────────────────────────

describe("formOptionValueForLabel / formOptionLabelForValue", () => {
  const question = {
    options: [
      { label: "Mobile", value: "mobile" },
      { label: "Desktop", value: "desktop" },
    ],
  };

  it("resolves value from label", () => {
    expect(formOptionValueForLabel(question, "Mobile")).toBe("mobile");
  });

  it("resolves label from value", () => {
    expect(formOptionLabelForValue(question, "mobile")).toBe("Mobile");
  });

  it("falls back to input if not found", () => {
    expect(formOptionValueForLabel(question, "Unknown")).toBe("Unknown");
    expect(formOptionLabelForValue(question, "unknown")).toBe("unknown");
  });
});
