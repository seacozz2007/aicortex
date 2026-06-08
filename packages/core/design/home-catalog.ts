import type { DesignMode } from "../types/design";
import { OD_DESIGN_EXAMPLES_RAW } from "./od-example-data";

/** Home intent chips — mirrors Open Design HOME_HERO_CHIPS create row. */
export type DesignIntentId =
  | "prototype"
  | "deck"
  | "hyperframes"
  | "live-artifact"
  | "image"
  | "video"
  | "audio"
  | "template"
  | "design_system";

export type DesignSubcategoryParent = "prototype" | "deck";

export interface DesignIntentChip {
  id: DesignIntentId;
  /** i18n key under design.hub.chips */
  labelKey: string;
  group: "create" | "more";
  /** Value sent to CreateDesignSession API */
  designMode: DesignMode;
  hasSubcategories: boolean;
  hintKey?: string;
}

export interface DesignSubcategory {
  slug: string;
  parent: DesignSubcategoryParent;
  /** i18n key under design.hub.subcategories */
  labelKey: string;
}

export interface DesignExample {
  id: string;
  title: string;
  /** Open Design localized card title */
  titleZh?: string;
  description: string;
  intent: DesignIntentId;
  subcategory?: string;
  designMode: DesignMode;
  brief: string;
  /** Open Design zh-CN useCase query (composer fill on click) */
  briefZh?: string;
  artifact_entry?: string;
  previewClass: string;
  /** Static SVG fallback under /design-previews/ */
  previewPath?: string;
  /** Live HTML example under /design-previews/examples/ */
  previewHtml?: string;
  /** Poster/thumbnail for image, video, or remote previews */
  previewPoster?: string;
}

export const DESIGN_INTENT_CHIPS: DesignIntentChip[] = [
  {
    id: "prototype",
    labelKey: "prototype",
    group: "create",
    designMode: "prototype",
    hasSubcategories: true,
  },
  {
    id: "deck",
    labelKey: "deck",
    group: "create",
    designMode: "deck",
    hasSubcategories: true,
  },
  {
    id: "hyperframes",
    labelKey: "hyperframes",
    group: "create",
    designMode: "hyperframes",
    hasSubcategories: false,
    hintKey: "hyperframes",
  },
  {
    id: "live-artifact",
    labelKey: "live_artifact",
    group: "create",
    designMode: "prototype",
    hasSubcategories: false,
    hintKey: "live_artifact",
  },
  {
    id: "image",
    labelKey: "image",
    group: "create",
    designMode: "prototype",
    hasSubcategories: false,
  },
  {
    id: "video",
    labelKey: "video",
    group: "create",
    designMode: "prototype",
    hasSubcategories: false,
  },
  {
    id: "audio",
    labelKey: "audio",
    group: "more",
    designMode: "prototype",
    hasSubcategories: false,
  },
  {
    id: "template",
    labelKey: "from_template",
    group: "more",
    designMode: "template",
    hasSubcategories: false,
  },
  {
    id: "design_system",
    labelKey: "design_system_chip",
    group: "more",
    designMode: "design_system",
    hasSubcategories: false,
  },
];

/** Subcategory taxonomy aligned with Open Design facets.ts */
export const DESIGN_SUBCATEGORIES: DesignSubcategory[] = [
  { slug: "landing-marketing", parent: "prototype", labelKey: "landing_marketing" },
  { slug: "business-dashboards", parent: "prototype", labelKey: "dashboards" },
  { slug: "app-prototypes", parent: "prototype", labelKey: "apps" },
  { slug: "developer-tools", parent: "prototype", labelKey: "devtools" },
  { slug: "docs-reports", parent: "prototype", labelKey: "docs_reports" },
  { slug: "brand-design", parent: "prototype", labelKey: "brand_design" },
  { slug: "pitch-business", parent: "deck", labelKey: "pitch_business" },
  { slug: "course-training", parent: "deck", labelKey: "course_training" },
  { slug: "reports-briefings", parent: "deck", labelKey: "reports_briefings" },
  { slug: "product-sales", parent: "deck", labelKey: "product_sales" },
  { slug: "engineering-talks", parent: "deck", labelKey: "engineering_talks" },
  { slug: "creative-decks", parent: "deck", labelKey: "creative_decks" },
];

const preview = {
  landing:
    "bg-gradient-to-br from-orange-100 via-white to-sky-100 dark:from-orange-950/50 dark:via-background dark:to-sky-950/40",
  dashboard:
    "bg-gradient-to-br from-slate-100 via-indigo-50 to-violet-100 dark:from-slate-900 dark:via-indigo-950/40 dark:to-violet-950/30",
  app: "bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-blue-950/40 dark:via-background dark:to-cyan-950/30",
  devtools:
    "bg-gradient-to-br from-zinc-100 via-slate-50 to-stone-100 dark:from-zinc-900 dark:via-background dark:to-stone-950/30",
  docs: "bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-amber-950/40 dark:via-background dark:to-orange-950/30",
  brand:
    "bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-emerald-950/40 dark:via-background dark:to-teal-950/30",
  deck: "bg-gradient-to-br from-rose-50 via-white to-fuchsia-50 dark:from-rose-950/40 dark:via-background dark:to-fuchsia-950/30",
  motion:
    "bg-gradient-to-br from-violet-100 via-purple-50 to-indigo-100 dark:from-violet-950/40 dark:via-background dark:to-indigo-950/30",
  live: "bg-gradient-to-br from-green-50 via-white to-emerald-50 dark:from-green-950/40 dark:via-background dark:to-emerald-950/30",
  media:
    "bg-gradient-to-br from-pink-50 via-white to-red-50 dark:from-pink-950/40 dark:via-background dark:to-red-950/30",
};

const PREVIEW_ASSETS: Record<keyof typeof preview, string> = {
  landing: "/design-previews/landing.svg",
  dashboard: "/design-previews/dashboard.svg",
  app: "/design-previews/app.svg",
  devtools: "/design-previews/devtools.svg",
  docs: "/design-previews/docs.svg",
  brand: "/design-previews/brand.svg",
  deck: "/design-previews/deck.svg",
  motion: "/design-previews/motion.svg",
  live: "/design-previews/live.svg",
  media: "/design-previews/media.svg",
};

/** Resolve live HTML preview URL for hub example cards. */
export function designExamplePreviewHtml(example: DesignExample): string | undefined {
  return example.previewHtml;
}

/** Card title for locale — mirrors Open Design plugin titles. */
export function designExampleTitle(example: DesignExample, locale: string): string {
  if (locale.startsWith("zh") && example.titleZh) return example.titleZh;
  return example.title;
}

/** Composer prompt on example click — mirrors Open Design useCase.query. */
export function designExampleBrief(example: DesignExample, locale: string): string {
  if (locale.startsWith("zh") && example.briefZh) return example.briefZh;
  return example.brief;
}

function buildDesignExamples(): DesignExample[] {
  return OD_DESIGN_EXAMPLES_RAW.map((raw) => ({
    id: raw.id,
    title: raw.title,
    titleZh: raw.titleZh,
    description: raw.description,
    intent: raw.intent as DesignIntentId,
    subcategory: raw.subcategory,
    designMode: raw.designMode as DesignMode,
    brief: raw.brief,
    briefZh: raw.briefZh,
    artifact_entry: raw.artifact_entry,
    previewClass: preview[raw.previewKind],
    previewHtml: raw.previewHtml,
    previewPoster: raw.previewPoster,
  }));
}

/** Resolve static SVG fallback when HTML preview is unavailable. */
export function designExamplePreviewPath(example: DesignExample): string {
  if (example.previewPath) return example.previewPath;
  for (const key of Object.keys(preview) as (keyof typeof preview)[]) {
    if (example.previewClass === preview[key]) return PREVIEW_ASSETS[key];
  }
  return PREVIEW_ASSETS.landing;
}

export const DESIGN_EXAMPLES: DesignExample[] = buildDesignExamples();

export function subcategoriesForIntent(intentId: DesignIntentId): DesignSubcategory[] {
  if (intentId !== "prototype" && intentId !== "deck") return [];
  return DESIGN_SUBCATEGORIES.filter((item) => item.parent === intentId);
}

export function filterDesignExamples(
  intentId: DesignIntentId,
  subcategorySlug: string | null,
): DesignExample[] {
  const byIntent = DESIGN_EXAMPLES.filter((ex) => ex.intent === intentId);
  if (!subcategorySlug) return byIntent;
  return byIntent.filter((ex) => ex.subcategory === subcategorySlug);
}

export function findDesignExample(id: string): DesignExample | undefined {
  return DESIGN_EXAMPLES.find((ex) => ex.id === id);
}

export function intentChip(id: DesignIntentId): DesignIntentChip | undefined {
  return DESIGN_INTENT_CHIPS.find((chip) => chip.id === id);
}
