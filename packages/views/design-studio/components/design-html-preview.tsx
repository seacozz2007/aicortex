"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Monitor, Smartphone, Tablet } from "lucide-react";
import { cn } from "@aicortex/ui/lib/utils";
import { useT } from "../../i18n";
import { buildArtifactRawURL } from "../../chat/components/chat-artifact-url";
import { applyPropertyDraft } from "../lib/apply-element-styles";
import { extractSelectedElement, isPreviewTarget } from "../lib/extract-element-style";
import {
  formatPropertyPatch,
  propertyDraftFromElement,
  type ElementPropertyDraft,
  type PreviewTool,
  type SelectedPreviewElement,
} from "../lib/preview-element";
import { copyIframeScreenshot } from "../lib/preview-screenshot";
import { DesignCommentQueuePanel, type QueuedPreviewComment } from "./design-comment-queue-panel";
import { DesignCommentToolbar } from "./design-comment-toolbar";
import { DesignElementInspector } from "./design-element-inspector";
import { DesignPreviewDrawLayer } from "./design-preview-draw-layer";
import { DesignPropertyEditorModal } from "./design-property-editor-modal";
import { DesignPreviewCommentHint } from "./design-preview-comment-hint";
import { DesignSelectionOverlay } from "./design-selection-overlay";

export type DesignViewport = "desktop" | "tablet" | "mobile";

export type PreviewCommentHandler = (
  element: SelectedPreviewElement,
  note: string,
  images?: File[],
) => void;

const VIEWPORT_WIDTH: Record<DesignViewport, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

const SELECTED_CLASS = "aicortex-preview-selected";
const DECK_FIX_STYLE_ID = "aicortex-preview-deck-fix";
const COMMENT_STYLE_ID = "aicortex-preview-comment-style";

function isDrawTool(tool: PreviewTool): tool is "pencil" | "pen" {
  return tool === "pencil" || tool === "pen";
}

function resolveTarget(el: HTMLElement): HTMLElement {
  return (el.closest("[data-aicortex-id]") as HTMLElement | null) ?? el;
}

function stageRectForElement(
  el: HTMLElement,
  stage: HTMLElement,
  scale: number,
): SelectedPreviewElement["rect"] {
  const elRect = el.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  return {
    top: (elRect.top - stageRect.top) / scale,
    left: (elRect.left - stageRect.left) / scale,
    width: elRect.width / scale,
    height: elRect.height / scale,
  };
}

type StageOverlayBounds = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function useStageOverlayBounds(
  stageRef: React.RefObject<HTMLDivElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  deps: unknown[],
) {
  const [bounds, setBounds] = useState<StageOverlayBounds | null>(null);

  useEffect(() => {
    if (!enabled) {
      setBounds(null);
      return;
    }

    const stage = stageRef.current;
    const container = containerRef.current;
    if (!stage || !container) return;

    const sync = () => {
      const stageRect = stage.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setBounds({
        top: stageRect.top - containerRect.top + container.scrollTop,
        left: stageRect.left - containerRect.left + container.scrollLeft,
        width: stageRect.width,
        height: stageRect.height,
      });
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(stage);
    observer.observe(container);
    container.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);

    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync when preview layout inputs change
  }, [containerRef, enabled, stageRef, ...deps]);

  return bounds;
}

export function DesignHtmlPreview({
  path,
  taskId,
  workspaceSlug,
  commentMode = false,
  onComment,
  onQueueComment,
  onPropertySave,
  queuedComments = [],
  onRemoveQueuedComment,
  onClearQueuedComments,
  onSendQueue,
  queueSending = false,
}: {
  path: string;
  taskId: string;
  workspaceSlug: string;
  commentMode?: boolean;
  onComment?: PreviewCommentHandler;
  onQueueComment?: PreviewCommentHandler;
  onPropertySave?: (element: SelectedPreviewElement, patch: string) => void;
  queuedComments?: QueuedPreviewComment[];
  onRemoveQueuedComment?: (id: string) => void;
  onClearQueuedComments?: () => void;
  onSendQueue?: () => void;
  queueSending?: boolean;
}) {
  const { t } = useT("design");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const selectedNodeRef = useRef<HTMLElement | null>(null);
  const propertyBaselineRef = useRef<ElementPropertyDraft | null>(null);

  const [viewport, setViewport] = useState<DesignViewport>("desktop");
  const [loading, setLoading] = useState(true);
  const [tool, setTool] = useState<PreviewTool>("comment");
  const [zoom, setZoom] = useState(100);
  const [selectedElement, setSelectedElement] = useState<SelectedPreviewElement | null>(null);
  const [hoveredElement, setHoveredElement] = useState<SelectedPreviewElement | null>(null);
  const [inspectorNote, setInspectorNote] = useState("");
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [propertyEditorOpen, setPropertyEditorOpen] = useState(false);
  const [inspectorPos, setInspectorPos] = useState<{ top: number; left: number } | null>(null);
  const [screenshotPending, setScreenshotPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [annotatedCount, setAnnotatedCount] = useState<number | null>(null);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [hoverCardPos, setHoverCardPos] = useState<{ top: number; left: number } | null>(null);

  const previewURL = buildArtifactRawURL(taskId, path, workspaceSlug);
  const scale = zoom / 100;
  const drawActive = isDrawTool(tool);
  const stageBounds = useStageOverlayBounds(
    stageRef,
    overlayRef,
    commentMode && !loading,
    [viewport, scale, previewURL, tool],
  );

  const clearSelection = useCallback(() => {
    const node = selectedNodeRef.current;
    if (node) node.classList.remove(SELECTED_CLASS);
    selectedNodeRef.current = null;
    setSelectedElement(null);
    setInspectorNote("");
    setPendingImages([]);
    setInspectorPos(null);
    setPropertyEditorOpen(false);
  }, []);

  const buildSnapshot = useCallback(
    (el: HTMLElement): SelectedPreviewElement | null => {
      const stage = stageRef.current;
      if (!stage) return null;
      const snapshot = extractSelectedElement(el);
      snapshot.rect = stageRectForElement(el, stage, scale);
      return snapshot;
    },
    [scale],
  );

  const updateInspectorPosition = useCallback(() => {
    const node = selectedNodeRef.current;
    const container = overlayRef.current;
    if (!node || !container || propertyEditorOpen || drawActive) {
      setInspectorPos(null);
      return;
    }
    const elRect = node.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const top = elRect.bottom - containerRect.top + 8;
    const left = Math.max(8, Math.min(elRect.left - containerRect.left, containerRect.width - 368));
    setInspectorPos({ top, left });
  }, [drawActive, propertyEditorOpen]);

  const selectElement = useCallback(
    (el: HTMLElement, openPropertyEditor: boolean) => {
      selectedNodeRef.current?.classList.remove(SELECTED_CLASS);
      selectedNodeRef.current = el;
      el.classList.add(SELECTED_CLASS);
      const snapshot = buildSnapshot(el);
      if (!snapshot) return;
      setSelectedElement(snapshot);
      setInspectorNote("");
      setPendingImages([]);
      if (openPropertyEditor) {
        propertyBaselineRef.current = propertyDraftFromElement(snapshot);
        setPropertyEditorOpen(true);
      } else {
        setPropertyEditorOpen(false);
      }
      requestAnimationFrame(updateInspectorPosition);
    },
    [buildSnapshot, updateInspectorPosition],
  );

  const attachPreviewHandlers = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    if (doc.querySelector(".deck") && !doc.getElementById(DECK_FIX_STYLE_ID)) {
      const fix = doc.createElement("style");
      fix.id = DECK_FIX_STYLE_ID;
      fix.textContent = `
        html, body { height: 100%; margin: 0; overflow: hidden; }
        .deck { width: 100% !important; height: 100% !important; }
      `;
      doc.head?.appendChild(fix);
    }

    if (!commentMode) return;

    let style = doc.getElementById(COMMENT_STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement("style");
      style.id = COMMENT_STYLE_ID;
      doc.head?.appendChild(style);
    }
    style.textContent = `
      * { cursor: crosshair !important; }
      .${SELECTED_CLASS} {
        outline: 2px solid #1677ff !important;
        outline-offset: 2px;
      }
      [data-aicortex-id]:hover,
      *:hover {
        outline: 2px solid rgba(22, 119, 255, 0.35) !important;
        outline-offset: 2px;
      }
    `;

    const onClick = (event: MouseEvent) => {
      if (drawActive) return;
      if (!isPreviewTarget(event.target, doc)) return;
      event.preventDefault();
      event.stopPropagation();
      const el = resolveTarget(event.target as HTMLElement);
      selectElement(el, tool === "crop");
    };

    const onMove = (event: MouseEvent) => {
      if (drawActive || propertyEditorOpen) {
        setHoveredElement(null);
        setHoverCardPos(null);
        return;
      }
      if (!isPreviewTarget(event.target, doc)) {
        setHoveredElement(null);
        setHoverCardPos(null);
        return;
      }
      const el = resolveTarget(event.target as HTMLElement);
      const snapshot = buildSnapshot(el);
      setHoveredElement(snapshot);
      const container = overlayRef.current;
      if (container) {
        const elRect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        setHoverCardPos({
          top: elRect.bottom - containerRect.top + 8,
          left: Math.max(8, elRect.left - containerRect.left),
        });
      }
    };

    const onLeave = () => {
      setHoveredElement(null);
      setHoverCardPos(null);
    };

    doc.addEventListener("click", onClick as EventListener, true);
    doc.addEventListener("mousemove", onMove as EventListener, true);
    doc.addEventListener("mouseleave", onLeave as EventListener, true);
    return () => {
      doc.removeEventListener("click", onClick as EventListener, true);
      doc.removeEventListener("mousemove", onMove as EventListener, true);
      doc.removeEventListener("mouseleave", onLeave as EventListener, true);
      doc.getElementById(COMMENT_STYLE_ID)?.remove();
    };
  }, [buildSnapshot, commentMode, drawActive, propertyEditorOpen, selectElement, tool]);

  useEffect(() => {
    setLoading(true);
    clearSelection();
    setHoveredElement(null);
    setHoverCardPos(null);
    setAnnotatedCount(null);
    setHintDismissed(false);
  }, [previewURL, clearSelection]);

  useEffect(() => {
    if (!commentMode) {
      clearSelection();
      setHoveredElement(null);
      setHoverCardPos(null);
      setHintDismissed(false);
      setPropertyEditorOpen(false);
    }
  }, [commentMode, clearSelection]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const finishLoad = () => {
      setLoading(false);
      clearSelection();
      setHoveredElement(null);
      setHoverCardPos(null);
      const doc = iframe.contentDocument;
      if (doc) {
        setAnnotatedCount(doc.querySelectorAll("[data-aicortex-id]").length);
      }
    };

    iframe.addEventListener("load", finishLoad);
    if (iframe.contentDocument?.readyState === "complete") {
      finishLoad();
    }
    return () => iframe.removeEventListener("load", finishLoad);
  }, [previewURL, clearSelection]);

  useEffect(() => {
    if (loading) return;
    const cleanup = attachPreviewHandlers();
    return () => cleanup?.();
  }, [attachPreviewHandlers, loading]);

  useEffect(() => {
    if (!commentMode || !selectedElement) return;
    const container = overlayRef.current;
    if (!container) return;
    const onScroll = () => updateInspectorPosition();
    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [commentMode, selectedElement, updateInspectorPosition]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const flushComment = useCallback(
    (element: SelectedPreviewElement, note: string, images?: File[]) => {
      if (!note.trim() || !onComment) return;
      onComment(element, note.trim(), images);
    },
    [onComment],
  );

  const handleQueueComment = () => {
    if (!selectedElement || !inspectorNote.trim()) return;
    onQueueComment?.(selectedElement, inspectorNote.trim(), pendingImages);
    setInspectorNote("");
    setPendingImages([]);
    clearSelection();
  };

  const handleSubmitComment = () => {
    if (!selectedElement || !inspectorNote.trim()) return;
    flushComment(selectedElement, inspectorNote, pendingImages);
    setInspectorNote("");
    setPendingImages([]);
    clearSelection();
    setToast(t(($) => $.preview.comment_added));
  };

  const openPropertyEditor = useCallback(() => {
    if (!selectedElement) return;
    propertyBaselineRef.current = propertyDraftFromElement(selectedElement);
    setPropertyEditorOpen(true);
    setInspectorPos(null);
  }, [selectedElement]);

  const handlePropertyDraftChange = (draft: ElementPropertyDraft) => {
    const node = selectedNodeRef.current;
    if (!node) return;
    applyPropertyDraft(node, draft);
  };

  const closePropertyEditor = useCallback((revert: boolean) => {
    const node = selectedNodeRef.current;
    const baseline = propertyBaselineRef.current;
    if (revert && node && baseline) applyPropertyDraft(node, baseline);
    propertyBaselineRef.current = null;
    setPropertyEditorOpen(false);
  }, []);

  const handlePropertyCancel = () => {
    closePropertyEditor(true);
    setTool("comment");
  };

  const handlePropertySave = (draft: ElementPropertyDraft) => {
    if (!selectedElement) return;
    onPropertySave?.(selectedElement, formatPropertyPatch(selectedElement, draft));
    propertyBaselineRef.current = null;
    setPropertyEditorOpen(false);
    setTool("comment");
    clearSelection();
  };

  const handlePropertyDelete = () => {
    if (!selectedElement) return;
    onPropertySave?.(
      selectedElement,
      `[Delete element · ${selectedElement.id}]\nRemove this element from the design.`,
    );
    selectedNodeRef.current?.remove();
    setTool("comment");
    clearSelection();
  };

  const handleToolChange = useCallback(
    (next: PreviewTool) => {
      if (next === "camera") return;

      if (next === tool) {
        if (propertyEditorOpen) closePropertyEditor(true);
        setTool("comment");
        return;
      }

      setTool(next);
      if (isDrawTool(next)) {
        setToast(t(($) => $.preview.draw_mode_hint));
      }
      if (next === "crop" && selectedElement) {
        propertyBaselineRef.current = propertyDraftFromElement(selectedElement);
        setPropertyEditorOpen(true);
        setInspectorPos(null);
        return;
      }

      if (next === "comment" || isDrawTool(next)) {
        if (propertyEditorOpen) closePropertyEditor(true);
      }
    },
    [closePropertyEditor, propertyEditorOpen, selectedElement, t, tool],
  );

  const handleScreenshot = async () => {
    const iframe = iframeRef.current;
    if (!iframe || screenshotPending) return;
    setScreenshotPending(true);
    try {
      const ok = await copyIframeScreenshot(iframe);
      setToast(
        ok ? t(($) => $.preview.screenshot_copied) : t(($) => $.preview.screenshot_failed),
      );
    } finally {
      setScreenshotPending(false);
    }
  };

  const showInspector =
    selectedElement &&
    !propertyEditorOpen &&
    !drawActive &&
    tool === "comment" &&
    inspectorPos;

  const overlayTarget =
    !drawActive &&
    !propertyEditorOpen &&
    (selectedElement ??
      (hoveredElement ? hoveredElement : null));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-2 py-1.5">
        <div className="flex items-center gap-0.5 rounded-md border p-0.5">
          {(
            [
              ["desktop", Monitor],
              ["tablet", Tablet],
              ["mobile", Smartphone],
            ] as const
          ).map(([id, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setViewport(id)}
              className={cn(
                "rounded px-2 py-1 text-muted-foreground transition-colors hover:text-foreground",
                viewport === id && "bg-accent text-foreground",
              )}
              title={t(($) => $.preview.viewport[id])}
            >
              <Icon className="size-3.5" />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <a
            href={previewURL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title={t(($) => $.preview.open_external)}
            aria-label={t(($) => $.preview.open_external)}
          >
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>

      <div ref={overlayRef} className="relative min-h-0 flex-1 overflow-auto bg-muted/30 p-2">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-muted/20 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t(($) => $.preview.loading)}
          </div>
        )}

        <div
          ref={stageRef}
          className="relative mx-auto min-h-[320px] origin-top"
          style={{
            maxWidth: VIEWPORT_WIDTH[viewport],
            transform: `scale(${scale})`,
            transformOrigin: "top center",
            width: VIEWPORT_WIDTH[viewport] === "100%" ? "100%" : VIEWPORT_WIDTH[viewport],
            height: "100%",
          }}
        >
          <iframe
            ref={iframeRef}
            key={previewURL}
            title={t(($) => $.preview.frame_title)}
            src={previewURL}
            className={cn(
              "h-full min-h-[320px] w-full rounded-md border bg-background shadow-sm",
              drawActive && "pointer-events-none",
            )}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          />

          {commentMode && !loading && overlayTarget ? (
            <DesignSelectionOverlay
              element={overlayTarget}
              scale={1}
              offset={{ x: 0, y: 0 }}
              variant={selectedElement ? "selected" : "hover"}
            />
          ) : null}
        </div>

        {commentMode && !loading && stageBounds ? (
          <div
            className={cn(
              "absolute z-[35] overflow-hidden rounded-md",
              drawActive ? "pointer-events-auto cursor-crosshair" : "pointer-events-none",
            )}
            style={{
              top: stageBounds.top,
              left: stageBounds.left,
              width: stageBounds.width,
              height: stageBounds.height,
            }}
          >
            <DesignPreviewDrawLayer
              active={drawActive}
              tool={tool}
              onStrokeComplete={() => setToast(t(($) => $.preview.draw_saved))}
            />
          </div>
        ) : null}

        {commentMode && !loading ? (
          <>
            <DesignCommentToolbar
              tool={tool}
              onToolChange={handleToolChange}
              queueCount={queuedComments.length}
              zoom={zoom}
              onZoomChange={setZoom}
              onScreenshot={() => void handleScreenshot()}
              screenshotPending={screenshotPending}
            />

            <DesignCommentQueuePanel
              items={queuedComments}
              onRemove={(id) => onRemoveQueuedComment?.(id)}
              onClear={() => onClearQueuedComments?.()}
              onSendQueue={onSendQueue}
              sending={queueSending}
            />

            {!hintDismissed && annotatedCount != null ? (
              <DesignPreviewCommentHint
                annotatedCount={annotatedCount}
                onDismiss={() => setHintDismissed(true)}
              />
            ) : null}

            {showInspector ? (
              <DesignElementInspector
                element={selectedElement}
                note={inspectorNote}
                onNoteChange={setInspectorNote}
                onClose={clearSelection}
                onQueue={handleQueueComment}
                onSubmit={handleSubmitComment}
                onAttachImages={(files) => setPendingImages((prev) => [...prev, ...files])}
                onOpenPropertyEditor={openPropertyEditor}
                attachmentCount={pendingImages.length}
                style={{ top: inspectorPos.top, left: inspectorPos.left }}
              />
            ) : null}

            {hoveredElement && hoverCardPos && !selectedElement && !drawActive && !propertyEditorOpen ? (
              <div
                className="pointer-events-none absolute z-[25] max-w-[280px] rounded-lg border border-white/10 bg-[#141418]/90 px-2.5 py-2 text-[10px] text-white shadow-lg backdrop-blur-md"
                style={{
                  top: hoverCardPos.top,
                  left: hoverCardPos.left,
                }}
              >
                <div className="grid grid-cols-[56px_1fr] gap-x-2 gap-y-1">
                  <span className="text-white/40">Size</span>
                  <span>{hoveredElement.style.size}</span>
                  <span className="text-white/40">Font</span>
                  <span className="truncate">{hoveredElement.style.font}</span>
                </div>
              </div>
            ) : null}

            {selectedElement && propertyEditorOpen ? (
              <DesignPropertyEditorModal
                element={selectedElement}
                open={propertyEditorOpen}
                onClose={handlePropertyCancel}
                onSave={handlePropertySave}
                onDelete={handlePropertyDelete}
                onDraftChange={handlePropertyDraftChange}
              />
            ) : null}

            {toast ? (
              <div className="pointer-events-none absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-white/10 bg-[#141418]/95 px-3 py-1.5 text-xs text-white shadow-lg">
                {toast}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
