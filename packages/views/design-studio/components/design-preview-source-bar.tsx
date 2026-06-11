"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTunnelScanPorts } from "@aicortex/core/config";
import {
  useRuntimeTunnelFeature,
} from "@aicortex/core/config/features";
import {
  runtimeTunnelKeys,
  useCreateRuntimeTunnel,
  useDeleteRuntimeTunnel,
  useRuntimeTunnels,
} from "@aicortex/core/runtimes/tunnels";
import type { RuntimeTunnel } from "@aicortex/core/types";
import { cn } from "@aicortex/ui/lib/utils";
import { useT } from "../../i18n";

export type DesignPreviewMode = "file" | "tunnel";

export function formatPreviewAddressLabel(input: {
  mode: DesignPreviewMode;
  htmlPath?: string | null;
  port?: number | null;
}): string {
  if (input.mode === "tunnel" && input.port != null) {
    return `localhost:${input.port}`;
  }
  const fileName =
    input.htmlPath?.split("/").pop() ||
    input.htmlPath ||
    "index.html";
  return `file:${fileName}`;
}

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

export function DesignPreviewSourcePanel({
  htmlEntries,
  htmlLoading,
  runtimeId,
  commentMode = false,
  mode,
  onModeChange,
  selectedHtmlPath,
  onHtmlPathChange,
  selectedPort,
  onPortChange,
  onAfterSelect,
  onTunnelConnect,
}: {
  htmlEntries: { path: string; name: string }[];
  htmlLoading: boolean;
  runtimeId?: string;
  commentMode?: boolean;
  mode: DesignPreviewMode;
  onModeChange: (mode: DesignPreviewMode) => void;
  selectedHtmlPath: string | null;
  onHtmlPathChange: (path: string) => void;
  selectedPort: number | null;
  onPortChange: (port: number | null) => void;
  onAfterSelect?: () => void;
  onTunnelConnect?: () => void;
}) {
  const { t } = useT("design");
  const { t: tRuntimes } = useT("runtimes");
  const queryClient = useQueryClient();
  const configuredScanPorts = useTunnelScanPorts();
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
  const [panelTab, setPanelTab] = useState<DesignPreviewMode>(mode);
  const [portActionPending, setPortActionPending] = useState(false);

  useEffect(() => {
    setPanelTab(mode);
  }, [mode]);

  const activeTunnels = useMemo(
    () => tunnels.filter((tunnel) => tunnel.status === "active"),
    [tunnels],
  );

  const quickAddPorts = useMemo(() => {
    const used = new Set(tunnels.map((tunnel) => tunnel.port));
    return configuredScanPorts.filter((port) => !used.has(port));
  }, [configuredScanPorts, tunnels]);

  useEffect(() => {
    if (commentMode && mode !== "file" && canFile) {
      onModeChange("file");
    }
  }, [canFile, commentMode, mode, onModeChange]);

  const handleConnectPort = async (port: number) => {
    if (!runtimeId || portActionPending) return;
    setPortActionPending(true);
    try {
      const existing = activeTunnels.some((tunnel) => tunnel.port === port);
      if (!existing) {
        await createMutation.mutateAsync({ port });
      }
      await queryClient.invalidateQueries({ queryKey: runtimeTunnelKeys.all(runtimeId) });
      await queryClient.refetchQueries({ queryKey: runtimeTunnelKeys.all(runtimeId) });
      onPortChange(port);
      onModeChange("tunnel");
      onTunnelConnect?.();
      onAfterSelect?.();
    } finally {
      setPortActionPending(false);
    }
  };

  const handleDisconnectPort = async (tunnel: RuntimeTunnel) => {
    if (!runtimeId || portActionPending) return;
    setPortActionPending(true);
    try {
      await deleteMutation.mutateAsync(tunnel.id);
      await queryClient.invalidateQueries({ queryKey: runtimeTunnelKeys.all(runtimeId) });
      await queryClient.refetchQueries({ queryKey: runtimeTunnelKeys.all(runtimeId) });
      if (selectedPort === tunnel.port) {
        onPortChange(null);
        if (canFile) {
          onModeChange("file");
        }
      }
    } finally {
      setPortActionPending(false);
    }
  };

  if (!canFile && !canTunnel) {
    return (
      <p className="text-xs text-muted-foreground">{t(($) => $.preview.no_html)}</p>
    );
  }

  return (
    <div className="space-y-3">
      {showModeToggle ? (
        <div className="flex justify-end">
          <ModeToggle mode={panelTab} onModeChange={setPanelTab} />
        </div>
      ) : null}

      {(panelTab === "file" || !canTunnel) && canFile && (
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t(($) => $.preview.select_html)}
          </label>
          {htmlLoading ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {t(($) => $.preview.loading_files)}
            </div>
          ) : (
            <ul className="max-h-48 space-y-0.5 overflow-auto">
              {htmlEntries.map((entry) => {
                const selected = selectedHtmlPath === entry.path;
                return (
                  <li key={entry.path}>
                    <button
                      type="button"
                      onClick={() => {
                        onHtmlPathChange(entry.path);
                        onModeChange("file");
                        onAfterSelect?.();
                      }}
                      className={cn(
                        "flex w-full items-center rounded-md px-2 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-accent hover:text-foreground",
                        selected && "bg-accent font-medium text-foreground",
                      )}
                      aria-current={selected ? "true" : undefined}
                    >
                      {entry.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {panelTab === "tunnel" && canTunnel && runtimeId && (
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t(($) => $.preview.select_port)}
          </label>
          {tunnelsLoading ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {tRuntimes(($) => $.tunnels.loading)}
            </div>
          ) : (
            <div className="space-y-2">
              {activeTunnels.length > 0 ? (
                <ul className="max-h-36 space-y-0.5 overflow-auto">
                  {activeTunnels.map((tunnel) => {
                    const selected =
                      mode === "tunnel" && selectedPort === tunnel.port;
                    return (
                      <li key={tunnel.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={portActionPending}
                          onClick={() => void handleConnectPort(tunnel.port)}
                          className={cn(
                            "min-w-0 flex-1 rounded-md px-2 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60",
                            selected && "bg-accent font-medium text-foreground",
                          )}
                          aria-current={selected ? "true" : undefined}
                        >
                          {tunnel.title} :{tunnel.port}
                        </button>
                        <button
                          type="button"
                          disabled={portActionPending}
                          onClick={() => void handleDisconnectPort(tunnel)}
                          className="shrink-0 rounded-md px-2 py-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
                        >
                          {t(($) => $.preview.disconnect_port, { port: tunnel.port })}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {t(($) => $.preview.no_ports)}
                </p>
              )}

              {quickAddPorts.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {tRuntimes(($) => $.tunnels.add_action)}
                  </p>
                  <ul className="flex flex-wrap gap-1">
                    {quickAddPorts.map((port) => (
                      <li key={port}>
                        <button
                          type="button"
                          disabled={portActionPending}
                          onClick={() => void handleConnectPort(port)}
                          className="rounded-md border px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                        >
                          :{port}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
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
