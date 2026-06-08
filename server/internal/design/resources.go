package design

import (
	"encoding/json"
	"strings"
)

type designSystemRef struct {
	Name    string `json:"name"`
	Content string `json:"content"`
	Source  string `json:"source,omitempty"`
}

// ParseDesignSystemResource extracts name and DESIGN.md content from a project resource ref.
func ParseDesignSystemResource(resourceRef json.RawMessage) (name, content string) {
	var payload designSystemRef
	if err := json.Unmarshal(resourceRef, &payload); err != nil {
		return "", ""
	}
	return strings.TrimSpace(payload.Name), strings.TrimSpace(payload.Content)
}
