//go:build windows

package daemon

import (
	"os/exec"
)

// setProcessGroupAttr is a no-op on Windows. The creack/pty library handles
// session management internally; there is no Setsid equivalent exposed via
// syscall.SysProcAttr on Windows.
func setProcessGroupAttr(cmd *exec.Cmd) {
	// No-op: Windows does not have Unix-style process groups via Setsid.
	// creack/pty manages the PTY session lifecycle on Windows.
}

// killProcessGroup kills the terminal process directly.
// On Windows we cannot kill by process group (no negated PID kill), so
// we kill the child process itself. The OS will clean up any descendants.
func killProcessGroup(sess *TerminalSession) error {
	return sess.cmd.Process.Kill()
}
