// Package defaultskills provides system default skills that are
// automatically seeded into every new workspace. These skills teach agents
// platform-specific capabilities (interactive forms, etc.) without requiring
// the user to author skill content from scratch.
package defaultskills

import _ "embed"

//go:embed question-form/SKILL.md
var questionFormSkillContent string

// DefaultSkill describes a single system-provided skill.
type DefaultSkill struct {
	Name        string
	Description string
	Content     string
}

// All is the canonical list of default skills seeded into every new workspace.
// To add a new default skill, add a new subdirectory under defaultskills/ with
// a SKILL.md file, embed it, and append an entry here.
var All = []DefaultSkill{
	{
		Name:        "Interactive Forms",
		Description: "Gather structured requirements using tappable forms (radio, checkbox, select, text, textarea)",
		Content:     questionFormSkillContent,
	},
}

// QuestionForm returns the built-in Interactive Forms skill.
func QuestionForm() DefaultSkill {
	return All[0]
}
