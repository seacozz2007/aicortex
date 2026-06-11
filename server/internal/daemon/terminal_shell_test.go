//go:build windows

package daemon

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultTerminalShellWindowsPrefersCOMSPEC(t *testing.T) {
	comspec := filepath.Join(t.TempDir(), "mock-cmd.exe")
	if err := os.WriteFile(comspec, []byte("mock"), 0o644); err != nil {
		t.Fatal(err)
	}

	t.Setenv("SHELL", "/bin/sh")
	t.Setenv("COMSPEC", comspec)

	if got := defaultTerminalShell(); got != comspec {
		t.Fatalf("defaultTerminalShell() = %q, want %q", got, comspec)
	}
}

func TestDefaultTerminalShellWindowsIgnoresMissingSHELL(t *testing.T) {
	t.Setenv("SHELL", "/bin/sh")
	t.Setenv("COMSPEC", "")

	got := defaultTerminalShell()
	if got == "/bin/sh" {
		t.Fatalf("defaultTerminalShell() must not fall back to /bin/sh on Windows, got %q", got)
	}
	if !shellExists(got) {
		t.Fatalf("defaultTerminalShell() returned missing executable %q", got)
	}
}
