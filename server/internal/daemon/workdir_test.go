package daemon

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNormalizeWorkdirPath(t *testing.T) {
	t.Parallel()
	if got := normalizeWorkdirPath(`  D:/CODE/demo  `); got != filepath.Clean(`D:/CODE/demo`) {
		t.Fatalf("normalizeWorkdirPath() = %q", got)
	}
}

func TestEnsureWorkdirAccessible(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	if err := ensureWorkdirAccessible(dir); err != nil {
		t.Fatalf("existing dir: %v", err)
	}
	if err := ensureWorkdirAccessible(filepath.Join(dir, "missing")); err == nil {
		t.Fatal("expected error for missing dir")
	}
	file := filepath.Join(dir, "file.txt")
	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := ensureWorkdirAccessible(file); err == nil {
		t.Fatal("expected error for file path")
	}
	if err := ensureWorkdirAccessible("https://gitee.com/foo/bar.git"); err == nil {
		t.Fatal("expected error for git URL")
	}
}
