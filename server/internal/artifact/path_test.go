package artifact

import (
	"path/filepath"
	"testing"
)

func TestResolveUnderRoot(t *testing.T) {
	root := filepath.Clean("/tmp/workdir")
	got, err := ResolveUnderRoot(root, "index.html")
	if err != nil || filepath.Base(got) != "index.html" {
		t.Fatalf("expected index.html under root, got %q err=%v", got, err)
	}
	if _, err := ResolveUnderRoot(root, "../etc/passwd"); err == nil {
		t.Fatal("expected traversal rejection")
	}
}
