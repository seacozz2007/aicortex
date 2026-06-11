"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Monitor, Smartphone, Tablet } from "lucide-react";
import { cn } from "@aicortex/ui/lib/utils";
import {
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@aicortex/ui/components/ui/dropdown-menu";
import { useT } from "../../i18n";
import { buildArtifactRawURL } from "../../chat/components/chat-artifact-url";
import { applyPropertyDraft } from "../lib/apply-element-styles";
import { extractSelectedElement, isPreviewTarget } from "../lib/extract-element-style";
import {
  elementVisualViewportRect,
  overlayRectForContainer,
} from "../lib/preview-element-rect";
import {
  clearPreviewIframeSelectionOverlay,
  syncPreviewIframeSelectionOverlay,
} from "../lib/preview-iframe-overlay";
import { injectSnapshotBridge } from "../lib/preview-screenshot";
import {
  formatPropertyPatch,
  propertyDraftFromElement,
  type ElementPropertyDraft,
  type MarkAnnotationAction,
  type PreviewToolMode,
  type SelectedPreviewElement,
} from "../lib/preview-element";
import { copyIframeScreenshot } from "../lib/preview-screenshot";
import { DesignCommentQueuePanel, type QueuedPreviewComment } from "./design-comment-queue-panel";
import { DesignCommentToolbar } from "./design-comment-toolbar";
import { DesignElementInspector } from "./design-element-inspector";
import { DesignMarkOverlay } from "./design-mark-overlay";
import { DesignPropertyEditorModal } from "./design-property-editor-modal";
import { DesignPreviewBrowserChrome } from "./design-preview-browser-chrome";
import { DesignPreviewCommentHint } from "./design-preview-comment-hint";
import {
  DesignPreviewSourcePanel,
  formatPreviewAddressLabel,
  type DesignPreviewMode,
} from "./design-preview-source-bar";

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

const DECK_FIX_STYLE_ID = "aicortex-preview-deck-fix";
const COMMENT_STYLE_ID = "aicortex-preview-comment-style";

function resolveTarget(el: HTMLElement): HTMLElement {
  return (el.closest("[data-aicortex-id]") as HTMLElement | null) ?? el;
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
        top: stageRect.top - containerRect.top,
        left: stageRect.left - containerRect.left,
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
  onCommentModeChange,
  previewSource,
  htmlEntries = [],
  htmlLoading = false,
  runtimeId,
  sendDisabled = false,
  onQueueComment,
  onSendToChat,
  onPropertySave,
  onMarkAnnotation,
  queuedComments = [],
  onRemoveQueuedComment,
  onClearQueuedComments,
  onSendQueue,
  queueSending = false,
  onTunnelConnect,
}: {
  path: string;
  taskId: string;
  workspaceSlug: string;
  commentMode?: boolean;
  onCommentModeChange?: (enabled: boolean) => void;
  previewSource?: {
    mode: DesignPreviewMode;
    setMode: (mode: DesignPreviewMode) => void;
    selectedHtmlPath: string | null;
    setSelectedHtmlPath: (path: string) => void;
    selectedPort: number | null;
    setSelectedPort: (port: number | null) => void;
  };
  htmlEntries?: { path: string; name: string }[];
  htmlLoading?: boolean;
  runtimeId?: string;
  sendDisabled?: boolean;
  onComment?: PreviewCommentHandler;
  onQueueComment?: PreviewCommentHandler;
  onSendToChat?: PreviewCommentHandler;
  onPropertySave?: (element: SelectedPreviewElement, patch: string) => void;
  onMarkAnnotation?: (payload: {
    action: MarkAnnotationAction;
    note: string;
    imageFile?: File;
    extraFiles?: File[];
  }) => Promise<void>;
  queuedComments?: QueuedPreviewComment[];
  onRemoveQueuedComment?: (id: string) => void;
  onClearQueuedComments?: () => void;
  onSendQueue?: () => void;
  queueSending?: boolean;
  onTunnelConnect?: () => void;
}) {
  const { t } = useT("design");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const selectedNodeRef = useRef<HTMLElement | null>(null);
  const hoverNodeRef = useRef<HTMLElement | null>(null);
  const propertyBaselineRef = useRef<ElementPropertyDraft | null>(null);

  const [viewport, setViewport] = useState<DesignViewport>("desktop");
  const [loading, setLoading] = useState(true);
  const [tool, setTool] = useState<PreviewToolMode | null>(null);
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
  const markActive = tool === "mark";
  const editActive = tool === "edit";
  const commentActive = tool === "comment";
  const toolRef = useRef<PreviewToolMode | null>(tool);
  const propertyEditorOpenRef = useRef(propertyEditorOpen);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    propertyEditorOpenRef.current = propertyEditorOpen;
  }, [propertyEditorOpen]);

  const stageBounds = useStageOverlayBounds(
    stageRef,
    overlayRef,
    commentMode && !loading && markActive,
    [viewport, scale, previewURL, tool],
  );

  const clearSelection = useCallback(() => {
    selectedNodeRef.current = null;
    setSelectedElement(null);
    clearPreviewIframeSelectionOverlay(iframeRef.current);
    setInspectorNote("");
    setPendingImages([]);
    setInspectorPos(null);
    setPropertyEditorOpen(false);
    propertyBaselineRef.current = null;
  }, []);

  const syncOverlayRects = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const selectedNode = selectedNodeRef.current;
    const hoverNode = hoverNodeRef.current;

    syncPreviewIframeSelectionOverlay(iframe, {
      selected:
        markActive || propertyEditorOpenRef.current ? null : selectedNode,
      hover: hoverNode,
      showHover: commentActive && !markActive && !propertyEditorOpenRef.current,
    });
  }, [commentActive, markActive]);

  const updateInspectorPosition = useCallback(() => {
    const node = selectedNodeRef.current;
    const iframe = iframeRef.current;
    if (!node || !iframe || propertyEditorOpen || markActive) {
      setInspectorPos(null);
      return;
    }
    const rect = elementVisualViewportRect(node, iframe);
    setInspectorPos({
      top: rect.top + rect.height + 8,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 368)),
    });
  }, [markActive, propertyEditorOpen]);

  const openPropertyEditorFor = useCallback(
    (snapshot: SelectedPreviewElement, node: HTMLElement) => {
      selectedNodeRef.current = node;
      setSelectedElement(snapshot);
      setHoveredElement(null);
      setHoverCardPos(null);
      propertyBaselineRef.current = propertyDraftFromElement(snapshot);
      setPropertyEditorOpen(true);
      setInspectorPos(null);
      requestAnimationFrame(() => syncOverlayRects());
    },
    [syncOverlayRects],
  );

  const buildSnapshot = useCallback((el: HTMLElement): SelectedPreviewElement | null => {
    const container = overlayRef.current;
    if (!container) return null;
    const snapshot = extractSelectedElement(el);
    snapshot.rect = overlayRectForContainer(el, container, iframeRef.current);
    return snapshot;
  }, []);

  const selectElementForComment = useCallback(
    (el: HTMLElement) => {
      const snapshot = buildSnapshot(el);
      if (!snapshot) return;
      selectedNodeRef.current = el;
      setSelectedElement(snapshot);
      setHoveredElement(null);
      setHoverCardPos(null);
      setInspectorNote("");
      setPendingImages([]);
      setPropertyEditorOpen(false);
      requestAnimationFrame(() => {
        updateInspectorPosition();
        syncOverlayRects();
      });
    },
    [buildSnapshot, syncOverlayRects, updateInspectorPosition],
  );

  const attachPreviewHandlers = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    if (!commentMode || markActive || !tool) return;

    let style = doc.getElementById(COMMENT_STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement("style");
      style.id = COMMENT_STYLE_ID;
      doc.head?.appendChild(style);
    }
    style.textContent =
      tool === "edit"
        ? `* { cursor: pointer !important; }`
        : `* { cursor: crosshair !important; }`;

    const onClick = (event: MouseEvent) => {
      const mode = toolRef.current;
      if (!mode || mode === "mark") return;
      if (!isPreviewTarget(event.target, doc)) return;
      event.preventDefault();
      event.stopPropagation();
      const el = resolveTarget(event.target as HTMLElement);
      if (mode === "edit") {
        const snapshot = buildSnapshot(el);
        if (snapshot) openPropertyEditorFor(snapshot, el);
        return;
      }
      if (mode === "comment") {
        selectElementForComment(el);
      }
    };

    const onMove = (event: MouseEvent) => {
      if (
        toolRef.current !== "comment" ||
        propertyEditorOpenRef.current ||
        selectedNodeRef.current
      ) {
        hoverNodeRef.current = null;
        setHoveredElement(null);
        setHoverCardPos(null);
        syncPreviewIframeSelectionOverlay(iframeRef.current, {
          selected: null,
          hover: null,
          showHover: false,
        });
        return;
      }
      if (!isPreviewTarget(event.target, doc)) {
        hoverNodeRef.current = null;
        setHoveredElement(null);
        setHoverCardPos(null);
        syncPreviewIframeSelectionOverlay(iframeRef.current, {
          selected: null,
          hover: null,
          showHover: false,
        });
        return;
      }
      const el = resolveTarget(event.target as HTMLElement);
      hoverNodeRef.current = el;
      const snapshot = buildSnapshot(el);
      if (!snapshot) return;
      setHoveredElement(snapshot);
      const iframe = iframeRef.current;
      if (iframe) {
        const rect = elementVisualViewportRect(el, iframe);
        setHoverCardPos({
          top: rect.top + rect.height + 8,
          left: Math.max(8, rect.left),
        });
        syncOverlayRects();
      }
    };

    const onLeave = () => {
      hoverNodeRef.current = null;
      setHoveredElement(null);
      setHoverCardPos(null);
      syncPreviewIframeSelectionOverlay(iframeRef.current, {
        selected: selectedNodeRef.current,
        hover: null,
        showHover: false,
      });
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
  }, [
    buildSnapshot,
    commentMode,
    markActive,
    openPropertyEditorFor,
    selectElementForComment,
    syncOverlayRects,
    tool,
  ]);

  const applyDeckFix = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.querySelector(".deck") || doc.getElementById(DECK_FIX_STYLE_ID)) return;
    const fix = doc.createElement("style");
    fix.id = DECK_FIX_STYLE_ID;
    fix.textContent = `
      html, body { height: 100%; margin: 0; overflow: hidden; }
      .deck { width: 100% !important; height: 100% !important; }
    `;
    doc.head?.appendChild(fix);
  }, []);

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
      setTool(null);
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
      applyDeckFix();
      injectSnapshotBridge(iframe);
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
  }, [applyDeckFix, previewURL, clearSelection]);

  useEffect(() => {
    if (loading) return;
    const cleanup = attachPreviewHandlers();
    return () => cleanup?.();
  }, [attachPreviewHandlers, loading]);

  useEffect(() => {
    if (!commentMode || !selectedElement) return;
    const container = overlayRef.current;
    if (!container) return;
    const onScroll = () => {
      updateInspectorPosition();
      syncOverlayRects();
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    const iframeDoc = iframeRef.current?.contentDocument;
    iframeDoc?.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, { capture: true });
      iframeDoc?.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [commentMode, loading, selectedElement, syncOverlayRects, updateInspectorPosition]);

  useEffect(() => {
    if (!commentMode || loading) return;
    const onScroll = () => syncOverlayRects();
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    const iframeDoc = iframeRef.current?.contentDocument;
    iframeDoc?.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      iframeDoc?.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [commentMode, loading, previewURL, syncOverlayRects]);

  useEffect(() => {
    if (!commentMode) {
      clearPreviewIframeSelectionOverlay(iframeRef.current);
      return;
    }
    syncOverlayRects();
  }, [commentMode, syncOverlayRects]);

  useEffect(() => {
    if (!commentMode) return;
    syncOverlayRects();
  }, [commentMode, scale, viewport, syncOverlayRects]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleSaveComment = () => {
    if (!selectedElement || !inspectorNote.trim()) return;
    onQueueComment?.(selectedElement, inspectorNote.trim(), pendingImages);
    setInspectorNote("");
    setPendingImages([]);
    clearSelection();
    setToast(t(($) => $.preview.comment_saved));
  };

  const handleSendToChat = () => {
    if (!selectedElement || !inspectorNote.trim()) return;
    onSendToChat?.(selectedElement, inspectorNote.trim(), pendingImages);
    setInspectorNote("");
    setPendingImages([]);
    clearSelection();
    setToast(t(($) => $.preview.comment_added));
  };

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
    clearSelection();
  };

  const handlePropertySave = (draft: ElementPropertyDraft) => {
    if (!selectedElement) return;
    onPropertySave?.(selectedElement, formatPropertyPatch(selectedElement, draft));
    propertyBaselineRef.current = null;
    setPropertyEditorOpen(false);
    clearSelection();
    setToast(t(($) => $.preview.edit_saved));
  };

  const handlePropertyDelete = () => {
    if (!selectedElement) return;
    onPropertySave?.(
      selectedElement,
      `[Delete element · ${selectedElement.id}]\nRemove this element from the design.`,
    );
    selectedNodeRef.current?.remove();
    clearSelection();
  };

  const handleToolChange = useCallback(
    (next: PreviewToolMode) => {
      if (next === tool) {
        if (propertyEditorOpen) closePropertyEditor(true);
        clearSelection();
        setTool(null);
        return;
      }

      if (propertyEditorOpen) closePropertyEditor(true);
      clearSelection();
      setHoveredElement(null);
      setHoverCardPos(null);
      setTool(next);
    },
    [clearSelection, closePropertyEditor, propertyEditorOpen, tool],
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

  const handleRefresh = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    setLoading(true);
    clearSelection();
    try {
      iframe.contentWindow?.location.reload();
    } catch {
      iframe.src = iframe.src;
    }
  }, [clearSelection]);

  const addressText = formatPreviewAddressLabel({
    mode: previewSource?.mode ?? "file",
    htmlPath: path,
    port: previewSource?.selectedPort,
  });

  const sourcePanel =
    previewSource && htmlEntries.length > 0
      ? (close: () => void) => (
          <DesignPreviewSourcePanel
            htmlEntries={htmlEntries}
            htmlLoading={htmlLoading}
            runtimeId={runtimeId}
            commentMode={commentMode}
            mode={previewSource.mode}
            onModeChange={previewSource.setMode}
            selectedHtmlPath={previewSource.selectedHtmlPath}
            onHtmlPathChange={previewSource.setSelectedHtmlPath}
            selectedPort={previewSource.selectedPort}
            onPortChange={previewSource.setSelectedPort}
            onAfterSelect={close}
            onTunnelConnect={onTunnelConnect}
          />
        )
      : undefined;

  const overflowMenu = (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>{t(($) => $.preview.chrome.viewport_label)}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={viewport}
          onValueChange={(value) => setViewport(value as DesignViewport)}
        >
          {(
            [
              ["desktop", Monitor, t(($) => $.preview.viewport.desktop)],
              ["tablet", Tablet, t(($) => $.preview.viewport.tablet)],
              ["mobile", Smartphone, t(($) => $.preview.viewport.mobile)],
            ] as const
          ).map(([id, Icon, label]) => (
            <DropdownMenuRadioItem key={id} value={id} className="gap-2 text-xs">
              <Icon className="size-3.5" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
    </>
  );

  const showInspector =
    selectedElement &&
    commentActive &&
    !propertyEditorOpen &&
    !markActive &&
    inspectorPos;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DesignPreviewBrowserChrome
        addressText={addressText}
        externalHref={previewURL}
        onRefresh={handleRefresh}
        commentMode={commentMode}
        onCommentModeChange={onCommentModeChange}
        designEnabled={!!onCommentModeChange}
        sourcePanel={sourcePanel}
        overflowMenu={overflowMenu}
      />

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
              markActive && "pointer-events-none",
            )}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          />
        </div>

        {commentMode && !loading && markActive && stageBounds ? (
          <div
            className="absolute z-[35] overflow-hidden rounded-md"
            style={{
              top: stageBounds.top,
              left: stageBounds.left,
              width: stageBounds.width,
              height: stageBounds.height,
            }}
          >
            <DesignMarkOverlay
              iframeRef={iframeRef}
              active={markActive}
              sendDisabled={sendDisabled}
              onClose={() => setTool(null)}
              onSubmit={async (payload) => {
                await onMarkAnnotation?.(payload);
                setToast(t(($) => $.preview.mark.submitted));
              }}
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
                onSaveComment={handleSaveComment}
                onSendToChat={handleSendToChat}
                onAttachImages={(files) => setPendingImages((prev) => [...prev, ...files])}
                attachmentCount={pendingImages.length}
                style={{ position: "fixed", top: inspectorPos.top, left: inspectorPos.left }}
              />
            ) : null}

            {hoveredElement && hoverCardPos && !selectedElement && commentActive && !markActive ? (
              <div
                className="pointer-events-none fixed z-[25] max-w-[280px] rounded-lg border border-white/10 bg-[#141418]/90 px-2.5 py-2 text-[10px] text-white shadow-lg backdrop-blur-md"
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

            {selectedElement && propertyEditorOpen && editActive ? (
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
