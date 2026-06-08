package design

// TemplateEntry is one built-in design template in the catalog.
type TemplateEntry struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	Mode          string `json:"mode"`
	Brief         string `json:"brief"`
	ArtifactEntry string `json:"artifact_entry,omitempty"`
}

// TemplateCatalog returns the Phase B built-in template gallery.
func TemplateCatalog() []TemplateEntry {
	return []TemplateEntry{
		{
			ID:          "landing-saas",
			Title:       "SaaS Landing",
			Description: "Hero, features, pricing, and CTA sections",
			Mode:        "template",
			Brief:       "Build a SaaS landing page with hero, three feature cards, pricing table, and footer CTA. Use semantic HTML sections.",
			ArtifactEntry: "index.html",
		},
		{
			ID:          "dashboard-analytics",
			Title:       "Analytics Dashboard",
			Description: "Sidebar nav + KPI cards + chart placeholders",
			Mode:        "prototype",
			Brief:       "Create an analytics dashboard with sidebar navigation, four KPI stat cards, and two chart placeholder panels.",
		},
		{
			ID:          "pitch-deck-startup",
			Title:       "Startup Pitch Deck",
			Description: "Fullscreen HTML slide deck for investors",
			Mode:        "deck",
			Brief:       "Create a 8-slide HTML pitch deck: title, problem, solution, product, traction, business model, team, ask. One section per slide.",
		},
		{
			ID:          "design-system-showcase",
			Title:       "Design System Showcase",
			Description: "Token gallery + component examples",
			Mode:        "design_system",
			Brief:       "Extend the active DESIGN.md with a showcase page demonstrating colors, typography, buttons, inputs, and cards.",
		},
	}
}
