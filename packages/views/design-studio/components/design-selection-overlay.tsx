"use client";

import type { SelectedPreviewElement } from "../lib/preview-element";

export function DesignSelectionOverlay({
  element,
  scale,
  offset,
  variant = "selected",
}: {
  element: SelectedPreviewElement;
  scale: number;
  offset: { x: number; y: number };
  variant?: "selected" | "hover";
}) {
  const left = offset.x + element.rect.left * scale;
  const top = offset.y + element.rect.top * scale;
  const width = element.rect.width * scale;
  const height = element.rect.height * scale;

  return (
    <div
      className="pointer-events-none absolute z-20 rounded-[2px]"
      style={{
        left,
        top,
        width,
        height,
        boxShadow:
          variant === "selected"
            ? "inset 0 0 0 2px #1677ff, 0 0 0 1px rgba(22,119,255,0.25)"
            : "inset 0 0 0 2px rgba(22,119,255,0.55)",
        background:
          variant === "selected" ? "rgba(22,119,255,0.08)" : "rgba(22,119,255,0.04)",
      }}
    />
  );
}
