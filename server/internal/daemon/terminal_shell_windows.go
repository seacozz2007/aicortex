//go:build windows

package daemon

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func defaultTerminalShell() string {
	if shell := os.Getenv("SHELL"); shell != "" && shellExists(shell) {
		return shell
	}
	if shell := os.Getenv("COMSPEC"); shell != "" && shellExists(shell) {
		return shell
	}
	for _, candidate := range []string{"pwsh.exe", "powershell.exe", "cmd.exe"} {
		if path, err := exec.LookPath(candidate); err == nil {
			return path
		}
	}
	return "cmd.exe"
}

func terminalExtraEnv() []string {
	return []string{"TERM=xterm-256color"}
}

func shellExists(path string) bool {
	// Ignore Unix-style paths on Windows (e.g. /bin/sh from Git Bash env).
	if strings.HasPrefix(path, "/") && !strings.Contains(path, ":") {
		return false
	}
	if strings.ContainsAny(path, `/\`) {
		if filepath.IsAbs(path) {
			if _, err := os.Stat(path); err == nil {
				return true
			}
		}
	}
	_, err := exec.LookPath(path)
	return err == nil
}
