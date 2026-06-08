package skills

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const UsageSkillDirName = "aicortex"

// SupportedUsageProviders lists platforms for `aicortex skill -p`.
var SupportedUsageProviders = []string{"claude", "cursor", "kiro"}

// NormalizeProvider lowercases and validates a platform name for `aicortex skill -p`.
func NormalizeProvider(provider string) (string, error) {
	p := strings.ToLower(strings.TrimSpace(provider))
	switch p {
	case "claude", "cursor", "kiro":
		return p, nil
	default:
		return "", fmt.Errorf("unsupported provider %q (supported: %s)", provider, strings.Join(SupportedUsageProviders, ", "))
	}
}

// LocalSkillRoot returns the user-level skill directory for a provider.
// Project-level paths (e.g. workdir/.cursor/skills) are handled separately by the daemon.
func LocalSkillRoot(provider string) (string, bool, error) {
	provider, err := NormalizeProvider(provider)
	if err != nil {
		return "", false, err
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", false, fmt.Errorf("resolve user home: %w", err)
	}

	switch provider {
	case "claude":
		return filepath.Join(home, ".claude", "skills"), true, nil
	case "cursor":
		return filepath.Join(home, ".cursor", "skills"), true, nil
	case "kiro":
		return filepath.Join(home, ".kiro", "skills"), true, nil
	default:
		return "", false, nil
	}
}

// UsageSkillPath returns the directory where the AICortex usage skill is installed.
func UsageSkillPath(provider string) (string, error) {
	root, supported, err := LocalSkillRoot(provider)
	if err != nil {
		return "", err
	}
	if !supported {
		return "", fmt.Errorf("provider %q does not support local skill install", provider)
	}
	return filepath.Join(root, UsageSkillDirName), nil
}
