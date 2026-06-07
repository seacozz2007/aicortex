package artifact

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestScanHTMLArtifacts(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "index.html"))
	mustWrite(t, filepath.Join(root, "dist", "index.html"))
	mustWrite(t, filepath.Join(root, "node_modules", "pkg", "index.html"))
	mustWrite(t, filepath.Join(root, "deep", "a", "b", "c", "d", "nested.html"))

	got := ScanHTMLArtifacts(root)
	if len(got) == 0 {
		t.Fatal("expected candidates")
	}
	if got[0].RelPath != "index.html" {
		t.Fatalf("priority path first: got %q", got[0].RelPath)
	}
	for _, c := range got {
		if strings.Contains(c.RelPath, "node_modules") {
			t.Fatalf("skipped node_modules: %q", c.RelPath)
		}
	}
}

func mustWrite(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("<html></html>"), 0o644); err != nil {
		t.Fatal(err)
	}
}
