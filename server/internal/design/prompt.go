package design

import (
	"fmt"
	"strings"
)

// PromptInput carries the fields needed to assemble an Open Design task prompt.
type PromptInput struct {
	DesignMode          string
	ChatMessage         string
	DesignSystemContent string
	DesignSystemName    string
	ArtifactEntry       string
	ProjectTitle        string
	CraftRequires       []string
	ParameterValues     map[string]string
	DesignExampleHint   string // set when OD example templates were seeded into work_dir
	DesignExampleID     string // od.example_id from selected gallery card
}

// BuildPrompt assembles the per-turn user prompt for design_mode tasks.
func BuildPrompt(in PromptInput) string {
	mode := strings.TrimSpace(in.DesignMode)
	if mode == "" {
		mode = "prototype"
	}
	entry := strings.TrimSpace(in.ArtifactEntry)
	if entry == "" {
		entry = "index.html"
	}

	var b strings.Builder

	if s := loadPromptFile("snippets/injection_resistance.md"); s != "" {
		b.WriteString(s)
		b.WriteString("\n\n")
	}
	if s := loadPromptFile("snippets/official_system.md"); s != "" {
		b.WriteString(s)
		b.WriteString("\n\n")
	}

	if in.ProjectTitle != "" {
		fmt.Fprintf(&b, "Project: **%s**\n\n", in.ProjectTitle)
	}
	fmt.Fprintf(&b, "Design mode: **%s**\n", mode)
	fmt.Fprintf(&b, "Primary artifact entry: **%s**\n\n", entry)

	if strings.TrimSpace(in.DesignSystemContent) != "" {
		name := strings.TrimSpace(in.DesignSystemName)
		if name == "" {
			name = "Design System"
		}
		fmt.Fprintf(&b, "## Active Design System (%s)\n\n", name)
		b.WriteString(in.DesignSystemContent)
		b.WriteString("\n\n")
	}

	if s := loadPromptFile("snippets/discovery.md"); s != "" {
		b.WriteString(s)
		b.WriteString("\n\n")
	}

	if craft := CraftForRequires(in.CraftRequires, mode); craft != "" {
		b.WriteString("## Craft\n\n")
		b.WriteString(craft)
		b.WriteString("\n\n")
	}

	if strings.TrimSpace(in.DesignExampleHint) != "" {
		b.WriteString("## Bundled example templates\n\n")
		b.WriteString(in.DesignExampleHint)
		b.WriteString("\n\n")
	}

	if len(in.ParameterValues) > 0 {
		b.WriteString("## Design parameters\n\n")
		for k, v := range in.ParameterValues {
			fmt.Fprintf(&b, "- **%s**: %s\n", k, v)
		}
		b.WriteString("\n")
	}

	if mode == "deck" {
		if strings.TrimSpace(in.DesignExampleID) == "html-ppt-presenter-mode-reveal" ||
			strings.Contains(strings.ToLower(in.DesignExampleHint), "presenter-mode") {
			b.WriteString("## html-ppt deck rules\n\n")
			b.WriteString("- The work directory already contains a **working** `index.html` bootstrapped from `presenter-mode-reveal` with `assets/runtime.js` wired.\n")
			b.WriteString("- **Edit that file** — replace slide copy and `<aside class=\"notes\">` text only. Keep `.deck`, `.slide`, theme links, and runtime script tags.\n")
			b.WriteString("- Never emit a long scrolling page; one viewport = one slide. Speaker notes stay in `<aside class=\"notes\">`, never on the visible slide.\n")
			b.WriteString("- After edits, verify `←` `→` navigation and `S` presenter popup still work.\n\n")
		} else if s := loadPromptFile("snippets/deck_framework.md"); s != "" {
			b.WriteString(s)
			b.WriteString("\n\n")
		}
	}

	b.WriteString("## Output rules\n\n")
	fmt.Fprintf(&b, "- Write files under the task work directory; primary preview entry: `%s`\n", entry)
	b.WriteString("- Prefer real files over inline-only responses\n")
	b.WriteString("- Tag interactive regions with `data-aicortex-id` for comment mode\n")
	b.WriteString("- **Visual prototype only** — embed fictional sample cards/rows in HTML; do **not** run `aicortex issue create` or any other workspace write commands\n")
	b.WriteString("- Kanban/dashboard/backlog briefs describe **UI layout**, not real tasks to create in AICortex\n")
	b.WriteString("- Keep responses concise after file writes\n\n")

	b.WriteString("## User brief\n\n")
	b.WriteString(in.ChatMessage)
	return b.String()
}
