/**
 * Agent sprite state machine + waypoint-based movement.
 * Pure logic — no rendering. Consumed by the canvas renderer.
 */

import {
  WAYPOINTS,
  OUTSIDE,
  TIMING,
  type Position,
  type ZoneId,
} from "../constants";

export type SpriteState =
  | "idle"
  | "working"
  | "walking"
  | "waiting"
  | "meeting"
  | "offline"
  | "celebrating";

export interface Bubble {
  emoji: string;
  text?: string;
  timer: number;
}

export interface AgentSpriteData {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  state: SpriteState;
  zone: ZoneId;
  opacity: number;
  frame: number;
  bubble: Bubble | null;
  /** Internal: path waypoints being traversed. */
  path: Position[] | null;
  pathIdx: number;
  /** Internal: minimum-stay timer (frames remaining). */
  stayTimer: number;
}

/** Resolve the sprite state from zone. */
function zoneToState(zone: ZoneId): SpriteState {
  switch (zone) {
    case "desks":
      return "working";
    case "lounge":
      return "idle";
    case "meeting":
      return "meeting";
    case "outside":
      return "offline";
  }
}

/** Build the full waypoint path from current position to target. */
function buildPath(
  from: Position,
  fromZone: ZoneId,
  toZone: ZoneId,
  target: Position,
): Position[] {
  const key = `${fromZone}→${toZone}`;
  const waypoints = WAYPOINTS[key] ?? [];
  return [from, ...waypoints, target];
}

/** Create initial sprite data for an agent. */
export function createSprite(
  id: string,
  name: string,
  color: string,
  zone: ZoneId,
  target: Position,
): AgentSpriteData {
  const pos = zone === "outside" ? OUTSIDE : target;
  return {
    id,
    name,
    color,
    x: pos.x,
    y: pos.y,
    state: zoneToState(zone),
    zone,
    opacity: zone === "outside" ? 0.4 : 1,
    frame: (Math.random() * 100) | 0,
    bubble: null,
    path: null,
    pathIdx: 0,
    stayTimer: 0,
  };
}

/** Trigger a zone transition for a sprite. */
export function transitionSprite(
  sprite: AgentSpriteData,
  newZone: ZoneId,
  target: Position,
): void {
  if (sprite.zone === newZone) {
    // Same zone, just update target if needed
    if (sprite.path === null) {
      sprite.x = target.x;
      sprite.y = target.y;
    }
    return;
  }

  // Offline is high-priority — interrupt immediately
  if (newZone === "outside") {
    sprite.bubble = { emoji: "💤", text: "Disconnected", timer: TIMING.BUBBLE_DURATION };
    sprite.path = buildPath({ x: sprite.x, y: sprite.y }, sprite.zone, "outside", OUTSIDE);
    sprite.pathIdx = 1;
    sprite.zone = "outside";
    return;
  }

  // If still in min-stay, queue will be handled by caller debounce
  if (sprite.stayTimer > 0 && sprite.path === null) return;

  // Build path and start walking
  const bubbles: Record<ZoneId, Bubble | null> = {
    desks: { emoji: "📋", timer: 80 },
    lounge: null,
    meeting: { emoji: "🗣", timer: 80 },
    outside: null,
  };

  sprite.bubble = bubbles[newZone];
  sprite.path = buildPath({ x: sprite.x, y: sprite.y }, sprite.zone, newZone, target);
  sprite.pathIdx = 1;
  sprite.zone = newZone;
}

/** Show a celebration bubble (task completed). */
export function celebrateSprite(sprite: AgentSpriteData): void {
  sprite.state = "celebrating";
  sprite.bubble = { emoji: "✅", text: "Done!", timer: TIMING.BUBBLE_DURATION };
}

/** Advance sprite one frame. Call at 60fps. */
export function tickSprite(sprite: AgentSpriteData): void {
  sprite.frame++;

  // Tick bubble
  if (sprite.bubble) {
    sprite.bubble.timer--;
    if (sprite.bubble.timer <= 0) sprite.bubble = null;
  }

  // Tick stay timer
  if (sprite.stayTimer > 0) sprite.stayTimer--;

  // Move along path
  if (sprite.path && sprite.pathIdx < sprite.path.length) {
    const target = sprite.path[sprite.pathIdx]!;
    const dx = target.x - sprite.x;
    const dy = target.y - sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 2) {
      sprite.x = target.x;
      sprite.y = target.y;
      sprite.pathIdx++;
      if (sprite.pathIdx >= sprite.path.length) {
        // Arrived
        sprite.path = null;
        sprite.state = zoneToState(sprite.zone);
        sprite.opacity = sprite.zone === "outside" ? 0.4 : 1;
        sprite.stayTimer = (TIMING.MIN_STAY_MS / 16) | 0; // ~30 frames
      }
    } else {
      const spd = TIMING.MOVE_SPEED;
      sprite.x += (dx / dist) * spd;
      sprite.y += (dy / dist) * spd;
      sprite.state = "walking";
      sprite.opacity = 1;
    }
  } else if (!sprite.path) {
    // Settled — ensure correct state
    if (sprite.state === "celebrating") {
      // Stay celebrating until bubble expires
      if (!sprite.bubble) sprite.state = zoneToState(sprite.zone);
    } else {
      sprite.state = zoneToState(sprite.zone);
      sprite.opacity = sprite.zone === "outside" ? 0.4 : 1;
    }
  }
}
