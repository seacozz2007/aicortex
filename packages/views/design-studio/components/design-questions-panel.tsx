"use client";

import { QuestionFormView } from "../../chat/components/question-form-view";
import type { QuestionForm } from "../../chat/lib/question-form-parser";

export function DesignQuestionsPanel({
  form,
  onSubmit,
}: {
  form: QuestionForm;
  onSubmit: (text: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto p-4">
      <QuestionFormView
        form={form}
        interactive
        layout="studio"
        onSubmit={(text) => onSubmit(text)}
      />
    </div>
  );
}
