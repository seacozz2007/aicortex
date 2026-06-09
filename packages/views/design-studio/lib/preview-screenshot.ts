export async function captureIframeScreenshot(
  iframe: HTMLIFrameElement,
): Promise<Blob | null> {
  const doc = iframe.contentDocument;
  if (!doc?.documentElement) return null;

  const width = Math.max(1, Math.round(iframe.clientWidth));
  const height = Math.max(1, Math.round(iframe.clientHeight));
  const html = doc.documentElement.outerHTML
    .replace(/#/g, "%23")
    .replace(/\n/g, "%0A");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<foreignObject width="100%" height="100%">
<div xmlns="http://www.w3.org/1999/xhtml">${html}</div>
</foreignObject></svg>`;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => resolve(blob), "image/png");
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export async function copyIframeScreenshot(iframe: HTMLIFrameElement): Promise<boolean> {
  const blob = await captureIframeScreenshot(iframe);
  if (!blob || !navigator.clipboard?.write) return false;
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  return true;
}
