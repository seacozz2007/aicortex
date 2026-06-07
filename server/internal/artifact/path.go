package artifact

import (
	"errors"
	"path/filepath"
	"strings"
)

var errPathTraversal = errors.New("path traversal not allowed")

// ResolveUnderRoot joins root and a relative path, rejecting escapes.
func ResolveUnderRoot(root, rel string) (string, error) {
	root = filepath.Clean(root)
	if root == "" || root == "." {
		return "", errPathTraversal
	}
	rel = strings.TrimSpace(rel)
	if rel == "" || rel == "." {
		return root, nil
	}
	rel = filepath.Clean(filepath.FromSlash(strings.ReplaceAll(rel, "\\", "/")))
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", errPathTraversal
	}
	joined := filepath.Clean(filepath.Join(root, rel))
	rootPrefix := root + string(filepath.Separator)
	if joined != root && !strings.HasPrefix(joined, rootPrefix) {
		return "", errPathTraversal
	}
	return joined, nil
}
