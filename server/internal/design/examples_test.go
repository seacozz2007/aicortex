package design

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseExampleIDFromSkillConfig(t *testing.T) {
	t.Parallel()
	cfg := []byte(`{"od":{"example_id":"html-ppt-presenter-mode-reveal"}}`)
	if got := ParseExampleIDFromSkillConfig(cfg); got != "html-ppt-presenter-mode-reveal" {
		t.Fatalf("got %q", got)
	}
}

func TestExampleSkillName(t *testing.T) {
	t.Parallel()
	name, err := exampleSkillName("html-ppt-presenter-mode-reveal")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if name != "html-ppt-presenter-mode" {
		t.Fatalf("got %q", name)
	}
}

func TestSeedExampleWorkDir(t *testing.T) {
	srcRoot := exampleSourceDir("html-ppt-presenter-mode-reveal")
	if srcRoot == "" {
		t.Skip("example bundle not available in this checkout")
	}

	workDir := t.TempDir()
	if err := SeedExampleWorkDir(workDir, "html-ppt-presenter-mode-reveal"); err != nil {
		t.Fatalf("seed: %v", err)
	}

	skillPath := filepath.Join(workDir, "skills", "html-ppt-presenter-mode", "SKILL.md")
	if _, err := os.Stat(skillPath); err != nil {
		t.Fatalf("expected example skill at %s: %v", skillPath, err)
	}

	marker := filepath.Join(workDir, designExampleSeedMarker)
	data, err := os.ReadFile(marker)
	if err != nil {
		t.Fatalf("marker: %v", err)
	}
	if string(data) != "html-ppt-presenter-mode-reveal" {
		t.Fatalf("marker = %q", data)
	}

	// Idempotent second call.
	if err := SeedExampleWorkDir(workDir, "html-ppt-presenter-mode-reveal"); err != nil {
		t.Fatalf("re-seed: %v", err)
	}

	indexPath := filepath.Join(workDir, "index.html")
	indexData, err := os.ReadFile(indexPath)
	if err != nil {
		t.Fatalf("expected bootstrapped index.html: %v", err)
	}
	if !strings.Contains(string(indexData), `class="deck"`) {
		t.Fatalf("bootstrapped index.html missing .deck wrapper")
	}
	if !strings.Contains(string(indexData), `src="assets/runtime.js"`) {
		t.Fatalf("bootstrapped index.html missing rewritten runtime.js path")
	}
	if _, err := os.Stat(filepath.Join(workDir, "assets", "runtime.js")); err != nil {
		t.Fatalf("expected assets/runtime.js: %v", err)
	}
}
