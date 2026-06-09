package issueutil

import (
	"fmt"
	"strings"
)

var validIssuePriorities = map[string]struct{}{
	"urgent": {},
	"high":   {},
	"medium": {},
	"low":    {},
	"none":   {},
}

var linearPriorityAliases = map[string]string{
	"p0": "urgent",
	"p1": "high",
	"p2": "medium",
	"p3": "low",
	"p4": "none",
}

var spokenPriorityAliases = map[string]string{
	"asap":     "urgent",
	"critical": "urgent",
	"blocker":  "urgent",
}

// NormalizeIssuePriority maps Linear-style P0–P4 labels and common aliases
// onto the issue table's canonical values. Returns an error for unknown input.
func NormalizeIssuePriority(raw string) (string, error) {
	p := strings.TrimSpace(strings.ToLower(raw))
	if p == "" {
		return "none", nil
	}
	if mapped, ok := linearPriorityAliases[p]; ok {
		return mapped, nil
	}
	if mapped, ok := spokenPriorityAliases[p]; ok {
		return mapped, nil
	}
	if _, ok := validIssuePriorities[p]; ok {
		return p, nil
	}
	return "", fmt.Errorf(
		"invalid priority %q: use urgent, high, medium, low, none (or P0–P4)",
		strings.TrimSpace(raw),
	)
}
