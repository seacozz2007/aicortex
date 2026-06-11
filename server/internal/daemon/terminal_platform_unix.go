//go:build !windows

package daemon

import (
	"io"
	"os"
	"os/exec"
	"syscall"

	"github.com/creack/pty"
)

type unixPTY struct {
	file *os.File
	cmd  *exec.Cmd
}

func (u *unixPTY) Read(p []byte) (int, error)  { return u.file.Read(p) }
func (u *unixPTY) Write(p []byte) (int, error) { return u.file.Write(p) }

func (u *unixPTY) Close() error {
	err := u.file.Close()
	if u.cmd.Process != nil {
		_ = syscall.Kill(-u.cmd.Process.Pid, syscall.SIGKILL)
	}
	return err
}

func (u *unixPTY) Resize(rows, cols uint16) error {
	return pty.Setsize(u.file, &pty.Winsize{Rows: rows, Cols: cols})
}

func (u *unixPTY) Wait() error {
	return u.cmd.Wait()
}

func openPlatformPTY(shell string, rows, cols int) (platformPTY, error) {
	cmd := newTerminalCommand(shell)
	cmd.Env = append(os.Environ(), terminalExtraEnv()...)
	setProcessGroupAttr(cmd)

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
	if err != nil {
		return nil, err
	}
	return &unixPTY{file: ptmx, cmd: cmd}, nil
}
