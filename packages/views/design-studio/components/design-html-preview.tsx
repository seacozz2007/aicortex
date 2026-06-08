"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Monitor, Smartphone, Tablet } from "lucide-react";
import { cn } from "@aicortex/ui/lib/utils";
import { useT } from "../../i18n";
import { buildArtifactRawURL } from "../../chat/components/chat-artifact-url";

export type DesignViewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_WIDTH: Record<DesignViewport, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

export function DesignHtmlPreview({
  path,
  taskId,
  workspaceSlug,
  commentMode = false,
  onComment,
}: {
  path: string;
  taskId: string;
  workspaceSlug: string;
  commentMode?: boolean;
  onComment?: (elementId: string, note: string) => void;
}) {
  const { t } = useT("design");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [viewport, setViewport] = useState<DesignViewport>("desktop");
  const [loading, setLoading] = useState(true);
  const [pendingElement, setPendingElement] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const previewURL = buildArtifactRawURL(taskId, path, workspaceSlug);

  const attachCommentHandlers = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !commentMode) return;

    const style = doc.createElement("style");
    style.textContent =
      "[data-aicortex-id]:hover { outline: 2px solid #5e6ad2 !important; outline-offset: 2px; cursor: crosshair; }";
    doc.head?.appendChild(style);

    const handler = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const el = target.closest("[data-aicortex-id]") as HTMLElement | null;
      const elementId =
        el?.getAttribute("data-aicortex-id") ??
        `${target.tagName.toLowerCase()}-${target.className || "node"}`;
      setPendingElement(elementId);
      setNote("");
    };

    doc.addEventListener("click", handler as EventListener, true);
    return () => doc.removeEventListener("click", handler as EventListener, true);
  }, [commentMode]);

  useEffect(() => {
    setLoading(true);
  }, [previewURL]);

  useEffect(() => {
    if (!commentMode) {
      setPendingElement(null);
      setNote("");
    }
  }, [commentMode]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      setLoading(false);
      attachCommentHandlers();
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [attachCommentHandlers, previewURL]);

  const submitComment = () => {
    if (!pendingElement || !note.trim() || !onComment) return;
    onComment(pendingElement, note.trim());
    setPendingElement(null);
    setNote("");
  };

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
        {commentMode && (
          <span className="inline-flex items-center gap-1 text-[11px] text-brand">
            <MessageSquare className="size-3" />
            {t(($) => $.preview.comment_mode_hint)}
          </span>
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto bg-muted/30 p-2">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-muted/20 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t(($) => $.preview.loading)}
          </div>
        )}
        <div
          className="mx-auto h-full min-h-[320px] transition-[max-width] duration-200"
          style={{ maxWidth: VIEWPORT_WIDTH[viewport] }}
        >
          <iframe
            ref={iframeRef}
            key={previewURL}
            title={t(($) => $.preview.frame_title)}
            src={previewURL}
            className="h-full w-full rounded-md border bg-background shadow-sm"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
      </div>

      {pendingElement && commentMode && (
        <div className="shrink-0 space-y-2 border-t bg-card p-2">
          <p className="text-[11px] text-muted-foreground">
            {t(($) => $.preview.comment_on, { id: pendingElement })}
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t(($) => $.preview.comment_placeholder)}
            className="min-h-[60px] w-full rounded-md border bg-background px-2 py-1 text-xs"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs hover:bg-accent"
              onClick={() => setPendingElement(null)}
            >
              {t(($) => $.session.clear_comment)}
            </button>
            <button
              type="button"
              disabled={!note.trim()}
              className="rounded-md bg-brand px-3 py-1 text-xs text-brand-foreground disabled:opacity-50"
              onClick={submitComment}
            >
              {t(($) => $.preview.add_comment)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
