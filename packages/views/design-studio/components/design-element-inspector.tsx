"use client";

import { useRef } from "react";
import { Paperclip, X } from "lucide-react";
import { cn } from "@aicortex/ui/lib/utils";
import { useT } from "../../i18n";
import type { SelectedPreviewElement } from "../lib/preview-element";

function ColorSwatch({ value }: { value: string }) {
  const show =
    value &&
    value !== "transparent" &&
    !value.startsWith("rgba(0, 0, 0, 0");
  return (
    <span
      className={cn(
        "inline-block size-3 shrink-0 rounded-sm border border-white/20",
        !show && "bg-[repeating-conic-gradient(#666_0%_25%,#444_0%_50%)] bg-[length:6px_6px]",
      )}
      style={show ? { background: value } : undefined}
      aria-hidden
    />
  );
}

function PropertyRow({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
  return (
    <div className="grid grid-cols-[72px_1fr] items-center gap-2 text-[11px] leading-tight">
      <span className="text-white/45">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-white/90">
        {swatch != null ? <ColorSwatch value={swatch} /> : null}
        <span className="truncate font-mono text-[10px]">{value}</span>
      </span>
    </div>
  );
}

export function DesignElementInspector({
  element,
  note,
  onNoteChange,
  onClose,
  onSaveComment,
  onSendToChat,
  onAttachImages,
  attachmentCount = 0,
  style,
}: {
  element: SelectedPreviewElement;
  note: string;
  onNoteChange: (value: string) => void;
  onClose: () => void;
  onSaveComment: () => void;
  onSendToChat: () => void;
  onAttachImages?: (files: File[]) => void;
  attachmentCount?: number;
  style?: React.CSSProperties;
}) {
  const { t } = useT("design");
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className="pointer-events-auto absolute z-30 w-[min(360px,calc(100%-16px))] overflow-hidden rounded-xl border border-white/10 bg-[#141418]/95 text-white shadow-2xl backdrop-blur-md"
      style={style}
    >
      <div className="space-y-2 border-b border-white/8 px-3 py-2.5">
        <span className="truncate text-[10px] font-mono text-white/45">{element.id}</span>
        <PropertyRow label={t(($) => $.preview.inspector.size)} value={element.style.size} />
        <PropertyRow
          label={t(($) => $.preview.inspector.color)}
          value={element.style.color}
          swatch={element.style.color}
        />
        <PropertyRow
          label={t(($) => $.preview.inspector.bg)}
          value={element.style.background}
          swatch={element.style.background}
        />
        <PropertyRow label={t(($) => $.preview.inspector.font)} value={element.style.font} />
        <PropertyRow
          label={t(($) => $.preview.inspector.line)}
          value={element.style.lineHeight}
        />
      </div>

      <div className="p-2.5">
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder={t(($) => $.preview.inspector.comment_placeholder)}
          className="min-h-[72px] w-full resize-none rounded-lg border border-[#5e6ad2]/60 bg-black/30 px-2.5 py-2 text-xs text-white placeholder:text-white/35 focus:border-[#5e6ad2] focus:outline-none"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (note.trim()) onSaveComment();
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) onAttachImages?.(files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative inline-flex size-7 items-center justify-center rounded-md border border-white/10 text-white/50 hover:bg-white/5 hover:text-white/80"
              title={t(($) => $.preview.inspector.attach)}
              aria-label={t(($) => $.preview.inspector.attach)}
            >
              <Paperclip className="size-3.5" />
              {attachmentCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-[#c96442] text-[8px] font-bold">
                  {attachmentCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex size-7 items-center justify-center rounded-md border border-white/10 text-white/50 hover:bg-white/5 hover:text-white/80"
              aria-label={t(($) => $.preview.inspector.close)}
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!note.trim()}
              onClick={onSendToChat}
              className="rounded-md px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/5 disabled:opacity-40"
            >
              {t(($) => $.preview.inspector.send_to_chat)}
            </button>
            <button
              type="button"
              disabled={!note.trim()}
              onClick={onSaveComment}
              className="rounded-md bg-[#c96442] px-3 py-1 text-[11px] font-medium text-white disabled:opacity-40"
            >
              {t(($) => $.preview.inspector.submit_comment)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
