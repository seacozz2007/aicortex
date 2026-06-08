package agent

import (
	"log/slog"
	"testing"
)

func TestBuildCursorArgsNoChatSubcommand(t *testing.T) {
	t.Parallel()

	args := buildCursorArgs("你好啊", ExecOptions{Cwd: "/tmp/work"}, slog.Default())
	if len(args) < 2 || args[0] != "-p" || args[1] != "你好啊" {
		t.Fatalf("expected prompt via -p, got %v", args)
	}
	for _, a := range args {
		if a == "chat" {
			t.Fatalf("chat subcommand must not appear in args: %v", args)
		}
	}
}

func TestCursorACPBlockedArgs(t *testing.T) {
	t.Parallel()

	args := filterCustomArgs([]string{"acp", "--model", "composer-1.5"}, cursorACPBlockedArgs, slog.Default())
	if len(args) != 2 || args[0] != "--model" || args[1] != "composer-1.5" {
		t.Fatalf("expected only model arg, got %v", args)
	}
}
