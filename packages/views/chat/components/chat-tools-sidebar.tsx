"use client";

import { FileText } from "lucide-react";
import { useArtifactBrowseFeature } from "@aicortex/core/config/features";
import type { ChatSession } from "@aicortex/core/types";
import { useT } from "../../i18n";
import { ChatArtifactPanel } from "./chat-artifact-panel";

export function ChatToolsSidebar({
  session,
}: {
  session: ChatSession | null;
}) {
  const { t } = useT("chat");
  const artifactEnabled = useArtifactBrowseFeature();

  if (!artifactEnabled) {
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
        <FileText className="size-4 mr-1.5 text-muted-foreground" />
        <span className="text-sm font-medium">{t(($) => $.tools_sidebar.tabs.files)}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ChatArtifactPanel
          taskId={session?.last_task_id}
          hasWorkDir={!!session?.work_dir}
        />
      </div>
    </aside>
  );
}
