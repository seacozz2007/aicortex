//go:build windows

package daemon

import (
	"context"
	"os"
	"os/exec"
	"strings"

	"github.com/UserExistsError/conpty"
)

type winPTY struct {
	cpty *conpty.ConPty
}

func (w *winPTY) Read(p []byte) (int, error)  { return w.cpty.Read(p) }
func (w *winPTY) Write(p []byte) (int, error) { return w.cpty.Write(p) }
func (w *winPTY) Close() error                { return w.cpty.Close() }

func (w *winPTY) Resize(rows, cols uint16) error {
	return w.cpty.Resize(int(cols), int(rows))
}

func (w *winPTY) Wait() error {
	_, err := w.cpty.Wait(context.Background())
	return err
}

func openPlatformPTY(shell string, rows, cols int) (platformPTY, error) {
	if !conpty.IsConPtyAvailable() {
		return nil, conpty.ErrConPtyUnsupported
	}

	cmd := newTerminalCommand(shell)
	cmdLine := commandLineFromCmd(cmd)
	env := append(os.Environ(), terminalExtraEnv()...)

	cpty, err := conpty.Start(
		cmdLine,
		conpty.ConPtyDimensions(cols, rows),
		conpty.ConPtyEnv(env),
	)
	if err != nil {
		return nil, err
	}
	return &winPTY{cpty: cpty}, nil
}

func commandLineFromCmd(cmd *exec.Cmd) string {
	args := cmd.Args
	if len(args) == 0 {
		return windowsQuoteArg(cmd.Path)
	}
	parts := make([]string, len(args))
	for i, a := range args {
		parts[i] = windowsQuoteArg(a)
	}
	return strings.Join(parts, " ")
}

func windowsQuoteArg(s string) string {
	if s == "" {
		return `""`
	}
	if !strings.ContainsAny(s, " \t\n\v\"") {
		return s
	}
	return `"` + strings.ReplaceAll(s, `"`, `\"`) + `"`
}
