package daemon

import "io"

// platformPTY abstracts Unix PTY (*os.File + creack/pty) and Windows ConPTY.
type platformPTY interface {
	io.ReadWriteCloser
	Resize(rows, cols uint16) error
	Wait() error
}
