//go:build windows

package daemon

import (
	"os/exec"
	"path/filepath"
	"strings"
)

func newTerminalCommand(shell string) *exec.Cmd {
	base := strings.ToLower(filepath.Base(shell))

	switch {
	case isWindowsCmdShell(base):
		// /K keeps cmd interactive when attached to a ConPTY.
		return exec.Command(shell, "/K")
	case isWindowsPowerShell(base):
		return exec.Command(shell, "-NoLogo", "-NoExit")
	case isWindowsBash(base):
		return exec.Command(shell, "--login", "-i")
	default:
		return exec.Command(shell)
	}
}

func isWindowsCmdShell(base string) bool {
	return base == "cmd.exe" || base == "cmd"
}

func isWindowsPowerShell(base string) bool {
	return base == "powershell.exe" || base == "powershell" || base == "pwsh.exe" || base == "pwsh"
}

func isWindowsBash(base string) bool {
	return base == "bash.exe" || base == "bash"
}
