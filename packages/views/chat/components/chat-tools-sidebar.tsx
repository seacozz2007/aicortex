"use client";

import { useState } from "react";
import { FileText, Globe, Terminal } from "lucide-react";
import { useArtifactBrowseFeature } from "@aicortex/core/config/features";
import type { ChatSession } from "@aicortex/core/types";
import { cn } from "@aicortex/ui/lib/utils";
import { useT } from "../../i18n";
import { ChatArtifactPanel } from "./chat-artifact-panel";

type ToolsTab = "files" | "terminal" | "web";

export function ChatToolsSidebar({
  session,
}: {
  session: ChatSession | null;
}) {
  const { t } = useT("chat");
  const enabled = useArtifactBrowseFeature();
  const [tab, setTab] = useState<ToolsTab>("files");

  if (!enabled) {
    return null;
  }

  const tabs: { id: ToolsTab; label: string; icon: typeof FileText }[] = [
    { id: "files", label: t(($) => $.tools_sidebar.tabs.files), icon: FileText },
    { id: "terminal", label: t(($) => $.tools_sidebar.tabs.terminal), icon: Terminal },
    { id: "web", label: t(($) => $.tools_sidebar.tabs.web), icon: Globe },
  ];

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
        {tab === "files" ? (
          <ChatArtifactPanel
            taskId={session?.last_task_id}
            hasWorkDir={!!session?.work_dir}
          />
        ) : (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            {t(($) => $.tools_sidebar.coming_soon)}
          </p>
        )}
      </div>
    </aside>
  );
}
