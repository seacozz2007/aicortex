"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const QUICK_TUNNEL_PORTS = [5173, 3000, 8080, 4173] as const;

function ModeToggle({
  mode,
  onModeChange,
}: {
  mode: DesignPreviewMode;
  onModeChange: (mode: DesignPreviewMode) => void;
}) {
  const { t } = useT("design");

  return (
    <div className="flex shrink-0 gap-0.5 rounded-md border p-0.5">
      <button
        type="button"
        onClick={() => onModeChange("file")}
        className={cn(
          "rounded px-2 py-0.5 text-[10px] transition-colors",
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
          "rounded px-2 py-0.5 text-[10px] transition-colors",
          mode === "tunnel"
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent/60",
        )}
      >
        {t(($) => $.preview.source_tunnel)}
      </button>
    </div>
  );
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
  const [portSelectKey, setPortSelectKey] = useState(0);

  const activeTunnels = useMemo(
    () => tunnels.filter((tunnel) => tunnel.status === "active"),
    [tunnels],
  );

  const quickAddPorts = useMemo(() => {
    const used = new Set(tunnels.map((tunnel) => tunnel.port));
    return QUICK_TUNNEL_PORTS.filter((port) => !used.has(port));
  }, [tunnels]);

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

  const handlePortSelect = (value: string) => {
    if (!runtimeId) return;
    if (value.startsWith("__delete:")) {
      const tunnelId = value.slice("__delete:".length);
      const tunnel = tunnels.find((item) => item.id === tunnelId);
      deleteMutation.mutate(tunnelId, {
        onSuccess: () => {
          if (tunnel && selectedPort === tunnel.port) {
            onPortChange(null);
          }
          setPortSelectKey((key) => key + 1);
        },
      });
      return;
    }
    if (value.startsWith("__create:")) {
      const parsed = Number.parseInt(value.slice("__create:".length), 10);
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
      return;
    }
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) onPortChange(parsed);
  };

  if (!canFile && !canTunnel) {
    return null;
  }

  return (
    <div className="shrink-0 border-b bg-sidebar px-2 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          {(mode === "file" || !canTunnel) && canFile && (
            <>
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
                  className="h-8 w-full max-w-md rounded-md border bg-background px-2 font-mono text-[11px] outline-none focus:ring-1 focus:ring-ring"
                >
                  {htmlEntries.map((entry) => (
                    <option key={entry.path} value={entry.path}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}

          {mode === "tunnel" && canTunnel && runtimeId && (
            <>
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t(($) => $.preview.select_port)}
              </label>
              {tunnelsLoading ? (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  {tRuntimes(($) => $.tunnels.loading)}
                </div>
              ) : (
                <div className="flex max-w-md items-center gap-2">
                  <select
                    key={portSelectKey}
                    value={
                      selectedPort != null && activeTunnels.some((t) => t.port === selectedPort)
                        ? String(selectedPort)
                        : ""
                    }
                    onChange={(e) => handlePortSelect(e.target.value)}
                    disabled={createMutation.isPending || deleteMutation.isPending}
                    className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono text-[11px] outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                  >
                    <option value="" disabled>
                      {activeTunnels.length > 0
                        ? t(($) => $.preview.select_port)
                        : t(($) => $.preview.no_ports)}
                    </option>
                    {activeTunnels.length > 0 ? (
                      <optgroup label={t(($) => $.preview.port_group_active)}>
                        {activeTunnels.map((tunnel) => (
                          <option key={tunnel.id} value={tunnel.port}>
                            {tunnel.title} :{tunnel.port}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {activeTunnels.length > 0 ? (
                      <optgroup label={t(($) => $.preview.port_group_disconnect)}>
                        {activeTunnels.map((tunnel) => (
                          <option key={`delete-${tunnel.id}`} value={`__delete:${tunnel.id}`}>
                            {t(($) => $.preview.disconnect_port, { port: tunnel.port })}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {quickAddPorts.length > 0 ? (
                      <optgroup label={tRuntimes(($) => $.tunnels.add_action)}>
                        {quickAddPorts.map((port) => (
                          <option key={port} value={`__create:${port}`}>
                            :{port}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                  {selectedPort != null &&
                  workspaceSlug &&
                  activeTunnels.some((tunnel) => tunnel.port === selectedPort) ? (
                    <a
                      href={buildTunnelPreviewURL(runtimeId, selectedPort, workspaceSlug)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label={tRuntimes(($) => $.tunnels.open_external)}
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>

        {showModeToggle ? <ModeToggle mode={mode} onModeChange={onModeChange} /> : null}
      </div>
    </div>
  );
}

export function useDesignPreviewSource({
  sessionId,
  artifactEntry,
  htmlEntries,
  htmlLoading = false,
  runtimeId,
  commentMode = false,
}: {
  sessionId: string;
  artifactEntry: string;
  htmlEntries: { path: string; name: string }[];
  htmlLoading?: boolean;
  runtimeId?: string;
  commentMode?: boolean;
}) {
  const tunnelEnabled = useRuntimeTunnelFeature();
  const canTunnel = tunnelEnabled && !!runtimeId;
  const canFile = htmlEntries.length > 0;
  const modeUserSelectedRef = useRef(false);

  const defaultHtmlPath = useMemo(
    () => resolveDefaultHtmlPath(htmlEntries, artifactEntry),
    [artifactEntry, htmlEntries],
  );

  const [mode, setModeState] = useState<DesignPreviewMode>("file");

  const setMode = (next: DesignPreviewMode, userInitiated = false) => {
    if (userInitiated) {
      modeUserSelectedRef.current = true;
    }
    setModeState(next);
  };

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
    modeUserSelectedRef.current = false;
    setModeState("file");
    if (typeof window === "undefined") return;
    const saved = window.sessionStorage.getItem(storageKey(sessionId, "mode"));
    if (saved === "tunnel" && !htmlLoading && !canFile && canTunnel) {
      modeUserSelectedRef.current = true;
      setModeState("tunnel");
    }
  }, [sessionId]);

  useEffect(() => {
    if (htmlLoading) return;
    if (typeof window !== "undefined") {
      const saved = window.sessionStorage.getItem(storageKey(sessionId, "mode"));
      if (saved === "tunnel" && canFile) {
        window.sessionStorage.removeItem(storageKey(sessionId, "mode"));
      }
    }
    if (commentMode && canFile) {
      setModeState("file");
      return;
    }
    if (modeUserSelectedRef.current) return;
    if (canFile) {
      setModeState("file");
      return;
    }
    if (canTunnel) {
      setModeState("tunnel");
    }
  }, [canFile, canTunnel, commentMode, htmlLoading, sessionId]);

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
    if (typeof window === "undefined" || !modeUserSelectedRef.current) return;
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

  return {
    mode,
    setMode: (next: DesignPreviewMode) => setMode(next, true),
    selectedHtmlPath,
    setSelectedHtmlPath,
    selectedPort,
    setSelectedPort,
    effectiveHtmlPath: selectedHtmlPath ?? defaultHtmlPath,
  };
}

export { buildTunnelPreviewURL };
