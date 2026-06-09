HyperFrames are **HTML motion compositions**, not generated video files. Build a single `index.html` with timed frame sections the browser can autoplay; optional metadata supports later Remotion/HyperFrames export.

## Structure

- Output consecutive `<section class="frame">` elements sized to the requested aspect ratio (default 1920×1080 for 16:9).
- Frame count follows content density: short briefs 6–10 frames; longer narratives use more frames with **one idea per frame**.
- Each frame bottom includes a hidden marker: `<!-- frame:N duration:3000 transition:fade -->` (duration in ms).
- End the file with `<!-- HYPERFRAMES_META: {...} -->` JSON listing each frame's duration, transition, and sceneSummary.

## Motion & layout

- Frame 1 is the hook (one stat, contrarian line, or question). Middle frames build the argument. Final frame is conclusion + CTA.
- Typography is bold and large; one headline idea per frame — avoid walls of text.
- Use a cohesive cinematic palette (dark base + one accent). Prefer CSS transitions between frames, not heavy video codecs.
- Add autoplay JavaScript: advance every N ms (match requested total duration ÷ frame count), plus click/arrow-key control and a corner progress indicator.

## Assets

- When a source folder is provided, reference real files from that folder (screenshots, logos, charts). Never use lorem ipsum or stock placeholders when real assets exist.
- Inline CSS/JS; primary entry remains `index.html`.

## Output rules

- Tag interactive regions with `data-aicortex-id` for comment mode.
- Prefer real files in the task work directory over inline-only responses.
