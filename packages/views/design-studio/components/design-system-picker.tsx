"use client";

import { useMemo, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import {
  DESIGN_SYSTEM_CATALOG,
  designSystemLabel,
  designSystemSummary,
  type DesignSystemCatalogEntry,
} from "@aicortex/core/design";
import type { ProjectResource } from "@aicortex/core/types";
import { Input } from "@aicortex/ui/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aicortex/ui/components/ui/popover";
import { cn } from "@aicortex/ui/lib/utils";
import { useT } from "../../i18n";

function SwatchPreview({ swatches }: { swatches?: string[] }) {
  if (!swatches?.length) {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted/40">
        <Sparkles className="size-3 text-muted-foreground" />
      </span>
    );
  }
  return (
    <span className="relative flex size-7 shrink-0 overflow-hidden rounded-full border">
      {swatches.slice(0, 4).map((color, index) => (
        <span
          key={`${color}-${index}`}
          className="absolute inset-0"
          style={{
            background: color,
            clipPath:
              swatches.length === 1
                ? "circle(50% at 50% 50%)"
                : swatches.length === 2
                  ? index === 0
                    ? "polygon(0 0, 50% 0, 50% 100%, 0 100%)"
                    : "polygon(50% 0, 100% 0, 100% 100%, 50% 100%)"
                  : swatches.length === 3
                    ? index === 0
                      ? "polygon(0 0, 100% 0, 50% 50%)"
                      : index === 1
                        ? "polygon(0 100%, 50% 50%, 100% 100%)"
                        : "polygon(0 0, 50% 50%, 0 100%)"
                    : index === 0
                      ? "polygon(0 0, 50% 0, 50% 50%, 0 50%)"
                      : index === 1
                        ? "polygon(50% 0, 100% 0, 100% 50%, 50% 50%)"
                        : index === 2
                          ? "polygon(0 50%, 50% 50%, 50% 100%, 0 100%)"
                          : "polygon(50% 50%, 100% 50%, 100% 100%, 50% 100%)",
          }}
        />
      ))}
    </span>
  );
}

interface DesignSystemPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPresetId: string;
  designSystemId: string;
  projectDesignSystems: ProjectResource[];
  trigger: React.ReactElement;
  onSelectAuto: () => void;
  onSelectPreset: (id: string) => void;
  onSelectProject: (id: string) => void;
}

function CatalogItem({
  entry,
  selected,
  onSelect,
}: {
  entry: DesignSystemCatalogEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t, i18n } = useT("design");
  const label = designSystemLabel(entry, i18n.language);
  const summary = designSystemSummary(entry, i18n.language);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-accent",
        selected && "bg-accent",
      )}
    >
      <SwatchPreview swatches={entry.swatches} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <span className="truncate">{label}</span>
          {entry.isDefault ? (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              ({t(($) => $.hub.design_system_default_badge)})
            </span>
          ) : null}
        </span>
        {summary ? (
          <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {summary}
          </span>
        ) : null}
      </span>
      <span className="mt-0.5 max-w-[88px] shrink-0 truncate text-[10px] text-muted-foreground">
        {entry.category}
      </span>
      {selected ? <Check className="mt-0.5 size-3.5 shrink-0 text-brand" /> : null}
    </button>
  );
}

export function DesignSystemPicker({
  open,
  onOpenChange,
  selectedPresetId,
  designSystemId,
  projectDesignSystems,
  trigger,
  onSelectAuto,
  onSelectPreset,
  onSelectProject,
}: DesignSystemPickerProps) {
  const { t, i18n } = useT("design");
  const [query, setQuery] = useState("");

  const isAuto = !selectedPresetId && !designSystemId;

  const visibleCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DESIGN_SYSTEM_CATALOG;
    return DESIGN_SYSTEM_CATALOG.filter((entry) => {
      const label = designSystemLabel(entry, i18n.language).toLowerCase();
      const summary = designSystemSummary(entry, i18n.language).toLowerCase();
      return (
        entry.id.toLowerCase().includes(q) ||
        label.includes(q) ||
        summary.includes(q) ||
        entry.category.toLowerCase().includes(q)
      );
    });
  }, [i18n.language, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" className="w-[min(440px,calc(100vw-24px))] p-0">
        <div className="border-b p-2.5">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(($) => $.hub.design_system_search_placeholder)}
            className="h-8 text-xs"
            autoFocus
          />
          <div className="mt-1.5 text-[11px] text-muted-foreground">
            {t(($) => $.hub.design_system_available_count, { n: visibleCatalog.length + (query ? 0 : 1) })}
          </div>
        </div>

        <div className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5">
          {!query.trim() ? (
            <button
              type="button"
              onClick={() => {
                onSelectAuto();
                onOpenChange(false);
              }}
              className={cn(
                "mb-1 flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-accent",
                isAuto && "bg-accent",
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-brand/10">
                <Sparkles className="size-3.5 text-brand" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-xs font-medium text-brand">
                  {t(($) => $.hub.design_system_auto)}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {t(($) => $.hub.design_system_auto_summary)}
                </span>
              </span>
              {isAuto ? <Check className="mt-0.5 size-3.5 shrink-0 text-brand" /> : null}
            </button>
          ) : null}

          {visibleCatalog.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              {t(($) => $.hub.design_system_no_matches)}
            </div>
          ) : (
            <>
              <div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t(($) => $.hub.design_system_official_preset)}
              </div>
              {visibleCatalog.map((entry) => (
                <CatalogItem
                  key={entry.id}
                  entry={entry}
                  selected={!designSystemId && selectedPresetId === entry.id}
                  onSelect={() => {
                    onSelectPreset(entry.id);
                    onOpenChange(false);
                  }}
                />
              ))}
            </>
          )}

          {projectDesignSystems.length > 0 ? (
            <>
              <div className="mt-2 px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t(($) => $.hub.design_system_project_resources)}
              </div>
              {projectDesignSystems.map((ds) => {
                const label =
                  ds.label ??
                  (ds.resource_ref as { name?: string })?.name ??
                  ds.id;
                const selected = designSystemId === ds.id;
                return (
                  <button
                    key={ds.id}
                    type="button"
                    onClick={() => {
                      onSelectProject(ds.id);
                      onOpenChange(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-accent",
                      selected && "bg-accent",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {selected ? <Check className="size-3.5 shrink-0 text-brand" /> : null}
                  </button>
                );
              })}
            </>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
