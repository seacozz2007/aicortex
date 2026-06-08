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
