"use client";

import { useState } from "react";
import { useT } from "../../i18n";
import { DesignHtmlPreview, type PreviewCommentHandler } from "./design-html-preview";
import { DesignPreviewBrowserChrome } from "./design-preview-browser-chrome";
import {
  buildTunnelPreviewURL,
  DesignPreviewSourcePanel,
  formatPreviewAddressLabel,
  type DesignPreviewMode,
} from "./design-preview-source-bar";
import type { QueuedPreviewComment } from "./design-comment-queue-panel";
import type { MarkAnnotationAction, SelectedPreviewElement } from "../lib/preview-element";

export type StudioPreviewSource = {
  mode: DesignPreviewMode;
  setMode: (mode: DesignPreviewMode) => void;
  selectedHtmlPath: string | null;
  setSelectedHtmlPath: (path: string) => void;
  selectedPort: number | null;
  setSelectedPort: (port: number | null) => void;
  effectiveHtmlPath: string | null;
};

export function DesignToolsPreviewPanel({
  taskId,
  workspaceSlug,
  runtimeId,
  htmlEntries,
  htmlLoading,
  previewSource,
  commentMode = false,
  onCommentModeChange,
  designEnabled,
  sendDisabled = false,
  onSendToChat,
  onQueueComment,
  onPropertySave,
  onMarkAnnotation,
  queuedComments = [],
  onRemoveQueuedComment,
  onClearQueuedComments,
  onSendQueue,
  queueSending = false,
}: {
  taskId: string;
  workspaceSlug: string;
  runtimeId?: string;
  htmlEntries: { path: string; name: string }[];
  htmlLoading: boolean;
  previewSource: StudioPreviewSource;
  designEnabled?: boolean;
  commentMode?: boolean;
  onCommentModeChange?: (enabled: boolean) => void;
  sendDisabled?: boolean;
  onSendToChat?: PreviewCommentHandler;
  onQueueComment?: PreviewCommentHandler;
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
}) {
  const { t } = useT("design");
  const [tunnelReloadKey, setTunnelReloadKey] = useState(0);
  const showDesignControls = designEnabled ?? !!onCommentModeChange;

  const previewSourceProps = {
    mode: previewSource.mode,
    setMode: previewSource.setMode,
    selectedHtmlPath: previewSource.selectedHtmlPath,
    setSelectedHtmlPath: previewSource.setSelectedHtmlPath,
    selectedPort: previewSource.selectedPort,
    setSelectedPort: previewSource.setSelectedPort,
  };

  const renderSourcePanel = (close: () => void) => (
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
      onTunnelConnect={() => setTunnelReloadKey((key) => key + 1)}
    />
  );

  const canPickSource = htmlEntries.length > 0 || !!runtimeId;

  if (previewSource.mode === "file" && previewSource.effectiveHtmlPath) {
    return (
      <div className="min-h-0 flex-1">
        <DesignHtmlPreview
          path={previewSource.effectiveHtmlPath}
          taskId={taskId}
          workspaceSlug={workspaceSlug}
          commentMode={commentMode}
          onCommentModeChange={onCommentModeChange}
          previewSource={previewSourceProps}
          htmlEntries={htmlEntries}
          htmlLoading={htmlLoading}
          runtimeId={runtimeId}
          sendDisabled={sendDisabled}
          onSendToChat={onSendToChat}
          onQueueComment={onQueueComment}
          onPropertySave={onPropertySave}
          onMarkAnnotation={onMarkAnnotation}
          queuedComments={queuedComments}
          onRemoveQueuedComment={onRemoveQueuedComment}
          onClearQueuedComments={onClearQueuedComments}
          onSendQueue={onSendQueue}
          queueSending={queueSending}
          onTunnelConnect={() => setTunnelReloadKey((key) => key + 1)}
        />
      </div>
    );
  }

  if (previewSource.mode === "tunnel" && runtimeId && previewSource.selectedPort != null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-muted/20">
        <DesignPreviewBrowserChrome
          addressText={formatPreviewAddressLabel({
            mode: "tunnel",
            port: previewSource.selectedPort,
          })}
          externalHref={buildTunnelPreviewURL(
            runtimeId,
            previewSource.selectedPort,
            workspaceSlug,
          )}
          onRefresh={() => setTunnelReloadKey((key) => key + 1)}
          commentMode={commentMode}
          onCommentModeChange={onCommentModeChange}
          designEnabled={showDesignControls}
          sourcePanel={canPickSource ? renderSourcePanel : undefined}
        />
        <iframe
          key={`${buildTunnelPreviewURL(runtimeId, previewSource.selectedPort, workspaceSlug)}-${tunnelReloadKey}`}
          title={t(($) => $.preview.frame_title)}
          src={buildTunnelPreviewURL(runtimeId, previewSource.selectedPort, workspaceSlug)}
          className="min-h-0 flex-1 bg-background"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DesignPreviewBrowserChrome
        addressText={formatPreviewAddressLabel({
          mode: previewSource.mode,
          htmlPath: previewSource.selectedHtmlPath,
          port: previewSource.selectedPort,
        })}
        commentMode={commentMode}
        onCommentModeChange={onCommentModeChange}
        designEnabled={showDesignControls}
        sourcePanel={canPickSource ? renderSourcePanel : undefined}
      />
      <p className="p-4 text-xs text-muted-foreground">
        {previewSource.mode === "tunnel"
          ? t(($) => $.preview.no_ports)
          : t(($) => $.preview.no_html)}
      </p>
    </div>
  );
}
