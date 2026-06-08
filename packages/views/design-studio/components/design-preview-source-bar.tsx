"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import {
  useRuntimeTunnelFeature,
} from "@aicortex/core/config/features";
import {
  useCreateRuntimeTunnel,
  useDeleteRuntimeTunnel,
  useRuntimeTunnels,
} from "@aicortex/core/runtimes/tunnels";
import type { RuntimeTunnel } from "@aicortex/core/types";
import { Button } from "@aicortex/ui/components/ui/button";
import { Input } from "@aicortex/ui/components/ui/input";
import { cn } from "@aicortex/ui/lib/utils";
import { useT } from "../../i18n";

export type DesignPreviewMode = "file" | "tunnel";

function buildTunnelPreviewURL(
  runtimeId: string,
  port: number,
  workspaceSlug: string,
): string {
  const params = new URLSearchParams({ workspace_slug: workspaceSlug });
  return `/api/runtimes/${runtimeId}/tunnel/${port}/?${params.toString()}`;
}

function resolveDefaultHtmlPath(
  htmlFiles: { path: string; name: string }[],
  artifactEntry: string,
): string | null {
  if (htmlFiles.length === 0) return null;
  const entryName = artifactEntry.split("/").pop() ?? artifactEntry;
  const exact = htmlFiles.find((f) => f.name === entryName);
  if (exact) return exact.path;
  const index = htmlFiles.find((f) => f.name.toLowerCase() === "index.html");
  if (index) return index.path;
  return htmlFiles[0]!.path;
}

function storageKey(sessionId: string, suffix: string) {
  return `design-preview:${sessionId}:${suffix}`;
}

export function DesignPreviewSourceBar({
  sessionId: _sessionId,
  artifactEntry: _artifactEntry,
  htmlEntries,
  htmlLoading,
  runtimeId,
  workspaceSlug,
  commentMode = false,
  mode,
  onModeChange,
  selectedHtmlPath,
  onHtmlPathChange,
  selectedPort,
  onPortChange,
}: {
  sessionId: string;
  artifactEntry: string;
  htmlEntries: { path: string; name: string }[];
  htmlLoading: boolean;
  runtimeId?: string;
  workspaceSlug: string;
  commentMode?: boolean;
  mode: DesignPreviewMode;
  onModeChange: (mode: DesignPreviewMode) => void;
  selectedHtmlPath: string | null;
  onHtmlPathChange: (path: string) => void;
  selectedPort: number | null;
  onPortChange: (port: number | null) => void;
}) {
  const { t } = useT("design");
  const { t: tRuntimes } = useT("runtimes");
  const tunnelEnabled = useRuntimeTunnelFeature();
  const canTunnel = tunnelEnabled && !!runtimeId;
  const canFile = htmlEntries.length > 0;
  const showModeToggle = canFile && canTunnel && !commentMode;

  const { data: tunnels = [], isLoading: tunnelsLoading } = useRuntimeTunnels(
    runtimeId ?? "",
    canTunnel && !!runtimeId,
  );
  const createMutation = useCreateRuntimeTunnel(runtimeId ?? "");
  const deleteMutation = useDeleteRuntimeTunnel(runtimeId ?? "");
  const [portInput, setPortInput] = useState("5173");

  const activeTunnels = useMemo(
    () => tunnels.filter((tunnel) => tunnel.status === "active"),
    [tunnels],
  );

  useEffect(() => {
    if (commentMode && mode !== "file" && canFile) {
      onModeChange("file");
    }
  }, [canFile, commentMode, mode, onModeChange]);

  useEffect(() => {
    if (mode === "file" || !canTunnel) return;
    if (selectedPort != null) return;
    if (activeTunnels.length > 0) {
      onPortChange(activeTunnels[0]!.port);
    }
  }, [activeTunnels, canTunnel, mode, onPortChange, selectedPort]);

  const handleCreateTunnel = () => {
    if (!runtimeId) return;
    const parsed = Number.parseInt(portInput, 10);
    if (!Number.isFinite(parsed)) return;
    createMutation.mutate(
      { port: parsed },
      {
        onSuccess: (tunnel: RuntimeTunnel) => {
          onPortChange(tunnel.port);
          onModeChange("tunnel");
        },
      },
    );
  };

  if (!canFile && !canTunnel) {
    return null;
  }

  return (
    <div className="shrink-0 space-y-2 border-b bg-sidebar px-2 py-2">
      {showModeToggle && (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onModeChange("file")}
            className={cn(
              "flex-1 rounded-md px-2 py-1 text-[11px] transition-colors",
              mode === "file"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60",
            )}
          >
            {t(($) => $.preview.source_file)}
          </button>
          <button
            type="button"
            onClick={() => onModeChange("tunnel")}
            className={cn(
              "flex-1 rounded-md px-2 py-1 text-[11px] transition-colors",
              mode === "tunnel"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60",
            )}
          >
            {t(($) => $.preview.source_tunnel)}
          </button>
        </div>
      )}

      {(mode === "file" || !canTunnel) && canFile && (
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t(($) => $.preview.select_html)}
          </label>
          {htmlLoading ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {t(($) => $.preview.loading_files)}
            </div>
          ) : htmlEntries.length === 1 ? (
            <p className="truncate font-mono text-[11px] text-foreground">
              {htmlEntries[0]!.name}
            </p>
          ) : (
            <select
              value={selectedHtmlPath ?? ""}
              onChange={(e) => onHtmlPathChange(e.target.value)}
              className="h-8 w-full rounded-md border bg-background px-2 font-mono text-[11px] outline-none focus:ring-1 focus:ring-ring"
            >
              {htmlEntries.map((entry) => (
                <option key={entry.path} value={entry.path}>
                  {entry.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {mode === "tunnel" && canTunnel && runtimeId && (
        <div className="space-y-2">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t(($) => $.preview.select_port)}
          </label>
          {tunnelsLoading ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {tRuntimes(($) => $.tunnels.loading)}
            </div>
          ) : activeTunnels.length > 1 ? (
            <select
              value={selectedPort ?? ""}
              onChange={(e) => onPortChange(Number.parseInt(e.target.value, 10))}
              className="h-8 w-full rounded-md border bg-background px-2 font-mono text-[11px] outline-none focus:ring-1 focus:ring-ring"
            >
              {activeTunnels.map((tunnel) => (
                <option key={tunnel.id} value={tunnel.port}>
                  {tunnel.title} :{tunnel.port}
                </option>
              ))}
            </select>
          ) : activeTunnels.length === 1 ? (
            <div className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium">{activeTunnels[0]!.title}</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  :{activeTunnels[0]!.port}
                </p>
              </div>
              {workspaceSlug && (
                <a
                  href={buildTunnelPreviewURL(runtimeId, activeTunnels[0]!.port, workspaceSlug)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={tRuntimes(($) => $.tunnels.open_external)}
                >
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {t(($) => $.preview.no_ports)}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Input
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
              inputMode="numeric"
              placeholder={tRuntimes(($) => $.tunnels.port_placeholder)}
              className="h-8 font-mono text-xs"
            />
            <Button
              size="sm"
              onClick={handleCreateTunnel}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                tRuntimes(($) => $.tunnels.add_action)
              )}
            </Button>
          </div>

          {tunnels.length > 0 && (
            <div className="max-h-24 space-y-1 overflow-auto">
              {tunnels.map((tunnel: RuntimeTunnel) => {
                const isActive = tunnel.status === "active";
                return (
                  <div
                    key={tunnel.id}
                    className="flex items-center justify-between gap-2 rounded-md border px-2 py-1"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => isActive && onPortChange(tunnel.port)}
                      disabled={!isActive}
                    >
                      <div className="truncate text-[11px] font-medium">{tunnel.title}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        :{tunnel.port}
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => deleteMutation.mutate(tunnel.id)}
                      disabled={deleteMutation.isPending}
                      aria-label={tRuntimes(($) => $.tunnels.delete_aria)}
                    >
                      ×
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function useDesignPreviewSource({
  sessionId,
  artifactEntry,
  htmlEntries,
  runtimeId,
  commentMode = false,
}: {
  sessionId: string;
  artifactEntry: string;
  htmlEntries: { path: string; name: string }[];
  runtimeId?: string;
  commentMode?: boolean;
}) {
  const tunnelEnabled = useRuntimeTunnelFeature();
  const canTunnel = tunnelEnabled && !!runtimeId;
  const canFile = htmlEntries.length > 0;

  const defaultHtmlPath = useMemo(
    () => resolveDefaultHtmlPath(htmlEntries, artifactEntry),
    [artifactEntry, htmlEntries],
  );

  const [mode, setMode] = useState<DesignPreviewMode>(() => {
    if (typeof window === "undefined") return canFile ? "file" : "tunnel";
    const saved = window.sessionStorage.getItem(storageKey(sessionId, "mode"));
    if (saved === "file" || saved === "tunnel") return saved;
    return canFile ? "file" : "tunnel";
  });

  const [selectedHtmlPath, setSelectedHtmlPath] = useState<string | null>(() => {
    if (typeof window === "undefined") return defaultHtmlPath;
    const saved = window.sessionStorage.getItem(storageKey(sessionId, "html"));
    if (saved && htmlEntries.some((e) => e.path === saved)) return saved;
    return defaultHtmlPath;
  });

  const [selectedPort, setSelectedPort] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = window.sessionStorage.getItem(storageKey(sessionId, "port"));
    if (!saved) return null;
    const parsed = Number.parseInt(saved, 10);
    return Number.isFinite(parsed) ? parsed : null;
  });

  useEffect(() => {
    if (!selectedHtmlPath && defaultHtmlPath) {
      setSelectedHtmlPath(defaultHtmlPath);
    } else if (
      selectedHtmlPath &&
      htmlEntries.length > 0 &&
      !htmlEntries.some((e) => e.path === selectedHtmlPath)
    ) {
      setSelectedHtmlPath(defaultHtmlPath);
    }
  }, [defaultHtmlPath, htmlEntries, selectedHtmlPath]);

  useEffect(() => {
    if (commentMode && mode !== "file" && canFile) {
      setMode("file");
    }
  }, [canFile, commentMode, mode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(storageKey(sessionId, "mode"), mode);
  }, [mode, sessionId]);

  useEffect(() => {
    if (typeof window === "undefined" || !selectedHtmlPath) return;
    window.sessionStorage.setItem(storageKey(sessionId, "html"), selectedHtmlPath);
  }, [selectedHtmlPath, sessionId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedPort == null) {
      window.sessionStorage.removeItem(storageKey(sessionId, "port"));
      return;
    }
    window.sessionStorage.setItem(storageKey(sessionId, "port"), String(selectedPort));
  }, [selectedPort, sessionId]);

  useEffect(() => {
    if (canFile) return;
    if (canTunnel) setMode("tunnel");
  }, [canFile, canTunnel]);

  return {
    mode,
    setMode,
    selectedHtmlPath,
    setSelectedHtmlPath,
    selectedPort,
    setSelectedPort,
    effectiveHtmlPath: selectedHtmlPath ?? defaultHtmlPath,
  };
}

export { buildTunnelPreviewURL };
