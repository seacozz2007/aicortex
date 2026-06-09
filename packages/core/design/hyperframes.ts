/** HyperFrames composer options — HTML timed frames, not video generation. */

export type HyperframesAspectRatio = "16:9" | "9:16" | "1:1" | "4:5";

export type HyperframesDurationSec = 3 | 5 | 8 | 10 | 15 | 30;

export const HYPERFRAMES_ASPECT_RATIOS: {
  id: HyperframesAspectRatio;
  label: string;
  width: number;
  height: number;
}[] = [
  { id: "16:9", label: "16:9", width: 1920, height: 1080 },
  { id: "9:16", label: "9:16", width: 1080, height: 1920 },
  { id: "1:1", label: "1:1", width: 1080, height: 1080 },
  { id: "4:5", label: "4:5", width: 1080, height: 1350 },
];

export const HYPERFRAMES_DURATIONS: HyperframesDurationSec[] = [3, 5, 8, 10, 15, 30];

export function hyperframesDimensions(ratio: HyperframesAspectRatio): { width: number; height: number } {
  const found = HYPERFRAMES_ASPECT_RATIOS.find((r) => r.id === ratio);
  return found ?? { width: 1920, height: 1080 };
}

export function buildHyperframesBriefPrefix(opts: {
  aspectRatio: HyperframesAspectRatio;
  durationSec: HyperframesDurationSec;
  sourceFolder?: string;
}): string {
  const { width, height } = hyperframesDimensions(opts.aspectRatio);
  const lines = [
    "## HyperFrames parameters",
    `- Aspect ratio: ${opts.aspectRatio} (${width}×${height})`,
    `- Target duration: ${opts.durationSec}s total`,
    `- Output: single HTML HyperFrames composition (not MP4)`,
  ];
  if (opts.sourceFolder?.trim()) {
    lines.push(`- Source assets folder: ${opts.sourceFolder.trim()}`);
  }
  return lines.join("\n");
}
