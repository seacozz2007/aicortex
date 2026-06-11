const ROOT_ID = "aicortex-preview-selection-root";
const SELECTED_ID = "aicortex-preview-selection-selected";
const HOVER_ID = "aicortex-preview-selection-hover";

function ensureRoot(doc: Document): HTMLElement {
  let root = doc.getElementById(ROOT_ID);
  if (!root) {
    root = doc.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("data-aicortex-overlay", "true");
    Object.assign(root.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: "2147483646",
      overflow: "hidden",
    });
    doc.body.appendChild(root);
  }
  return root;
}

function upsertBox(
  root: HTMLElement,
  id: string,
  el: HTMLElement | null,
  variant: "selected" | "hover",
) {
  const doc = root.ownerDocument;
  if (!doc) return;

  let box = doc.getElementById(id);
  if (!el) {
    box?.remove();
    return;
  }

  const rect = el.getBoundingClientRect();
  if (!box) {
    box = doc.createElement("div");
    box.id = id;
    root.appendChild(box);
  }

  Object.assign(box.style, {
    position: "fixed",
    pointerEvents: "none",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    borderRadius: "2px",
    boxShadow:
      variant === "selected"
        ? "inset 0 0 0 2px #1677ff, 0 0 0 1px rgba(22,119,255,0.25)"
        : "inset 0 0 0 2px rgba(22,119,255,0.55)",
    background:
      variant === "selected" ? "rgba(22,119,255,0.08)" : "rgba(22,119,255,0.04)",
  });
}

export function syncPreviewIframeSelectionOverlay(
  iframe: HTMLIFrameElement | null,
  options: {
    selected: HTMLElement | null;
    hover: HTMLElement | null;
    showHover: boolean;
  },
) {
  const doc = iframe?.contentDocument;
  if (!doc?.body) return;

  if (!options.selected && (!options.showHover || !options.hover)) {
    doc.getElementById(ROOT_ID)?.remove();
    return;
  }

  const root = ensureRoot(doc);
  upsertBox(root, SELECTED_ID, options.selected, "selected");
  upsertBox(
    root,
    HOVER_ID,
    options.showHover && !options.selected ? options.hover : null,
    "hover",
  );
}

export function clearPreviewIframeSelectionOverlay(iframe: HTMLIFrameElement | null) {
  iframe?.contentDocument?.getElementById(ROOT_ID)?.remove();
}
