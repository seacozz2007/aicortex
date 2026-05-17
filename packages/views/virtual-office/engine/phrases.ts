/** Phrase picker utilities */

import {
  TASK_START_PHRASES,
  TASK_COMPLETE_PHRASES,
  IDLE_CHATTER_PHRASES,
  ARGUMENT_PHRASES,
  WATCHING_TV_PHRASES,
  LOOKING_AT_PLANT_PHRASES,
  MEETING_START_PHRASES,
  ONLINE_PHRASES,
  OFFLINE_PHRASES,
} from "./phrase-data";

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function pickTaskStart(): string { return pick(TASK_START_PHRASES); }
export function pickTaskComplete(): string { return pick(TASK_COMPLETE_PHRASES); }
export function pickIdleChatter(): string { return pick(IDLE_CHATTER_PHRASES); }
export function pickArgument(): [string, string] { return pick(ARGUMENT_PHRASES); }
export function pickWatchingTV(): string { return pick(WATCHING_TV_PHRASES); }
export function pickLookingAtPlant(): string { return pick(LOOKING_AT_PLANT_PHRASES); }
export function pickMeetingStart(): string { return pick(MEETING_START_PHRASES); }
export function pickOnline(): string { return pick(ONLINE_PHRASES); }
export function pickOffline(): string { return pick(OFFLINE_PHRASES); }
