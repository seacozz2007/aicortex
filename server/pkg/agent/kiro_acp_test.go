package agent

import (
	"log/slog"
	"testing"
)

func TestKiroACPBlockedArgs(t *testing.T) {
	t.Parallel()

	args := filterCustomArgs([]string{"acp", "--trust-all-tools", "--model", "claude-sonnet"}, kiroBlockedArgs, slog.Default())
	if len(args) != 2 || args[0] != "--model" || args[1] != "claude-sonnet" {
		t.Fatalf("expected only model arg, got %v", args)
	}
}

func TestKiroACPConnOptsFromExec(t *testing.T) {
	t.Parallel()

	opts := kiroACPConnOptsFromExec(ExecOptions{
		Cwd:             "/tmp/work",
		Model:           "test-model",
		ResumeSessionID: "sess-1",
		CustomArgs:      []string{"--agent", "foo"},
	})
	if opts.Cwd != "/tmp/work" || opts.Model != "test-model" || opts.ResumeSessionID != "sess-1" {
		t.Fatalf("unexpected opts: %+v", opts)
	}
}
