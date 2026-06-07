"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Trash2 } from "lucide-react";
import { useRuntimeTunnelFeature } from "@aicortex/core/config/features";
import { useWorkspaceSlug } from "@aicortex/core/paths";
import {
  useCreateRuntimeTunnel,
  useDeleteRuntimeTunnel,
  useRuntimeTunnels,
} from "@aicortex/core/runtimes/tunnels";
import type { RuntimeTunnel } from "@aicortex/core/types";
import { Button } from "@aicortex/ui/components/ui/button";
import { Input } from "@aicortex/ui/components/ui/input";
import { useT } from "../../i18n";

function buildTunnelPreviewURL(
  runtimeId: string,
  port: number,
  workspaceSlug: string,
): string {
  const params = new URLSearchParams({ workspace_slug: workspaceSlug });
  return `/api/runtimes/${runtimeId}/tunnel/${port}/?${params.toString()}`;
}

export function RuntimeTunnelPanel({
  runtimeId,
  canManage,
}: {
  runtimeId: string;
  canManage: boolean;
}) {
  const { t } = useT("runtimes");
  const workspaceSlug = useWorkspaceSlug();
  const enabled = useRuntimeTunnelFeature();
  const { data: tunnels = [], isLoading } = useRuntimeTunnels(runtimeId, enabled);
  const createMutation = useCreateRuntimeTunnel(runtimeId);
  const deleteMutation = useDeleteRuntimeTunnel(runtimeId);
  const [port, setPort] = useState("5173");
  const [previewPort, setPreviewPort] = useState<number | null>(null);

  if (!enabled) {
    return null;
  }

  const handleCreate = () => {
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
  const previewURL =
    activePreview != null && workspaceSlug
      ? buildTunnelPreviewURL(runtimeId, activePreview, workspaceSlug)
      : null;

  return (
    <div className="rounded-lg border">
      <div className="border-b px-4 py-2.5">
        <span className="text-xs font-semibold">{t(($) => $.tunnels.title)}</span>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(($) => $.tunnels.hint)}
        </p>
      </div>

      <div className="space-y-3 p-4">
        {canManage && (
          <div className="flex items-center gap-2">
            <Input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              inputMode="numeric"
              placeholder={t(($) => $.tunnels.port_placeholder)}
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
                t(($) => $.tunnels.add_action)
              )}
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t(($) => $.tunnels.loading)}
          </div>
        ) : tunnels.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t(($) => $.tunnels.empty)}</p>
        ) : (
          <div className="space-y-2">
            {tunnels.map((tunnel: RuntimeTunnel) => {
              const isActive = tunnel.status === "active";
              return (
              <div
                key={tunnel.id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => isActive && setPreviewPort(tunnel.port)}
                  disabled={!isActive}
                >
                  <div className="flex items-center gap-2">
                    <div className="truncate text-xs font-medium">{tunnel.title}</div>
                    {!isActive && (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {t(($) => $.tunnels.status_disabled)}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    :{tunnel.port}
                  </div>
                </button>
                <div className="flex items-center gap-1">
                  {workspaceSlug && isActive && (
                    <a
                      href={buildTunnelPreviewURL(runtimeId, tunnel.port, workspaceSlug)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label={t(($) => $.tunnels.open_external)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => deleteMutation.mutate(tunnel.id)}
                      disabled={deleteMutation.isPending}
                      aria-label={t(($) => $.tunnels.delete_aria)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
            })}
          </div>
        )}

        {previewURL && (
          <div className="overflow-hidden rounded-md border bg-muted/20">
            <iframe
              title={t(($) => $.tunnels.preview_frame_title)}
              src={previewURL}
              className="h-72 w-full bg-background"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
        )}
      </div>
    </div>
  );
}
