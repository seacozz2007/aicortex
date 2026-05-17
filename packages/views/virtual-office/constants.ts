/** Virtual Office layout constants — zone coordinates, waypoints, timings. */

export interface Position {
  x: number;
  y: number;
}

/** Canvas dimensions (logical pixels, rendered at 2x). */
export const CANVAS_WIDTH = 640;
export const CANVAS_HEIGHT = 400;
export const CANVAS_SCALE = 2;

/** Zone bounding boxes. */
export const ZONES = {
  meeting: { x: 30, y: 95, w: 170, h: 200 },
  workspace: { x: 215, y: 95, w: 250, h: 200 },
  lounge: { x: 480, y: 95, w: 135, h: 200 },
} as const;

/** Fixed desk positions (3×3 grid). */
export const DESKS: Position[] = [];
for (let r = 0; r < 3; r++)
  for (let c = 0; c < 3; c++)
    DESKS.push({ x: 255 + c * 80, y: 125 + r * 65 });

export const MAX_DESKS = DESKS.length;

/** Lounge rest spots. */
export const LOUNGE_SPOTS: Position[] = [
  { x: 510, y: 140 },
  { x: 555, y: 160 },
  { x: 520, y: 200 },
  { x: 560, y: 230 },
  { x: 530, y: 265 },
];

/** Meeting room seats (leader + 5 members). */
export const MEETING_SPOTS: Position[] = [
  { x: 65, y: 155 },
  { x: 110, y: 155 },
  { x: 155, y: 155 },
  { x: 65, y: 210 },
  { x: 110, y: 210 },
  { x: 155, y: 210 },
];

/** Outside / door position for offline agents. */
export const OUTSIDE: Position = { x: 320, y: 380 };

/** Waypoint nodes for routing between zones. */
const DESK_EXIT: Position = { x: 340, y: 280 };
const LOUNGE_ENTRY: Position = { x: 480, y: 200 };
const MEETING_ENTRY: Position = { x: 200, y: 180 };
const CORRIDOR_MID: Position = { x: 340, y: 300 };

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
  MOVE_SPEED: 1.8,
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
