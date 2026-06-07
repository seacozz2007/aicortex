"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, FileText, Folder, Loader2 } from "lucide-react";
import { useDefaultLayout } from "react-resizable-panels";
import { useArtifactBrowseFeature } from "@aicortex/core/config/features";
import { useTaskArtifacts } from "@aicortex/core/artifacts/queries";
import type { ArtifactEntry } from "@aicortex/core/types";
import { useWorkspaceSlug } from "@aicortex/core/paths";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@aicortex/ui/components/ui/resizable";
import { cn } from "@aicortex/ui/lib/utils";
import { useT } from "../../i18n";
import { isHtmlArtifact } from "./chat-artifact-url";
import { ChatHtmlFilePreview } from "./chat-html-file-preview";

const MAX_TEXT_BYTES = 512 * 1024;

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".mdx",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".env",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".css",
  ".scss",
  ".less",
  ".sql",
  ".sh",
  ".bash",
  ".zsh",
  ".xml",
  ".csv",
  ".ini",
  ".cfg",
  ".conf",
  ".log",
  ".gitignore",
  ".dockerignore",
  ".editorconfig",
  ".properties",
]);

function isTextArtifact(path: string): boolean {
  if (isHtmlArtifact(path)) return false;
  const lower = path.toLowerCase();
  const base = lower.split("/").pop() ?? lower;
  if (base === ".env" || base.startsWith(".env.")) return true;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return false;
  return TEXT_EXTENSIONS.has(base.slice(dot));
}

function TextPreview({
  path,
  content,
}: {
  path: string;
  content: string;
}) {
  const lines = useMemo(() => content.split("\n"), [content]);
  const fileName = path.split("/").pop() ?? path;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b px-3 py-2">
        <p className="truncate font-mono text-xs text-foreground">{fileName}</p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">{path}</p>
      </div>
      <div className="flex min-h-0 flex-1 overflow-auto bg-muted/20">
        <div className="shrink-0 select-none border-r bg-muted/30 px-2 py-2 text-right font-mono text-[11px] leading-relaxed text-muted-foreground">
          {lines.map((_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>
        <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words p-2 font-mono text-[11px] leading-relaxed text-foreground">
          {content}
        </pre>
      </div>
    </div>
  );
}

export function ChatArtifactPanel({
  taskId,
  hasWorkDir,
}: {
  taskId?: string | null;
  hasWorkDir?: boolean;
}) {
  const { t: tChat } = useT("chat");
  const { t: tRuntimes } = useT("runtimes");
  const enabled = useArtifactBrowseFeature();
  const workspaceSlug = useWorkspaceSlug();
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "aicortex_chat_tools_files_layout",
  });

  const [cwd, setCwd] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [unsupportedPath, setUnsupportedPath] = useState<string | null>(null);

  const { data: listing, isLoading: listingLoading } = useTaskArtifacts(
    taskId ?? null,
    cwd,
    enabled && !!taskId,
  );

  const breadcrumbs = useMemo(() => {
    if (!cwd) return [];
    return cwd.split("/").filter(Boolean);
  }, [cwd]);

  useEffect(() => {
    setCwd("");
    setSelectedPath(null);
    setTextContent(null);
    setContentError(null);
    setUnsupportedPath(null);
  }, [taskId]);

  useEffect(() => {
    if (
      !selectedPath ||
      !taskId ||
      !workspaceSlug ||
      isHtmlArtifact(selectedPath) ||
      !isTextArtifact(selectedPath)
    ) {
      return;
    }

    let cancelled = false;
    setContentLoading(true);
    setContentError(null);
    setTextContent(null);
    setUnsupportedPath(null);

    void (async () => {
      try {
        const res = await fetch(
          buildArtifactRawURL(taskId, selectedPath, workspaceSlug),
          { credentials: "include" },
        );
        if (!res.ok) {
          throw new Error(`${res.status}`);
        }
        const text = await res.text();
        if (cancelled) return;
        if (text.length > MAX_TEXT_BYTES) {
          setContentError(tChat(($) => $.tools_sidebar.files.too_large));
          return;
        }
        setTextContent(text);
      } catch {
        if (!cancelled) {
          setContentError(tChat(($) => $.tools_sidebar.files.load_error));
        }
      } finally {
        if (!cancelled) {
          setContentLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedPath, taskId, workspaceSlug]);

  const navigateTo = useCallback((path: string) => {
    setCwd(path);
    setSelectedPath(null);
    setTextContent(null);
    setContentError(null);
    setUnsupportedPath(null);
  }, []);

  const openEntry = useCallback(
    (entry: ArtifactEntry) => {
      if (entry.is_dir) {
        navigateTo(entry.path);
        return;
      }
      if (entry.size > MAX_TEXT_BYTES) {
        setSelectedPath(null);
        setTextContent(null);
        setContentError(tChat(($) => $.tools_sidebar.files.too_large));
        setUnsupportedPath(null);
        return;
      }
      if (isHtmlArtifact(entry.path)) {
        setContentError(null);
        setUnsupportedPath(null);
        setTextContent(null);
        setSelectedPath(entry.path);
        return;
      }
      if (!isTextArtifact(entry.path)) {
        setSelectedPath(null);
        setTextContent(null);
        setContentError(null);
        setUnsupportedPath(entry.path);
        return;
      }
      setContentError(null);
      setUnsupportedPath(null);
      setSelectedPath(entry.path);
    },
    [navigateTo, tChat],
  );

  if (!enabled) {
    return null;
  }

  if (!taskId || !hasWorkDir) {
    return (
      <p className="px-3 py-4 text-xs text-muted-foreground">
        {tChat(($) => $.tools_sidebar.files.empty)}
      </p>
    );
  }

  const previewBody = (() => {
    if (unsupportedPath) {
      return (
        <p className="p-4 text-xs text-muted-foreground">
          {tChat(($) => $.tools_sidebar.files.binary_unsupported)}
        </p>
      );
    }
    if (contentLoading) {
      return (
        <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {tChat(($) => $.tools_sidebar.files.loading_content)}
        </div>
      );
    }
    if (contentError) {
      return <p className="p-4 text-xs text-destructive">{contentError}</p>;
    }
    if (
      selectedPath &&
      taskId &&
      workspaceSlug &&
      isHtmlArtifact(selectedPath)
    ) {
      return (
        <ChatHtmlFilePreview
          path={selectedPath}
          taskId={taskId}
          workspaceSlug={workspaceSlug}
        />
      );
    }
    if (selectedPath && textContent !== null) {
      return <TextPreview path={selectedPath} content={textContent} />;
    }
    return (
      <p className="p-4 text-xs text-muted-foreground">
        {tChat(($) => $.tools_sidebar.files.select_file)}
      </p>
    );
  })();

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full min-h-0"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <ResizablePanel id="tree" defaultSize="38%" minSize={160} maxSize="55%">
        <div className="flex h-full min-h-0 flex-col border-r">
          <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5 text-[11px] text-muted-foreground">
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => navigateTo("")}
            >
              /
            </button>
            {breadcrumbs.map((part, index) => {
              const path = breadcrumbs.slice(0, index + 1).join("/");
              return (
                <span key={path} className="inline-flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" />
                  <button
                    type="button"
                    className="hover:text-foreground"
                    onClick={() => navigateTo(path)}
                  >
                    {part}
                  </button>
                </span>
              );
            })}
          </div>

          {listingLoading ? (
            <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {tRuntimes(($) => $.artifacts.loading_files)}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              {(listing?.entries ?? []).map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => openEntry(entry)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/50",
                    selectedPath === entry.path && "bg-accent",
                  )}
                >
                  {entry.is_dir ? (
                    <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  {!entry.is_dir && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {entry.size}
                    </span>
                  )}
                </button>
              ))}
              {(listing?.entries?.length ?? 0) === 0 && (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  {tRuntimes(($) => $.artifacts.empty_dir)}
                </p>
              )}
            </div>
          )}
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel id="preview" minSize={220}>
        <div className="h-full min-h-0 overflow-hidden bg-background">
          {previewBody}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
