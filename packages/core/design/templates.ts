import type { DesignMode } from "../types/design";
import {
  DESIGN_EXAMPLES,
  type DesignExample,
  type DesignIntentId,
} from "./home-catalog";

/** @deprecated Use DesignExample from home-catalog */
export type DesignTemplateCategory =
  | "landing"
  | "dashboards"
  | "apps"
  | "devtools"
  | "docs"
  | "brand";

/** @deprecated Use DesignExample */
export interface DesignTemplate {
  id: string;
  title: string;
  description: string;
  mode: DesignMode;
  brief: string;
  artifact_entry?: string;
  category: DesignTemplateCategory;
  previewClass: string;
}

/** Back-compat alias for hub code importing DESIGN_TEMPLATES */
export const DESIGN_TEMPLATES: DesignTemplate[] = DESIGN_EXAMPLES.map(mapExampleToLegacy);

function mapExampleToLegacy(ex: DesignExample): DesignTemplate {
  const categoryMap: Record<string, DesignTemplateCategory> = {
    "landing-marketing": "landing",
    "business-dashboards": "dashboards",
    "app-prototypes": "apps",
    "developer-tools": "devtools",
    "docs-reports": "docs",
    "brand-design": "brand",
  };
  return {
    id: ex.id,
    title: ex.title,
    description: ex.description,
    mode: ex.designMode,
    brief: ex.brief,
    artifact_entry: ex.artifact_entry,
    category: categoryMap[ex.subcategory ?? ""] ?? "landing",
    previewClass: ex.previewClass,
  };
}

export type { DesignExample, DesignIntentId };
