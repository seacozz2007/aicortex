//go:build !windows

package daemon

import "os/exec"

func newTerminalCommand(shell string) *exec.Cmd {
	return exec.Command(shell)
}
