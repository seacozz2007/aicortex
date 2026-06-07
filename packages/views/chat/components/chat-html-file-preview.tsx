"use client";

import { useEffect, useMemo, useState } from "react";
import { Code2, Eye, Loader2 } from "lucide-react";
import { cn } from "@aicortex/ui/lib/utils";
import { useT } from "../../i18n";
import { buildArtifactRawURL } from "./chat-artifact-url";

const MAX_HTML_BYTES = 512 * 1024;

type HtmlViewMode = "render" | "source";

export function ChatHtmlFilePreview({
  path,
  taskId,
  workspaceSlug,
  defaultView = "render",
}: {
  path: string;
  taskId: string;
  workspaceSlug: string;
  defaultView?: HtmlViewMode;
}) {
  const { t } = useT("chat");
  const [viewMode, setViewMode] = useState<HtmlViewMode>(defaultView);
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileName = path.split("/").pop() ?? path;
  const previewURL = buildArtifactRawURL(taskId, path, workspaceSlug);
  const lines = useMemo(() => (source ?? "").split("\n"), [source]);

  useEffect(() => {
    setViewMode(defaultView);
    setSource(null);
    setError(null);
  }, [path, taskId, defaultView]);

  useEffect(() => {
    if (viewMode !== "source" || source !== null || loading) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const res = await fetch(previewURL, { credentials: "include" });
        if (!res.ok) {
          throw new Error(`${res.status}`);
        }
        const text = await res.text();
        if (cancelled) return;
        if (text.length > MAX_HTML_BYTES) {
          setError(t(($) => $.tools_sidebar.files.too_large));
          return;
        }
        setSource(text);
      } catch {
        if (!cancelled) {
          setError(t(($) => $.tools_sidebar.files.load_error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewMode, source, loading, previewURL, t]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-2 py-1.5">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-foreground">{fileName}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">{path}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 rounded-md border p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("render")}
            className={cn(
              "rounded px-2 py-1 text-muted-foreground transition-colors hover:text-foreground",
              viewMode === "render" && "bg-accent text-foreground",
            )}
            title={t(($) => $.tools_sidebar.html.view_render_tooltip)}
          >
            <Eye className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("source")}
            className={cn(
              "rounded px-2 py-1 text-muted-foreground transition-colors hover:text-foreground",
              viewMode === "source" && "bg-accent text-foreground",
            )}
            title={t(($) => $.tools_sidebar.html.view_source_tooltip)}
          >
            <Code2 className="size-3.5" />
          </button>
        </div>
      </div>

      {viewMode === "render" ? (
        <iframe
          key={previewURL}
          title={t(($) => $.tools_sidebar.web.static_frame_title)}
          src={previewURL}
          className="min-h-0 flex-1 w-full bg-background"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t(($) => $.tools_sidebar.files.loading_content)}
        </div>
      ) : error ? (
        <p className="p-4 text-xs text-destructive">{error}</p>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-auto bg-muted/20">
          <div className="shrink-0 select-none border-r bg-muted/30 px-2 py-2 text-right font-mono text-[11px] leading-relaxed text-muted-foreground">
            {lines.map((_, index) => (
              <div key={index}>{index + 1}</div>
            ))}
          </div>
          <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words p-2 font-mono text-[11px] leading-relaxed text-foreground">
            {source ?? ""}
          </pre>
        </div>
      )}
    </div>
  );
}
