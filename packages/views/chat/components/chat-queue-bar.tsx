"use client";

import { useState } from "react";
import { ArrowUp, Check, CornerDownLeft, Pencil, Trash2, X } from "lucide-react";
import { cn } from "@aicortex/ui/lib/utils";
import { Button } from "@aicortex/ui/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@aicortex/ui/components/ui/tooltip";
import type { OutboundQueuedMessage } from "@aicortex/core/chat/outbound-queue";
import { chatQueuePreviewText } from "@aicortex/core/chat/outbound-queue";
import { useChatStore } from "@aicortex/core/chat";
import { useT } from "../../i18n";

function QueueEditRow({
  initialValue,
  onSave,
  onCancel,
}: {
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const { t } = useT("chat");
  const [value, setValue] = useState(initialValue);

  return (
    <div className="flex min-w-0 flex-1 items-start gap-1.5">
      <textarea
        autoFocus
        value={value}
        rows={2}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            const trimmed = value.trim();
            if (trimmed) onSave(trimmed);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="min-h-9 min-w-0 flex-1 resize-none rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-brand"
      />
      <div className="flex shrink-0 flex-col gap-0.5">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={() => {
            const trimmed = value.trim();
            if (trimmed) onSave(trimmed);
          }}
          aria-label={t(($) => $.queue_bar.save_edit_aria)}
        >
          <Check className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={onCancel}
          aria-label={t(($) => $.queue_bar.cancel_edit_aria)}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function ChatQueueBar({
  sessionId,
  items,
  sendShortcut,
  className,
}: {
  sessionId: string;
  items: OutboundQueuedMessage[];
  /** e.g. "Ctrl+Enter" — shown like Cursor's "↵ to Send" hint. */
  sendShortcut?: string;
  className?: string;
}) {
  const { t } = useT("chat");
  const updateOutbound = useChatStore((s) => s.updateOutbound);
  const removeOutbound = useChatStore((s) => s.removeOutbound);
  const moveOutboundToFront = useChatStore((s) => s.moveOutboundToFront);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (items.length === 0) return null;

  const count = items.length;

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-4xl overflow-hidden rounded-lg border border-border/80 bg-muted/25",
        className,
      )}
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/90">
            {t(($) => $.queue_bar.queued_count, { count })}
          </span>
          {sendShortcut ? (
            <>
              <CornerDownLeft className="size-3 shrink-0 opacity-70" aria-hidden />
              <span className="truncate">{t(($) => $.queue_bar.send_hint)}</span>
            </>
          ) : null}
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground/80">
          {t(($) => $.queue_bar.waiting_hint)}
        </span>
      </div>
      <div className="max-h-40 space-y-1.5 overflow-y-auto px-2 py-2">
        {items.map((item, index) => {
          const isEditing = editingId === item.id;
          const preview = chatQueuePreviewText(item.content);
          return (
            <div
              key={item.id}
              className="flex items-center gap-1 rounded-md border border-border/50 bg-card/60 px-2 py-1.5"
            >
              {isEditing ? (
                <QueueEditRow
                  initialValue={item.content}
                  onSave={(content) => {
                    updateOutbound(sessionId, item.id, content);
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <p
                    className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
                    title={preview}
                  >
                    {preview}
                  </p>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            className="size-7 text-muted-foreground"
                            onClick={() => setEditingId(item.id)}
                            aria-label={t(($) => $.queue_bar.edit_aria)}
                          />
                        }
                      >
                        <Pencil className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {t(($) => $.queue_bar.edit_aria)}
                      </TooltipContent>
                    </Tooltip>
                    {index > 0 && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              className="size-7 text-muted-foreground"
                              onClick={() => moveOutboundToFront(sessionId, item.id)}
                              aria-label={t(($) => $.queue_bar.move_up_aria)}
                            />
                          }
                        >
                          <ArrowUp className="size-3.5" />
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {t(($) => $.queue_bar.move_up_aria)}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeOutbound(sessionId, item.id)}
                            aria-label={t(($) => $.queue_bar.delete_aria)}
                          />
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {t(($) => $.queue_bar.delete_aria)}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
