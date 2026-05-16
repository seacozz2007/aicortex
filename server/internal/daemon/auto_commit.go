package daemon

import (
	"bytes"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// defaultExcludePatterns are common build artifacts that should never be
// committed. They are written to .git/info/exclude (a local-only gitignore
// that does not pollute the repository).
var defaultExcludePatterns = []string{
	"node_modules",
	".next",
	".turbo",
	"__pycache__",
	"target",
	"dist",
	"build",
	".cache",
	"*.pyc",
	"*.o",
	"*.so",
	"*.dylib",
	".env",
	".env.local",
}

// autoCommitAndPush stages, commits, and pushes any uncommitted changes in
// the task workdir after the agent finishes. It is best-effort: failures are
// logged but never block task completion reporting.
func autoCommitAndPush(workDir string, taskID string, agentName string, log *slog.Logger) {
	if workDir == "" {
		return
	}

	// Check if workDir is inside a git repo.
	if _, err := os.Stat(filepath.Join(workDir, ".git")); err != nil {
		// Also check if it's a worktree (file .git pointing to gitdir).
		gitFile := filepath.Join(workDir, ".git")
		data, readErr := os.ReadFile(gitFile)
		if readErr != nil || !bytes.HasPrefix(data, []byte("gitdir:")) {
			log.Debug("auto-commit: not a git repo, skipping", "workdir", workDir)
			return
		}
	}

	// Ensure .git/info/exclude has common patterns.
	ensureGitExclude(workDir, log)

	// Check if there are uncommitted changes.
	statusOut, err := runGit(workDir, "status", "--porcelain")
	if err != nil {
		log.Warn("auto-commit: git status failed", "error", err)
		return
	}
	if strings.TrimSpace(statusOut) == "" {
		log.Debug("auto-commit: working tree clean, skipping")
		return
	}

	// Stage all changes (respecting .gitignore and .git/info/exclude).
	if _, err := runGit(workDir, "add", "-A"); err != nil {
		log.Warn("auto-commit: git add failed", "error", err)
		return
	}

	// Check again after staging (in case everything was ignored).
	diffOut, err := runGit(workDir, "diff", "--cached", "--quiet")
	_ = diffOut
	if err == nil {
		// exit 0 means no staged changes
		log.Debug("auto-commit: no staged changes after add, skipping")
		return
	}

	// Commit.
	shortTask := taskID
	if len(shortTask) > 8 {
		shortTask = shortTask[:8]
	}
	commitMsg := fmt.Sprintf("feat: auto-commit by %s [task:%s]", agentName, shortTask)
	if _, err := runGit(workDir, "commit", "-m", commitMsg, "--no-verify"); err != nil {
		log.Warn("auto-commit: git commit failed", "error", err)
		return
	}

	log.Info("auto-commit: committed changes", "agent", agentName, "task", shortTask)

	// Push to the default branch (main/master), not the agent's worktree branch.
	// This ensures the next agent task can see the changes.
	defaultBranch := detectDefaultBranch(workDir)
	if defaultBranch == "" {
		// Fallback: push current branch.
		if _, err := runGit(workDir, "push", "origin", "HEAD"); err != nil {
			log.Warn("auto-commit: git push failed (non-fatal)", "error", err)
			return
		}
	} else {
		// Push current HEAD to the default branch on remote.
		if _, err := runGit(workDir, "push", "origin", "HEAD:"+defaultBranch); err != nil {
			log.Warn("auto-commit: git push to default branch failed (non-fatal)", "error", err, "branch", defaultBranch)
			return
		}
	}

	log.Info("auto-commit: pushed to remote")
}

// ensureGitExclude writes default exclude patterns to .git/info/exclude if
// the repository does not already have a .gitignore covering them.
func ensureGitExclude(workDir string, log *slog.Logger) {
	// If .gitignore exists, assume the repo manages its own ignores.
	if _, err := os.Stat(filepath.Join(workDir, ".gitignore")); err == nil {
		return
	}

	// Resolve the actual git dir (handles worktrees where .git is a file).
	gitDir := filepath.Join(workDir, ".git")
	info, err := os.Stat(gitDir)
	if err != nil {
		return
	}
	if !info.IsDir() {
		// .git is a file (worktree) — read the gitdir path.
		data, err := os.ReadFile(gitDir)
		if err != nil {
			return
		}
		line := strings.TrimSpace(string(data))
		gitDir = strings.TrimPrefix(line, "gitdir: ")
		if !filepath.IsAbs(gitDir) {
			gitDir = filepath.Join(workDir, gitDir)
		}
	}

	excludePath := filepath.Join(gitDir, "info", "exclude")

	// Read existing content to avoid duplicating.
	existing, _ := os.ReadFile(excludePath)
	existingStr := string(existing)

	var toAdd []string
	for _, pat := range defaultExcludePatterns {
		if !strings.Contains(existingStr, pat) {
			toAdd = append(toAdd, pat)
		}
	}

	if len(toAdd) == 0 {
		return
	}

	// Ensure info/ directory exists.
	if err := os.MkdirAll(filepath.Dir(excludePath), 0o755); err != nil {
		log.Warn("auto-commit: mkdir info/ failed", "error", err)
		return
	}

	f, err := os.OpenFile(excludePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		log.Warn("auto-commit: open exclude file failed", "error", err)
		return
	}
	defer f.Close()

	content := "\n# Auto-added by AICortex daemon\n" + strings.Join(toAdd, "\n") + "\n"
	if _, err := f.WriteString(content); err != nil {
		log.Warn("auto-commit: write exclude file failed", "error", err)
	}
}

func runGit(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_TERMINAL_PROMPT=0",
		"GIT_AUTHOR_NAME=AICortex Agent",
		"GIT_AUTHOR_EMAIL=agent@aicortex.ai",
		"GIT_COMMITTER_NAME=AICortex Agent",
		"GIT_COMMITTER_EMAIL=agent@aicortex.ai",
	)
	out, err := cmd.CombinedOutput()
	return string(out), err
}
