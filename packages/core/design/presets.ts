import type { DesignSystemResourceRef } from "../types/project";

export interface DesignSystemPreset {
  id: string;
  label: string;
  ref: DesignSystemResourceRef;
}

/** Curated DESIGN.md presets ported from Open Design design-systems catalog. */
export const DESIGN_SYSTEM_PRESETS: DesignSystemPreset[] = [
  {
    id: "linear-app",
    label: "Linear App",
    ref: {
      name: "linear-app",
      source: "import:open-design/design-systems/linear-app/DESIGN.md",
      content: `# Linear App Design System

## Typography
- Font: Inter, system-ui, sans-serif
- Headings: 600 weight, tight tracking
- Body: 14px / 1.5

## Colors
- Background: #08090a
- Surface: #141516
- Border: rgba(255,255,255,0.08)
- Text primary: #f7f8f8
- Text secondary: #8a8f98
- Accent: #5e6ad2

## Layout
- Max content width: 1120px
- Section padding: 24px–48px
- Border radius: 8px (cards), 6px (buttons)

## Components
- Buttons: subtle fill, 1px border, hover lift
- Inputs: dark surface, focus ring accent
- Cards: surface bg + hairline border
`,
    },
  },
  {
    id: "stripe-dashboard",
    label: "Stripe Dashboard",
    ref: {
      name: "stripe-dashboard",
      source: "import:open-design/design-systems/stripe-dashboard/DESIGN.md",
      content: `# Stripe Dashboard Design System

## Typography
- Font: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
- Headings: 600, neutral-900 on light
- Body: 14px

## Colors
- Background: #f6f9fc
- Surface: #ffffff
- Border: #e3e8ee
- Text: #425466
- Accent: #635bff

## Layout
- Card shadow: 0 1px 3px rgba(50,50,93,.15)
- Radius: 4px
- Dense data tables with zebra rows
`,
    },
  },
  {
    id: "minimal-light",
    label: "Minimal Light",
    ref: {
      name: "minimal-light",
      source: "builtin:minimal-light",
      content: `# Minimal Light

## Typography
- Font: system-ui, sans-serif
- Scale: 12 / 14 / 16 / 20 / 24 / 32

## Colors
- Background: #ffffff
- Surface: #f4f4f5
- Text: #18181b
- Muted: #71717a
- Accent: #2563eb

## Spacing
- Base unit: 4px
- Section gaps: 24px–64px
`,
    },
  },
];
