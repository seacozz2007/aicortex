import type { DesignMode } from "../types/design";

export interface DesignTemplate {
  id: string;
  title: string;
  description: string;
  mode: DesignMode;
  brief: string;
  artifact_entry?: string;
}

/** Built-in template catalog (Phase B) — mirrors OD template gallery subset. */
export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    id: "landing-saas",
    title: "SaaS Landing",
    description: "Hero, features, pricing, and CTA sections",
    mode: "template",
    brief:
      "Build a SaaS landing page with hero, three feature cards, pricing table, and footer CTA. Use semantic HTML sections.",
    artifact_entry: "index.html",
  },
  {
    id: "dashboard-analytics",
    title: "Analytics Dashboard",
    description: "Sidebar nav + KPI cards + chart placeholders",
    mode: "prototype",
    brief:
      "Create an analytics dashboard with sidebar navigation, four KPI stat cards, and two chart placeholder panels.",
  },
  {
    id: "pitch-deck-startup",
    title: "Startup Pitch Deck",
    description: "Fullscreen HTML slide deck for investors",
    mode: "deck",
    brief:
      "Create a 8-slide HTML pitch deck: title, problem, solution, product, traction, business model, team, ask. One section per slide.",
  },
  {
    id: "design-system-showcase",
    title: "Design System Showcase",
    description: "Token gallery + component examples",
    mode: "design_system",
    brief:
      "Extend the active DESIGN.md with a showcase page demonstrating colors, typography, buttons, inputs, and cards.",
  },
];
