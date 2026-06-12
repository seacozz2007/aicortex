"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@aicortex/ui/lib/utils";

export function useStudioToolsFullscreen() {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  return {
    fullscreen,
    toggleFullscreen: () => setFullscreen((value) => !value),
  };
}

export function StudioToolsPanelShell({
  fullscreen,
  onToggleFullscreen,
  fullscreenLabel,
  exitFullscreenLabel,
  toolbar,
  children,
  className,
}: {
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  fullscreenLabel: string;
  exitFullscreenLabel: string;
  toolbar: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "flex min-h-0 min-w-0 flex-col bg-sidebar",
        fullscreen ? "fixed inset-0 z-50" : "relative h-full border-l border-border",
        className,
      )}
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto">{toolbar}</div>
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          aria-label={fullscreen ? exitFullscreenLabel : fullscreenLabel}
          title={fullscreen ? exitFullscreenLabel : fullscreenLabel}
        >
          {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </aside>
  );
}
