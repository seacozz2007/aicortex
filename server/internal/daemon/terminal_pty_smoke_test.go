//go:build windows

package daemon

import (
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/UserExistsError/conpty"
	"github.com/aicortex/aicortex/server/pkg/protocol"
)

func TestPTYStartsDefaultShell(t *testing.T) {
	if !conpty.IsConPtyAvailable() {
		t.Skip("ConPTY not available on this Windows build")
	}

	shell := defaultTerminalShell()
	t.Logf("default shell: %q", shell)

	ptyHandle, err := openPlatformPTY(shell, 24, 80)
	if err != nil {
		t.Fatalf("openPlatformPTY(%q): %v", shell, err)
	}
	defer ptyHandle.Close()

	done := make(chan struct{})
	go func() {
		_, _ = io.ReadAll(ptyHandle)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		// shell still running — success
	}
}

func TestPTYStartsPowerShellWithArgs(t *testing.T) {
	if !conpty.IsConPtyAvailable() {
		t.Skip("ConPTY not available on this Windows build")
	}

	ptyHandle, err := openPlatformPTY(defaultTerminalShell(), 24, 80)
	if err != nil {
		t.Fatalf("openPlatformPTY: %v", err)
	}
	defer ptyHandle.Close()

	buf := make([]byte, 4096)
	deadline := time.Now().Add(3 * time.Second)
	var n int
	for time.Now().Before(deadline) && n == 0 {
		var readErr error
		n, readErr = ptyHandle.Read(buf)
		if readErr != nil && readErr != io.EOF {
			t.Fatalf("read: %v", readErr)
		}
		if n == 0 {
			time.Sleep(100 * time.Millisecond)
		}
	}
	if n == 0 {
		t.Fatal("expected shell banner output within 3s")
	}
	t.Logf("output (%d bytes): %q", n, string(buf[:n]))
}

func TestHandleAttachOpensMissingSession(t *testing.T) {
	if !conpty.IsConPtyAvailable() {
		t.Skip("ConPTY not available on this Windows build")
	}

	tm := NewTerminalManager(slog.Default())
	tm.HandleAttach(protocol.TerminalAttachPayload{
		SessionID: "test-session",
		Cols:      80,
		Rows:      24,
	})

	tm.mu.Lock()
	_, ok := tm.sessions["test-session"]
	tm.mu.Unlock()
	if !ok {
		t.Fatal("expected session to be opened on attach")
	}
	tm.CloseAll()
}
