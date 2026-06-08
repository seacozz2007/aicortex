package skills

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func setTestHome(t *testing.T, home string) {
	t.Helper()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
}

func TestGenerateUsageSkill(t *testing.T) {
	home := t.TempDir()
	setTestHome(t, home)

	path, err := GenerateUsageSkill("cursor")
	if err != nil {
		t.Fatalf("GenerateUsageSkill: %v", err)
	}

	want := filepath.Join(home, ".cursor", "skills", UsageSkillDirName, "SKILL.md")
	if path != want {
		t.Fatalf("path = %q, want %q", path, want)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read SKILL.md: %v", err)
	}
	content := string(data)
	if !strings.HasPrefix(content, "---\nname: aicortex\n") {
		t.Fatalf("unexpected frontmatter: %q", content[:min(80, len(content))])
	}
	if !strings.Contains(content, "aicortex issue list") {
		t.Fatal("expected issue commands in skill content")
	}
	if !strings.Contains(content, "aicortex skill -p cursor") {
		t.Fatal("expected refresh command in skill content")
	}
}

func TestGenerateUsageSkill_OverwritesExisting(t *testing.T) {
	home := t.TempDir()
	setTestHome(t, home)

	skillDir, err := UsageSkillPath("kiro")
	if err != nil {
		t.Fatalf("UsageSkillPath: %v", err)
	}
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte("stale"), 0o644); err != nil {
		t.Fatalf("write stale: %v", err)
	}

	path, err := GenerateUsageSkill("kiro")
	if err != nil {
		t.Fatalf("GenerateUsageSkill: %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if !strings.Contains(string(data), "name: aicortex") {
		t.Fatal("expected generated content after overwrite")
	}
}

func TestNormalizeProvider(t *testing.T) {
	tests := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{"cursor", "cursor", false},
		{"CURSOR", "cursor", false},
		{" kiro ", "kiro", false},
		{"codex", "", true},
	}
	for _, tc := range tests {
		got, err := NormalizeProvider(tc.in)
		if tc.wantErr {
			if err == nil {
				t.Fatalf("NormalizeProvider(%q) expected error", tc.in)
			}
			continue
		}
		if err != nil {
			t.Fatalf("NormalizeProvider(%q) error = %v", tc.in, err)
		}
		if got != tc.want {
			t.Fatalf("NormalizeProvider(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
