/**
 * Pure Canvas 2D renderer for the virtual office.
 * Draws background, furniture, agents (Y-sorted), HUD, and tooltips.
 * No external dependencies — uses the same pixel-art approach as the demo.
 */

import { CANVAS_WIDTH, CANVAS_HEIGHT, DESKS, ZONES } from "../constants";
import type { AgentSpriteData } from "./agent-sprite";

// --- Furniture drawing ---

function drawDesk(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#5a4530";
  ctx.fillRect(x - 18, y - 4, 36, 12);
  ctx.fillStyle = "#6b5540";
  ctx.fillRect(x - 17, y - 3, 34, 10);
  ctx.fillStyle = "#4a3520";
  ctx.fillRect(x - 16, y + 8, 3, 6);
  ctx.fillRect(x + 13, y + 8, 3, 6);
  ctx.fillStyle = "#2a2a3a";
  ctx.fillRect(x - 8, y - 16, 16, 12);
  ctx.fillStyle = "#3388cc";
  ctx.fillRect(x - 7, y - 15, 14, 10);
  ctx.fillStyle = "#55bbee";
  ctx.fillRect(x - 5, y - 13, 6, 1);
  ctx.fillRect(x - 5, y - 11, 9, 1);
  ctx.fillRect(x - 5, y - 9, 5, 1);
  ctx.fillStyle = "#333";
  ctx.fillRect(x - 1, y - 4, 3, 2);
  ctx.fillStyle = "#444";
  ctx.fillRect(x - 6, y, 12, 4);
}

function drawSofa(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#2a3555";
  ctx.fillRect(x - 16, y - 6, 32, 14);
  ctx.fillStyle = "#354570";
  ctx.fillRect(x - 14, y - 4, 13, 10);
  ctx.fillRect(x + 1, y - 4, 13, 10);
  ctx.fillStyle = "#253050";
  ctx.fillRect(x - 16, y - 10, 32, 5);
  ctx.fillRect(x - 18, y - 8, 4, 14);
  ctx.fillRect(x + 14, y - 8, 4, 14);
}

function drawWhiteboard(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#666";
  ctx.fillRect(x - 20, y - 28, 40, 2);
  ctx.fillRect(x - 20, y, 40, 2);
  ctx.fillRect(x - 20, y - 28, 2, 30);
  ctx.fillRect(x + 18, y - 28, 2, 30);
  ctx.fillStyle = "#eee";
  ctx.fillRect(x - 18, y - 26, 36, 26);
  ctx.fillStyle = "#e44";
  ctx.fillRect(x - 14, y - 22, 10, 2);
  ctx.fillStyle = "#4a4";
  ctx.fillRect(x - 14, y - 17, 16, 2);
  ctx.fillStyle = "#44a";
  ctx.fillRect(x - 14, y - 12, 8, 2);
  ctx.fillStyle = "#555";
  ctx.fillRect(x - 10, y + 2, 2, 12);
  ctx.fillRect(x + 8, y + 2, 2, 12);
}

function drawCoffeeMachine(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#5a4530";
  ctx.fillRect(x - 10, y - 2, 20, 6);
  ctx.fillStyle = "#333";
  ctx.fillRect(x - 7, y - 18, 14, 16);
  ctx.fillStyle = "#444";
  ctx.fillRect(x - 6, y - 16, 8, 6);
  ctx.fillStyle = "#ddd";
  ctx.fillRect(x + 2, y - 5, 5, 5);
  ctx.fillStyle = "#8b5e3c";
  ctx.fillRect(x + 3, y - 4, 3, 3);
}

function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#8b5e3c";
  ctx.fillRect(x - 5, y - 2, 10, 8);
  ctx.fillStyle = "#a06b40";
  ctx.fillRect(x - 6, y - 3, 12, 3);
  ctx.fillStyle = "#3a8a3a";
  ctx.fillRect(x - 2, y - 14, 4, 12);
  ctx.fillStyle = "#4a9a4a";
  ctx.fillRect(x - 8, y - 16, 6, 4);
  ctx.fillRect(x + 2, y - 18, 6, 4);
  ctx.fillRect(x - 9, y - 12, 5, 3);
  ctx.fillRect(x + 4, y - 13, 5, 3);
}

// --- Agent drawing ---

function darken(hex: string, amt: number): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) * (1 - amt));
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) * (1 - amt));
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) * (1 - amt));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function drawAgent(ctx: CanvasRenderingContext2D, agent: AgentSpriteData) {
  const { x, color, state, frame, opacity } = agent;
  ctx.globalAlpha = opacity;

  const bobY = state === "idle" ? Math.sin(frame * 0.08) * 1 : 0;
  const y = agent.y + bobY;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  if (state === "working" || state === "meeting") {
    // Sitting pose
    ctx.fillStyle = "#2a2a44";
    ctx.fillRect(x - 4, y - 4, 8, 4);
    ctx.fillStyle = color;
    ctx.fillRect(x - 5, y - 14, 10, 10);
    const armOff = Math.sin(frame * 0.3) * 1;
    ctx.fillStyle = "#ffc8a0";
    ctx.fillRect(x - 7, y - 10 + armOff, 2, 5);
    ctx.fillRect(x + 5, y - 10 - armOff, 2, 5);
    ctx.fillStyle = "#ffd5b4";
    ctx.fillRect(x - 4, y - 20, 8, 6);
    ctx.fillStyle = darken(color, 0.5);
    ctx.fillRect(x - 4, y - 22, 8, 3);
    ctx.fillStyle = "#222";
    ctx.fillRect(x - 2, y - 18, 1, 2);
    ctx.fillRect(x + 2, y - 18, 1, 2);
  } else if (state === "walking") {
    const step = Math.sin(frame * 0.3) * 3;
    ctx.fillStyle = "#2a2a44";
    ctx.fillRect(x - 3, y - 4, 2, 5);
    ctx.fillRect(x + 1, y - 4, 2, 5);
    ctx.fillStyle = color;
    ctx.fillRect(x - 5, y - 14, 10, 10);
    ctx.fillStyle = "#ffc8a0";
    ctx.fillRect(x - 7, y - 11 + step, 2, 5);
    ctx.fillRect(x + 5, y - 11 - step, 2, 5);
    ctx.fillStyle = "#ffd5b4";
    ctx.fillRect(x - 4, y - 20, 8, 6);
    ctx.fillStyle = darken(color, 0.5);
    ctx.fillRect(x - 4, y - 22, 8, 3);
    ctx.fillStyle = "#222";
    ctx.fillRect(x - 2, y - 18, 1, 2);
    ctx.fillRect(x + 2, y - 18, 1, 2);
  } else if (state === "offline") {
    ctx.fillStyle = "#555";
    ctx.fillRect(x - 4, y - 4, 8, 5);
    ctx.fillStyle = "#666";
    ctx.fillRect(x - 5, y - 14, 10, 10);
    ctx.fillStyle = "#888";
    ctx.fillRect(x - 4, y - 20, 8, 6);
    ctx.fillStyle = "#777";
    ctx.fillRect(x - 4, y - 22, 8, 3);
    ctx.fillStyle = "#444";
    ctx.fillRect(x - 2, y - 17, 2, 1);
    ctx.fillRect(x + 1, y - 17, 2, 1);
  } else {
    // idle / waiting / celebrating
    ctx.fillStyle = "#2a2a44";
    ctx.fillRect(x - 3, y - 4, 2, 5);
    ctx.fillRect(x + 1, y - 4, 2, 5);
    ctx.fillStyle = color;
    ctx.fillRect(x - 5, y - 14, 10, 10);
    ctx.fillStyle = "#ffc8a0";
    if (state === "celebrating") {
      ctx.fillRect(x - 7, y - 18, 2, 5);
      ctx.fillRect(x + 5, y - 18, 2, 5);
    } else {
      ctx.fillRect(x - 7, y - 10, 2, 5);
      ctx.fillRect(x + 5, y - 10, 2, 5);
      if (state === "idle") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(x + 6, y - 9, 4, 4);
        ctx.fillStyle = "#8b5e3c";
        ctx.fillRect(x + 7, y - 8, 2, 2);
      }
    }
    ctx.fillStyle = "#ffd5b4";
    ctx.fillRect(x - 4, y - 20, 8, 6);
    ctx.fillStyle = darken(color, 0.5);
    ctx.fillRect(x - 4, y - 22, 8, 3);
    ctx.fillStyle = "#222";
    ctx.fillRect(x - 2, y - 18, 1, 2);
    ctx.fillRect(x + 2, y - 18, 1, 2);
    if (state === "celebrating") {
      ctx.fillStyle = "#c55";
      ctx.fillRect(x - 1, y - 15, 3, 1);
    }
  }

  ctx.globalAlpha = 1;

  // Name tag
  ctx.font = "11px monospace";
  const tw = ctx.measureText(agent.name).width;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(x - tw / 2 - 2, y + 4, tw + 4, 9);
  ctx.fillStyle = agent.color;
  ctx.textAlign = "center";
  ctx.fillText(agent.name, x, y + 11);

  // Bubble
  if (agent.bubble && agent.bubble.timer > 0) {
    const by = y - 34;
    const bText = agent.bubble.text;
    ctx.font = "12px monospace";
    const bw = bText ? Math.max(18, ctx.measureText(bText).width + 12) : 18;
    const bh = bText ? 26 : 16;
    ctx.fillStyle = "rgba(20,20,40,0.9)";
    ctx.fillRect(x - bw / 2, by - bh / 2 - 2, bw, bh);
    ctx.fillStyle = "rgba(127,219,202,0.6)";
    ctx.fillRect(x - bw / 2, by - bh / 2 - 2, bw, 1);
    ctx.fillStyle = "rgba(20,20,40,0.9)";
    ctx.fillRect(x - 1, by + bh / 2 - 2, 3, 4);
    ctx.fillStyle = "#fff";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(agent.bubble.emoji, x, by - (bText ? 2 : 0));
    if (bText) {
      ctx.fillStyle = "#7fdbca";
      ctx.font = "11px monospace";
      ctx.fillText(bText, x, by + 9);
    }
  }
}

// --- Furniture layout ---

interface FurnitureItem {
  type: "desk" | "sofa" | "whiteboard" | "coffee" | "plant";
  x: number;
  y: number;
  sortY: number;
}

const FURNITURE: FurnitureItem[] = [
  ...DESKS.map((d) => ({ type: "desk" as const, x: d.x, y: d.y, sortY: d.y + 14 })),
  { type: "whiteboard", x: 165, y: 195, sortY: 217 },
  { type: "sofa", x: 780, y: 225, sortY: 237 },
  { type: "sofa", x: 817, y: 375, sortY: 387 },
  { type: "coffee", x: 870, y: 187, sortY: 199 },
  { type: "plant", x: 52, y: 412, sortY: 424 },
  { type: "plant", x: 900, y: 412, sortY: 424 },
  { type: "plant", x: 292, y: 165, sortY: 177 },
];

const DRAW_FURNITURE: Record<FurnitureItem["type"], (ctx: CanvasRenderingContext2D, x: number, y: number) => void> = {
  desk: drawDesk,
  sofa: drawSofa,
  whiteboard: drawWhiteboard,
  coffee: drawCoffeeMachine,
  plant: drawPlant,
};

// --- Main render function ---

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  sprites: AgentSpriteData[],
) {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Background
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Zone backgrounds
  ctx.fillStyle = "rgba(30,40,60,0.5)";
  ctx.fillRect(ZONES.meeting.x, ZONES.meeting.y, ZONES.meeting.w, ZONES.meeting.h);
  ctx.fillRect(ZONES.workspace.x, ZONES.workspace.y, ZONES.workspace.w, ZONES.workspace.h);
  ctx.fillRect(ZONES.lounge.x, ZONES.lounge.y, ZONES.lounge.w, ZONES.lounge.h);

  // Zone borders
  ctx.strokeStyle = "rgba(127,219,202,0.15)";
  ctx.lineWidth = 1;
  ctx.strokeRect(ZONES.meeting.x, ZONES.meeting.y, ZONES.meeting.w, ZONES.meeting.h);
  ctx.strokeRect(ZONES.workspace.x, ZONES.workspace.y, ZONES.workspace.w, ZONES.workspace.h);
  ctx.strokeRect(ZONES.lounge.x, ZONES.lounge.y, ZONES.lounge.w, ZONES.lounge.h);

  // Zone labels
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.font = "12px monospace";
  ctx.textAlign = "center";
  ctx.fillText("MEETING", ZONES.meeting.x + ZONES.meeting.w / 2, ZONES.meeting.y + ZONES.meeting.h + 12);
  ctx.fillText("WORKSPACE", ZONES.workspace.x + ZONES.workspace.w / 2, ZONES.workspace.y + ZONES.workspace.h + 12);
  ctx.fillText("LOUNGE", ZONES.lounge.x + ZONES.lounge.w / 2, ZONES.lounge.y + ZONES.lounge.h + 12);

  // Y-sort all objects (furniture + agents)
  type Renderable = { sortY: number; render: () => void };
  const queue: Renderable[] = [
    ...FURNITURE.map((f) => ({
      sortY: f.sortY,
      render: () => DRAW_FURNITURE[f.type](ctx, f.x, f.y),
    })),
    ...sprites.map((s) => ({
      sortY: s.y,
      render: () => drawAgent(ctx, s),
    })),
  ];
  queue.sort((a, b) => a.sortY - b.sortY);
  queue.forEach((item) => item.render());

  // HUD bar
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillRect(0, CANVAS_HEIGHT - 20, CANVAS_WIDTH, 20);
  ctx.fillStyle = "#7fdbca";
  ctx.font = "12px monospace";
  ctx.textAlign = "left";
  const working = sprites.filter((s) => s.state === "working" || s.state === "meeting").length;
  const idle = sprites.filter((s) => s.state === "idle" || s.state === "waiting" || s.state === "celebrating").length;
  const offline = sprites.filter((s) => s.state === "offline").length;
  ctx.fillText(
    `⚡ Working: ${working}   ☕ Idle: ${idle}   💤 Offline: ${offline}   👥 Total: ${sprites.length}`,
    16,
    CANVAS_HEIGHT - 6,
  );
}

/** Hit-test: find agent at canvas coordinates. */
export function hitTest(
  sprites: AgentSpriteData[],
  mx: number,
  my: number,
): AgentSpriteData | null {
  return sprites.find((a) => Math.abs(a.x - mx) < 12 && Math.abs(a.y - 10 - my) < 18) ?? null;
}
