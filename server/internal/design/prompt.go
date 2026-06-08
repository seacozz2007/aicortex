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

	if craft := CraftForMode(mode); craft != "" {
		b.WriteString("## Craft\n\n")
		b.WriteString(craft)
		b.WriteString("\n\n")
	}

	if mode == "deck" {
		if s := loadPromptFile("snippets/deck_framework.md"); s != "" {
			b.WriteString(s)
			b.WriteString("\n\n")
		}
	}

	b.WriteString("## Output rules\n\n")
	fmt.Fprintf(&b, "- Write files under the task work directory; primary preview entry: `%s`\n", entry)
	b.WriteString("- Prefer real files over inline-only responses\n")
	b.WriteString("- Tag interactive regions with `data-aicortex-id` for comment mode\n")
	b.WriteString("- Keep responses concise after file writes\n\n")

	b.WriteString("## User brief\n\n")
	b.WriteString(in.ChatMessage)
	return b.String()
}
