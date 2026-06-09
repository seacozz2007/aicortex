import fs from "fs";

const data = JSON.parse(
  fs.readFileSync("packages/core/design/od-examples.generated.json", "utf8"),
);

function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

const lines = data.map((ex) => {
  const parts = [
    `    id: "${ex.id}"`,
    `    title: "${esc(String(ex.title))}"`,
    `    titleZh: "${esc(String(ex.titleZh))}"`,
    `    description: "${esc(String(ex.description))}"`,
    `    intent: "${ex.intent}"`,
  ];
  if (ex.subcategory) parts.push(`    subcategory: "${ex.subcategory}"`);
  parts.push(`    designMode: "${ex.designMode}"`);
  parts.push(`    previewClass: preview.${ex.previewClass?.toString().split(" ")[0].replace(/.*from-(\w+).*/, "") || "landing"}`);
  // fix previewClass - use kind mapping instead
  return null;
});

// simpler: output as const using JSON in ts file
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

export const OD_DESIGN_EXAMPLES_RAW: OdDesignExampleRaw[] = ${JSON.stringify(
  data.map((ex) => {
    const kind =
      ex.intent === "deck"
        ? "deck"
        : ex.intent === "hyperframes"
          ? "motion"
          : ex.intent === "live-artifact"
            ? "live"
            : ex.intent === "image" || ex.intent === "video" || ex.intent === "audio"
              ? "media"
              : ex.subcategory === "landing-marketing"
                ? "landing"
                : ex.subcategory === "business-dashboards"
                  ? "dashboard"
                  : ex.subcategory === "app-prototypes"
                    ? "app"
                    : ex.subcategory === "developer-tools"
                      ? "devtools"
                      : ex.subcategory === "docs-reports"
                        ? "docs"
                        : ex.subcategory === "brand-design"
                          ? "brand"
                          : "landing";
    const { previewClass: _pc, ...rest } = ex;
    return { ...rest, previewKind: kind };
  }),
  null,
  2,
)};
`;

fs.writeFileSync("packages/core/design/od-example-data.ts", ts);
console.log("wrote od-example-data.ts");
