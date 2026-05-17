"use client";

import { useState } from "react";
import { GitCommitHorizontal, FolderSync, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@aicortex/ui/components/ui/card";
import { Switch } from "@aicortex/ui/components/ui/switch";
import { Label } from "@aicortex/ui/components/ui/label";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentWorkspace } from "@aicortex/core/paths";
import { workspaceKeys } from "@aicortex/core/workspace/queries";
import { api } from "@aicortex/core/api";
import type { Workspace } from "@aicortex/core/types";
import { useT } from "../../i18n";

export function LabsTab() {
  const { t } = useT("settings");
  const workspace = useCurrentWorkspace();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const settings = (workspace?.settings as Record<string, unknown>) ?? {};
  const coAuthoredByEnabled = settings.co_authored_by_enabled !== false;
  const pinnedProjectWorkdirEnabled = settings.pinned_project_workdir === true;
  const forumEnabled = settings.forum_enabled === true;

  const updateSetting = async (key: string, value: unknown) => {
    if (!workspace || saving) return;
    setSaving(true);
    try {
      const updated = await api.updateWorkspace(workspace.id, {
        settings: { ...settings, [key]: value },
      });
      qc.setQueryData(workspaceKeys.list(), (old: Workspace[] | undefined) =>
        old?.map((ws) => (ws.id === updated.id ? updated : ws)),
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t(($) => $.labs.toast_failed),
      );
    } finally {
      setSaving(false);
    }
  };

  if (!workspace) return null;

  return (
    <div className="space-y-4">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">{t(($) => $.labs.section_git)}</h2>

        <Card>
          <CardContent>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md border bg-muted/50 p-2 text-muted-foreground">
                  <GitCommitHorizontal className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="co-authored-by"
                    className="text-sm font-medium"
                  >
                    {t(($) => $.labs.co_authored_by_label)}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t(($) => $.labs.co_authored_by_description_prefix)}{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      {"Co-authored-by: aicortex-agent <github@aicortex.ai>"}
                    </code>{" "}
                    {t(($) => $.labs.co_authored_by_description_suffix)}
                  </p>
                </div>
              </div>
              <Switch
                id="co-authored-by"
                checked={coAuthoredByEnabled}
                onCheckedChange={(checked) => updateSetting("co_authored_by_enabled", checked)}
                disabled={saving}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md border bg-muted/50 p-2 text-muted-foreground">
                  <FolderSync className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="pinned-project-workdir"
                    className="text-sm font-medium"
                  >
                    {t(($) => $.labs.pinned_workdir_label)}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t(($) => $.labs.pinned_workdir_description)}
                  </p>
                </div>
              </div>
              <Switch
                id="pinned-project-workdir"
                checked={pinnedProjectWorkdirEnabled}
                onCheckedChange={(checked) => updateSetting("pinned_project_workdir", checked)}
                disabled={saving}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">社交</h2>

        <Card>
          <CardContent>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md border bg-muted/50 p-2 text-muted-foreground">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="forum-enabled"
                    className="text-sm font-medium"
                  >
                    Agent 论坛
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Agent 完成任务时自动发帖，根据性格生成拟人化动态。开启后顶部导航出现 Forum 入口。
                  </p>
                </div>
              </div>
              <Switch
                id="forum-enabled"
                checked={forumEnabled}
                onCheckedChange={(checked) => updateSetting("forum_enabled", checked)}
                disabled={saving}
              />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
