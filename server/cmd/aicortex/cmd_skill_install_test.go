package main

import (
	"bytes"
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

func TestRunSkillGenerate(t *testing.T) {
	home := t.TempDir()
	setTestHome(t, home)

	cmd := testCmd()
	cmd.Flags().StringP("platform", "p", "claude", "")
	if err := cmd.Flags().Set("platform", "cursor"); err != nil {
		t.Fatalf("set platform: %v", err)
	}

	oldStdout := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	os.Stdout = w
	if err := runSkillGenerate(cmd, nil); err != nil {
		t.Fatalf("runSkillGenerate: %v", err)
	}
	w.Close()
	os.Stdout = oldStdout
	var out bytes.Buffer
	_, _ = out.ReadFrom(r)

	skillPath := filepath.Join(home, ".cursor", "skills", "aicortex", "SKILL.md")
	data, err := os.ReadFile(skillPath)
	if err != nil {
		t.Fatalf("read generated skill: %v", err)
	}
	if !strings.Contains(string(data), "name: aicortex") {
		t.Fatal("expected generated aicortex skill content")
	}
	if !strings.Contains(out.String(), "Generated") {
		t.Fatalf("expected Generated output, got %q", out.String())
	}
}
