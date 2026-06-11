import type { ElementRect } from "./preview-element";

function overlapRatio(rect: ElementRect, bounds: DOMRect): number {
  const left = Math.max(rect.left, bounds.left);
  const top = Math.max(rect.top, bounds.top);
  const right = Math.min(rect.left + rect.width, bounds.right);
  const bottom = Math.min(rect.top + rect.height, bounds.bottom);
  const overlap = Math.max(0, right - left) * Math.max(0, bottom - top);
  const area = rect.width * rect.height;
  return area > 0 ? overlap / area : 0;
}

/** Map an iframe element to top-level viewport coordinates (sidebar, chrome, zoom). */
export function elementVisualViewportRect(
  el: HTMLElement,
  iframe: HTMLIFrameElement | null,
): ElementRect {
  const elRect = el.getBoundingClientRect();
  const direct: ElementRect = {
    top: elRect.top,
    left: elRect.left,
    width: elRect.width,
    height: elRect.height,
  };

  if (!iframe || el.ownerDocument === document) {
    return direct;
  }

  const iframeRect = iframe.getBoundingClientRect();
  const scaleX = iframe.clientWidth > 0 ? iframeRect.width / iframe.clientWidth : 1;
  const scaleY = iframe.clientHeight > 0 ? iframeRect.height / iframe.clientHeight : 1;

  const nested: ElementRect = {
    top: iframeRect.top + elRect.top * scaleY,
    left: iframeRect.left + elRect.left * scaleX,
    width: elRect.width * scaleX,
    height: elRect.height * scaleY,
  };

  return overlapRatio(direct, iframeRect) >= overlapRatio(nested, iframeRect)
    ? direct
    : nested;
}

export function overlayRectForContainer(
  el: HTMLElement,
  container: HTMLElement,
  iframe: HTMLIFrameElement | null,
): ElementRect {
  const visual = elementVisualViewportRect(el, iframe);
  const containerRect = container.getBoundingClientRect();
  return {
    top: visual.top - containerRect.top + container.scrollTop,
    left: visual.left - containerRect.left + container.scrollLeft,
    width: visual.width,
    height: visual.height,
  };
}
