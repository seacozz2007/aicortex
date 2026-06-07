"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Trash2 } from "lucide-react";
import {
  useArtifactBrowseFeature,
  useRuntimeTunnelFeature,
} from "@aicortex/core/config/features";
import { useTaskArtifacts } from "@aicortex/core/artifacts/queries";
import { useWorkspaceSlug } from "@aicortex/core/paths";
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
import { ChatHtmlFilePreview } from "./chat-html-file-preview";

const DEFAULT_HTML_PATH = "index.html";

function buildTunnelPreviewURL(
  runtimeId: string,
  port: number,
  workspaceSlug: string,
): string {
  const params = new URLSearchParams({ workspace_slug: workspaceSlug });
  return `/api/runtimes/${runtimeId}/tunnel/${port}/?${params.toString()}`;
}

type WebPreviewMode = "static" | "tunnel";

export function ChatWebPanel({
  runtimeId,
  taskId,
  hasWorkDir,
}: {
  runtimeId?: string;
  taskId?: string | null;
  hasWorkDir?: boolean;
}) {
  const { t } = useT("chat");
  const { t: tRuntimes } = useT("runtimes");
  const workspaceSlug = useWorkspaceSlug();
  const artifactEnabled = useArtifactBrowseFeature();
  const tunnelEnabled = useRuntimeTunnelFeature();

  const canStatic =
    artifactEnabled && !!taskId && !!hasWorkDir && !!workspaceSlug;
  const canTunnel = tunnelEnabled && !!runtimeId;

  const [mode, setMode] = useState<WebPreviewMode>(
    canStatic ? "static" : "tunnel",
  );

  useEffect(() => {
    if (mode === "static" && !canStatic && canTunnel) {
      setMode("tunnel");
    } else if (mode === "tunnel" && !canTunnel && canStatic) {
      setMode("static");
    }
  }, [mode, canStatic, canTunnel]);

  const { data: rootListing, isLoading: rootLoading } = useTaskArtifacts(
    taskId ?? null,
    "",
    canStatic,
  );

  const hasIndexHtml = useMemo(
    () =>
      (rootListing?.entries ?? []).some(
        (entry) => !entry.is_dir && entry.name.toLowerCase() === "index.html",
      ),
    [rootListing],
  );

  const { data: tunnels = [], isLoading: tunnelsLoading } = useRuntimeTunnels(
    runtimeId ?? "",
    canTunnel && !!runtimeId,
  );
  const createMutation = useCreateRuntimeTunnel(runtimeId ?? "");
  const deleteMutation = useDeleteRuntimeTunnel(runtimeId ?? "");
  const [port, setPort] = useState("5173");
  const [previewPort, setPreviewPort] = useState<number | null>(null);

  const handleCreate = () => {
    if (!runtimeId) return;
    const parsed = Number.parseInt(port, 10);
    if (!Number.isFinite(parsed)) return;
    createMutation.mutate(
      { port: parsed },
      {
        onSuccess: (tunnel: RuntimeTunnel) => {
          setPreviewPort(tunnel.port);
        },
      },
    );
  };

  const activeTunnels = tunnels.filter((tunnel) => tunnel.status === "active");
  const activePreview =
    previewPort ??
    (activeTunnels.length > 0 ? activeTunnels[0]!.port : null);
  const tunnelPreviewURL =
    canTunnel &&
    runtimeId &&
    activePreview != null &&
    workspaceSlug
      ? buildTunnelPreviewURL(runtimeId, activePreview, workspaceSlug)
      : null;

  if (!canStatic && !canTunnel) {
    return (
      <p className="px-3 py-4 text-xs text-muted-foreground">
        {t(($) => $.tools_sidebar.web.disabled)}
      </p>
    );
  }

  const showStaticPreview =
    mode === "static" && canStatic && taskId && workspaceSlug && !rootLoading && hasIndexHtml;
  const showTunnelPreview = mode === "tunnel" && !!tunnelPreviewURL;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {canStatic && canTunnel && (
        <div className="flex shrink-0 gap-1 border-b p-2">
          <button
            type="button"
            onClick={() => setMode("static")}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs transition-colors",
              mode === "static"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60",
            )}
          >
            {t(($) => $.tools_sidebar.web.mode_static)}
          </button>
          <button
            type="button"
            onClick={() => setMode("tunnel")}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs transition-colors",
              mode === "tunnel"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60",
            )}
          >
            {t(($) => $.tools_sidebar.web.mode_tunnel)}
          </button>
        </div>
      )}

      {mode === "static" && canStatic && (
        <div className="shrink-0 border-b px-2 py-1.5">
          <p className="text-[11px] text-muted-foreground">
            {t(($) => $.tools_sidebar.web.static_hint)}
          </p>
          {rootLoading ? (
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t(($) => $.tools_sidebar.web.checking_index)}
            </div>
          ) : !hasIndexHtml ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t(($) => $.tools_sidebar.web.index_missing)}
            </p>
          ) : null}
        </div>
      )}

      {mode === "tunnel" && canTunnel && runtimeId && (
        <div className="shrink-0 space-y-2 border-b p-2">
          <p className="text-[11px] text-muted-foreground">
            {t(($) => $.tools_sidebar.web.tunnel_hint)}
          </p>
          <div className="flex items-center gap-2">
            <Input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              inputMode="numeric"
              placeholder={tRuntimes(($) => $.tunnels.port_placeholder)}
              className="h-8 font-mono text-xs"
            />
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                tRuntimes(($) => $.tunnels.add_action)
              )}
            </Button>
          </div>

          {tunnelsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {tRuntimes(($) => $.tunnels.loading)}
            </div>
          ) : tunnels.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {tRuntimes(($) => $.tunnels.empty)}
            </p>
          ) : (
            <div className="max-h-28 space-y-1 overflow-auto">
              {tunnels.map((tunnel: RuntimeTunnel) => {
                const isActive = tunnel.status === "active";
                return (
                  <div
                    key={tunnel.id}
                    className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => isActive && setPreviewPort(tunnel.port)}
                      disabled={!isActive}
                    >
                      <div className="truncate text-xs font-medium">{tunnel.title}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        :{tunnel.port}
                      </div>
                    </button>
                    <div className="flex items-center gap-0.5">
                      {workspaceSlug && isActive && (
                        <a
                          href={buildTunnelPreviewURL(runtimeId, tunnel.port, workspaceSlug)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                          aria-label={tRuntimes(($) => $.tunnels.open_external)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => deleteMutation.mutate(tunnel.id)}
                        disabled={deleteMutation.isPending}
                        aria-label={tRuntimes(($) => $.tunnels.delete_aria)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 bg-muted/20">
        {showStaticPreview ? (
          <ChatHtmlFilePreview
            path={DEFAULT_HTML_PATH}
            taskId={taskId}
            workspaceSlug={workspaceSlug}
          />
        ) : showTunnelPreview ? (
          <iframe
            key={tunnelPreviewURL}
            title={tRuntimes(($) => $.tunnels.preview_frame_title)}
            src={tunnelPreviewURL}
            className="h-full w-full bg-background"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : mode === "static" && !rootLoading && !hasIndexHtml ? (
          <p className="p-4 text-xs text-muted-foreground">
            {t(($) => $.tools_sidebar.web.index_missing)}
          </p>
        ) : mode === "tunnel" ? (
          <p className="p-4 text-xs text-muted-foreground">
            {t(($) => $.tools_sidebar.web.select_port)}
          </p>
        ) : (
          <div className="flex h-full items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t(($) => $.tools_sidebar.web.checking_index)}
          </div>
        )}
      </div>
    </div>
  );
}
