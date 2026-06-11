//go:build windows

package daemon

import (
	"os/exec"
)

// setProcessGroupAttr is a no-op on Windows. ConPTY manages the process lifecycle.
func setProcessGroupAttr(cmd *exec.Cmd) {}
