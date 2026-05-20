/**
 * Meeting room scene extension for the Virtual Office.
 * Provides meeting-aware state (speaker detection from comments)
 * and rendering enhancements (speaker highlight, meeting info).
 */

import type { AgentSpriteData } from "../engine/agent-sprite";
import { ZONES } from "../constants";

/** Data about an active meeting room. */
export interface MeetingRoomInfo {
  issueId: string;
  title: string;
  currentSpeakerId: string | null;
  participantIds: string[];
}

/** Draw meeting-room-specific overlays on the canvas. */
export function drawMeetingRoomOverlay(
  ctx: CanvasRenderingContext2D,
  sprites: AgentSpriteData[],
  speakerIds: Set<string>,
) {
  const zone = ZONES.meeting;
  const meetingSprites = sprites.filter((s) => s.zone === "meeting");
  if (meetingSprites.length === 0) return;

  // Draw zone header with meeting indicator
  ctx.fillStyle = "rgba(127,219,202,0.15)";
  ctx.fillRect(zone.x, zone.y - 2, zone.w, 2);
  ctx.fillStyle = "rgba(127,219,202,0.08)";
  ctx.fillRect(zone.x, zone.y, zone.w, zone.h);

  // Highlight current speaker
  for (const sprite of meetingSprites) {
    if (speakerIds.has(sprite.id)) {
      // Glow ring around speaker
      ctx.strokeStyle = "rgba(127,219,202,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sprite.x, sprite.y - 8, 16, 0, Math.PI * 2);
      ctx.stroke();

      // Speaker label above
      ctx.fillStyle = "rgba(127,219,202,0.9)";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("🗣 SPEAKING", sprite.x, sprite.y - 36);
    }
  }

  // Draw meeting room label with participant count
  ctx.fillStyle = "rgba(127,219,202,0.5)";
  ctx.font = "11px monospace";
  ctx.textAlign = "center";
  ctx.fillText(
    `MEETING (${meetingSprites.length})`,
    zone.x + zone.w / 2,
    zone.y + zone.h + 12,
  );
}
