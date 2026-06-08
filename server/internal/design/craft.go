package design

import (
	"embed"
	"fmt"
	"strings"
)

//go:embed craft/*.md snippets/*.md
var promptFS embed.FS

func loadPromptFile(path string) string {
	data, err := promptFS.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// CraftForMode returns craft guidance for a design mode.
func CraftForMode(mode string) string {
	mode = strings.TrimSpace(mode)
	if mode == "" {
		mode = "prototype"
	}
	content := loadPromptFile(fmt.Sprintf("craft/%s.md", mode))
	if content == "" {
		content = loadPromptFile("craft/prototype.md")
	}
	return content
}

// CraftForRequires merges craft files referenced by skill metadata od.craft.requires.
func CraftForRequires(requires []string, fallbackMode string) string {
	seen := map[string]struct{}{}
	var parts []string
	for _, req := range requires {
		req = strings.TrimSpace(req)
		if req == "" {
			continue
		}
		if _, ok := seen[req]; ok {
			continue
		}
		seen[req] = struct{}{}
		if craft := loadPromptFile(fmt.Sprintf("craft/%s.md", req)); craft != "" {
			parts = append(parts, craft)
		}
	}
	if len(parts) > 0 {
		return strings.Join(parts, "\n\n")
	}
	return CraftForMode(fallbackMode)
}
