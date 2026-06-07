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

// killProcessGroup kills the entire process group for the terminal session.
// On Unix we send SIGKILL to the negated PID (the process group leader).
func killProcessGroup(sess *TerminalSession) error {
	return syscall.Kill(-sess.cmd.Process.Pid, syscall.SIGKILL)
}
