"use client";

import { useEffect, useMemo, useState } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, Globe, PanelRight, Terminal } from "lucide-react";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { useWorkspacePaths, useWorkspaceSlug } from "@aicortex/core/paths";
import { chatMessagesOptions, pendingChatTaskOptions, chatSessionsOptions } from "@aicortex/core/chat/queries";
import { useMarkChatSessionRead } from "@aicortex/core/chat/mutations";
import { useAgentPresenceDetail } from "@aicortex/core/agents";
import { useArtifactBrowseFeature } from "@aicortex/core/config/features";
import { useTaskArtifacts } from "@aicortex/core/artifacts/queries";
import { cn } from "@aicortex/ui/lib/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@aicortex/ui/components/ui/resizable";
import { AppLink } from "../../navigation";
import { useT } from "../../i18n";
import { isHtmlArtifact } from "../../chat/components/chat-artifact-url";
import { ArtifactHtmlPreview } from "../../shared/artifact-preview";
import { ChatTerminalPanel } from "../../chat/components/chat-terminal-panel";
import { ChatArtifactPanel } from "../../chat/components/chat-artifact-panel";

type ToolsTab = "preview" | "files";

export function DevStudioSession({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string;
}) {
  const { t } = useT("dev-studio");
  const wsId = useWorkspaceId();
  const workspaceSlug = useWorkspaceSlug() ?? "";
  const p = useWorkspacePaths();
  const markRead = useMarkChatSessionRead();
  const artifactBrowseEnabled = useArtifactBrowseFeature();

  // Chat session data
  const { data: chatSessions = [] } = useQuery(chatSessionsOptions(wsId));

  // Messages and pending task
  const { data: rawMessages = [] } = useQuery(chatMessagesOptions(sessionId));
  const messages = rawMessages;
  const { data: pendingTask } = useQuery(pendingChatTaskOptions(sessionId));

  // Determine last task ID from pending task or messages
  const pendingTaskId = pendingTask?.task_id;
  const lastTaskId = useMemo(() => {
    if (pendingTaskId && !pendingTaskId.startsWith("optimistic-")) {
      return pendingTaskId;
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role === "assistant" && m.task_id && !m.task_id.startsWith("optimistic-")) {
        return m.task_id;
      }
    }
    return null;
  }, [messages, pendingTaskId]);

  // Get runtime_id and work_dir from the chat session
  const chatSession = chatSessions.find((s) => s.id === sessionId);
  const runtimeId = chatSession?.runtime_id ?? null;
  const workDir = chatSession?.work_dir ?? null;

  // Agent presence
  const agentId = chatSession?.agent_id;
  const presenceDetail = useAgentPresenceDetail(wsId, agentId);
  const availability =
    presenceDetail === "loading" ? undefined : presenceDetail?.availability;

  // Tools sidebar state
  const [toolsOpen, setToolsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<ToolsTab>("preview");
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "aicortex_dev_studio_layout",
    storage: typeof window === "undefined" ? undefined : localStorage,
  });

  // Mark as read on mount
  useEffect(() => {
    if (sessionId) {
      void markRead.mutateAsync(sessionId).catch(() => {});
    }
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Artifact data for preview/files
  const { data: rootListing } = useTaskArtifacts(
    lastTaskId ?? null,
    "",
    artifactBrowseEnabled && !!lastTaskId,
  );

  const htmlEntries = useMemo(
    () =>
      (rootListing?.entries ?? [])
        .filter((entry) => !entry.is_dir && isHtmlArtifact(entry.path))
        .map((entry) => ({ path: entry.path, name: entry.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rootListing?.entries],
  );

  const previewHtmlPath = htmlEntries.length > 0 ? htmlEntries[0]!.path : null;
  const showPreview = artifactBrowseEnabled && !!lastTaskId && !!workspaceSlug;

  const chatSessionTitle = chatSession?.title;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
        <AppLink
          href={p.projectDev(projectId)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t(($) => $.session.back)}
        </AppLink>
        <span className="text-sm font-medium truncate">{chatSessionTitle}</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setToolsOpen((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent",
              toolsOpen && "bg-accent",
            )}
          >
            <PanelRight className="size-3.5" />
            {t(($) => $.session.tabs_preview)}
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex min-h-0 flex-1">
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          {/* Left: Terminal */}
          <ResizablePanel defaultSize={toolsOpen ? 55 : 100} minSize={35}>
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 items-center gap-2 border-b bg-muted/20 px-3 py-1.5">
                <Terminal className="size-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {t(($) => $.session.terminal_hint)}
                </span>
              </div>
              {runtimeId ? (
                <div className="min-h-0 flex-1">
                  <ChatTerminalPanel
                    chatSessionId={sessionId}
                    runtimeId={runtimeId}
                    workDir={workDir ?? undefined}
                    sessionTitle={chatSessionTitle}
                  />
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center bg-[#1a1b26]">
                  <p className="text-xs text-muted-foreground">
                    {t(($) => $.session.terminal_connecting)}
                    {availability === "offline" && (
                      <span className="ml-1 text-warning">(agent offline)</span>
                    )}
                  </p>
                </div>
              )}
            </div>
          </ResizablePanel>

          {/* Right: Tools sidebar */}
          {toolsOpen && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={45} minSize={25}>
                <aside className="flex h-full min-h-0 min-w-0 flex-col bg-sidebar">
                  {/* Tab bar */}
                  <div className="flex h-10 shrink-0 items-center border-b px-2">
                    <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
                      {([
                        { id: "preview" as ToolsTab, label: t(($) => $.session.tabs_preview), icon: Globe },
                        { id: "files" as ToolsTab, label: t(($) => $.session.tabs_files), icon: FileText },
                      ]).map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setActiveTab(item.id)}
                            className={cn(
                              "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                              activeTab === item.id
                                ? "bg-accent text-foreground"
                                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                            )}
                          >
                            <Icon className="size-3.5" />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tab content */}
                  <div className="flex min-h-0 flex-1 flex-col">
                    {activeTab === "preview" && (
                      <div className="flex min-h-0 flex-1 flex-col">
                        {showPreview && previewHtmlPath && lastTaskId ? (
                          <div className="min-h-0 flex-1">
                            <ArtifactHtmlPreview
                              taskId={lastTaskId}
                              path={previewHtmlPath}
                              workspaceSlug={workspaceSlug}
                            />
                          </div>
                        ) : (
                          <div className="flex flex-1 items-center justify-center p-4 text-center">
                            <p className="text-xs text-muted-foreground">
                              {t(($) => $.session.preview_unavailable)}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    {activeTab === "files" && (
                      <div className="flex min-h-0 flex-1 flex-col">
                        {lastTaskId ? (
                          <div className="min-h-0 flex-1">
                            <ChatArtifactPanel
                              taskId={lastTaskId}
                              hasWorkDir={!!workDir || !!lastTaskId}
                            />
                          </div>
                        ) : (
                          <div className="flex flex-1 items-center justify-center p-4 text-center">
                            <p className="text-xs text-muted-foreground">
                              {t(($) => $.session.files_empty)}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </aside>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
