/**
 * Agent sprite state machine + waypoint-based movement + idle behaviors.
 * Pure logic — no rendering. Consumed by the canvas renderer.
 */

import {
  WAYPOINTS,
  OUTSIDE,
  TIMING,
  LOUNGE_SPOTS,
  type Position,
  type ZoneId,
} from "../constants";
import {
  pickTaskStart,
  pickTaskComplete,
  pickIdleChatter,
  pickArgument,
  pickWatchingTV,
  pickLookingAtPlant,
  pickMeetingStart,
  pickOnline,
  pickOffline,
} from "./phrases";

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
  path: Position[] | null;
  pathIdx: number;
  stayTimer: number;
  /** Countdown to next idle behavior (frames). */
  idleTimer: number;
  /** Previous zone — used to detect transitions for bubbles. */
  prevZone: ZoneId;
}

function zoneToState(zone: ZoneId): SpriteState {
  switch (zone) {
    case "desks": return "working";
    case "lounge": return "idle";
    case "meeting": return "meeting";
    case "outside": return "offline";
  }
}

function buildPath(from: Position, fromZone: ZoneId, toZone: ZoneId, target: Position): Position[] {
  const key = `${fromZone}→${toZone}`;
  const waypoints = WAYPOINTS[key] ?? [];
  return [from, ...waypoints, target];
}

/** Random idle timer: 300–900 frames (~5–15s at 60fps). */
function randomIdleTimer(): number {
  return 300 + Math.floor(Math.random() * 600);
}

export function createSprite(
  id: string, name: string, color: string, zone: ZoneId, target: Position,
): AgentSpriteData {
  const pos = zone === "outside" ? OUTSIDE : target;
  return {
    id, name, color,
    x: pos.x, y: pos.y,
    state: zoneToState(zone),
    zone, prevZone: zone,
    opacity: zone === "outside" ? 0.4 : 1,
    frame: (Math.random() * 100) | 0,
    bubble: null,
    path: null, pathIdx: 0,
    stayTimer: 0,
    idleTimer: randomIdleTimer(),
  };
}

/** Trigger a zone transition with contextual bubble phrases. */
export function transitionSprite(sprite: AgentSpriteData, newZone: ZoneId, target: Position): void {
  if (sprite.zone === newZone) {
    if (sprite.path === null) { sprite.x = target.x; sprite.y = target.y; }
    return;
  }

  const oldZone = sprite.zone;
  sprite.prevZone = oldZone;

  // Offline — high priority interrupt
  if (newZone === "outside") {
    sprite.bubble = { emoji: "💤", text: pickOffline(), timer: TIMING.BUBBLE_DURATION };
    sprite.path = buildPath({ x: sprite.x, y: sprite.y }, oldZone, "outside", OUTSIDE);
    sprite.pathIdx = 1;
    sprite.zone = "outside";
    return;
  }

  if (sprite.stayTimer > 0 && sprite.path === null) return;

  // Contextual bubbles based on transition direction
  if (newZone === "desks" && oldZone === "lounge") {
    // Starting work
    sprite.bubble = { emoji: "💪", text: pickTaskStart(), timer: TIMING.BUBBLE_DURATION };
  } else if (newZone === "lounge" && oldZone === "desks") {
    // Finished work
    sprite.state = "celebrating";
    sprite.bubble = { emoji: "✅", text: pickTaskComplete(), timer: TIMING.BUBBLE_DURATION };
  } else if (newZone === "meeting") {
    sprite.bubble = { emoji: "🗣", text: pickMeetingStart(), timer: 80 };
  } else if (newZone === "desks" && oldZone === "outside") {
    sprite.bubble = { emoji: "🟢", text: pickOnline(), timer: 80 };
  }

  sprite.path = buildPath({ x: sprite.x, y: sprite.y }, oldZone, newZone, target);
  sprite.pathIdx = 1;
  sprite.zone = newZone;
}

/** Trigger idle behavior on a sprite. Called by the idle behavior system. */
function triggerIdleBehavior(sprite: AgentSpriteData, allSprites: AgentSpriteData[]): void {
  if (sprite.bubble) return; // Don't interrupt existing bubble

  const roll = Math.random();

  if (roll < 0.3) {
    // Chatter
    sprite.bubble = { emoji: "💬", text: pickIdleChatter(), timer: 120 };
  } else if (roll < 0.45) {
    // Argument with another idle agent — move closer first
    const others = allSprites.filter(
      (s) => s.id !== sprite.id && s.zone === "lounge" && !s.bubble && !s.path,
    );
    if (others.length > 0) {
      const target = others[Math.floor(Math.random() * others.length)]!;
      const [line1, line2] = pickArgument();
      // Move both toward midpoint
      const midX = (sprite.x + target.x) / 2;
      const midY = (sprite.y + target.y) / 2;
      sprite.path = [{ x: sprite.x, y: sprite.y }, { x: midX - 12, y: midY }];
      sprite.pathIdx = 1;
      target.path = [{ x: target.x, y: target.y }, { x: midX + 12, y: midY }];
      target.pathIdx = 1;
      // Show bubbles (slightly delayed via shorter timer offset)
      sprite.bubble = { emoji: "😤", text: line1, timer: 160 };
      target.bubble = { emoji: "😡", text: line2, timer: 130 };
    } else {
      sprite.bubble = { emoji: "💬", text: pickIdleChatter(), timer: 120 };
    }
  } else if (roll < 0.55) {
    // Watch TV
    sprite.bubble = { emoji: "📺", text: pickWatchingTV(), timer: 100 };
  } else if (roll < 0.65) {
    // Look at plant
    sprite.bubble = { emoji: "🌱", text: pickLookingAtPlant(), timer: 90 };
  } else if (roll < 0.85) {
    // Wander — small random movement within lounge
    const spot = LOUNGE_SPOTS[Math.floor(Math.random() * LOUNGE_SPOTS.length)]!;
    const jitterX = spot.x + (Math.random() - 0.5) * 20;
    const jitterY = spot.y + (Math.random() - 0.5) * 16;
    sprite.path = [{ x: sprite.x, y: sprite.y }, { x: jitterX, y: jitterY }];
    sprite.pathIdx = 1;
  }
  // else: do nothing this cycle
}

/** Advance sprite one frame. Call at 60fps. */
export function tickSprite(sprite: AgentSpriteData, allSprites: AgentSpriteData[]): void {
  sprite.frame++;

  // Tick bubble
  if (sprite.bubble) {
    sprite.bubble.timer--;
    if (sprite.bubble.timer <= 0) sprite.bubble = null;
  }

  // Tick stay timer
  if (sprite.stayTimer > 0) sprite.stayTimer--;

  // Idle behavior timer (only when settled in lounge)
  if (sprite.zone === "lounge" && !sprite.path && sprite.state === "idle") {
    sprite.idleTimer--;
    if (sprite.idleTimer <= 0) {
      triggerIdleBehavior(sprite, allSprites);
      sprite.idleTimer = randomIdleTimer();
    }
  }

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
        sprite.path = null;
        sprite.state = zoneToState(sprite.zone);
        sprite.opacity = sprite.zone === "outside" ? 0.4 : 1;
        sprite.stayTimer = (TIMING.MIN_STAY_MS / 16) | 0;
      }
    } else {
      const spd = TIMING.MOVE_SPEED;
      sprite.x += (dx / dist) * spd;
      sprite.y += (dy / dist) * spd;
      sprite.state = "walking";
      sprite.opacity = 1;
    }
  } else if (!sprite.path) {
    if (sprite.state === "celebrating") {
      if (!sprite.bubble) sprite.state = zoneToState(sprite.zone);
    } else {
      sprite.state = zoneToState(sprite.zone);
      sprite.opacity = sprite.zone === "outside" ? 0.4 : 1;
    }
  }
}
