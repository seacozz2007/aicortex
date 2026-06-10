"use client";

import { GripVertical, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@aicortex/ui/lib/utils";
import { useT } from "../../i18n";
import type { ElementPropertyDraft, SelectedPreviewElement } from "../lib/preview-element";
import { propertyDraftFromElement } from "../lib/preview-element";

const FONT_OPTIONS = [
  "inherit",
  "Arial, sans-serif",
  "Georgia, serif",
  "Times New Roman, serif",
  "Caveat, cursive",
  "Zilla Slab, serif",
  "Shrikhand, cursive",
  "system-ui, sans-serif",
];

const WEIGHT_OPTIONS = ["100", "300", "400", "500", "600", "700", "800", "900"];
const ALIGN_OPTIONS = ["left", "center", "right", "justify"];

function StepperInput({
  label,
  value,
  onChange,
  unit = "px",
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  step?: number;
}) {
  return (
    <label className="space-y-0.5">
      <span className="text-[10px] text-white/35">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - step))}
          className="inline-flex size-6 items-center justify-center rounded border border-white/10 text-white/60 hover:bg-white/8"
        >
          −
        </button>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full min-w-0 rounded-md border border-white/10 bg-black/30 px-1.5 py-1 text-[11px] tabular-nums text-white focus:border-white/25 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => onChange(value + step)}
          className="inline-flex size-6 items-center justify-center rounded border border-white/10 text-white/60 hover:bg-white/8"
        >
          +
        </button>
        {unit ? <span className="text-[10px] text-white/35">{unit}</span> : null}
      </div>
    </label>
  );
}

export function DesignPropertyEditorModal({
  element,
  open,
  onClose,
  onSave,
  onDelete,
  onDraftChange,
}: {
  element: SelectedPreviewElement;
  open: boolean;
  onClose: () => void;
  onSave: (draft: ElementPropertyDraft) => void;
  onDelete: () => void;
  onDraftChange: (draft: ElementPropertyDraft) => void;
}) {
  const { t } = useT("design");
  const [draft, setDraft] = useState<ElementPropertyDraft>(() =>
    propertyDraftFromElement(element),
  );

  useEffect(() => {
    if (!open) return;
    setDraft(propertyDraftFromElement(element));
  }, [element.id, open]);

  const updateDraft = (next: ElementPropertyDraft) => {
    setDraft(next);
    onDraftChange(next);
  };

  if (!open) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-start justify-center overflow-auto bg-black/35 p-4 pt-10">
      <div className="w-full max-w-[320px] overflow-hidden rounded-xl border border-white/10 bg-[#141418] text-white shadow-2xl">
        <header className="flex items-center gap-2 border-b border-white/8 px-3 py-2.5">
          <GripVertical className="size-4 text-white/30" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-medium capitalize">
            {element.label}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-7 items-center justify-center rounded-md text-white/50 hover:bg-white/8 hover:text-white"
            aria-label={t(($) => $.preview.property_editor.close)}
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="max-h-[min(60vh,420px)] space-y-4 overflow-auto px-3 py-3">
          <section>
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-white/45">
              {t(($) => $.preview.property_editor.typography)}
            </p>
            <div className="space-y-2">
              <label className="block space-y-0.5">
                <span className="text-[10px] text-white/35">Font</span>
                <select
                  value={draft.fontFamily}
                  onChange={(e) => updateDraft({ ...draft, fontFamily: e.target.value })}
                  className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white focus:border-white/25 focus:outline-none"
                >
                  {FONT_OPTIONS.map((font) => (
                    <option key={font} value={font}>
                      {font.split(",")[0]?.replace(/['"]/g, "") ?? font}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <StepperInput
                  label="Size"
                  value={draft.fontSize}
                  onChange={(fontSize) => updateDraft({ ...draft, fontSize })}
                />
                <label className="space-y-0.5">
                  <span className="text-[10px] text-white/35">
                    {t(($) => $.preview.property_editor.font_weight)}
                  </span>
                  <select
                    value={draft.fontWeight}
                    onChange={(e) => updateDraft({ ...draft, fontWeight: e.target.value })}
                    className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white focus:border-white/25 focus:outline-none"
                  >
                    {WEIGHT_OPTIONS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2">
                <span className="w-12 text-[10px] text-white/35">Color</span>
                <input
                  type="color"
                  value={draft.color.startsWith("#") ? draft.color : "#000000"}
                  onChange={(e) => updateDraft({ ...draft, color: e.target.value })}
                  className="size-7 cursor-pointer rounded border border-white/10 bg-transparent"
                />
                <input
                  type="text"
                  value={draft.color}
                  onChange={(e) => updateDraft({ ...draft, color: e.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] font-mono text-white focus:border-white/25 focus:outline-none"
                />
              </label>
              <label className="block space-y-0.5">
                <span className="text-[10px] text-white/35">
                  {t(($) => $.preview.property_editor.text_align)}
                </span>
                <select
                  value={draft.textAlign}
                  onChange={(e) => updateDraft({ ...draft, textAlign: e.target.value })}
                  className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white focus:border-white/25 focus:outline-none"
                >
                  {ALIGN_OPTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <StepperInput
                  label="Line"
                  value={draft.lineHeight}
                  onChange={(lineHeight) => updateDraft({ ...draft, lineHeight })}
                />
                <StepperInput
                  label="Tracking"
                  value={draft.letterSpacing}
                  onChange={(letterSpacing) => updateDraft({ ...draft, letterSpacing })}
                  step={0.5}
                />
              </div>
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-between border-t border-white/8 px-3 py-2.5">
          <button
            type="button"
            onClick={onDelete}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-md text-white/45 hover:bg-destructive/20 hover:text-destructive",
            )}
            aria-label={t(($) => $.preview.property_editor.delete)}
          >
            <Trash2 className="size-4" />
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs text-white/65 hover:bg-white/8"
            >
              {t(($) => $.preview.property_editor.cancel)}
            </button>
            <button
              type="button"
              onClick={() => onSave(draft)}
              className="rounded-md bg-[#c96442] px-3 py-1.5 text-xs font-medium text-white"
            >
              {t(($) => $.preview.property_editor.save)}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
