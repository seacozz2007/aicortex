"use client";

import type { Label } from "@aicortex/core/types";
import { X } from "lucide-react";
import { useT } from "../i18n";

interface LabelChipProps {
  label: Label;
  onRemove?: () => void;
  className?: string;
  /**
   * When true, show the full label name without truncation. Use this in
   * management/edit surfaces where users need to see or verify the exact
   * name. The default (false) truncates at 12rem to keep chips compact in
   * the issue sidebar and future board/list card rows.
   */
  fullName?: boolean;
}

/**
 * Renders a single label as a colored pill. If `onRemove` is provided, shows
 * an × button that calls it. Used in the issue-detail sidebar, the picker,
 * and the management dialog.
 */
export function LabelChip({ label, onRemove, className, fullName }: LabelChipProps) {
  const { t } = useT("labels");
  const nameClass = fullName ? "break-all" : "truncate max-w-[12rem]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-current/20 ${className ?? ""}`}
      style={{ backgroundColor: `${label.color}20`, color: label.color }}
      aria-label={label.name}
      title={label.name}
    >
      <span className={nameClass}>{label.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          // bg-current/20 uses the computed text color so the hover state is
          // visible on both light and dark chip backgrounds. hover:bg-black/10
          // was invisible on darker chips (anything requiring light text).
          className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full hover:bg-current/20 focus:outline-none focus:ring-1 focus:ring-current"
          aria-label={t(($) => $.remove_label, { name: label.name })}
        >
          <X className="h-2.5 w-2.5" strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}
