"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  ListChecks,
  Loader2,
  PenLine,
  Send,
  Square,
  TextCursorInput,
  X,
} from "lucide-react";
import { cn } from "@aicortex/ui/lib/utils";
import { useT } from "../../i18n";
import { compositeMarkScreenshot, captureViewportMarkScreenshot } from "../lib/preview-screenshot";
import type { MarkAnnotationAction, MarkSubTool } from "../lib/preview-element";

type Point = { x: number; y: number };
type Stroke = { points: Point[] };
type NormalizedRect = { x: number; y: number; width: number; height: number };

const STROKE_COLOR = "#ff3b30";
const STROKE_WIDTH = 4;

function normalizedRectFromPoints(start: Point, end: Point): NormalizedRect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  box: NormalizedRect,
  w: number,
  h: number,
  dashed: boolean,
) {
  ctx.save();
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth = dashed ? 2 : STROKE_WIDTH;
  if (dashed) ctx.setLineDash([6, 4]);
  ctx.strokeRect(box.x * w, box.y * h, box.width * w, box.height * h);
  ctx.restore();
}

async function compositeMarkImage(
  iframe: HTMLIFrameElement,
  inkCanvas: HTMLCanvasElement | null,
  strokes: Stroke[],
  box: NormalizedRect | null,
): Promise<File | null> {
  return compositeMarkScreenshot({
    iframe,
    inkCanvas,
    strokes,
    box,
  });
}

export function DesignMarkOverlay({
  iframeRef,
  active,
  sendDisabled = false,
  onClose,
  onSubmit,
}: {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  active: boolean;
  sendDisabled?: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    action: MarkAnnotationAction;
    note: string;
    imageFile?: File;
    extraFiles?: File[];
  }) => Promise<void>;
}) {
  const { t } = useT("design");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const undoneRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  const boxDraftRef = useRef<{ start: Point; current: Point } | null>(null);
  const selectionBoxRef = useRef<NormalizedRect | null>(null);

  const [markTool, setMarkTool] = useState<MarkSubTool>("box");
  const [note, setNote] = useState("");
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [pendingAction, setPendingAction] = useState<MarkAnnotationAction | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [inkVersion, setInkVersion] = useState(0);

  const syncHistory = useCallback(() => {
    setCanUndo(strokesRef.current.length > 0 || selectionBoxRef.current != null);
    setCanRedo(undoneRef.current.length > 0);
    setInkVersion((v) => v + 1);
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const draftBox = boxDraftRef.current
      ? normalizedRectFromPoints(boxDraftRef.current.start, boxDraftRef.current.current)
      : selectionBoxRef.current;
    if (draftBox && (draftBox.width > 0.001 || draftBox.height > 0.001)) {
      drawBox(ctx, draftBox, rect.width, rect.height, boxDraftRef.current != null);
    }
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = STROKE_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const all = drawingRef.current
      ? [...strokesRef.current, drawingRef.current]
      : strokesRef.current;
    for (const stroke of all) {
      const first = stroke.points[0];
      if (!first) continue;
      ctx.beginPath();
      ctx.moveTo(first.x * rect.width, first.y * rect.height);
      for (let i = 1; i < stroke.points.length; i++) {
        const p = stroke.points[i]!;
        ctx.lineTo(p.x * rect.width, p.y * rect.height);
      }
      ctx.stroke();
    }
  }, []);

  const undo = useCallback(() => {
    if (selectionBoxRef.current) {
      selectionBoxRef.current = null;
      syncHistory();
      redraw();
      return;
    }
    const last = strokesRef.current.pop();
    if (last) undoneRef.current.push(last);
    syncHistory();
    redraw();
  }, [redraw, syncHistory]);

  const redo = useCallback(() => {
    const stroke = undoneRef.current.pop();
    if (stroke) strokesRef.current.push(stroke);
    syncHistory();
    redraw();
  }, [redraw, syncHistory]);

  const clearInk = useCallback(() => {
    strokesRef.current = [];
    undoneRef.current = [];
    selectionBoxRef.current = null;
    boxDraftRef.current = null;
    drawingRef.current = null;
    syncHistory();
    redraw();
  }, [redraw, syncHistory]);

  useEffect(() => {
    if (!active) return;
    clearInk();
    setNote("");
    setExtraFiles([]);
    setMarkTool("box");
  }, [active, clearInk]);

  useEffect(() => {
    if (!active) return;
    const onResize = () => redraw();
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [active, redraw]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onClose, redo, undo]);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(rect.width, 1))),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / Math.max(rect.height, 1))),
    };
  };

  const canSubmit =
    inkVersion >= 0 &&
    (strokesRef.current.length > 0 ||
      selectionBoxRef.current != null ||
      note.trim().length > 0 ||
      extraFiles.length > 0);

  const submit = async (action: MarkAnnotationAction) => {
    if (sending || !canSubmit) return;
    if (action === "send" && sendDisabled) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    setSending(true);
    setPendingAction(action);
    try {
      const hasInk =
        strokesRef.current.length > 0 || selectionBoxRef.current != null;
      const shouldCapture =
        hasInk || note.trim().length > 0 || extraFiles.length > 0;
      let imageFile: File | undefined;
      if (shouldCapture) {
        const file = hasInk
          ? await compositeMarkImage(
              iframe,
              canvasRef.current,
              strokesRef.current,
              selectionBoxRef.current,
            )
          : await captureViewportMarkScreenshot(iframe);
        if (file) imageFile = file;
      }
      await onSubmit({
        action,
        note: note.trim(),
        imageFile,
        extraFiles: extraFiles.length ? extraFiles : undefined,
      });
      clearInk();
      setNote("");
      setExtraFiles([]);
    } finally {
      setSending(false);
      setPendingAction(null);
    }
  };

  if (!active) return null;

  return (
    <>
      <div ref={wrapRef} className="absolute inset-0 z-[40]">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full cursor-crosshair touch-none"
          onPointerDown={(e) => {
            if (sending) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            const point = pointFromEvent(e);
            if (markTool === "box") {
              boxDraftRef.current = { start: point, current: point };
              selectionBoxRef.current = null;
            } else {
              const stroke = { points: [point] };
              drawingRef.current = stroke;
              strokesRef.current.push(stroke);
              undoneRef.current = [];
            }
            syncHistory();
            redraw();
          }}
          onPointerMove={(e) => {
            if (sending) return;
            if (boxDraftRef.current) {
              boxDraftRef.current.current = pointFromEvent(e);
              redraw();
              return;
            }
            if (drawingRef.current) {
              drawingRef.current.points.push(pointFromEvent(e));
              redraw();
            }
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
            if (boxDraftRef.current) {
              const box = normalizedRectFromPoints(
                boxDraftRef.current.start,
                boxDraftRef.current.current,
              );
              selectionBoxRef.current =
                box.width > 0.01 || box.height > 0.01 ? box : null;
              boxDraftRef.current = null;
            }
            drawingRef.current = null;
            syncHistory();
            redraw();
          }}
        />
      </div>

      <div className="pointer-events-auto absolute bottom-4 left-1/2 z-[50] flex max-w-[min(760px,calc(100%-32px))] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-3xl border border-white/10 bg-[#141414]/95 px-2 py-1.5 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="inline-flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
            aria-label={t(($) => $.preview.mark.close)}
          >
            <X className="size-3.5" />
          </button>
          <div className="flex items-center gap-0.5 rounded-lg border border-white/10 p-0.5">
            <button
              type="button"
              onClick={() => setMarkTool("box")}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-md text-white/60 hover:text-white",
                markTool === "box" && "bg-white/15 text-white",
              )}
              title={t(($) => $.preview.mark.box_select)}
            >
              <Square className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setMarkTool("pen")}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-md text-white/60 hover:text-white",
                markTool === "pen" && "bg-white/15 text-white",
              )}
              title={t(($) => $.preview.mark.pen)}
            >
              <PenLine className="size-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo || sending}
            className="inline-flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 disabled:opacity-30"
            title={t(($) => $.preview.mark.undo)}
          >
            <ArrowLeft className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo || sending}
            className="inline-flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 disabled:opacity-30"
            title={t(($) => $.preview.mark.redo)}
          >
            <ArrowRight className="size-3.5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) setExtraFiles((prev) => [...prev, ...files]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            className="inline-flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10"
            title={t(($) => $.preview.mark.attach_image)}
          >
            <ImagePlus className="size-3.5" />
          </button>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={sending}
            placeholder={t(($) => $.preview.mark.note_placeholder)}
            className="min-w-0 flex-1 rounded-full border border-[#f89668]/80 bg-[#da6138]/20 px-3 py-1 text-[13px] text-white outline-none placeholder:text-white/45"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) void submit("queue");
            }}
          />
          <button
            type="button"
            onClick={() => void submit("draft")}
            disabled={sending || !canSubmit}
            className="inline-flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 disabled:opacity-30"
            title={t(($) => $.preview.mark.add_to_input)}
          >
            {pendingAction === "draft" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <TextCursorInput className="size-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => void submit("queue")}
            disabled={sending || !canSubmit}
            className="inline-flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 disabled:opacity-30"
            title={t(($) => $.preview.mark.queue)}
          >
            {pendingAction === "queue" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ListChecks className="size-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => void submit("send")}
            disabled={sending || !canSubmit || sendDisabled}
            className="inline-flex size-8 items-center justify-center rounded-full bg-[#c96442] text-white disabled:opacity-30"
            title={
              sendDisabled
                ? t(($) => $.preview.mark.send_disabled)
                : t(($) => $.preview.mark.send)
            }
          >
            {pendingAction === "send" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
          </button>
        </div>
      </div>
    </>
  );
}
