"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Palette } from "lucide-react";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { useWorkspacePaths } from "@aicortex/core/paths";
import { projectDetailOptions } from "@aicortex/core/projects/queries";
import { agentListOptions } from "@aicortex/core/workspace/queries";
import {
  designSessionsOptions,
  designSystemResourcesOptions,
  designSettingsOptions,
} from "@aicortex/core/design/queries";
import { DESIGN_TEMPLATES, type DesignTemplate } from "@aicortex/core/design";
import { api } from "@aicortex/core/api";
import { useCreateDesignSession } from "@aicortex/core/design/mutations";
import type { DesignMode, ProjectResource } from "@aicortex/core/types";
import { cn } from "@aicortex/ui/lib/utils";
import { AppLink } from "../../navigation";
import { useT } from "../../i18n";

const MODES: DesignMode[] = ["prototype", "deck", "template", "design_system"];

export function DesignStudioHub({ projectId }: { projectId: string }) {
  const { t } = useT("design");
  const wsId = useWorkspaceId();
  const p = useWorkspacePaths();
  const { data: project } = useQuery(projectDetailOptions(wsId, projectId));
  const { data: sessions = [] } = useQuery(designSessionsOptions(wsId, projectId));
  const { data: designSystems = [] as ProjectResource[] } = useQuery(
    designSystemResourcesOptions(wsId, projectId),
  );
  const { data: designSettings } = useQuery(designSettingsOptions(wsId));
  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const createSession = useCreateDesignSession(wsId, projectId);

  const [mode, setMode] = useState<DesignMode>("prototype");
  const [designSystemId, setDesignSystemId] = useState("");
  const [designSkillId, setDesignSkillId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [brief, setBrief] = useState("");

  const hasDesignSystem = designSystems.length > 0;
  const designAgent = agents.find((a) => a.id === designSettings?.default_design_agent_id);
  const designSkills = designAgent?.skills ?? [];
  const visibleTemplates = useMemo(
    () => DESIGN_TEMPLATES.filter((tpl) => tpl.mode === mode || mode === "template"),
    [mode],
  );
  async function handleCreate() {
    const trimmedBrief = brief.trim();
    const selectedTemplate = DESIGN_TEMPLATES.find((tpl: DesignTemplate) => tpl.id === selectedTemplateId);
    const session = await createSession.mutateAsync({
      design_mode: selectedTemplate?.mode ?? mode,
      design_skill_id: designSkillId || undefined,
      design_system_resource_id: designSystemId || undefined,
      artifact_entry: selectedTemplate?.artifact_entry,
      title: trimmedBrief.slice(0, 80) || selectedTemplate?.title || t(($) => $.hub.default_title),
    });
    const message = trimmedBrief || selectedTemplate?.brief;
    if (message) {
      await api.sendChatMessage(session.id, message);
    }
    window.location.href = p.projectDesignSession(projectId, session.id);
  }

  function applyTemplate(templateId: string) {
    const tpl = DESIGN_TEMPLATES.find((item: DesignTemplate) => item.id === templateId);
    if (!tpl) return;
    setSelectedTemplateId(templateId);
    setMode(tpl.mode);
    if (!brief.trim()) {
      setBrief(tpl.brief);
    }
  }
  const modeLabels = useMemo(
    () =>
      Object.fromEntries(MODES.map((m) => [m, t(($) => $.modes[m])])) as Record<DesignMode, string>,
    [t],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b px-6 py-4">
        <Palette className="size-5 text-brand" />
        <div>
          <h1 className="text-lg font-semibold">{t(($) => $.hub.title)}</h1>
          <p className="text-sm text-muted-foreground">
            {project?.title ?? projectId}
          </p>
        </div>
        <AppLink
          href={p.projectDetail(projectId)}
          className="ml-auto text-sm text-muted-foreground hover:text-foreground"
        >
          {t(($) => $.hub.back_to_project)}
        </AppLink>
      </header>

      <div className="grid min-h-0 flex-1 gap-6 overflow-auto p-6 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-medium">{t(($) => $.hub.new_design)}</h2>
          {!hasDesignSystem && (
            <p className="mb-3 text-sm text-amber-600 dark:text-amber-400">
              {t(($) => $.hub.no_design_system_hint)}{" "}
              <AppLink
                href={p.projectDetail(projectId)}
                className="underline hover:text-foreground"
              >
                {t(($) => $.hub.add_design_system_link)}
              </AppLink>
            </p>
          )}
          {designAgent && (
            <p className="mb-3 text-xs text-muted-foreground">
              {t(($) => $.hub.design_agent, { name: designAgent.name })}
            </p>
          )}
          <div className="mb-3 flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  mode === m
                    ? "border-brand bg-brand/10 text-brand"
                    : "hover:bg-accent",
                )}
              >
                {modeLabels[m]}
              </button>
            ))}
          </div>
          {hasDesignSystem && (
            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-muted-foreground">
                {t(($) => $.hub.design_system)}
              </span>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={designSystemId}
                onChange={(e) => setDesignSystemId(e.target.value)}
              >
                <option value="">{t(($) => $.hub.select_design_system)}</option>
                {designSystems.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.label ?? (ds.resource_ref as { name?: string })?.name ?? ds.id}
                  </option>
                ))}
              </select>
            </label>
          )}
          {designSkills.length > 0 && (
            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-muted-foreground">
                {t(($) => $.hub.skill)}
              </span>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={designSkillId}
                onChange={(e) => setDesignSkillId(e.target.value)}
              >
                <option value="">{t(($) => $.hub.select_skill)}</option>
                {designSkills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(mode === "template" || visibleTemplates.length > 0) && (
            <div className="mb-3">
              <span className="mb-1 block text-sm text-muted-foreground">
                {t(($) => $.hub.templates)}
              </span>
              <div className="grid gap-2 sm:grid-cols-2">
                {visibleTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl.id)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      selectedTemplateId === tpl.id
                        ? "border-brand bg-brand/10"
                        : "hover:bg-accent",
                    )}
                  >
                    <span className="font-medium">{tpl.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {tpl.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-muted-foreground">{t(($) => $.hub.brief)}</span>
            <textarea
              className="min-h-[120px] w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder={t(($) => $.hub.brief_placeholder)}
            />
          </label>
          <button
            type="button"
            disabled={
              (!brief.trim() && !selectedTemplateId) || createSession.isPending
            }
            onClick={() => void handleCreate()}
            className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-50"
          >
            <Plus className="size-4" />
            {t(($) => $.hub.start)}
          </button>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-medium">{t(($) => $.hub.sessions)}</h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t(($) => $.hub.no_sessions)}</p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((session) => (
                <li key={session.id}>
                  <AppLink
                    href={p.projectDesignSession(projectId, session.id)}
                    className="block rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent"
                  >
                    <span className="font-medium">{session.title}</span>
                    {session.design_mode && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {modeLabels[session.design_mode as DesignMode] ?? session.design_mode}
                      </span>
                    )}
                  </AppLink>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
