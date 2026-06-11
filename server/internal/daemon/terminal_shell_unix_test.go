//go:build !windows

package daemon

import "testing"

func TestDefaultTerminalShellUnixUsesSHELL(t *testing.T) {
	t.Setenv("SHELL", "/usr/bin/zsh")
	if got := defaultTerminalShell(); got != "/usr/bin/zsh" {
		t.Fatalf("defaultTerminalShell() = %q, want /usr/bin/zsh", got)
	}
}

func TestDefaultTerminalShellUnixFallsBackToSh(t *testing.T) {
	t.Setenv("SHELL", "")
	if got := defaultTerminalShell(); got != "/bin/sh" {
		t.Fatalf("defaultTerminalShell() = %q, want /bin/sh", got)
	}
}
