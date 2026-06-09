import type { SelectedPreviewElement } from "./preview-element";

function parsePx(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
}

function shortenColor(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "rgba(0, 0, 0, 0)" || trimmed === "transparent") {
    return "transparent";
  }
  return trimmed;
}

function primaryFontFamily(fontFamily: string): string {
  const first = fontFamily.split(",")[0]?.trim() ?? "inherit";
  return first.replace(/^['"]|['"]$/g, "");
}

function elementLabel(el: HTMLElement): string {
  const tagged = el.getAttribute("data-aicortex-id");
  if (tagged) return tagged;
  const cls = el.className?.toString().split(/\s+/).filter(Boolean)[0];
  if (cls) return cls;
  return el.tagName.toLowerCase();
}

function elementId(el: HTMLElement): string {
  return (
    el.getAttribute("data-aicortex-id") ??
    `${el.tagName.toLowerCase()}-${el.className?.toString().split(/\s+/).filter(Boolean)[0] || "node"}`
  );
}

export function extractSelectedElement(el: HTMLElement): SelectedPreviewElement {
  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);

  return {
    id: elementId(el),
    tag: el.tagName.toLowerCase(),
    label: elementLabel(el),
    rect: {
      top: rect.top,
      left: rect.left,
      width,
      height,
    },
    style: {
      size: `${width}×${height}`,
      color: shortenColor(cs.color),
      background: shortenColor(cs.backgroundColor),
      font: `${cs.fontSize} ${primaryFontFamily(cs.fontFamily)}`,
      lineHeight: cs.lineHeight,
    },
    width,
    height,
    fill: shortenColor(cs.backgroundColor),
    opacity: Number.isFinite(parseFloat(cs.opacity)) ? parseFloat(cs.opacity) : 1,
    padding: {
      top: parsePx(cs.paddingTop),
      right: parsePx(cs.paddingRight),
      bottom: parsePx(cs.paddingBottom),
      left: parsePx(cs.paddingLeft),
    },
    margin: {
      top: parsePx(cs.marginTop),
      right: parsePx(cs.marginRight),
      bottom: parsePx(cs.marginBottom),
      left: parsePx(cs.marginLeft),
    },
    borderRadius: parsePx(cs.borderRadius),
    fontWeight: cs.fontWeight || "400",
    textAlign: cs.textAlign || "left",
  };
}

export function isPreviewTarget(
  el: EventTarget | null,
  doc?: Document | null,
): el is HTMLElement {
  if (!el || typeof el !== "object") return false;
  const node = el as HTMLElement;
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  if (doc && node.ownerDocument !== doc) return false;
  const tag = node.tagName;
  if (tag === "HTML" || tag === "BODY") return false;
  return true;
}
