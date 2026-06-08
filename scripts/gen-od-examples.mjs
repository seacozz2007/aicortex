/**
 * Sync Design Studio example catalog from Open Design plugin manifests.
 * Mirrors HomeHero homeHeroExamplePluginsForChip (up to 18 per chip, curated sort).
 */
import fs from "fs";
import path from "path";

const OD_BASE = "D:/CODE/open-design/plugins/_official";
const OUT_TS = "packages/core/design/od-example-data.ts";
const PREVIEW_DEST = "D:/CODE/aicortex/apps/web/public/design-previews/examples";
const DESIGN_RESOURCES_DEST = "D:/CODE/aicortex/server/resources/design";
const MAX_PER_CHIP = 18;

const CURATED = {
  prototype: [
    "example-open-design-landing",
    "example-kanban-board",
    "example-social-carousel",
    "example-blog-post",
    "example-doc-kami-parchment",
  ],
  deck: [
    "example-html-ppt-zhangzara-creative-mode",
    "example-html-ppt-zhangzara-scatterbrain",
    "example-guizang-ppt",
    "example-html-ppt-zhangzara-cobalt-grid",
    "example-html-ppt-zhangzara-capsule",
  ],
  "live-artifact": [
    "example-live-dashboard",
    "image-template-notion-team-dashboard-live-artifact",
    "example-social-media-matrix-tracker-template",
    "example-trading-analysis-dashboard-template",
    "example-live-artifact",
  ],
  hyperframes: [
    "video-template-hyperframes-app-showcase-three-phones",
    "video-template-hyperframes-brand-sizzle-reel",
    "video-template-hyperframes-social-overlay-stack",
    "video-template-hyperframes-website-to-video-promo",
    "video-template-hyperframes-flight-map-route",
  ],
  image: [
    "image-template-anime-martial-arts-battle-illustration",
    "image-template-e-commerce-live-stream-ui-mockup",
    "image-template-infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels",
    "image-template-profile-avatar-anime-girl-to-cinematic-photo",
    "image-template-social-media-post-showa-day-retro-culture-magazine-cover",
  ],
  video: [
    "video-template-video-seedance-three-kingdoms-lyubu-yuanmen-archery",
    "video-template-seedance-2-0-15-second-cinematic-japanese-romance-short-film",
    "video-template-cinematic-east-asian-woman-hand-dance",
    "video-template-luxury-supercar-cinematic-narrative",
    "video-template-forbidden-city-cat-satire",
  ],
};

const CURATED_RANK = new Map(
  Object.values(CURATED)
    .flat()
    .map((id, i) => [id, i]),
);

const SUBCATEGORIES = [
  {
    parent: "prototype",
    slug: "business-dashboards",
    slugs: [
      "dashboard",
      "admin-panel",
      "analytics",
      "control-panel",
      "team-dashboard",
      "live-dashboard",
      "refreshable-dashboard",
      "ops-dashboard",
      "github-dashboard",
      "social-media-dashboard",
      "data",
      "chart",
    ],
  },
  {
    parent: "prototype",
    slug: "app-prototypes",
    slugs: [
      "mobile",
      "app",
      "mobile-app",
      "ios-app",
      "android-app",
      "phone-screen",
      "app-ui",
      "app-mockup",
      "app-onboarding",
      "onboarding",
      "signup",
      "task",
      "habit-tracker",
      "dating-app",
      "dating-web",
      "kanban-board",
      "kanban",
    ],
  },
  {
    parent: "prototype",
    slug: "landing-marketing",
    slugs: [
      "landing",
      "landing-page",
      "saas-landing",
      "marketing-page",
      "product-landing",
      "pricing",
      "pricing-page",
      "waitlist-page",
      "coming-soon-page",
      "email-template",
      "newsletter",
      "lead-magnet",
      "e-guide",
      "poster",
      "social-carousel",
      "kami-landing",
    ],
  },
  {
    parent: "prototype",
    slug: "developer-tools",
    slugs: [
      "engineering",
      "docs",
      "documentation",
      "api-reference",
      "runbook",
      "ops-doc",
      "sre-doc",
      "github",
      "linear",
      "issue",
      "docs-page",
      "eng-runbook",
      "codex",
    ],
  },
  {
    parent: "prototype",
    slug: "docs-reports",
    slugs: [
      "report",
      "financial-report",
      "finance-report",
      "case-report",
      "clinical-case",
      "case-study",
      "guide",
      "tutorial",
      "pm-spec",
      "prd",
      "spec",
      "invoice",
      "resume",
      "cv",
      "blog-post",
      "blog",
      "article",
      "weekly",
      "eguide",
      "digital-eguide",
      "doc-kami",
    ],
  },
  {
    parent: "prototype",
    slug: "brand-design",
    slugs: [
      "design",
      "design-review",
      "design-audit",
      "critique",
      "mockup",
      "wireframe",
      "visual",
      "brand",
      "mockup-device",
    ],
  },
  {
    parent: "deck",
    slug: "pitch-business",
    slugs: ["pitch-deck", "pitch", "fundraising", "seed-round", "investor-deck", "vc-deck", "business-plan", "b2b-saas-pitch", "founder-vision-deck"],
  },
  {
    parent: "deck",
    slug: "course-training",
    slugs: ["course-module", "course-slides", "training-deck", "workshop", "lesson", "education", "classroom"],
  },
  {
    parent: "deck",
    slug: "reports-briefings",
    slugs: ["weekly-report", "status-update", "team-report", "business-review", "white-paper", "investment-thesis", "consulting-deliverable", "financial", "data-viz-launch"],
  },
  {
    parent: "deck",
    slug: "product-sales",
    slugs: ["product-launch", "launch-deck", "feature-reveal", "launch-slides", "sales", "customer", "product"],
  },
  {
    parent: "deck",
    slug: "engineering-talks",
    slugs: ["engineering", "tech-sharing", "tech-talk", "technical-presentation", "architecture", "dev-workflow"],
  },
  {
    parent: "deck",
    slug: "creative-decks",
    slugs: ["creative", "agency", "portfolio", "zhangzara", "guizang", "editorial", "html-ppt"],
  },
];

const audioExamples = [
  {
    id: "audio-startup-sound",
    title: "Product Startup Sound",
    titleZh: "产品启动音效",
    brief:
      "Generate a product startup sound that feels light, trustworthy, slightly futuristic, and suitable for a desktop app launch",
    briefZh:
      "生成一段产品启动音效，听起来轻盈、可信、带一点未来感，适合桌面 App 打开时播放",
  },
  {
    id: "audio-podcast-intro",
    title: "Podcast Intro Bed",
    titleZh: "播客片头音乐",
    brief:
      "Create a 20-second podcast intro bed with a warm opening, clear pulse, and a clean handoff into voiceover",
    briefZh: "制作 20 秒播客片头音乐，包含温暖前奏、清晰节拍和适合人声进入的收尾",
  },
  {
    id: "audio-meditation-loop",
    title: "Meditation Ambient Loop",
    titleZh: "冥想环境音循环",
    brief:
      "Make a seamless ambient loop for a meditation app using soft nature textures, low-frequency warmth, and calm pacing",
    briefZh: "做一个冥想 App 的环境音循环，使用柔和自然声、低频铺底和无缝循环结构",
  },
  {
    id: "audio-notification-set",
    title: "Branded Notification Sounds",
    titleZh: "品牌通知提示音",
    brief:
      "Generate a branded notification sound set for success, reminder, and error states while keeping one sonic identity",
    briefZh: "生成一组品牌通知提示音，区分成功、提醒和错误状态，但保持同一声音识别度",
  },
];

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function pluginId(folder, manifest) {
  const name = manifest.name ?? "";
  if (name.startsWith("example-")) return name;
  if (folder.startsWith("image-templates/")) return `image-template-${folder.split("/").pop()}`;
  if (folder.startsWith("video-templates/")) return `video-template-${folder.split("/").pop()}`;
  return `example-${folder.split("/").pop()}`;
}

function recordSlugs(manifest, folder, pluginIdVal) {
  const od = manifest.od ?? {};
  return new Set(
    [
      pluginIdVal,
      folder.split("/").pop(),
      manifest.name,
      manifest.title,
      od.mode,
      od.surface,
      od.scenario,
      od.taskKind,
      ...(manifest.tags ?? []),
    ]
      .map(slugify)
      .filter(Boolean),
  );
}

function hasAnySlug(slugs, values) {
  return values.some((v) => slugs.has(v));
}

function hasPartSlug(slugs, values) {
  const all = [...slugs];
  return values.some((val) =>
    all.some((sl) => sl === val || sl.includes(val) || sl.split("-").includes(val)),
  );
}

function matchesChip(chipId, slugs) {
  switch (chipId) {
    case "prototype":
      return hasAnySlug(slugs, ["prototype"]) || hasPartSlug(slugs, ["web-prototype"]);
    case "deck":
      return hasAnySlug(slugs, ["deck", "slides", "slide-deck"]) || hasPartSlug(slugs, ["slide", "deck"]);
    case "hyperframes":
      return hasPartSlug(slugs, ["hyperframes", "hyperframe"]);
    case "live-artifact":
      return hasAnySlug(slugs, ["live-artifact"]) || hasPartSlug(slugs, ["live-artifact"]);
    case "image":
      return (hasAnySlug(slugs, ["image"]) || hasPartSlug(slugs, ["image-template"])) && !hasPartSlug(slugs, ["video", "audio", "live-artifact"]);
    case "video":
      return (hasAnySlug(slugs, ["video"]) || hasPartSlug(slugs, ["video-template"])) && !hasPartSlug(slugs, ["hyperframes", "audio"]);
    case "audio":
      return hasAnySlug(slugs, ["audio"]) || hasPartSlug(slugs, ["audio"]);
    default:
      return false;
  }
}

function curatedPriority(chipId, id) {
  const list = CURATED[chipId];
  if (!list) return null;
  const idx = list.indexOf(id);
  return idx >= 0 ? idx : null;
}

function presetRank(manifest, slugs, chipId) {
  let score = 0;
  if (manifest.name?.startsWith("example-")) score += 12;
  if (String(manifest.name ?? "").includes("template")) score += 8;
  if (manifest.od?.preview?.type === "html") score += 6;
  if (slugs.has(chipId)) score += 4;
  if (manifest.od?.preview) score += 3;
  return score;
}

function hasQuery(manifest) {
  const q = manifest.od?.useCase?.query;
  if (!q) return false;
  if (typeof q === "string") return q.trim().length > 0;
  return Boolean(q.en || q["zh-CN"]);
}

function qobj(manifest) {
  const query = manifest.od?.useCase?.query;
  if (!query) return { en: "", zh: "" };
  if (typeof query === "string") return { en: query.trim(), zh: query.trim() };
  const en = (query.en || "").trim();
  let zh = (query["zh-CN"] || query.zh || "").trim();
  zh = zh.replace(/^使用这个插件完成以下任务：\s*/, "");
  return { en, zh: zh || en };
}

function inferSubcategory(parent, slugs, folderName) {
  for (const sub of SUBCATEGORIES) {
    if (sub.parent !== parent) continue;
    if (sub.slugs.some((s) => slugs.has(s) || [...slugs].some((sl) => sl.includes(s)))) {
      return sub.slug;
    }
  }
  if (parent === "prototype" && folderName.includes("dashboard")) return "business-dashboards";
  if (parent === "deck") return "creative-decks";
  return undefined;
}

function previewKind(intent, sub) {
  if (intent === "deck") return "deck";
  if (intent === "hyperframes") return "motion";
  if (intent === "live-artifact") return "live";
  if (intent === "image" || intent === "video" || intent === "audio") return "media";
  if (sub === "landing-marketing") return "landing";
  if (sub === "business-dashboards") return "dashboard";
  if (sub === "app-prototypes") return "app";
  if (sub === "developer-tools") return "devtools";
  if (sub === "docs-reports") return "docs";
  if (sub === "brand-design") return "brand";
  return "landing";
}

function designMode(manifest, intent) {
  const mode = manifest.od?.mode;
  if (intent === "hyperframes") return "hyperframes";
  if (intent === "deck") return "deck";
  if (mode === "deck") return "deck";
  if (mode === "template") return "template";
  if (mode === "design_system") return "design_system";
  return "prototype";
}

function discoverManifests() {
  const roots = [
    { prefix: "examples", dir: path.join(OD_BASE, "examples") },
    { prefix: "image-templates", dir: path.join(OD_BASE, "image-templates") },
    { prefix: "video-templates", dir: path.join(OD_BASE, "video-templates") },
  ];
  const found = [];
  for (const { prefix, dir } of roots) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const mp = path.join(dir, name, "open-design.json");
      if (!fs.existsSync(mp)) continue;
      found.push({
        folder: `${prefix}/${name}`,
        folderName: name,
        manifest: JSON.parse(fs.readFileSync(mp, "utf8")),
        srcDir: path.join(dir, name),
      });
    }
  }
  return found;
}

function sortForChip(a, b, chipId) {
  const aCur = curatedPriority(chipId, a.pluginId);
  const bCur = curatedPriority(chipId, b.pluginId);
  if (aCur !== null || bCur !== null) {
    if (aCur !== null && bCur === null) return -1;
    if (aCur === null && bCur !== null) return 1;
    if (aCur !== bCur) return (aCur ?? 0) - (bCur ?? 0);
  }
  const rankDelta = b.rank - a.rank;
  if (rankDelta !== 0) return rankDelta;
  return a.title.localeCompare(b.title);
}

function copyPreviewFolder(folderName, srcDir) {
  const dest = path.join(PREVIEW_DEST, folderName);
  if (fs.existsSync(dest)) return;
  fs.cpSync(srcDir, dest, { recursive: true, force: true });
}

function copyDesignExampleFolder(folderName, srcDir) {
  const dest = path.join(DESIGN_RESOURCES_DEST, "examples", folderName);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(srcDir, dest, { recursive: true, force: true });
}

const chips = ["prototype", "deck", "live-artifact", "hyperframes", "image", "video"];
const manifests = discoverManifests();
const byChip = Object.fromEntries(chips.map((c) => [c, []]));

for (const item of manifests) {
  const { folder, folderName, manifest, srcDir } = item;
  const id = pluginId(folder, manifest);
  const slugs = recordSlugs(manifest, folder, id);
  if (!hasQuery(manifest) && !CURATED_RANK.has(id)) continue;

  for (const chipId of chips) {
    if (!matchesChip(chipId, slugs) && curatedPriority(chipId, id) === null) continue;
    if (!hasQuery(manifest) && curatedPriority(chipId, id) === null) continue;

    const entry = manifest.od?.preview?.entry;
    const poster = manifest.od?.preview?.poster;
    const previewType = manifest.od?.preview?.type;

    if (previewType === "html" && entry) {
      copyPreviewFolder(folderName, srcDir);
      copyDesignExampleFolder(folderName, srcDir);
    }

    const previewHtml =
      previewType === "html" && entry
        ? `/design-previews/examples/${folderName}/${entry.replace("./", "")}`
        : undefined;

    const { en, zh } = qobj(manifest);
    const sub =
      chipId === "prototype" || chipId === "deck"
        ? inferSubcategory(chipId, slugs, folderName)
        : undefined;
    const kind = previewKind(chipId, sub);

    byChip[chipId].push({
      pluginId: id,
      id: folderName,
      intent: chipId,
      subcategory: sub,
      designMode: designMode(manifest, chipId),
      title: manifest.title,
      titleZh: manifest.title_i18n?.["zh-CN"] || manifest.title,
      description: (manifest.description || "").split("\n")[0].slice(0, 160),
      brief: en,
      briefZh: zh,
      previewKind: kind,
      previewHtml,
      previewPoster: poster || undefined,
      artifact_entry: chipId === "hyperframes" || previewHtml ? "index.html" : undefined,
      rank: presetRank(manifest, slugs, chipId),
    });
  }
}

const out = [];
for (const chipId of chips) {
  const list = byChip[chipId].sort((a, b) => sortForChip(a, b, chipId)).slice(0, MAX_PER_CHIP);
  for (const ex of list) {
    const { rank: _r, pluginId: _p, ...rest } = ex;
    out.push(rest);
  }
}

for (const a of audioExamples) {
  out.push({
    id: a.id,
    intent: "audio",
    designMode: "prototype",
    title: a.title,
    titleZh: a.titleZh,
    description: a.title,
    brief: a.brief,
    briefZh: a.briefZh,
    previewKind: "media",
  });
}

const ts = `/** Auto-generated from scripts/gen-od-examples.mjs — do not edit by hand. */

export type OdExamplePreviewKind =
  | "landing"
  | "dashboard"
  | "app"
  | "devtools"
  | "docs"
  | "brand"
  | "deck"
  | "motion"
  | "live"
  | "media";

export interface OdDesignExampleRaw {
  id: string;
  title: string;
  titleZh: string;
  description: string;
  intent: string;
  subcategory?: string;
  designMode: string;
  brief: string;
  briefZh: string;
  previewKind: OdExamplePreviewKind;
  previewHtml?: string;
  previewPoster?: string;
  artifact_entry?: string;
}

export const OD_DESIGN_EXAMPLES_RAW: OdDesignExampleRaw[] = ${JSON.stringify(out, null, 2)};
`;

fs.writeFileSync(OUT_TS, ts);

const counts = Object.fromEntries(chips.map((c) => [c, byChip[c].slice(0, MAX_PER_CHIP).length]));
console.log("Generated", out.length, "examples. Per chip:", counts);
