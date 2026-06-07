package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/spf13/cobra"
)

func init() {
	installCmd.Flags().Bool("dry-run", false, "Show what would be done without actually doing it")
}

var installCmd = &cobra.Command{
	Use:   "install",
	Short: "Add aicortex CLI to your system PATH",
	Long: `Add the aicortex CLI binary directory to your system PATH so you can
run 'aicortex' from any terminal without typing the full path.

On Windows this updates the User PATH environment variable via the registry.
On macOS/Linux this appends the export line to ~/.bashrc and ~/.zshrc.

Use --dry-run to preview the change without applying it.`,
	RunE: runInstall,
}

func runInstall(cmd *cobra.Command, _ []string) error {
	dryRun, _ := cmd.Flags().GetBool("dry-run")

	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("cannot determine executable path: %w", err)
	}
	exeDir, err := filepath.Abs(filepath.Dir(exe))
	if err != nil {
		return fmt.Errorf("cannot resolve absolute path: %w", err)
	}

	// Check if already in PATH (process-level + Windows registry).
	inPath := checkPathOnOS(exeDir)
	if inPath {
		fmt.Printf("✓ %s is already in your PATH.\n", exeDir)
		return nil
	}

	switch runtime.GOOS {
	case "windows":
		return installOnWindows(exeDir, dryRun)
	default:
		return installOnPosix(exeDir, dryRun)
	}
}

// checkPathOnOS returns true if exeDir is already in the persistent PATH.
func checkPathOnOS(exeDir string) bool {
	exeDirNorm := exeDir
	if runtime.GOOS == "windows" {
		exeDirNorm = strings.ToLower(exeDirNorm)
	}

	// Check process-level PATH.
	sep := ":"
	if runtime.GOOS == "windows" {
		sep = ";"
	}
	for _, p := range strings.Split(os.Getenv("PATH"), sep) {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		abs, err := filepath.Abs(p)
		if err != nil {
			continue
		}
		candidate := abs
		if runtime.GOOS == "windows" {
			candidate = strings.ToLower(candidate)
		}
		if candidate == exeDirNorm {
			return true
		}
	}

	// On Windows also check the user registry PATH (persists across terminals).
	if runtime.GOOS == "windows" {
		ps := fmt.Sprintf(`[Environment]::GetEnvironmentVariable('Path', 'User')`)
		out, err := exec.Command("powershell", "-NoProfile", "-Command", ps).Output()
		if err == nil {
			for _, p := range strings.Split(string(out), ";") {
				p = strings.TrimSpace(p)
				if p == "" {
					continue
				}
				abs, err := filepath.Abs(p)
				if err != nil {
					continue
				}
				if strings.ToLower(abs) == exeDirNorm {
					return true
				}
			}
		}
	}

	return false
}

// ---------- Windows ----------

func installOnWindows(exeDir string, dryRun bool) error {
	fmt.Printf("  Binary directory: %s\n", exeDir)
	if dryRun {
		fmt.Println("  Would add to User PATH (registry HKCU/Environment).")
		fmt.Println("  Run without --dry-run to apply.")
		return nil
	}

	// Build a PowerShell command that reads the current user PATH, appends the
	// new directory if not already present, writes it back, and broadcasts the
	// WM_SETTINGCHANGE message so running apps can pick up the change.
	ps := fmt.Sprintf(`$dir = '%s'
$cur = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($cur -split ';' -notcontains $dir) {
  [Environment]::SetEnvironmentVariable('Path', $cur + ';' + $dir, 'User')
}
`, exeDir)

	cmd := exec.Command("powershell", "-NoProfile", "-Command", ps)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to update PATH: %w", err)
	}

	// Also refresh this process's PATH so the change is immediate.
	os.Setenv("PATH", os.Getenv("PATH")+";"+exeDir)

	fmt.Printf("✓ Added to User PATH.\n")
	fmt.Println("  Open a new terminal for the change to take full effect.")
	return nil
}

// ---------- macOS / Linux ----------

func installOnPosix(exeDir string, dryRun bool) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("cannot determine home directory: %w", err)
	}

	line := fmt.Sprintf(`export PATH="%s:$PATH"`, exeDir)
	fmt.Printf("  Binary directory: %s\n", exeDir)
	fmt.Printf("  Export line: %s\n", line)

	shellConfigs := []string{".bashrc", ".zshrc", ".profile"}
	written := false

	for _, cfg := range shellConfigs {
		path := filepath.Join(home, cfg)
		data, err := os.ReadFile(path)
		if err != nil {
			continue // file doesn't exist, skip
		}
		if strings.Contains(string(data), line) {
			fmt.Printf("  Already in ~/%s\n", cfg)
			written = true
			continue
		}

		if dryRun {
			fmt.Printf("  Would append to ~/%s\n", cfg)
			continue
		}

		f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o644)
		if err != nil {
			fmt.Fprintf(os.Stderr, "  Warning: could not write ~/%s: %v\n", cfg, err)
			continue
		}
		_, _ = fmt.Fprintf(f, "\n# Added by aicortex install\n%s\n", line)
		f.Close()
		fmt.Printf("  ✓ Added to ~/%s\n", cfg)
		written = true
	}

	if !written && !dryRun {
		// Fallback: create .bashrc.
		path := filepath.Join(home, ".bashrc")
		data := fmt.Sprintf("# Added by aicortex install\n%s\n", line)
		if err := os.WriteFile(path, []byte(data), 0o644); err != nil {
			return fmt.Errorf("cannot create ~/.bashrc: %w", err)
		}
		fmt.Printf("  ✓ Created ~/.bashrc with PATH entry\n")
	}

	// Refresh current session PATH.
	os.Setenv("PATH", exeDir+":"+os.Getenv("PATH"))

	if dryRun {
		fmt.Println("  Run without --dry-run to apply.")
	} else {
		fmt.Println("  Run 'source ~/.bashrc' or open a new terminal to apply.")
	}
	return nil
}
