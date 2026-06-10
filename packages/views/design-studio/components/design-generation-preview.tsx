"use client";

import { Sparkles, Check, X } from "lucide-react";
import type {
  GenerationPreviewModel,
  GenerationPreviewStep,
} from "@aicortex/core/design/generation-preview";
import { useT } from "../../i18n";
import styles from "./design-generation-preview.module.css";

const STEP_LABEL_KEYS: Record<
  GenerationPreviewStep["id"],
  "step_understand" | "step_generate" | "step_prepare"
> = {
  understand: "step_understand",
  generate: "step_generate",
  prepare: "step_prepare",
};

export function DesignGenerationPreview({ model }: { model: GenerationPreviewModel }) {
  const { t } = useT("design");
  const generating = model.phase === "generating";
  const visibleSteps = model.steps.filter((step) => step.status !== "pending");

  const title =
    model.phase === "failed"
      ? t(($) => $.preview.generation.failed_title)
      : t(($) => $.preview.generation.title);

  return (
    <div className={styles.workspace}>
      <section
        className={styles.stage}
        aria-live="polite"
        aria-busy={generating}
        data-phase={model.phase}
        data-testid="design-generation-preview"
      >
      <div
        className={[
          styles.mark,
          generating ? styles.markActive : "",
          model.phase === "failed" ? styles.markFailed : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-hidden
      >
        {model.phase === "failed" ? (
          <X className="size-6" />
        ) : (
          <Sparkles className="size-6" />
        )}
      </div>

      <h1 className={styles.title}>{title}</h1>

      <ol className={styles.steps}>
        {visibleSteps.map((step) => (
          <li
            key={step.id}
            className={[
              styles.step,
              step.status === "running" && generating ? styles.stepRunning : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-status={step.status}
          >
            <span className={styles.stepIcon} aria-hidden>
              {step.status === "succeeded" ? (
                <Check className="size-3" />
              ) : step.status === "failed" ? (
                <X className="size-3" />
              ) : (
                <span
                  className={[
                    styles.stepDot,
                    generating && step.status === "running" ? styles.stepDotRunning : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              )}
            </span>
            <span>{t(($) => $.preview.generation[STEP_LABEL_KEYS[step.id]])}</span>
          </li>
        ))}
      </ol>

      {generating && model.detailLabel ? (
        <div className={styles.substatus}>
          <span className={styles.substatusLabel}>{model.detailLabel}</span>
        </div>
      ) : null}
      </section>
    </div>
  );
}
