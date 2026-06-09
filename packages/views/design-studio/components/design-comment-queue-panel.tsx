"use client";

import { X } from "lucide-react";
import { useT } from "../../i18n";

export type QueuedPreviewComment = {
  id: string;
  elementId: string;
  note: string;
};

export function DesignCommentQueuePanel({
  items,
  onRemove,
  onClear,
  onSendQueue,
  sending = false,
}: {
  items: QueuedPreviewComment[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onSendQueue?: () => void;
  sending?: boolean;
}) {
  const { t } = useT("design");
  if (items.length === 0) return null;

  return (
    <div className="pointer-events-auto absolute right-3 top-14 z-30 w-[min(280px,calc(100%-24px))] overflow-hidden rounded-xl border border-white/10 bg-[#141418]/95 text-white shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
        <span className="text-xs font-medium">
          {t(($) => $.preview.queue.title, { count: items.length })}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] text-white/55 hover:text-white"
        >
          {t(($) => $.preview.queue.clear_all)}
        </button>
      </div>
      <ul className="max-h-48 overflow-auto p-1.5">
        {items.map((item) => (
          <li
            key={item.id}
            className="mb-1 flex items-start gap-2 rounded-lg bg-white/5 px-2 py-1.5 last:mb-0"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-mono text-white/45">{item.elementId}</p>
              <p className="text-[11px] leading-snug text-white/85">{item.note}</p>
            </div>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-white/45 hover:bg-white/8 hover:text-white"
              aria-label={t(($) => $.preview.queue.remove)}
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      {onSendQueue ? (
        <div className="border-t border-white/8 p-2">
          <button
            type="button"
            disabled={sending}
            onClick={onSendQueue}
            className="w-full rounded-md bg-[#c96442] px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
          >
            {sending ? t(($) => $.preview.queue.sending) : t(($) => $.preview.queue.send_to_chat)}
          </button>
        </div>
      ) : null}
    </div>
  );
}
