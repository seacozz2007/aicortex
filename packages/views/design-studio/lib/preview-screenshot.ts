import { toCanvas } from "html-to-image";

const SNAPSHOT_BRIDGE_FLAG = "__aicortexSnapshotBridgeV3";

export type PreviewSnapshot = { dataUrl: string; w: number; h: number };

type SnapshotResultMessage = {
  type: "aicortex:snapshot:result";
  id: string;
  dataUrl?: string;
  w?: number;
  h?: number;
  error?: string;
};

function shouldExcludeSnapshotNode(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return false;
  if (node.tagName === "SCRIPT") return true;
  if (node.tagName === "STYLE" && node.id === "aicortex-preview-comment-style") return true;
  if (node.id === "aicortex-preview-selection-root") return true;
  if (node.id === "aicortex-preview-deck-fix") return true;
  if (node.hasAttribute("data-aicortex-snapshot-bridge")) return true;
  if (node.hasAttribute("data-aicortex-preview-bridge")) return true;
  return false;
}

function canvasElementLooksBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;
  try {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = Math.max(4, Math.floor((canvas.width * canvas.height) / 4096)) * 4;
    let first: [number, number, number, number] | null = null;
    let samples = 0;
    for (let i = 0; i + 3 < data.length; i += step) {
      samples++;
      const sample: [number, number, number, number] = [
        data[i]!,
        data[i + 1]!,
        data[i + 2]!,
        data[i + 3]!,
      ];
      if (!first) {
        first = sample;
        continue;
      }
      if (
        Math.abs(sample[0] - first[0]) > 6 ||
        Math.abs(sample[1] - first[1]) > 6 ||
        Math.abs(sample[2] - first[2]) > 6 ||
        Math.abs(sample[3] - first[3]) > 6
      ) {
        return false;
      }
    }
    return samples > 8;
  } catch {
    return false;
  }
}

/** Capture the visible iframe viewport by cloning live DOM (works with Tailwind/CDN CSS). */
export async function captureIframeDomSnapshot(
  iframe: HTMLIFrameElement,
): Promise<PreviewSnapshot | null> {
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc?.documentElement || !win) return null;

  const width = Math.max(1, win.innerWidth || iframe.clientWidth);
  const height = Math.max(1, win.innerHeight || iframe.clientHeight);
  const dpr = window.devicePixelRatio || 1;

  try {
    const canvas = await toCanvas(doc.body, {
      width,
      height,
      canvasWidth: Math.max(1, Math.round(width * dpr)),
      canvasHeight: Math.max(1, Math.round(height * dpr)),
      pixelRatio: dpr,
      backgroundColor: "#ffffff",
      cacheBust: true,
      skipAutoScale: true,
      filter: (node) => !shouldExcludeSnapshotNode(node),
    });

    if (canvasElementLooksBlank(canvas)) return null;

    return {
      dataUrl: canvas.toDataURL("image/png"),
      w: canvas.width,
      h: canvas.height,
    };
  } catch {
    return null;
  }
}

function snapshotBridgeScript(): string {
  return `(function(){
  if (window.${SNAPSHOT_BRIDGE_FLAG}) return;
  window.${SNAPSHOT_BRIDGE_FLAG} = true;
  var SNAPSHOT_STYLE_PROPS = [
    'display','position','box-sizing','width','height','min-width','max-width','min-height','max-height',
    'margin','margin-top','margin-right','margin-bottom','margin-left',
    'padding','padding-top','padding-right','padding-bottom','padding-left',
    'border','border-top','border-right','border-bottom','border-left','border-radius',
    'font','font-family','font-size','font-weight','font-style','line-height','letter-spacing',
    'color','background-color','opacity','transform','transform-origin','overflow','overflow-x','overflow-y',
    'white-space','text-align','vertical-align','object-fit','object-position',
    'flex','flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis',
    'grid','grid-template-columns','grid-template-rows','grid-column','grid-row',
    'gap','row-gap','column-gap','align-items','align-content','align-self',
    'justify-items','justify-content','justify-self','inset','top','right','bottom','left',
    'z-index','box-shadow','text-shadow'
  ];
  function copyComputedStyle(source, target){
    if (!source || !target || source.nodeType !== 1 || target.nodeType !== 1) return;
    var computed = window.getComputedStyle(source);
    var style = target.getAttribute('style') || '';
    for (var i = 0; i < SNAPSHOT_STYLE_PROPS.length; i++){
      var prop = SNAPSHOT_STYLE_PROPS[i];
      var value = computed.getPropertyValue(prop);
      if (value) style += prop + ':' + value + ';';
    }
    target.setAttribute('style', style);
  }
  function syncElementState(source, target){
    var tag = source.tagName ? source.tagName.toLowerCase() : '';
    if (tag === 'img' && source.currentSrc) target.setAttribute('src', source.currentSrc);
    if (tag === 'input' || tag === 'textarea') target.setAttribute('value', source.value || '');
    if (tag === 'canvas') {
      try {
        var img = document.createElement('img');
        img.setAttribute('src', source.toDataURL('image/png'));
        img.setAttribute('style', target.getAttribute('style') || '');
        target.parentNode && target.parentNode.replaceChild(img, target);
      } catch (_) {}
    }
  }
  function inlineSnapshotStyles(originalRoot, cloneRoot){
    copyComputedStyle(originalRoot, cloneRoot);
    syncElementState(originalRoot, cloneRoot);
    var originals = originalRoot.querySelectorAll('*');
    var clones = cloneRoot.querySelectorAll('*');
    var count = Math.min(originals.length, clones.length, 3500);
    for (var i = 0; i < count; i++){
      copyComputedStyle(originals[i], clones[i]);
      syncElementState(originals[i], clones[i]);
    }
    var scripts = cloneRoot.querySelectorAll('script');
    for (var s = scripts.length - 1; s >= 0; s--) scripts[s].remove();
    var links = cloneRoot.querySelectorAll('link[rel~="stylesheet"], link[rel~="preload"], link[rel~="preconnect"]');
    for (var l = links.length - 1; l >= 0; l--) links[l].remove();
    var styles = cloneRoot.querySelectorAll('style');
    for (var st = 0; st < styles.length; st++) {
      styles[st].textContent = (styles[st].textContent || '')
        .replace(/@import[^;]+;/gi, '')
        .replace(/@font-face\\s*\\{[^}]*\\}/gi, '');
    }
  }
  function pruneHiddenSnapshotNodes(originalRoot, cloneRoot){
    var originals = originalRoot.querySelectorAll('*');
    var clones = cloneRoot.querySelectorAll('*');
    var count = Math.min(originals.length, clones.length);
    var removals = [];
    for (var i = 0; i < count; i++){
      var original = originals[i];
      var clone = clones[i];
      if (!original || !clone || !clone.parentNode) continue;
      var computed = window.getComputedStyle(original);
      if (computed && (computed.display === 'none' || computed.visibility === 'hidden')) {
        removals.push(clone);
      }
    }
    for (var r = removals.length - 1; r >= 0; r--){
      if (removals[r].parentNode) removals[r].parentNode.removeChild(removals[r]);
    }
  }
  function waitForImages(){
    var imgs = Array.prototype.slice.call(document.images || []);
    return Promise.all(imgs.map(function(img){
      if (img.complete) return Promise.resolve();
      return new Promise(function(resolve){
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    }));
  }
  function scrollOffset(){
    var doc = document.documentElement;
    var body = document.body;
    return {
      x: Math.max(window.scrollX || 0, doc ? doc.scrollLeft || 0 : 0, body ? body.scrollLeft || 0 : 0),
      y: Math.max(window.scrollY || 0, doc ? doc.scrollTop || 0 : 0, body ? body.scrollTop || 0 : 0)
    };
  }
  function escapeAttribute(value){
    return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  function snapshotBackgroundColor(){
    try {
      var probe = window.getComputedStyle(document.body || document.documentElement);
      var bg = probe && probe.backgroundColor || '';
      if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return '#ffffff';
      return bg;
    } catch (_) { return '#ffffff'; }
  }
  function canvasLooksBlank(ctx, cw, ch){
    try {
      var data = ctx.getImageData(0, 0, cw, ch).data;
      var step = Math.max(4, Math.floor((cw * ch) / 4096)) * 4;
      var first = null, samples = 0;
      for (var i = 0; i + 3 < data.length; i += step){
        samples++;
        if (!first){ first = [data[i], data[i+1], data[i+2], data[i+3]]; continue; }
        if (Math.abs(data[i]-first[0]) > 6 || Math.abs(data[i+1]-first[1]) > 6 ||
            Math.abs(data[i+2]-first[2]) > 6 || Math.abs(data[i+3]-first[3]) > 6) return false;
      }
      return samples > 8;
    } catch (_) { return false; }
  }
  function collectStylesheetCssText(){
    var chunks = [];
    var styleTags = document.querySelectorAll('style');
    for (var i = 0; i < styleTags.length; i++) {
      var text = styleTags[i].textContent || '';
      if (text) chunks.push(text);
    }
    try {
      for (var s = 0; s < document.styleSheets.length; s++) {
        var sheet = document.styleSheets[s];
        try {
          var rules = sheet.cssRules;
          if (!rules) continue;
          for (var r = 0; r < rules.length; r++) chunks.push(rules[r].cssText);
        } catch (_) {}
      }
    } catch (_) {}
    return chunks.join('\\n');
  }
  function injectStylesIntoClone(cloneRoot, cssText){
    if (!cssText) return;
    var style = document.createElement('style');
    style.setAttribute('data-aicortex-snapshot', '1');
    style.textContent = cssText;
    var head = cloneRoot.querySelector('head');
    if (head) head.insertBefore(style, head.firstChild);
    else cloneRoot.insertBefore(style, cloneRoot.firstChild);
  }
  function finishSnapshotCanvas(id, canvas, useFallback){
    try {
      var ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      if (canvasLooksBlank(ctx, canvas.width, canvas.height)) {
        if (!useFallback) {
          renderSnapshot(id, true);
          return;
        }
        window.parent.postMessage({ type: 'aicortex:snapshot:result', id: id, error: 'empty-render' }, '*');
        return;
      }
      window.parent.postMessage({ type: 'aicortex:snapshot:result', id: id, dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height }, '*');
    } catch (err) {
      if (!useFallback) {
        renderSnapshot(id, true);
        return;
      }
      window.parent.postMessage({ type: 'aicortex:snapshot:result', id: id, error: String(err && err.message || err) }, '*');
    }
  }
  function drawSvgSnapshot(id, svg, w, h, dpr, bgColor, useFallback){
    var img = new Image();
    img.onload = function(){
      try {
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(w * dpr));
        canvas.height = Math.max(1, Math.floor(h * dpr));
        var ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        ctx.scale(dpr, dpr);
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        finishSnapshotCanvas(id, canvas, useFallback);
      } catch (err) {
        if (!useFallback) {
          renderSnapshot(id, true);
          return;
        }
        window.parent.postMessage({ type: 'aicortex:snapshot:result', id: id, error: String(err && err.message || err) }, '*');
      }
    };
    img.onerror = function(){
      if (!useFallback) {
        renderSnapshot(id, true);
        return;
      }
      window.parent.postMessage({ type: 'aicortex:snapshot:result', id: id, error: 'snapshot image failed' }, '*');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function renderSnapshotFallback(id){
    var w = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    var h = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    var dpr = window.devicePixelRatio || 1;
    var bgColor = snapshotBackgroundColor();
    var scroll = scrollOffset();
    var body = document.body;
    if (!body) {
      window.parent.postMessage({ type: 'aicortex:snapshot:result', id: id, error: 'missing-body' }, '*');
      return;
    }
    var cssText = collectStylesheetCssText();
    var clone = body.cloneNode(true);
    inlineSnapshotStyles(body, clone);
    if (cssText) {
      var style = document.createElement('style');
      style.setAttribute('data-aicortex-snapshot', '1');
      style.textContent = cssText;
      clone.insertBefore(style, clone.firstChild);
    }
    var contentW = Math.max(w, body.scrollWidth || 0);
    var contentH = Math.max(h, body.scrollHeight || 0);
    var viewportStyle = 'margin:0;padding:0;width:' + w + 'px;height:' + h + 'px;overflow:hidden;position:relative;background-color:' + bgColor + ';';
    var innerStyle = 'margin:0;padding:0;position:absolute;left:' + (-scroll.x) + 'px;top:' + (-scroll.y) + 'px;width:' + contentW + 'px;min-height:' + contentH + 'px;box-sizing:border-box;';
    var html = '<div xmlns="http://www.w3.org/1999/xhtml" style="' + escapeAttribute(viewportStyle) + '">' +
      '<div style="' + escapeAttribute(innerStyle) + '">' + clone.innerHTML + '</div></div>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<foreignObject x="0" y="0" width="' + w + '" height="' + h + '">' +
      html +
      '</foreignObject></svg>';
    drawSvgSnapshot(id, svg, w, h, dpr, bgColor, true);
  }
  function renderSnapshot(id, useFallback){
    if (useFallback) {
      renderSnapshotFallback(id);
      return;
    }
    var w = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    var h = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    var dpr = window.devicePixelRatio || 1;
    var bgColor = snapshotBackgroundColor();
    var scroll = scrollOffset();
    var contentW = Math.max(w, document.documentElement.scrollWidth || 0, document.body ? document.body.scrollWidth : 0);
    var contentH = Math.max(h, document.documentElement.scrollHeight || 0, document.body ? document.body.scrollHeight : 0);
    var clone = document.documentElement.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    injectStylesIntoClone(clone, collectStylesheetCssText());
    inlineSnapshotStyles(document.documentElement, clone);
    pruneHiddenSnapshotNodes(document.documentElement, clone);
    var cloneBody = clone.querySelector('body');
    var bodyContent = cloneBody ? cloneBody.innerHTML : clone.innerHTML;
    var viewportStyle = 'margin:0;padding:0;width:' + w + 'px;height:' + h + 'px;overflow:hidden;position:relative;background-color:' + bgColor + ';';
    var innerStyle = 'margin:0;padding:0;position:absolute;left:' + (-scroll.x) + 'px;top:' + (-scroll.y) + 'px;width:' + contentW + 'px;min-height:' + contentH + 'px;box-sizing:border-box;';
    var html = '<div xmlns="http://www.w3.org/1999/xhtml" style="' + escapeAttribute(viewportStyle) + '">' +
      '<div style="' + escapeAttribute(innerStyle) + '">' + bodyContent + '</div></div>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<foreignObject x="0" y="0" width="' + w + '" height="' + h + '">' +
      html +
      '</foreignObject></svg>';
    drawSvgSnapshot(id, svg, w, h, dpr, bgColor, false);
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || data.type !== 'aicortex:snapshot' || !data.id) return;
    waitForImages().then(function(){ renderSnapshot(String(data.id)); });
  });
  try { window.parent.postMessage({ type: 'aicortex:snapshot:ready' }, '*'); } catch (_) {}
})();`;
}

export function injectSnapshotBridge(iframe: HTMLIFrameElement): boolean {
  const doc = iframe.contentDocument;
  if (!doc?.documentElement) return false;
  const win = iframe.contentWindow as Window & Record<string, boolean | undefined>;
  doc.querySelectorAll("script[data-aicortex-snapshot-bridge]").forEach((el) => el.remove());
  delete win?.__aicortexSnapshotBridgeV2;
  delete win?.[SNAPSHOT_BRIDGE_FLAG];
  const script = doc.createElement("script");
  script.setAttribute("data-aicortex-snapshot-bridge", "1");
  script.textContent = snapshotBridgeScript();
  (doc.head ?? doc.documentElement).appendChild(script);
  return true;
}

async function waitForSnapshotBridge(iframe: HTMLIFrameElement, timeoutMs = 2000): Promise<void> {
  injectSnapshotBridge(iframe);
  const win = iframe.contentWindow;
  if (!win) return;
  if ((win as Window & Record<string, boolean | undefined>)?.[SNAPSHOT_BRIDGE_FLAG]) {
    return;
  }
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onReady);
      window.clearTimeout(timer);
      resolve();
    };
    const onReady = (ev: MessageEvent) => {
      if (ev.source !== win) return;
      if ((ev.data as { type?: string } | null)?.type === "aicortex:snapshot:ready") {
        finish();
      }
    };
    window.addEventListener("message", onReady);
    const timer = window.setTimeout(finish, timeoutMs);
  });
}

export async function requestPreviewSnapshotWithRetry(
  iframe: HTMLIFrameElement,
  timeouts: number[] = [1500, 3000, 6000],
): Promise<PreviewSnapshot | null> {
  const domSnap = await captureIframeDomSnapshot(iframe);
  if (domSnap) return domSnap;

  await waitForSnapshotBridge(iframe);
  for (const timeout of timeouts) {
    const snap = await requestPreviewSnapshot(iframe, timeout);
    if (snap) return snap;
  }
  return null;
}

export function requestPreviewSnapshot(
  iframe: HTMLIFrameElement,
  timeout = 8000,
): Promise<PreviewSnapshot | null> {
  const win = iframe.contentWindow;
  if (!win) return Promise.resolve(null);
  if (!injectSnapshotBridge(iframe)) return Promise.resolve(null);

  const id = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    let done = false;
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== win) return;
      const data = ev.data as SnapshotResultMessage | null;
      if (!data || data.type !== "aicortex:snapshot:result" || data.id !== id) return;
      if (done) return;
      done = true;
      window.removeEventListener("message", onMsg);
      if (data.dataUrl && data.w && data.h) {
        resolve({ dataUrl: data.dataUrl, w: data.w, h: data.h });
      } else {
        resolve(null);
      }
    };
    window.addEventListener("message", onMsg);
    try {
      win.postMessage({ type: "aicortex:snapshot", id }, "*");
    } catch {
      done = true;
      window.removeEventListener("message", onMsg);
      resolve(null);
      return;
    }
    window.setTimeout(() => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMsg);
      resolve(null);
    }, timeout);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob | null> {
  try {
    const res = await fetch(dataUrl);
    return res.ok ? res.blob() : null;
  } catch {
    return null;
  }
}

export async function captureIframeScreenshot(
  iframe: HTMLIFrameElement,
): Promise<Blob | null> {
  const snap = await requestPreviewSnapshotWithRetry(iframe);
  if (!snap) return null;
  return dataUrlToBlob(snap.dataUrl);
}

type MarkPoint = { x: number; y: number };
type MarkStroke = { points: MarkPoint[] };
type MarkBox = { x: number; y: number; width: number; height: number };

const MARK_STROKE_COLOR = "#ff3b30";
const MARK_STROKE_WIDTH = 4;

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function drawMarkInk(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  strokes: MarkStroke[],
  box: MarkBox | null,
) {
  if (box && (box.width > 0.001 || box.height > 0.001)) {
    ctx.save();
    ctx.strokeStyle = MARK_STROKE_COLOR;
    ctx.lineWidth = MARK_STROKE_WIDTH;
    ctx.strokeRect(box.x * width, box.y * height, box.width * width, box.height * height);
    ctx.restore();
  }
  ctx.strokeStyle = MARK_STROKE_COLOR;
  ctx.lineWidth = MARK_STROKE_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    const first = stroke.points[0];
    if (!first) continue;
    ctx.beginPath();
    ctx.moveTo(first.x * width, first.y * height);
    for (let i = 1; i < stroke.points.length; i++) {
      const point = stroke.points[i]!;
      ctx.lineTo(point.x * width, point.y * height);
    }
    ctx.stroke();
  }
}

function canvasToPngFile(canvas: HTMLCanvasElement, filename: string): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      resolve(new File([blob], filename, { type: "image/png" }));
    }, "image/png");
  });
}

/** Composite iframe snapshot + mark ink; falls back to ink-only export when capture fails. */
export async function compositeMarkScreenshot(input: {
  iframe: HTMLIFrameElement;
  inkCanvas?: HTMLCanvasElement | null;
  strokes: MarkStroke[];
  box: MarkBox | null;
}): Promise<File | null> {
  const wrapRect = input.inkCanvas?.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.round(wrapRect?.width ?? input.iframe.clientWidth));
  const cssHeight = Math.max(1, Math.round(wrapRect?.height ?? input.iframe.clientHeight));
  const dpr = window.devicePixelRatio || 1;
  const pixelWidth = Math.max(1, Math.floor(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.floor(cssHeight * dpr));

  const canvas = document.createElement("canvas");
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const snap = await requestPreviewSnapshotWithRetry(input.iframe);
  if (snap) {
    const bg = await loadImageFromDataUrl(snap.dataUrl);
    if (bg) {
      ctx.drawImage(bg, 0, 0, pixelWidth, pixelHeight);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pixelWidth, pixelHeight);
    }
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pixelWidth, pixelHeight);
  }

  if (input.inkCanvas) {
    ctx.drawImage(input.inkCanvas, 0, 0, pixelWidth, pixelHeight);
  } else {
    drawMarkInk(ctx, pixelWidth, pixelHeight, input.strokes, input.box);
  }

  return canvasToPngFile(canvas, `mark-${Date.now()}.png`);
}

export async function captureViewportMarkScreenshot(
  iframe: HTMLIFrameElement,
): Promise<File | null> {
  return compositeMarkScreenshot({
    iframe,
    strokes: [],
    box: null,
  });
}

export async function copyIframeScreenshot(iframe: HTMLIFrameElement): Promise<boolean> {
  const snap = await requestPreviewSnapshotWithRetry(iframe);
  if (!snap) return false;
  const blob = await dataUrlToBlob(snap.dataUrl);
  if (!blob) return false;

  const clipboard = navigator.clipboard;
  const ClipboardItemRef = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
  if (!clipboard?.write || !ClipboardItemRef) return false;

  try {
    let item: ClipboardItem;
    try {
      item = new ClipboardItemRef({ [blob.type]: Promise.resolve(blob) });
    } catch {
      item = new ClipboardItemRef({ [blob.type]: blob });
    }
    await clipboard.write([item]);
    return true;
  } catch {
    return false;
  }
}
