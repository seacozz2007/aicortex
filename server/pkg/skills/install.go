package skills

import (
	"fmt"
	"os"
	"path/filepath"
)

// GenerateUsageSkill writes the AICortex usage SKILL.md for the given platform.
// Existing files are overwritten by default.
func GenerateUsageSkill(platform string) (string, error) {
	platform, err := NormalizeProvider(platform)
	if err != nil {
		return "", err
	}

	skillDir, err := UsageSkillPath(platform)
	if err != nil {
		return "", err
	}

	content, err := UsageSkillContent(platform)
	if err != nil {
		return "", err
	}

	skillPath := filepath.Join(skillDir, "SKILL.md")
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		return "", fmt.Errorf("create skill dir: %w", err)
	}
	if err := os.WriteFile(skillPath, []byte(content), 0o644); err != nil {
		return "", fmt.Errorf("write SKILL.md: %w", err)
	}

	return skillPath, nil
}
