import type { DesignSystemResourceRef } from "../types/project";
import { DESIGN_SYSTEM_CATALOG, type DesignSystemCatalogEntry } from "./od-design-system-data";

export type { DesignSystemCatalogEntry };
export { DESIGN_SYSTEM_CATALOG };

export const AUTO_DESIGN_SYSTEM_ID = "__auto__";

/** @deprecated Use DESIGN_SYSTEM_CATALOG */
export type DesignSystemPreset = DesignSystemCatalogEntry;

/** @deprecated Use DESIGN_SYSTEM_CATALOG */
export const DESIGN_SYSTEM_PRESETS = DESIGN_SYSTEM_CATALOG;

export function designSystemLabel(entry: DesignSystemCatalogEntry, locale: string): string {
  if (locale.startsWith("zh") && entry.labelZh) return entry.labelZh;
  return entry.label;
}

export function designSystemSummary(entry: DesignSystemCatalogEntry, locale: string): string {
  if (locale.startsWith("zh") && entry.summaryZh) return entry.summaryZh;
  return entry.summary;
}

export function designSystemResourceRef(id: string, content: string): DesignSystemResourceRef {
  return {
    name: id,
    content,
    source: `import:open-design/design-systems/${id}/DESIGN.md`,
  };
}

export async function fetchDesignSystemContent(id: string): Promise<string> {
  const res = await fetch(`/design-systems/${encodeURIComponent(id)}/DESIGN.md`);
  if (!res.ok) {
    throw new Error(`Design system content not found: ${id}`);
  }
  return res.text();
}

export function findDesignSystemCatalogEntry(id: string): DesignSystemCatalogEntry | undefined {
  return DESIGN_SYSTEM_CATALOG.find((entry) => entry.id === id);
}
