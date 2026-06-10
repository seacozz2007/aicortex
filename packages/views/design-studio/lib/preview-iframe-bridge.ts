import type { PreviewToolMode } from "./preview-element";
import { injectSnapshotBridge } from "./preview-screenshot";

const BRIDGE_FLAG = "__aicortexPreviewBridge";

export type PreviewBridgeSelectPayload = {
  type: "aicortex:preview-select";
  tool: "comment" | "edit";
  selector?: string;
  id: string;
  tag: string;
  label: string;
  rect: { top: number; left: number; width: number; height: number };
  style: {
    size: string;
    color: string;
    background: string;
    font: string;
    lineHeight: string;
  };
  width: number;
  height: number;
  fill: string;
  opacity: number;
  padding: { top: number; right: number; bottom: number; left: number };
  margin: { top: number; right: number; bottom: number; left: number };
  borderRadius: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  textAlign: string;
  lineHeight: number;
  letterSpacing: number;
};

export type PreviewBridgeHoverPayload = {
  type: "aicortex:preview-hover";
  id: string;
  tag: string;
  label: string;
  rect: { top: number; left: number; width: number; height: number };
  style: PreviewBridgeSelectPayload["style"];
  width: number;
  height: number;
  fill: string;
  opacity: number;
  padding: PreviewBridgeSelectPayload["padding"];
  margin: PreviewBridgeSelectPayload["margin"];
  borderRadius: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  textAlign: string;
  lineHeight: number;
  letterSpacing: number;
};

function bridgeScript(): string {
  return `(function(){
  if (window.${BRIDGE_FLAG}) return;
  window.${BRIDGE_FLAG} = true;
  var tool = null;
  var styleId = 'aicortex-preview-tool-style';

  function parsePx(value){
    var n = parseFloat(value);
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
  }
  function shortenColor(value){
    var trimmed = String(value || '').trim();
    if (!trimmed || trimmed === 'rgba(0, 0, 0, 0)' || trimmed === 'transparent') return 'transparent';
    return trimmed;
  }
  function primaryFontFamily(fontFamily){
    var first = String(fontFamily || '').split(',')[0] || 'inherit';
    return first.trim().replace(/^['"]|['"]$/g, '');
  }
  function elementLabel(el){
    var tagged = el.getAttribute('data-aicortex-id');
    if (tagged) return tagged;
    var cls = (el.className && el.className.toString().split(/\\s+/).filter(Boolean)[0]) || '';
    if (cls) return cls;
    return el.tagName.toLowerCase();
  }
  function elementId(el){
    return el.getAttribute('data-aicortex-id') ||
      (el.tagName.toLowerCase() + '-' + ((el.className && el.className.toString().split(/\\s+/).filter(Boolean)[0]) || 'node'));
  }
  function resolveTarget(el){
    var node = el && el.closest ? el.closest('[data-aicortex-id]') : null;
    return node || el;
  }
  function isTarget(el){
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (tag === 'HTML' || tag === 'BODY') return false;
    return true;
  }
  function serialize(el){
    var cs = window.getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    var width = Math.round(rect.width);
    var height = Math.round(rect.height);
    return {
      id: elementId(el),
      tag: el.tagName.toLowerCase(),
      label: elementLabel(el),
      rect: { top: rect.top, left: rect.left, width: width, height: height },
      style: {
        size: width + '×' + height,
        color: shortenColor(cs.color),
        background: shortenColor(cs.backgroundColor),
        font: cs.fontSize + ' ' + primaryFontFamily(cs.fontFamily),
        lineHeight: cs.lineHeight
      },
      width: width,
      height: height,
      fill: shortenColor(cs.backgroundColor),
      opacity: Number.isFinite(parseFloat(cs.opacity)) ? parseFloat(cs.opacity) : 1,
      padding: { top: parsePx(cs.paddingTop), right: parsePx(cs.paddingRight), bottom: parsePx(cs.paddingBottom), left: parsePx(cs.paddingLeft) },
      margin: { top: parsePx(cs.marginTop), right: parsePx(cs.marginRight), bottom: parsePx(cs.marginBottom), left: parsePx(cs.marginLeft) },
      borderRadius: parsePx(cs.borderRadius),
      fontFamily: primaryFontFamily(cs.fontFamily),
      fontSize: parsePx(cs.fontSize),
      fontWeight: cs.fontWeight || '400',
      color: shortenColor(cs.color),
      textAlign: cs.textAlign || 'left',
      lineHeight: parsePx(cs.lineHeight),
      letterSpacing: parsePx(cs.letterSpacing)
    };
  }
  function updateCursor(){
    var doc = document;
    var style = doc.getElementById(styleId);
    if (!tool) {
      if (style) style.remove();
      return;
    }
    if (!style) {
      style = doc.createElement('style');
      style.id = styleId;
      (doc.head || doc.documentElement).appendChild(style);
    }
    style.textContent = tool === 'edit'
      ? '* { cursor: pointer !important; }'
      : '* { cursor: crosshair !important; }';
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || data.type !== 'aicortex:preview-tool') return;
    tool = data.tool || null;
    updateCursor();
  });
  document.addEventListener('click', function(ev){
    if (!tool || tool === 'mark') return;
    if (!isTarget(ev.target)) return;
    ev.preventDefault();
    ev.stopPropagation();
    var el = resolveTarget(ev.target);
    if (!el || !isTarget(el)) return;
    try {
      document.querySelectorAll('[data-aicortex-preview-active]').forEach(function(node){
        node.removeAttribute('data-aicortex-preview-active');
      });
      el.setAttribute('data-aicortex-preview-active', '1');
    } catch (_) {}
    var payload = serialize(el);
    payload.selector = el.getAttribute('data-aicortex-id')
      ? '[data-aicortex-id="' + String(el.getAttribute('data-aicortex-id')).replace(/"/g, '\\\\"') + '"]'
      : '[data-aicortex-preview-active]';
    window.parent.postMessage(Object.assign({ type: 'aicortex:preview-select', tool: tool }, payload), '*');
  }, true);
  document.addEventListener('mousemove', function(ev){
    if (tool !== 'comment') return;
    if (!isTarget(ev.target)) {
      window.parent.postMessage({ type: 'aicortex:preview-leave' }, '*');
      return;
    }
    var el = resolveTarget(ev.target);
    if (!el || !isTarget(el)) return;
    var payload = serialize(el);
    window.parent.postMessage(Object.assign({ type: 'aicortex:preview-hover' }, payload), '*');
  }, true);
  document.addEventListener('mouseleave', function(){
    window.parent.postMessage({ type: 'aicortex:preview-leave' }, '*');
  }, true);
})();`;
}

export function injectPreviewBridge(iframe: HTMLIFrameElement): boolean {
  const doc = iframe.contentDocument;
  if (!doc?.documentElement) return false;
  if ((iframe.contentWindow as Window & { __aicortexPreviewBridge?: boolean })?.__aicortexPreviewBridge) {
    return true;
  }
  const existing = doc.querySelector("script[data-aicortex-preview-bridge]");
  if (existing) return true;
  const script = doc.createElement("script");
  script.setAttribute("data-aicortex-preview-bridge", "1");
  script.textContent = bridgeScript();
  (doc.head ?? doc.documentElement).appendChild(script);
  injectSnapshotBridge(iframe);
  return true;
}

export function syncPreviewTool(iframe: HTMLIFrameElement, tool: PreviewToolMode | null): void {
  injectPreviewBridge(iframe);
  iframe.contentWindow?.postMessage({ type: "aicortex:preview-tool", tool }, "*");
}

export function findPreviewElement(
  iframe: HTMLIFrameElement,
  selector?: string | null,
  id?: string,
): HTMLElement | null {
  const doc = iframe.contentDocument;
  if (!doc) return null;
  if (selector) {
    try {
      const el = doc.querySelector(selector);
      if (el instanceof HTMLElement) return el;
    } catch {
      /* invalid selector */
    }
  }
  const active = doc.querySelector("[data-aicortex-preview-active]");
  if (active instanceof HTMLElement) return active;
  if (id) {
    const tagged = doc.querySelector(`[data-aicortex-id="${CSS.escape(id)}"]`);
    if (tagged instanceof HTMLElement) return tagged;
  }
  return null;
}

export function stageRectFromViewportRect(
  rect: { top: number; left: number; width: number; height: number },
  stage: HTMLElement,
  scale: number,
): { top: number; left: number; width: number; height: number } {
  const stageRect = stage.getBoundingClientRect();
  return {
    top: (rect.top - stageRect.top) / scale,
    left: (rect.left - stageRect.left) / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
}
