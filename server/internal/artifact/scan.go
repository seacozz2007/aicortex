package artifact

import (
	"os"
	"path/filepath"
	"strings"
)

const (
	MaxScanDepth     = 4
	MaxScanArtifacts = 5
)

// ScanCandidate is one HTML artifact discovered under a task work directory.
type ScanCandidate struct {
	RelPath string
	Kind    string
	Title   string
}

var scanPriorityPaths = []string{
	"index.html",
	"preview.html",
	"dist/index.html",
	"build/index.html",
	"public/index.html",
	"out/index.html",
}

var scanSkipDirs = map[string]bool{
	".git":         true,
	".svn":         true,
	".hg":          true,
	"node_modules": true,
	"vendor":       true,
	".next":        true,
	".cache":       true,
	"__pycache__":  true,
	".venv":        true,
	"venv":         true,
}

// ScanHTMLArtifacts finds previewable HTML files under root. Best-effort:
// missing root or permission errors yield an empty slice.
func ScanHTMLArtifacts(root string) []ScanCandidate {
	root = strings.TrimSpace(root)
	if root == "" {
		return nil
	}
	root = filepath.Clean(root)
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return nil
	}

	seen := make(map[string]bool)
	out := make([]ScanCandidate, 0, MaxScanArtifacts)

	add := func(rel string) {
		if len(out) >= MaxScanArtifacts || seen[rel] {
			return
		}
		abs, err := ResolveUnderRoot(root, rel)
		if err != nil {
			return
		}
		fi, err := os.Stat(abs)
		if err != nil || fi.IsDir() {
			return
		}
		seen[rel] = true
		title := filepath.Base(rel)
		out = append(out, ScanCandidate{
			RelPath: rel,
			Kind:    "html",
			Title:   title,
		})
	}

	for _, rel := range scanPriorityPaths {
		add(filepath.ToSlash(rel))
	}
	if len(out) >= MaxScanArtifacts {
		return out
	}

	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil || len(out) >= MaxScanArtifacts {
			return nil
		}
		if d.IsDir() {
			if path != root {
				name := d.Name()
				if scanSkipDirs[name] || strings.HasPrefix(name, ".") && name != "." {
					return filepath.SkipDir
				}
				rel, err := filepath.Rel(root, path)
				if err != nil {
					return nil
				}
				depth := strings.Count(filepath.ToSlash(rel), "/") + 1
				if depth >= MaxScanDepth {
					return filepath.SkipDir
				}
			}
			return nil
		}
		name := strings.ToLower(d.Name())
		if !strings.HasSuffix(name, ".html") && !strings.HasSuffix(name, ".htm") {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return nil
		}
		add(filepath.ToSlash(rel))
		return nil
	})

	return out
}
