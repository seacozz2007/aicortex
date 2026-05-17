/** Virtual Office layout constants — zone coordinates, waypoints, timings. */

export interface Position {
  x: number;
  y: number;
}

/** Canvas dimensions (logical pixels, rendered at 2x). */
export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 600;
export const CANVAS_SCALE = 1.5;

/** Zone bounding boxes. */
export const ZONES = {
  meeting: { x: 45, y: 142, w: 255, h: 300 },
  workspace: { x: 322, y: 142, w: 375, h: 300 },
  lounge: { x: 720, y: 142, w: 202, h: 300 },
} as const;

/** Fixed desk positions (3×3 grid). */
export const DESKS: Position[] = [];
for (let r = 0; r < 3; r++)
  for (let c = 0; c < 3; c++)
    DESKS.push({ x: 382 + c * 120, y: 187 + r * 97 });

export const MAX_DESKS = DESKS.length;

/** Lounge rest spots. */
export const LOUNGE_SPOTS: Position[] = [
  { x: 765, y: 210 },
  { x: 832, y: 240 },
  { x: 780, y: 300 },
  { x: 840, y: 345 },
  { x: 795, y: 397 },
];

/** Meeting room seats (leader + 5 members). */
export const MEETING_SPOTS: Position[] = [
  { x: 97, y: 232 },
  { x: 165, y: 232 },
  { x: 232, y: 232 },
  { x: 97, y: 315 },
  { x: 165, y: 315 },
  { x: 232, y: 315 },
];

/** Outside / door position for offline agents. */
export const OUTSIDE: Position = { x: 480, y: 570 };

/** Waypoint nodes for routing between zones. */
const DESK_EXIT: Position = { x: 510, y: 420 };
const LOUNGE_ENTRY: Position = { x: 720, y: 300 };
const MEETING_ENTRY: Position = { x: 300, y: 270 };
const CORRIDOR_MID: Position = { x: 510, y: 450 };

export type ZoneId = "desks" | "lounge" | "meeting" | "outside";

/** Pre-defined waypoint paths between zone pairs. */
export const WAYPOINTS: Record<string, Position[]> = {
  "desks→lounge": [DESK_EXIT, LOUNGE_ENTRY],
  "lounge→desks": [LOUNGE_ENTRY, DESK_EXIT],
  "desks→meeting": [DESK_EXIT, MEETING_ENTRY],
  "meeting→desks": [MEETING_ENTRY, DESK_EXIT],
  "lounge→meeting": [LOUNGE_ENTRY, DESK_EXIT, MEETING_ENTRY],
  "meeting→lounge": [MEETING_ENTRY, DESK_EXIT, LOUNGE_ENTRY],
  "outside→desks": [CORRIDOR_MID, DESK_EXIT],
  "outside→lounge": [CORRIDOR_MID, LOUNGE_ENTRY],
  "outside→meeting": [CORRIDOR_MID, MEETING_ENTRY],
  "desks→outside": [DESK_EXIT, CORRIDOR_MID],
  "lounge→outside": [LOUNGE_ENTRY, CORRIDOR_MID],
  "meeting→outside": [MEETING_ENTRY, CORRIDOR_MID],
};

/** Animation / state machine timing constants (ms). */
export const TIMING = {
  /** Debounce window for state changes. */
  DEBOUNCE_MS: 300,
  /** Minimum time an agent stays in a state before transitioning. */
  MIN_STAY_MS: 500,
  /** Agent movement speed (pixels per frame at 60fps). */
  MOVE_SPEED: 2.7,
  /** Bubble display duration (frames). */
  BUBBLE_DURATION: 100,
  /** Meeting heuristic: seconds leader must be working + members queued. */
  MEETING_HEURISTIC_DELAY_S: 3,
} as const;

/** Agent sprite colors (assigned by index). */
export const AGENT_COLORS = [
  "#f5a623", "#7ed321", "#4a90d9", "#bd10e0",
  "#50e3c2", "#e35050", "#f8e71c", "#9013fe",
  "#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4",
];
