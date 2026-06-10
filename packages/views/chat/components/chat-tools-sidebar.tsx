"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Globe, Terminal } from "lucide-react";
import {
  useArtifactBrowseFeature,
  useRuntimeTunnelFeature,
} from "@aicortex/core/config/features";
import { useWorkspaceExploreEnabled } from "@aicortex/core/workspace/hooks";
import type { ChatSession } from "@aicortex/core/types";
import { cn } from "@aicortex/ui/lib/utils";
import { useT } from "../../i18n";
import { ChatArtifactPanel } from "./chat-artifact-panel";
import { ChatTerminalPanel } from "./chat-terminal-panel";
import { ChatWebPanel } from "./chat-web-panel";

type ToolsTab = "files" | "terminal" | "web";

export function ChatToolsSidebar({
  session,
}: {
  session: ChatSession | null;
}) {
  const { t } = useT("chat");
  const artifactEnabled = useArtifactBrowseFeature();
  const tunnelEnabled = useRuntimeTunnelFeature();
  const exploreEnabled = useWorkspaceExploreEnabled();
  const runtimeId = session?.runtime_id;
  const [tab, setTab] = useState<ToolsTab>("files");

  const tabs = useMemo(() => {
    const result: { id: ToolsTab; label: string; icon: typeof FileText }[] = [];
    if (artifactEnabled) {
      result.push({
        id: "files",
        label: t(($) => $.tools_sidebar.tabs.files),
        icon: FileText,
      });
    }
    if (exploreEnabled && runtimeId) {
      result.push({
        id: "terminal",
        label: t(($) => $.tools_sidebar.tabs.terminal),
        icon: Terminal,
      });
    }
    const canWebStatic =
      artifactEnabled && !!session?.last_task_id && !!session?.work_dir;
    const canWebTunnel = tunnelEnabled && !!runtimeId;
    if (canWebStatic || canWebTunnel) {
      result.push({
        id: "web",
        label: t(($) => $.tools_sidebar.tabs.web),
        icon: Globe,
      });
    }
    return result;
  }, [artifactEnabled, exploreEnabled, tunnelEnabled, runtimeId, session?.last_task_id, session?.work_dir, t]);

  useEffect(() => {
    if (tabs.length === 0) return;
    if (!tabs.some((item) => item.id === tab)) {
      setTab(tabs[0]!.id);
    }
  }, [tabs, tab]);

  if (tabs.length === 0) {
    return (
      <aside className="flex h-full min-h-0 min-w-0 flex-col bg-sidebar">
        <div className="flex h-10 shrink-0 items-center border-b px-3">
          <span className="text-sm font-medium">{t(($) => $.tools_sidebar.title)}</span>
        </div>
        <p className="px-3 py-4 text-xs text-muted-foreground">
          {t(($) => $.tools_sidebar.unavailable)}
        </p>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col bg-sidebar">
      <div className="flex h-10 shrink-0 items-center border-b px-3">
        <span className="text-sm font-medium">{t(($) => $.tools_sidebar.title)}</span>
      </div>

      <div className="flex shrink-0 gap-1 border-b p-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors",
              tab === id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
            title={label}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "files" && artifactEnabled && (
          <ChatArtifactPanel
            taskId={session?.last_task_id}
            hasWorkDir={!!session?.work_dir}
          />
        )}
        {tab === "terminal" && runtimeId && session && (
          <ChatTerminalPanel
            chatSessionId={session.id}
            runtimeId={runtimeId}
            workDir={session.work_dir}
            sessionTitle={session.title}
          />
        )}
        {tab === "terminal" && !runtimeId && (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            {t(($) => $.tools_sidebar.terminal.no_runtime)}
          </p>
        )}
        {tab === "web" && (
          <ChatWebPanel
            runtimeId={runtimeId}
            taskId={session?.last_task_id}
            hasWorkDir={!!session?.work_dir}
          />
        )}
      </div>
    </aside>
  );
}
