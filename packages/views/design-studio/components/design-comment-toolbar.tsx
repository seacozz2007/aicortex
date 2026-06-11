"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  MessageSquarePlus,
  PenLine,
  Pencil,
} from "lucide-react";
import { cn } from "@aicortex/ui/lib/utils";
import { useT } from "../../i18n";
import type { PreviewToolMode } from "../lib/preview-element";

const MODE_TOOLS: {
  id: PreviewToolMode;
  icon: typeof MessageSquarePlus;
  labelKey: "comment" | "mark" | "edit";
}[] = [
  { id: "comment", icon: MessageSquarePlus, labelKey: "comment" },
  { id: "mark", icon: PenLine, labelKey: "mark" },
  { id: "edit", icon: Pencil, labelKey: "edit" },
];

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200];

export function DesignCommentToolbar({
  tool,
  onToolChange,
  queueCount,
  zoom,
  onZoomChange,
  onScreenshot,
  screenshotPending = false,
  variant = "floating",
}: {
  tool: PreviewToolMode | null;
  onToolChange: (tool: PreviewToolMode) => void;
  queueCount: number;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onScreenshot?: () => void;
  screenshotPending?: boolean;
  variant?: "floating" | "strip";
}) {
  const { t } = useT("design");
  const [zoomOpen, setZoomOpen] = useState(false);
  const zoomRef = useRef<HTMLDivElement>(null);
  const isStrip = variant === "strip";

  useEffect(() => {
    if (!zoomOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!zoomRef.current?.contains(event.target as Node)) setZoomOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [zoomOpen]);

  const iconBtnClass = isStrip
    ? "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    : "inline-flex size-8 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/8 hover:text-white";

  const activeClass = isStrip
    ? "bg-brand/15 text-brand hover:bg-brand/20 hover:text-brand"
    : "bg-[#c96442]/25 text-[#e8926f]";

  const queueHintClass = isStrip ? "text-foreground" : "text-white/80";

  return (
    <div
      className={cn(
        "flex items-center gap-0.5",
        isStrip
          ? "min-w-0 flex-1"
          : "pointer-events-auto absolute left-1/2 top-3 z-[60] -translate-x-1/2 rounded-xl border border-white/10 bg-[#141418]/92 px-1.5 py-1 shadow-2xl backdrop-blur-md",
      )}
    >
      <button
        type="button"
        onClick={() => onScreenshot?.()}
        disabled={screenshotPending}
        className={cn(iconBtnClass, "disabled:opacity-40")}
        title={t(($) => $.preview.toolbar.screenshot)}
        aria-label={t(($) => $.preview.toolbar.screenshot)}
      >
        <Camera className="size-4" />
      </button>

      {MODE_TOOLS.map(({ id, icon: Icon, labelKey }) => (
        <button
          key={id}
          type="button"
          onClick={() => onToolChange(id)}
          className={cn(
            "relative",
            iconBtnClass,
            tool === id && activeClass,
            id === "comment" && tool !== id && queueCount > 0 && queueHintClass,
          )}
          title={t(($) => $.preview.toolbar[labelKey])}
          aria-label={t(($) => $.preview.toolbar[labelKey])}
          aria-pressed={tool === id}
        >
          <Icon className="size-4" />
          {id === "comment" && queueCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c96442] px-1 text-[9px] font-semibold text-white">
              {queueCount}
            </span>
          ) : null}
        </button>
      ))}

      <span
        className={cn("mx-1 h-5 w-px", isStrip ? "bg-border" : "bg-white/10")}
        aria-hidden
      />

      <div ref={zoomRef} className="relative">
        <button
          type="button"
          onClick={() => setZoomOpen((v) => !v)}
          className={cn(
            "min-w-[52px] rounded-md px-2 py-1 text-[11px] tabular-nums",
            isStrip
              ? "text-muted-foreground hover:bg-accent hover:text-foreground"
              : "text-white/75 hover:bg-white/8",
          )}
          aria-haspopup="listbox"
          aria-expanded={zoomOpen}
        >
          {zoom}%
        </button>
        {zoomOpen ? (
          <div
            className={cn(
              "absolute left-1/2 top-full z-40 mt-1 min-w-[72px] -translate-x-1/2 overflow-hidden rounded-lg border py-1 shadow-xl",
              isStrip
                ? "border-border bg-popover"
                : "border-white/10 bg-[#141418]",
            )}
            role="listbox"
          >
            {ZOOM_STEPS.map((step) => (
              <button
                key={step}
                type="button"
                role="option"
                aria-selected={zoom === step}
                onClick={() => {
                  onZoomChange(step);
                  setZoomOpen(false);
                }}
                className={cn(
                  "block w-full px-3 py-1 text-left text-[11px] tabular-nums",
                  isStrip
                    ? "text-foreground hover:bg-accent"
                    : "text-white/75 hover:bg-white/8",
                  zoom === step &&
                    (isStrip ? "bg-accent font-medium" : "bg-white/10 text-white"),
                )}
              >
                {step}%
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
