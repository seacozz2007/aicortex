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
  const spritesRef = useRef<Map<string, AgentSpriteData>>(new Map());
  const rafRef = useRef<number>(0);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

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

  // Mouse hover for tooltip
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / CANVAS_SCALE;
    const my = (e.clientY - rect.top) / CANVAS_SCALE;

    const sprites = Array.from(spritesRef.current.values());
    const hit = hitTest(sprites, mx, my);
    if (hit) {
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
        x: e.clientX + 12,
        y: e.clientY - 10,
        text: `${hit.name} — ${stateLabel[hit.state] ?? hit.state}`,
      });
    } else {
      setTooltip(null);
    }
  }, []);

  // Click to navigate to agent detail
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / CANVAS_SCALE;
      const my = (e.clientY - rect.top) / CANVAS_SCALE;

      const sprites = Array.from(spritesRef.current.values());
      const hit = hitTest(sprites, mx, my);
      if (hit) {
        push(paths.agentDetail(hit.id));
      }
    },
    [push, paths],
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
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        onClick={handleClick}
        className="cursor-pointer rounded"
        style={{
          width: CANVAS_WIDTH * CANVAS_SCALE,
          height: CANVAS_HEIGHT * CANVAS_SCALE,
          imageRendering: "pixelated",
        }}
      />
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
