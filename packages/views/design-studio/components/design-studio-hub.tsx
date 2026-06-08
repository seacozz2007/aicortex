"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppWindow,
  Brush,
  ChevronDown,
  FileText,
  FolderOpen,
  Globe,
  Image as ImageIcon,
  LayoutGrid,
  LayoutTemplate,
  Lightbulb,
  Mic,
  MoreHorizontal,
  Orbit,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Star,
  Terminal,
  X,
} from "lucide-react";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { useWorkspacePaths } from "@aicortex/core/paths";
import { projectDetailOptions } from "@aicortex/core/projects/queries";
import { agentListOptions } from "@aicortex/core/workspace/queries";
import {
  designSessionsOptions,
  designSystemResourcesOptions,
  designSettingsOptions,
  designKeys,
} from "@aicortex/core/design/queries";
import {
  designSystemLabel as formatDesignSystemLabel,
  findDesignSystemCatalogEntry,
  fetchDesignSystemContent,
  designSystemResourceRef,
  filterDesignExamples,
  findDesignExample,
  designExamplePreviewPath,
  designExamplePreviewHtml,
  designExampleTitle,
  designExampleBrief,
  intentChip,
  subcategoriesForIntent,
  buildHyperframesBriefPrefix,
  HYPERFRAMES_ASPECT_RATIOS,
  HYPERFRAMES_DURATIONS,
  type HyperframesAspectRatio,
  type HyperframesDurationSec,
  type DesignExample,
  type DesignIntentId,
} from "@aicortex/core/design";
import { api } from "@aicortex/core/api";
import { useCreateDesignSession } from "@aicortex/core/design/mutations";
import { skillDetailOptions } from "@aicortex/core/workspace/queries";
import type { DesignParameterDef, DesignSystemResourceRef, ProjectResource } from "@aicortex/core/types";
import { Button } from "@aicortex/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aicortex/ui/components/ui/popover";
import { cn } from "@aicortex/ui/lib/utils";
import { AppLink, useNavigation } from "../../navigation";
import { useT } from "../../i18n";
import { DesignExamplePreview } from "./design-example-preview";
import { DesignSystemPicker } from "./design-system-picker";

const CREATE_CHIP_IDS: DesignIntentId[] = [
  "prototype",
  "deck",
  "hyperframes",
  "live-artifact",
  "image",
  "video",
];

const MORE_CHIP_IDS: DesignIntentId[] = ["audio", "template", "design_system"];

function chipLocaleKey(id: DesignIntentId): string {
  return id.replace(/-/g, "_");
}

const INTENT_ICONS: Record<DesignIntentId, typeof Palette> = {
  prototype: Palette,
  deck: LayoutTemplate,
  hyperframes: Orbit,
  "live-artifact": RefreshCw,
  image: ImageIcon,
  video: Play,
  audio: Mic,
  template: LayoutGrid,
  design_system: Brush,
};

const SUBCATEGORY_ICONS: Record<string, typeof Globe> = {
  "landing-marketing": Globe,
  "business-dashboards": LayoutGrid,
  "app-prototypes": AppWindow,
  "developer-tools": Terminal,
  "docs-reports": FileText,
  "brand-design": Brush,
  "pitch-business": LayoutTemplate,
  "course-training": Lightbulb,
  "reports-briefings": FileText,
  "product-sales": Star,
  "engineering-talks": Terminal,
  "creative-decks": Brush,
};

export function DesignStudioHub({ projectId }: { projectId: string }) {
  const { t, i18n } = useT("design");
  const wsId = useWorkspaceId();
  const p = useWorkspacePaths();
  const { searchParams, push } = useNavigation();
  const continueTaskId = searchParams.get("continue_task");
  const continueArtifactEntry = searchParams.get("artifact_entry");
  const qc = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { data: project } = useQuery(projectDetailOptions(wsId, projectId));
  const { data: sessions = [] } = useQuery(designSessionsOptions(wsId, projectId));
  const { data: designSystems = [] as ProjectResource[] } = useQuery(
    designSystemResourcesOptions(wsId, projectId),
  );
  const { data: designSettings } = useQuery(designSettingsOptions(wsId));
  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const createSession = useCreateDesignSession(wsId, projectId);

  const [activeIntent, setActiveIntent] = useState<DesignIntentId | null>("prototype");
  const [subcategorySlug, setSubcategorySlug] = useState<string | null>(null);
  const [selectedExampleId, setSelectedExampleId] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [designSystemId, setDesignSystemId] = useState("");
  const [designSkillId, setDesignSkillId] = useState("");
  const [brief, setBrief] = useState("");
  const [creating, setCreating] = useState(false);
  const [designSystemOpen, setDesignSystemOpen] = useState(false);
  const [skillOpen, setSkillOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [parameterValues, setParameterValues] = useState<Record<string, number>>({});
  const [hyperframesAspectRatio, setHyperframesAspectRatio] =
    useState<HyperframesAspectRatio>("16:9");
  const [hyperframesDuration, setHyperframesDuration] = useState<HyperframesDurationSec>(10);
  const [hyperframesSourceFolder, setHyperframesSourceFolder] = useState("");
  const [hyperframesAspectOpen, setHyperframesAspectOpen] = useState(false);
  const [hyperframesDurationOpen, setHyperframesDurationOpen] = useState(false);

  const isHyperframes = activeIntent === "hyperframes";

  const { data: selectedSkillDetail } = useQuery({
    ...skillDetailOptions(wsId, designSkillId),
    enabled: !!designSkillId,
  });

  const skillParameters = useMemo((): DesignParameterDef[] => {
    const od = selectedSkillDetail?.config?.od as { parameters?: DesignParameterDef[] } | undefined;
    return od?.parameters ?? [];
  }, [selectedSkillDetail?.config]);

  useEffect(() => {
    if (skillParameters.length === 0) {
      setParameterValues({});
      return;
    }
    const defaults: Record<string, number> = {};
    for (const param of skillParameters) {
      defaults[param.id] = param.default;
    }
    setParameterValues(defaults);
  }, [designSkillId, skillParameters]);

  const designAgent = agents.find((a) => a.id === designSettings?.default_design_agent_id);
  const designSkills = designAgent?.skills ?? [];
  const activeChip = activeIntent ? intentChip(activeIntent) : undefined;
  const subcategories = activeIntent ? subcategoriesForIntent(activeIntent) : [];
  const visibleExamples = useMemo(
    () => (activeIntent ? filterDesignExamples(activeIntent, subcategorySlug) : []),
    [activeIntent, subcategorySlug],
  );

  const selectedPreset = findDesignSystemCatalogEntry(selectedPresetId);
  const selectedProjectDesignSystem = designSystems.find((ds) => ds.id === designSystemId);
  const selectedSkill = designSkills.find((skill) => skill.id === designSkillId);
  const canSubmit = Boolean(brief.trim() || selectedExampleId);

  const designSystemButtonLabel = useMemo(() => {
    if (selectedProjectDesignSystem) {
      return (
        selectedProjectDesignSystem.label ??
        (selectedProjectDesignSystem.resource_ref as { name?: string })?.name ??
        selectedProjectDesignSystem.id
      );
    }
    if (selectedPreset) {
      const label = formatDesignSystemLabel(selectedPreset, i18n.language);
      return selectedPreset.isDefault
        ? `${label} (${t(($) => $.hub.design_system_default_badge)})`
        : label;
    }
    return t(($) => $.hub.design_system_auto);
  }, [selectedPreset, selectedProjectDesignSystem, i18n.language, t]);

  const IntentIcon = activeIntent ? INTENT_ICONS[activeIntent] : Palette;

  async function resolveDesignSystemResourceId(): Promise<string | undefined> {
    if (designSystemId) return designSystemId;
    if (!selectedPresetId) return undefined;

    const preset = findDesignSystemCatalogEntry(selectedPresetId);
    if (!preset) return undefined;

    const existing = designSystems.find((ds) => {
      const ref = ds.resource_ref as DesignSystemResourceRef;
      return ref.name === preset.id;
    });
    if (existing) return existing.id;

    const content = await fetchDesignSystemContent(preset.id);
    const created = await api.createProjectResource(projectId, {
      resource_type: "design_system",
      resource_ref: designSystemResourceRef(preset.id, content),
      label: formatDesignSystemLabel(preset, i18n.language),
    });
    qc.invalidateQueries({ queryKey: designKeys.designSystems(wsId, projectId) });
    return created.id;
  }

  async function handleCreate() {
    if (!canSubmit || creating || createSession.isPending) return;
    setCreating(true);
    try {
      const trimmedBrief = brief.trim();
      const selectedExample = findDesignExample(selectedExampleId);
      const designSystemResourceId = isHyperframes
        ? undefined
        : await resolveDesignSystemResourceId();
      const designMode = selectedExample?.designMode ?? activeChip?.designMode ?? "prototype";
      const hyperframesPrefix = isHyperframes
        ? buildHyperframesBriefPrefix({
            aspectRatio: hyperframesAspectRatio,
            durationSec: hyperframesDuration,
            sourceFolder: hyperframesSourceFolder || undefined,
          })
        : "";
      const session = await createSession.mutateAsync({
        design_mode: designMode,
        design_skill_id: designSkillId || undefined,
        design_example_id: selectedExampleId || undefined,
        design_system_resource_id: designSystemResourceId,
        artifact_entry:
          continueArtifactEntry ||
          selectedExample?.artifact_entry ||
          (isHyperframes ? "index.html" : undefined),
        continue_from_task_id: continueTaskId || undefined,
        title:
          trimmedBrief.slice(0, 80) ||
          (selectedExample ? designExampleTitle(selectedExample, i18n.language) : undefined) ||
          (continueTaskId ? t(($) => $.hub.continue_title) : t(($) => $.hub.default_title)),
      });
      const paramLines =
        skillParameters.length > 0
          ? skillParameters
              .map((p) => `${p.label}: ${parameterValues[p.id] ?? p.default}`)
              .join("\n")
          : "";
      const message =
        [hyperframesPrefix, trimmedBrief || (selectedExample ? designExampleBrief(selectedExample, i18n.language) : ""), paramLines]
          .filter(Boolean)
          .join("\n\n") || undefined;
      if (message) {
        await api.sendChatMessage(session.id, message);
      }
      push(p.projectDesignSession(projectId, session.id));
    } finally {
      setCreating(false);
    }
  }

  async function pickHyperframesSourceFolder() {
    const picker = (
      window as Window & {
        showDirectoryPicker?: () => Promise<{ name: string }>;
      }
    ).showDirectoryPicker;
    if (picker) {
      try {
        const handle = await picker();
        setHyperframesSourceFolder(handle.name);
        return;
      } catch {
        return;
      }
    }
    folderInputRef.current?.click();
  }

  function onHyperframesFolderInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    const first = files[0] as File & { webkitRelativePath?: string };
    const relative = first.webkitRelativePath ?? "";
    const folderName = relative.split("/")[0] || relative.split("\\")[0] || first.name;
    setHyperframesSourceFolder(folderName);
    e.target.value = "";
  }

  function clearActiveIntent() {
    setActiveIntent(null);
    setSubcategorySlug(null);
    setSelectedExampleId("");
    setMoreOpen(false);
  }

  function selectIntent(intentId: DesignIntentId) {
    setActiveIntent(intentId);
    setSubcategorySlug(null);
    setSelectedExampleId("");
    setMoreOpen(false);
  }

  function applyExample(example: DesignExample) {
    setSelectedExampleId(example.id);
    setBrief(designExampleBrief(example, i18n.language));
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function onPromptKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      void handleCreate();
    }
  }

  function renderIntentChip(intentId: DesignIntentId) {
    const chip = intentChip(intentId);
    if (!chip) return null;
    const Icon = INTENT_ICONS[intentId];
    const active = activeIntent === intentId;
    return (
      <button
        key={intentId}
        type="button"
        onClick={() => selectIntent(intentId)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
          active
            ? "border-brand/40 bg-brand/10 text-brand"
            : "bg-background hover:bg-accent",
        )}
        title={
          chip.hintKey === "hyperframes"
            ? t(($) => $.hub.chip_hints.hyperframes)
            : chip.hintKey === "live_artifact"
              ? t(($) => $.hub.chip_hints.live_artifact)
              : undefined
        }
      >
        <Icon className="size-3.5" />
        {t(($) => $.hub.chips[chipLocaleKey(intentId) as keyof typeof $.hub.chips])}
      </button>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b px-6 py-3">
        <span className="text-sm text-muted-foreground">{project?.title ?? projectId}</span>
        <AppLink
          href={p.projectDetail(projectId)}
          className="ml-auto text-sm text-muted-foreground hover:text-foreground"
        >
          {t(($) => $.hub.back_to_project)}
        </AppLink>
      </header>

      <main className="mx-auto flex w-full max-w-[960px] flex-1 flex-col px-6 py-8">
        <div className="mb-6 text-center">
          <div className="relative mb-4 inline-flex items-center justify-center">
            <span className="absolute right-[calc(100%+8px)] flex size-[26px] items-center justify-center rounded-full border bg-card">
              <Palette className="size-3.5 text-brand" />
            </span>
            <span className="font-serif text-base font-semibold">{t(($) => $.hub.brand_name)}</span>
          </div>
          <h1 className="font-serif text-[30px] font-semibold tracking-tight text-foreground">
            {t(($) => $.hub.hero_title)}
          </h1>
          <p className="mt-2 text-[13.5px] text-muted-foreground">{t(($) => $.hub.hero_subtitle)}</p>
          {continueTaskId && (
            <p className="mt-3 rounded-full border border-brand/30 bg-brand/5 px-3 py-1 text-xs text-brand">
              {t(($) => $.hub.continue_from_issue)}
            </p>
          )}
        </div>

        <div className="rounded-2xl border bg-card shadow-sm">
          <input
            ref={folderInputRef}
            type="file"
            className="hidden"
            // @ts-expect-error webkitdirectory is non-standard but widely supported
            webkitdirectory=""
            multiple
            onChange={onHyperframesFolderInputChange}
          />
          <textarea
            ref={textareaRef}
            className="min-h-[120px] w-full resize-none rounded-t-2xl bg-transparent px-5 py-4 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            onKeyDown={onPromptKeyDown}
            placeholder={t(($) => $.hub.composer_placeholder)}
          />
          <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2.5">
            <button
              type="button"
              disabled
              className="inline-flex size-8 items-center justify-center rounded-lg border opacity-40"
              title={t(($) => $.hub.attachments_soon)}
            >
              <Plus className="size-4" />
            </button>

            {activeIntent && activeChip && (
              <button
                type="button"
                onClick={clearActiveIntent}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/15"
                title={t(($) => $.hub.clear_active_intent)}
                aria-label={t(($) => $.hub.clear_active_intent)}
              >
                <IntentIcon className="size-3.5" />
                {t(($) => $.hub.chips[chipLocaleKey(activeIntent) as keyof typeof $.hub.chips])}
                <X className="size-3 opacity-70" />
              </button>
            )}

            {isHyperframes && (
              <>
                <button
                  type="button"
                  onClick={() => void pickHyperframesSourceFolder()}
                  className={cn(
                    "inline-flex max-w-[140px] items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent",
                    hyperframesSourceFolder && "border-brand/40 text-brand",
                  )}
                  title={hyperframesSourceFolder || t(($) => $.hub.hyperframes_source_folder)}
                >
                  <FolderOpen className="size-3.5 shrink-0" />
                  <span className="truncate">
                    {hyperframesSourceFolder || t(($) => $.hub.hyperframes_source_folder)}
                  </span>
                </button>
                {hyperframesSourceFolder && (
                  <button
                    type="button"
                    onClick={() => setHyperframesSourceFolder("")}
                    className="inline-flex size-7 items-center justify-center rounded-full border text-muted-foreground hover:bg-accent"
                    title={t(($) => $.hub.hyperframes_source_folder_clear)}
                  >
                    ×
                  </button>
                )}

                <Popover open={hyperframesAspectOpen} onOpenChange={setHyperframesAspectOpen}>
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                      >
                        <span>{hyperframesAspectRatio}</span>
                        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                      </button>
                    }
                  />
                  <PopoverContent align="start" className="w-auto p-1">
                    <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t(($) => $.hub.hyperframes_aspect_ratio)}
                    </p>
                    {HYPERFRAMES_ASPECT_RATIOS.map((ratio) => (
                      <button
                        key={ratio.id}
                        type="button"
                        onClick={() => {
                          setHyperframesAspectRatio(ratio.id);
                          setHyperframesAspectOpen(false);
                        }}
                        className={cn(
                          "flex w-full rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-accent",
                          hyperframesAspectRatio === ratio.id && "bg-accent",
                        )}
                      >
                        {ratio.label} ({ratio.width}×{ratio.height})
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>

                <Popover open={hyperframesDurationOpen} onOpenChange={setHyperframesDurationOpen}>
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                      >
                        <span>
                          {t(($) => $.hub.hyperframes_duration_seconds, {
                            seconds: hyperframesDuration,
                          })}
                        </span>
                        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                      </button>
                    }
                  />
                  <PopoverContent align="start" className="w-auto p-1">
                    <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t(($) => $.hub.hyperframes_duration)}
                    </p>
                    {HYPERFRAMES_DURATIONS.map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => {
                          setHyperframesDuration(sec);
                          setHyperframesDurationOpen(false);
                        }}
                        className={cn(
                          "flex w-full rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-accent",
                          hyperframesDuration === sec && "bg-accent",
                        )}
                      >
                        {t(($) => $.hub.hyperframes_duration_seconds, { seconds: sec })}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              </>
            )}

            {!isHyperframes && (
            <DesignSystemPicker
              open={designSystemOpen}
              onOpenChange={setDesignSystemOpen}
              selectedPresetId={selectedPresetId}
              designSystemId={designSystemId}
              projectDesignSystems={designSystems}
              onSelectAuto={() => {
                setSelectedPresetId("");
                setDesignSystemId("");
              }}
              onSelectPreset={(id) => {
                setSelectedPresetId(id);
                setDesignSystemId("");
              }}
              onSelectProject={(id) => {
                setDesignSystemId(id);
                setSelectedPresetId("");
              }}
              trigger={
                <button
                  type="button"
                  className="inline-flex max-w-[180px] items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{designSystemButtonLabel}</span>
                  <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                </button>
              }
            />
            )}

            {designAgent && (
              <Popover open={skillOpen} onOpenChange={setSkillOpen}>
                <PopoverTrigger
                  render={
                    <button
                      type="button"
                      className="inline-flex max-w-[180px] items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                    >
                      <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">
                        {selectedSkill?.name ?? designAgent.name}
                      </span>
                      <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                    </button>
                  }
                />
                <PopoverContent align="start" className="w-52 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDesignSkillId("");
                      setSkillOpen(false);
                    }}
                    className={cn(
                      "flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                      !designSkillId && "bg-accent",
                    )}
                  >
                    {designAgent.name}
                  </button>
                  {designSkills.map((skill) => (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => {
                        setDesignSkillId(skill.id);
                        setSkillOpen(false);
                      }}
                      className={cn(
                        "flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                        designSkillId === skill.id && "bg-accent",
                      )}
                    >
                      {skill.name}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )}

            <div className="ml-auto">
              <Button
                type="button"
                size="sm"
                disabled={!canSubmit || createSession.isPending || creating}
                onClick={() => void handleCreate()}
                className="rounded-full px-4"
              >
                <Send className="size-3.5" />
                {t(($) => $.hub.send)}
              </Button>
            </div>
          </div>
        </div>

        {skillParameters.length > 0 && (
          <div className="mx-auto mt-4 w-full max-w-[720px] space-y-2 rounded-xl border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">{t(($) => $.hub.parameters)}</p>
            {skillParameters.map((param) => (
              <label key={param.id} className="block space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>{param.label}</span>
                  <span className="font-mono text-muted-foreground">
                    {parameterValues[param.id] ?? param.default}
                  </span>
                </div>
                <input
                  type="range"
                  min={param.min}
                  max={param.max}
                  step={param.step ?? 1}
                  value={parameterValues[param.id] ?? param.default}
                  onChange={(e) =>
                    setParameterValues((prev) => ({
                      ...prev,
                      [param.id]: Number(e.target.value),
                    }))
                  }
                  className="w-full"
                />
              </label>
            ))}
          </div>
        )}

        {!activeIntent && (
        <div className="mx-auto mt-3 flex w-full max-w-[720px] flex-col items-center gap-2">
          <div className="flex flex-wrap justify-center gap-2">
            {CREATE_CHIP_IDS.map(renderIntentChip)}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {renderIntentChip("audio")}
            <Popover open={moreOpen} onOpenChange={setMoreOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors bg-background hover:bg-accent",
                    )}
                  >
                    <MoreHorizontal className="size-3.5" />
                    {t(($) => $.hub.more)}
                  </button>
                }
              />
              <PopoverContent align="center" className="flex w-auto gap-1 p-1">
                {MORE_CHIP_IDS.filter((id) => id !== "audio").map((intentId) => {
                  const Icon = INTENT_ICONS[intentId];
                  return (
                    <button
                      key={intentId}
                      type="button"
                      onClick={() => selectIntent(intentId)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs hover:bg-accent",
                        activeIntent === intentId && "bg-accent",
                      )}
                    >
                      <Icon className="size-3.5" />
                      {t(($) => $.hub.chips[chipLocaleKey(intentId) as keyof typeof $.hub.chips])}
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
          </div>
        </div>
        )}

        {activeIntent && subcategories.length > 0 && (
          <div
            className="mx-auto mt-3 flex w-full max-w-[720px] flex-wrap justify-center gap-2"
            data-testid="design-subcategory-row"
          >
            <button
              type="button"
              onClick={() => setSubcategorySlug(null)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                subcategorySlug === null
                  ? "border-brand/40 bg-brand/10 text-brand"
                  : "bg-background hover:bg-accent",
              )}
            >
              {t(($) => $.hub.subcategories.all)}
            </button>
            {subcategories.map((sub) => {
              const Icon = SUBCATEGORY_ICONS[sub.slug] ?? LayoutGrid;
              return (
                <button
                  key={sub.slug}
                  type="button"
                  onClick={() => setSubcategorySlug(sub.slug)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                    subcategorySlug === sub.slug
                      ? "border-brand/40 bg-brand/10 text-brand"
                      : "bg-background hover:bg-accent",
                  )}
                >
                  <Icon className="size-3.5" />
                  {t(($) => $.hub.subcategories[sub.labelKey as "landing_marketing" | "dashboards" | "apps" | "devtools" | "docs_reports" | "brand_design" | "pitch_business" | "course_training" | "reports_briefings" | "product_sales" | "engineering_talks" | "creative_decks"])}
                </button>
              );
            })}
          </div>
        )}

        {activeIntent && (
        <section className="mt-8">
          <h2 className="mb-4 text-sm font-semibold">{t(($) => $.hub.example_prompts)}</h2>
          {visibleExamples.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t(($) => $.hub.no_examples)}</p>
          ) : (
            <div className="-mx-2 flex gap-4 overflow-x-auto px-2 pb-2 snap-x snap-mandatory">
              {visibleExamples.map((example) => (
                <button
                  key={example.id}
                  type="button"
                  onClick={() => applyExample(example)}
                  className={cn(
                    "group w-[220px] shrink-0 snap-start overflow-hidden rounded-xl border bg-card text-left transition-all hover:shadow-md",
                    selectedExampleId === example.id && "border-brand ring-1 ring-brand/30",
                  )}
                >
                  <div className={cn("relative h-36 border-b overflow-hidden", example.previewClass)}>
                    {example.previewPoster ? (
                      <img
                        src={example.previewPoster}
                        alt=""
                        className="h-full w-full object-cover object-center"
                      />
                    ) : designExamplePreviewHtml(example) ? (
                      <DesignExamplePreview
                        src={designExamplePreviewHtml(example)!}
                        title={designExampleTitle(example, i18n.language)}
                        fallbackClassName={example.previewClass}
                        fallbackSrc={designExamplePreviewPath(example)}
                      />
                    ) : (
                      <img
                        src={designExamplePreviewPath(example)}
                        alt=""
                        className="h-full w-full object-cover object-center"
                      />
                    )}
                  </div>
                  <div className="bg-muted/30 px-3 py-2.5">
                    <div className="text-sm font-medium">
                      {designExampleTitle(example, i18n.language)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
        )}

        {sessions.length > 0 && (
          <section className="mt-10 border-t pt-8">
            <h2 className="mb-3 text-sm font-semibold">{t(($) => $.hub.sessions)}</h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sessions.map((session) => (
                <li key={session.id}>
                  <AppLink
                    href={p.projectDesignSession(projectId, session.id)}
                    className="block rounded-xl border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-accent"
                  >
                    <span className="font-medium">{session.title}</span>
                  </AppLink>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
