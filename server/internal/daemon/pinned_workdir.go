package daemon

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
)

// pinnedWorkdirPath computes the fixed workdir path for a (workspace, project, agent) tuple.
// Layout: <workspacesRoot>/<workspace_id>/projects/<project_id>/<agent_name>/
func pinnedWorkdirPath(workspacesRoot, workspaceID, projectID, agentName string) string {
	safe := sanitizeAgentName(agentName)
	return filepath.Join(workspacesRoot, workspaceID, "projects", projectID, safe)
}

// preparePinnedWorkdir ensures the pinned workdir exists and syncs it with
// the remote if it's a git repo. Returns the workdir path.
func preparePinnedWorkdir(workspacesRoot, workspaceID, projectID, agentName string, log *slog.Logger) (string, error) {
	dir := pinnedWorkdirPath(workspacesRoot, workspaceID, projectID, agentName)

	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("create pinned workdir: %w", err)
	}

	// If it's a git repo, sync with remote before the agent starts.
	if isGitRepo(dir) {
		syncGitRepo(dir, log)
	}

	return dir, nil
}

// syncGitRepo does a git fetch + reset --hard to the remote tracking branch,
// ensuring the workdir matches the latest remote state.
func syncGitRepo(dir string, log *slog.Logger) {
	// Fetch latest from remote.
	out, err := runGit(dir, "fetch", "origin")
	if err != nil {
		log.Warn("pinned-workdir: git fetch failed", "error", err, "output", strings.TrimSpace(out))
		return
	}

	// Determine the current branch.
	branchOut, err := runGit(dir, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		log.Warn("pinned-workdir: cannot determine branch", "error", err)
		return
	}
	branch := strings.TrimSpace(branchOut)
	if branch == "" || branch == "HEAD" {
		// Detached HEAD — try to find default branch.
		branch = detectDefaultBranch(dir)
		if branch == "" {
			log.Warn("pinned-workdir: cannot determine branch for reset, skipping sync")
			return
		}
		// Checkout the branch first.
		if out, err := runGit(dir, "checkout", branch); err != nil {
			log.Warn("pinned-workdir: checkout failed", "error", err, "output", strings.TrimSpace(out))
			return
		}
	}

	// Hard reset to remote tracking branch.
	remote := "origin/" + branch
	out, err = runGit(dir, "reset", "--hard", remote)
	if err != nil {
		log.Warn("pinned-workdir: git reset --hard failed", "error", err, "output", strings.TrimSpace(out))
		return
	}

	// Clean untracked files.
	if out, err := runGit(dir, "clean", "-fd"); err != nil {
		log.Warn("pinned-workdir: git clean failed", "error", err, "output", strings.TrimSpace(out))
	}

	log.Info("pinned-workdir: synced to remote", "branch", branch, "dir", dir)
}

// detectDefaultBranch tries to find the default branch name (main or master).
func detectDefaultBranch(dir string) string {
	// Try origin/HEAD.
	out, err := runGit(dir, "symbolic-ref", "refs/remotes/origin/HEAD")
	if err == nil {
		ref := strings.TrimSpace(out)
		// refs/remotes/origin/main -> main
		parts := strings.Split(ref, "/")
		if len(parts) > 0 {
			return parts[len(parts)-1]
		}
	}
	// Fallback: check if main or master exists.
	if _, err := runGit(dir, "rev-parse", "--verify", "origin/main"); err == nil {
		return "main"
	}
	if _, err := runGit(dir, "rev-parse", "--verify", "origin/master"); err == nil {
		return "master"
	}
	return ""
}

func isGitRepo(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, ".git"))
	return err == nil
}

func sanitizeAgentName(name string) string {
	name = strings.ToLower(name)
	name = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return '_'
	}, name)
	if name == "" {
		name = "agent"
	}
	return name
}

// extractLocalPath returns the path from the first local_path project resource,
// or empty string if none exists.
func extractLocalPath(resources []ProjectResourceData) string {
	for _, r := range resources {
		if r.ResourceType == "local_path" {
			var payload struct {
				Path string `json:"path"`
			}
			if err := json.Unmarshal(r.ResourceRef, &payload); err == nil && payload.Path != "" {
				return payload.Path
			}
		}
	}
	return ""
}
