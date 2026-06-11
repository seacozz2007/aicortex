//go:build !windows

package daemon

import (
	"os/exec"
	"syscall"
)

// setProcessGroupAttr sets the process to create a new session (Unix-only).
// This ensures the PTY process runs in its own process group, so when we
// kill the group we don't accidentally kill the daemon.
func setProcessGroupAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
}
