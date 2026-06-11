package daemon

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// normalizeWorkdirPath trims and normalizes a user-supplied directory path.
func normalizeWorkdirPath(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return ""
	}
	return filepath.Clean(filepath.FromSlash(p))
}

func isRemoteWorkdirPath(p string) bool {
	p = strings.TrimSpace(strings.ToLower(p))
	if strings.HasPrefix(p, "http://") || strings.HasPrefix(p, "https://") ||
		strings.HasPrefix(p, "git://") || strings.HasPrefix(p, "ssh://") {
		return true
	}
	if u, err := url.Parse(p); err == nil && u.Scheme != "" && u.Host != "" {
		return true
	}
	if strings.Contains(p, "@") && strings.Contains(p, ":") && !strings.Contains(p, ":\\") {
		return true
	}
	return false
}

// ensureWorkdirAccessible verifies that a directory exists and is usable as
// an agent Cwd. On Windows an invalid Cwd surfaces as
// "fork/exec ... .cmd: The directory name is invalid." from os/exec.
func ensureWorkdirAccessible(path string) error {
	path = normalizeWorkdirPath(path)
	if path == "" {
		return fmt.Errorf("working directory is empty")
	}
	if isRemoteWorkdirPath(path) {
		return fmt.Errorf("working directory %q looks like a remote git URL; configure it as a github_repo resource and set local_path to the cloned directory on this machine", path)
	}
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("working directory %q is not accessible: %w", path, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("working directory %q is not a directory", path)
	}
	return nil
}
