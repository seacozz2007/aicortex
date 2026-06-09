"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@aicortex/ui/lib/utils";
import type { PreviewTool } from "../lib/preview-element";

type Point = { x: number; y: number };

type Stroke = {
  id: string;
  tool: "pencil" | "pen";
  points: Point[];
};

function strokeWidth(tool: "pencil" | "pen") {
  return tool === "pen" ? 3.5 : 1.75;
}

function pointsToPath(points: Point[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return `M ${first!.x} ${first!.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(" ")}`;
}

export function DesignPreviewDrawLayer({
  active,
  tool,
  onStrokeComplete,
}: {
  active: boolean;
  tool: PreviewTool;
  onStrokeComplete?: (stroke: { id: string }) => void;
}) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);

  const drawTool = tool === "pencil" || tool === "pen" ? tool : null;

  const toLocalPoint = useCallback((event: React.PointerEvent<HTMLDivElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }, []);

  const interactive = active && !!drawTool;

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!interactive || !drawTool) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      const stroke: Stroke = {
        id: `stroke-${Date.now()}`,
        tool: drawTool,
        points: [toLocalPoint(event)],
      };
      drawingRef.current = stroke;
      setStrokes((prev) => [...prev, stroke]);
    },
    [drawTool, interactive, toLocalPoint],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const current = drawingRef.current;
      if (!interactive || !current) return;
      event.preventDefault();
      const updated: Stroke = {
        ...current,
        points: [...current.points, toLocalPoint(event)],
      };
      drawingRef.current = updated;
      setStrokes((prev) =>
        prev.map((stroke) => (stroke.id === updated.id ? updated : stroke)),
      );
    },
    [interactive, toLocalPoint],
  );

  const finishStroke = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const finished = drawingRef.current;
      drawingRef.current = null;
      if (!finished) return;

      setStrokes((prev) => {
        const next = prev.map((stroke) => (stroke.id === finished.id ? finished : stroke));
        return next.filter((stroke) => stroke.points.length > 1);
      });

      if (finished.points.length > 1) onStrokeComplete?.(finished);
    },
    [onStrokeComplete],
  );

  const visibleStrokes = strokes.filter((stroke) => stroke.points.length > 0);

  if (!interactive && visibleStrokes.length === 0) return null;

  return (
    <div
      className={cn(
        "relative h-full w-full",
        interactive ? "touch-none" : "pointer-events-none",
      )}
      onPointerDown={interactive ? handlePointerDown : undefined}
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerUp={interactive ? finishStroke : undefined}
      onPointerCancel={interactive ? finishStroke : undefined}
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        aria-hidden={!interactive}
      >
        {visibleStrokes.map((stroke) => (
          <path
            key={stroke.id}
            d={pointsToPath(stroke.points)}
            fill="none"
            stroke="#c96442"
            strokeWidth={strokeWidth(stroke.tool)}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.95}
          />
        ))}
      </svg>
    </div>
  );
}
