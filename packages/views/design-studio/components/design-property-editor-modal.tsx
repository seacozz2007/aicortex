"use client";

import { GripVertical, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@aicortex/ui/lib/utils";
import { useT } from "../../i18n";
import type { ElementBoxSides, ElementPropertyDraft, SelectedPreviewElement } from "../lib/preview-element";
import { propertyDraftFromElement } from "../lib/preview-element";

function SideInputs({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ElementBoxSides;
  onChange: (next: ElementBoxSides) => void;
}) {
  const sides = (
    [
      ["T", "top"],
      ["R", "right"],
      ["B", "bottom"],
      ["L", "left"],
    ] as const
  );

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-white/45">{label}</p>
      <div className="grid grid-cols-4 gap-1.5">
        {sides.map(([short, key]) => (
          <label key={key} className="space-y-0.5">
            <span className="text-[10px] text-white/35">{short}</span>
            <input
              type="number"
              value={value[key]}
              onChange={(e) =>
                onChange({ ...value, [key]: Number(e.target.value) || 0 })
              }
              className="w-full rounded-md border border-white/10 bg-black/30 px-1.5 py-1 text-[11px] tabular-nums text-white focus:border-white/25 focus:outline-none"
            />
          </label>
        ))}
      </div>
    </div>
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
            <p className="mb-1.5 text-[11px] font-medium text-white/45">
              {t(($) => $.preview.property_editor.size)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-0.5">
                <span className="text-[10px] text-white/35">
                  {t(($) => $.preview.property_editor.width)}
                </span>
                <input
                  type="number"
                  value={draft.width}
                  onChange={(e) =>
                    updateDraft({ ...draft, width: Number(e.target.value) || 0 })
                  }
                  className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs tabular-nums text-white focus:border-white/25 focus:outline-none"
                />
              </label>
              <label className="space-y-0.5">
                <span className="text-[10px] text-white/35">
                  {t(($) => $.preview.property_editor.height)}
                </span>
                <input
                  type="number"
                  value={draft.height}
                  onChange={(e) =>
                    updateDraft({ ...draft, height: Number(e.target.value) || 0 })
                  }
                  className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs tabular-nums text-white focus:border-white/25 focus:outline-none"
                />
              </label>
            </div>
          </section>

          <section>
            <p className="mb-1.5 text-[11px] font-medium text-white/45">
              {t(($) => $.preview.property_editor.box)}
            </p>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <span className="w-10 text-[10px] text-white/35">
                  {t(($) => $.preview.property_editor.fill)}
                </span>
                <input
                  type="color"
                  value={draft.fill.startsWith("#") ? draft.fill : "#000000"}
                  onChange={(e) => updateDraft({ ...draft, fill: e.target.value })}
                  className="size-7 cursor-pointer rounded border border-white/10 bg-transparent"
                />
                <input
                  type="text"
                  value={draft.fill}
                  onChange={(e) => updateDraft({ ...draft, fill: e.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] font-mono text-white focus:border-white/25 focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="w-10 text-[10px] text-white/35">
                  {t(($) => $.preview.property_editor.opacity)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={draft.opacity}
                  onChange={(e) =>
                    updateDraft({ ...draft, opacity: Number(e.target.value) })
                  }
                  className="flex-1 accent-[#c96442]"
                />
                <span className="w-8 text-right text-[11px] tabular-nums text-white/70">
                  {draft.opacity.toFixed(2)}
                </span>
              </label>
            </div>
          </section>

          <SideInputs
            label={t(($) => $.preview.property_editor.padding)}
            value={draft.padding}
            onChange={(padding) => updateDraft({ ...draft, padding })}
          />
          <SideInputs
            label={t(($) => $.preview.property_editor.margin)}
            value={draft.margin}
            onChange={(margin) => updateDraft({ ...draft, margin })}
          />

          <section>
            <p className="mb-1.5 text-[11px] font-medium text-white/45">
              {t(($) => $.preview.property_editor.typography)}
            </p>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <span className="w-16 text-[10px] text-white/35">
                  {t(($) => $.preview.property_editor.font_weight)}
                </span>
                <select
                  value={draft.fontWeight}
                  onChange={(e) => updateDraft({ ...draft, fontWeight: e.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white focus:border-white/25 focus:outline-none"
                >
                  {["100", "300", "400", "500", "600", "700", "800", "900"].map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="w-16 text-[10px] text-white/35">
                  {t(($) => $.preview.property_editor.text_align)}
                </span>
                <select
                  value={draft.textAlign}
                  onChange={(e) => updateDraft({ ...draft, textAlign: e.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white focus:border-white/25 focus:outline-none"
                >
                  {["left", "center", "right", "justify"].map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="w-16 text-[10px] text-white/35">
                  {t(($) => $.preview.property_editor.radius)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={48}
                  step={1}
                  value={draft.borderRadius}
                  onChange={(e) =>
                    updateDraft({ ...draft, borderRadius: Number(e.target.value) })
                  }
                  className="flex-1 accent-[#c96442]"
                />
                <span className="w-8 text-right text-[11px] tabular-nums text-white/70">
                  {draft.borderRadius}px
                </span>
              </label>
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
