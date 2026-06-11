//go:build !windows

package daemon

import "os"

func defaultTerminalShell() string {
	if shell := os.Getenv("SHELL"); shell != "" {
		return shell
	}
	return "/bin/sh"
}

func terminalExtraEnv() []string {
	return []string{"TERM=xterm-256color", "LANG=C.UTF-8"}
}
