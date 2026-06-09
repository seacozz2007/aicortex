package design

// PluginEntry is a curated non-media design plugin in the registry.
type PluginEntry struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	Intent        string `json:"intent"`
	Subcategory   string `json:"subcategory,omitempty"`
	Mode          string `json:"mode"`
	Brief         string `json:"brief"`
	ArtifactEntry string `json:"artifact_entry,omitempty"`
	PreviewPath   string `json:"preview_path,omitempty"`
}

// PluginCatalog returns curated prototype/deck/template plugins (no image/video/audio).
func PluginCatalog() []PluginEntry {
	return []PluginEntry{
		{ID: "open-design-landing", Title: "Open Design Landing", Description: "Marketing landing with hero and feature grid", Intent: "prototype", Subcategory: "landing-marketing", Mode: "prototype", Brief: "Build a polished product landing page with hero, social proof, three feature cards, pricing, and footer CTA.", ArtifactEntry: "index.html", PreviewPath: "/design-previews/open-design-landing.svg"},
		{ID: "saas-landing", Title: "SaaS Landing", Description: "Hero, features, pricing, and CTA sections", Intent: "prototype", Subcategory: "landing-marketing", Mode: "template", Brief: "Build a SaaS landing page with hero, three feature cards, pricing table, and footer CTA.", ArtifactEntry: "index.html", PreviewPath: "/design-previews/saas-landing.svg"},
		{ID: "analytics-dashboard", Title: "Analytics Dashboard", Description: "Sidebar nav + KPI cards + chart placeholders", Intent: "prototype", Subcategory: "business-dashboards", Mode: "prototype", Brief: "Create an analytics dashboard with sidebar navigation, four KPI stat cards, and two chart placeholder panels.", PreviewPath: "/design-previews/analytics-dashboard.svg"},
		{ID: "kanban-board", Title: "Kanban Board", Description: "Multi-column task board", Intent: "prototype", Subcategory: "app-prototypes", Mode: "prototype", Brief: "Design a kanban board app with header, project switcher, and three columns with card stacks.", PreviewPath: "/design-previews/kanban-board.svg"},
		{ID: "pitch-deck-startup", Title: "Startup Pitch Deck", Description: "Fullscreen HTML slide deck", Intent: "deck", Subcategory: "pitch-business", Mode: "deck", Brief: "Create an 8-slide HTML pitch deck: title, problem, solution, product, traction, business model, team, ask.", ArtifactEntry: "index.html", PreviewPath: "/design-previews/pitch-deck.svg"},
		{ID: "design-system-showcase", Title: "Design System Showcase", Description: "Token gallery + component examples", Intent: "design_system", Mode: "design_system", Brief: "Extend the active design system with a showcase page demonstrating colors, typography, buttons, inputs, and cards.", PreviewPath: "/design-previews/design-system.svg"},
	}
}
