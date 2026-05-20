"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { useWorkspacePaths } from "@aicortex/core/paths";
import { useNavigation } from "../../navigation";
import { useT } from "../../i18n";
import { CANVAS_WIDTH, CANVAS_HEIGHT, CANVAS_SCALE } from "../constants";
import { useOfficeState } from "../hooks/use-office-state";
import {
  createSprite,
  transitionSprite,
  tickSprite,
  type AgentSpriteData,
} from "../engine/agent-sprite";
import { renderFrame, hitTest } from "../engine/office-renderer";

export function VirtualOfficePage() {
  const { t } = useT("common");
  const wsId = useWorkspaceId();
  const { agents, loading } = useOfficeState(wsId);
  const paths = useWorkspacePaths();
  const { push } = useNavigation();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const spritesRef = useRef<Map<string, AgentSpriteData>>(new Map());
  const rafRef = useRef<number>(0);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [scaleFactor, setScaleFactor] = useState(1);

  // Observe container width and derive a scale factor that never upscales
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width } = entry.contentRect;
      const maxCssWidth = CANVAS_WIDTH * CANVAS_SCALE;
      setScaleFactor(Math.min(width / maxCssWidth, 1));
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const effectiveScale = CANVAS_SCALE * scaleFactor;

  // Helper to convert screen coordinates to logical canvas coordinates
  const screenToLogical = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { mx: 0, my: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        mx: (clientX - rect.left) / effectiveScale,
        my: (clientY - rect.top) / effectiveScale,
      };
    },
    [effectiveScale],
  );

  // Sync office state → sprites
  useEffect(() => {
    const map = spritesRef.current;
    const seen = new Set<string>();

    for (const agent of agents) {
      seen.add(agent.id);
      const existing = map.get(agent.id);
      if (!existing) {
        map.set(agent.id, createSprite(agent.id, agent.name, agent.color, agent.zone, agent.target));
      } else {
        // Update color/name in case they changed
        existing.name = agent.name;
        existing.color = agent.color;
        // Transition zone if changed
        if (existing.zone !== agent.zone) {
          transitionSprite(existing, agent.zone, agent.target);
        }
      }
    }

    // Remove sprites for agents no longer present
    for (const id of map.keys()) {
      if (!seen.has(id)) map.delete(id);
    }
  }, [agents]);

  // Animation loop — re-run when loading changes (canvas may mount/unmount)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    function loop() {
      if (!running) return;
      const sprites = Array.from(spritesRef.current.values());
      for (const s of sprites) tickSprite(s, sprites);
      renderFrame(ctx!, sprites);
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [loading]);

  const makeTooltip = useCallback((hit: AgentSpriteData, clientX: number, clientY: number) => {
    const stateLabel: Record<string, string> = {
      working: "⚡ Working",
      idle: "☕ Idle",
      offline: "💤 Offline",
      walking: "🚶 Moving",
      waiting: "⏳ Waiting",
      meeting: "🗣 Meeting",
      celebrating: "🎉 Done!",
    };
    setTooltip({
      x: clientX + 12,
      y: clientY - 10,
      text: `${hit.name} — ${stateLabel[hit.state] ?? hit.state}`,
    });
  }, []);

  // Mouse hover for tooltip
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { mx, my } = screenToLogical(e.clientX, e.clientY);
      const sprites = Array.from(spritesRef.current.values());
      const hit = hitTest(sprites, mx, my);
      if (hit) {
        makeTooltip(hit, e.clientX, e.clientY);
      } else {
        setTooltip(null);
      }
    },
    [screenToLogical, makeTooltip],
  );

  // Click to navigate to agent detail
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { mx, my } = screenToLogical(e.clientX, e.clientY);
      const sprites = Array.from(spritesRef.current.values());
      const hit = hitTest(sprites, mx, my);
      if (hit) {
        push(paths.agentDetail(hit.id));
      }
    },
    [screenToLogical, push, paths],
  );

  // Touch support for mobile devices
  const touchTargetRef = useRef<string | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      const touch = e.touches[0];
      if (!touch) return;
      const { mx, my } = screenToLogical(touch.clientX, touch.clientY);
      const sprites = Array.from(spritesRef.current.values());
      const hit = hitTest(sprites, mx, my);
      if (hit) {
        touchTargetRef.current = hit.id;
        makeTooltip(hit, touch.clientX, touch.clientY);
      } else {
        touchTargetRef.current = null;
        setTooltip(null);
      }
    },
    [screenToLogical, makeTooltip],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      const { mx, my } = screenToLogical(touch.clientX, touch.clientY);
      const sprites = Array.from(spritesRef.current.values());
      const hit = hitTest(sprites, mx, my);
      if (hit && hit.id === touchTargetRef.current) {
        push(paths.agentDetail(hit.id));
      }
      touchTargetRef.current = null;
      // Clear tooltip with a short delay so the user sees it
      setTimeout(() => setTooltip(null), 800);
    },
    [screenToLogical, push, paths],
  );

  if (loading && agents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {t(($) => $.virtualOffice.loading)}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
      <div className="text-center">
        <h1 className="text-base font-medium text-foreground">{t(($) => $.virtualOffice.title)}</h1>
        <p className="text-xs text-muted-foreground">
          {t(($) => $.virtualOffice.subtitle)}
        </p>
      </div>
      <div ref={containerRef} className="w-full max-w-[1440px] overflow-hidden">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="mx-auto cursor-pointer rounded"
          style={{
            width: CANVAS_WIDTH * CANVAS_SCALE * scaleFactor,
            height: CANVAS_HEIGHT * CANVAS_SCALE * scaleFactor,
            imageRendering: "pixelated",
            touchAction: "none",
          }}
        />
      </div>
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
