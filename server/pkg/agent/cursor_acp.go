package agent

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// cursorACPBlockedArgs are flags owned by the daemon for cursor ACP mode.
var cursorACPBlockedArgs = map[string]blockedArgMode{
	"acp": blockedStandalone,
}

// cursorACPBackend implements Backend by spawning `cursor-agent acp` (or
// `agent acp`) and driving one ACP session turn per Execute call.
type cursorACPBackend struct {
	cfg Config
}

func (b *cursorACPBackend) Execute(ctx context.Context, prompt string, opts ExecOptions) (*Session, error) {
	conn, err := OpenCursorACPConn(ctx, b.cfg, cursorACPConnOptsFromExec(opts))
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	return conn.RunPrompt(ctx, prompt)
}

// CursorACPConnOpts configures a long-lived cursor ACP connection.
type CursorACPConnOpts struct {
	Cwd             string
	Model           string
	ResumeSessionID string
	Timeout         time.Duration
	CustomArgs      []string
}

func cursorACPConnOptsFromExec(opts ExecOptions) CursorACPConnOpts {
	return CursorACPConnOpts{
		Cwd:             opts.Cwd,
		Model:           opts.Model,
		ResumeSessionID: opts.ResumeSessionID,
		Timeout:         opts.Timeout,
		CustomArgs:      opts.CustomArgs,
	}
}

// CursorACPConn is a long-lived cursor-agent ACP session. Callers that need
// multi-turn chat performance keep the connection open and invoke RunPrompt
// for each user message instead of spawning a new CLI per turn.
type CursorACPConn struct {
	cfg        Config
	cmd        *exec.Cmd
	stdin      io.WriteCloser
	client     *hermesClient
	sessionID  string
	model      string
	cwd        string
	providerErr *acpProviderErrorSniffer
	readerDone chan struct{}
	stderrDone chan struct{}
	closeOnce  sync.Once
	closed     atomic.Bool
}

// CursorACPSupported reports whether the resolved cursor CLI exposes `acp`.
func CursorACPSupported(executablePath string) bool {
	execName := executablePath
	if execName == "" {
		execName = "cursor-agent"
	}
	lookedUp, err := exec.LookPath(execName)
	if err != nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	argv0, args := chooseCursorInvocation(execName, lookedUp, []string{"acp", "--help"}, nil)
	cmd := exec.CommandContext(ctx, argv0, args...)
	hideAgentWindow(cmd)
	return cmd.Run() == nil
}

// OpenCursorACPConn spawns cursor-agent in ACP mode and prepares a session.
func OpenCursorACPConn(ctx context.Context, cfg Config, opts CursorACPConnOpts) (*CursorACPConn, error) {
	execName := cfg.ExecutablePath
	if execName == "" {
		execName = "cursor-agent"
	}
	lookedUp, err := exec.LookPath(execName)
	if err != nil {
		return nil, fmt.Errorf("cursor-agent executable not found at %q: %w", execName, err)
	}

	setupTimeout := opts.Timeout
	if setupTimeout == 0 {
		setupTimeout = 2 * time.Minute
	}
	setupCtx, setupCancel := context.WithTimeout(ctx, setupTimeout)
	defer setupCancel()

	acpArgs := append([]string{"acp"}, filterCustomArgs(opts.CustomArgs, cursorACPBlockedArgs, cfg.Logger)...)
	argv0, cmdArgs := chooseCursorInvocation(execName, lookedUp, acpArgs, cfg.Logger)

	// Long-lived chat connections must not tie the child process to a short
	// setup context — only the handshake below is deadline-bound.
	cmd := exec.Command(argv0, cmdArgs...)
	hideAgentWindow(cmd)
	cfg.Logger.Info("agent command", "exec", argv0, "args", cmdArgs)
	cwd := opts.Cwd
	if cwd == "" {
		cwd = "."
	}
	cmd.Dir = cwd
	cmd.Env = buildEnv(cfg.Env)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("cursor acp stdout pipe: %w", err)
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("cursor acp stdin pipe: %w", err)
	}
	providerErr := newACPProviderErrorSniffer("cursor")
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("cursor acp stderr pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start cursor acp: %w", err)
	}

	stderrDone := make(chan struct{})
	go func() {
		defer close(stderrDone)
		sink := io.MultiWriter(newLogWriter(cfg.Logger, "[cursor:acp:stderr] "), providerErr)
		_, _ = io.Copy(sink, stderr)
	}()

	cfg.Logger.Info("cursor acp started", "pid", cmd.Process.Pid, "cwd", cwd)

	c := &hermesClient{
		cfg:          cfg,
		stdin:        stdin,
		pending:      make(map[int]*pendingRPC),
		pendingTools: make(map[string]*pendingToolCall),
		acceptNotification: func(string) bool {
			return true
		},
	}

	readerDone := make(chan struct{})
	go func() {
		defer close(readerDone)
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 0, 1024*1024), 10*1024*1024)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			c.handleLine(line)
		}
		c.closeAllPending(fmt.Errorf("cursor acp process exited"))
	}()

	conn := &CursorACPConn{
		cfg:         cfg,
		cmd:         cmd,
		stdin:       stdin,
		client:      c,
		model:       opts.Model,
		cwd:         cwd,
		providerErr: providerErr,
		readerDone:  readerDone,
		stderrDone:  stderrDone,
	}

	if _, err := c.request(setupCtx, "initialize", map[string]any{
		"protocolVersion": 1,
		"clientInfo": map[string]any{
			"name":    "aicortex-agent-sdk",
			"version": "0.2.0",
		},
		"clientCapabilities": map[string]any{},
	}); err != nil {
		conn.Close()
		return nil, fmt.Errorf("cursor acp initialize failed: %w", err)
	}

	var sessionID string
	if opts.ResumeSessionID != "" {
		result, err := c.request(setupCtx, "session/load", map[string]any{
			"cwd":        cwd,
			"sessionId":  opts.ResumeSessionID,
			"mcpServers": []any{},
		})
		if err != nil {
			conn.Close()
			return nil, fmt.Errorf("cursor acp session/load failed: %w", err)
		}
		var changed bool
		sessionID, changed = resolveResumedSessionID(opts.ResumeSessionID, result)
		if changed {
			cfg.Logger.Warn("cursor returned a different session id on resume — original was likely lost; continuing with the new id",
				"requested", opts.ResumeSessionID,
				"actual", sessionID,
			)
		}
	} else {
		result, err := c.request(setupCtx, "session/new", map[string]any{
			"cwd":        cwd,
			"mcpServers": []any{},
		})
		if err != nil {
			conn.Close()
			return nil, fmt.Errorf("cursor acp session/new failed: %w", err)
		}
		sessionID = extractACPSessionID(result)
		if sessionID == "" {
			conn.Close()
			return nil, fmt.Errorf("cursor acp session/new returned no session ID")
		}
	}

	c.sessionID = sessionID
	conn.sessionID = sessionID
	cfg.Logger.Info("cursor acp session ready", "session_id", sessionID)

	if opts.Model != "" {
		if _, err := c.request(setupCtx, "session/set_model", map[string]any{
			"sessionId": sessionID,
			"modelId":   opts.Model,
		}); err != nil {
			conn.Close()
			return nil, fmt.Errorf("cursor acp set_session_model failed: %w", err)
		}
		cfg.Logger.Info("cursor acp session model set", "model", opts.Model)
	}

	return conn, nil
}

// SessionID returns the active ACP session id.
func (c *CursorACPConn) SessionID() string {
	return c.sessionID
}

// RunPrompt executes a single user turn on an already-prepared connection.
func (c *CursorACPConn) RunPrompt(ctx context.Context, prompt string) (*Session, error) {
	if c.closed.Load() {
		return nil, fmt.Errorf("cursor acp connection closed")
	}

	timeout := 20 * time.Minute
	runCtx, cancel := context.WithTimeout(ctx, timeout)

	msgCh := make(chan Message, 256)
	resCh := make(chan Result, 1)

	var outputMu sync.Mutex
	var output strings.Builder
	var streamingCurrentTurn atomic.Bool
	promptDone := make(chan hermesPromptResult, 1)

	prevOnMessage := c.client.onMessage
	prevOnPromptDone := c.client.onPromptDone
	prevAccept := c.client.acceptNotification

	c.client.acceptNotification = func(string) bool {
		return streamingCurrentTurn.Load()
	}
	c.client.onMessage = func(msg Message) {
		if !streamingCurrentTurn.Load() {
			return
		}
		if msg.Type == MessageText {
			outputMu.Lock()
			output.WriteString(msg.Content)
			outputMu.Unlock()
		}
		if msg.Type == MessageStatus && msg.SessionID == "" && c.sessionID != "" {
			msg.SessionID = c.sessionID
		}
		trySend(msgCh, msg)
	}
	c.client.onPromptDone = func(result hermesPromptResult) {
		if !streamingCurrentTurn.Load() {
			return
		}
		select {
		case promptDone <- result:
		default:
		}
	}

	go func() {
		defer cancel()
		defer close(msgCh)
		defer close(resCh)
		defer func() {
			c.client.onMessage = prevOnMessage
			c.client.onPromptDone = prevOnPromptDone
			c.client.acceptNotification = prevAccept
		}()

		startTime := time.Now()
		finalStatus := "completed"
		var finalError string

		c.client.usageMu.Lock()
		c.client.usage = TokenUsage{}
		c.client.usageMu.Unlock()

		promptBlocks := []map[string]any{
			{"type": "text", "text": prompt},
		}
		streamingCurrentTurn.Store(true)
		_, err := c.client.request(runCtx, "session/prompt", map[string]any{
			"sessionId": c.sessionID,
			"prompt":    promptBlocks,
		})
		if err != nil {
			if runCtx.Err() == context.DeadlineExceeded {
				finalStatus = "timeout"
				finalError = fmt.Sprintf("cursor acp timed out after %s", timeout)
			} else if runCtx.Err() == context.Canceled {
				finalStatus = "aborted"
				finalError = "execution cancelled"
			} else {
				finalStatus = "failed"
				finalError = fmt.Sprintf("cursor acp session/prompt failed: %v", err)
			}
		} else {
			select {
			case pr := <-promptDone:
				if pr.stopReason == "cancelled" {
					finalStatus = "aborted"
					finalError = "cursor acp cancelled the prompt"
				}
				c.client.usageMu.Lock()
				c.client.usage.InputTokens += pr.usage.InputTokens
				c.client.usage.OutputTokens += pr.usage.OutputTokens
				c.client.usageMu.Unlock()
			default:
			}
		}

		duration := time.Since(startTime)
		c.cfg.Logger.Info("cursor acp prompt finished", "pid", c.cmd.Process.Pid, "status", finalStatus, "duration", duration.Round(time.Millisecond).String())

		outputMu.Lock()
		finalOutput := output.String()
		outputMu.Unlock()

		finalStatus, finalError = promoteACPResultOnProviderError(finalStatus, finalError, finalOutput, c.providerErr)

		c.client.usageMu.Lock()
		u := c.client.usage
		c.client.usageMu.Unlock()

		var usageMap map[string]TokenUsage
		if u.InputTokens > 0 || u.OutputTokens > 0 || u.CacheReadTokens > 0 {
			model := c.model
			if model == "" {
				model = "cursor"
			}
			usageMap = map[string]TokenUsage{model: u}
		}

		resCh <- Result{
			Status:     finalStatus,
			Output:     finalOutput,
			Error:      finalError,
			DurationMs: duration.Milliseconds(),
			SessionID:  c.sessionID,
			Usage:      usageMap,
		}
	}()

	return &Session{Messages: msgCh, Result: resCh}, nil
}

// Close shuts down the underlying cursor-agent ACP process.
func (c *CursorACPConn) Close() error {
	if c == nil {
		return nil
	}
	var closeErr error
	c.closeOnce.Do(func() {
		c.closed.Store(true)
		if c.stdin != nil {
			_ = c.stdin.Close()
		}
		if c.cmd != nil && c.cmd.Process != nil {
			_ = c.cmd.Wait()
		}
		if c.readerDone != nil {
			<-c.readerDone
		}
		if c.stderrDone != nil {
			<-c.stderrDone
		}
	})
	return closeErr
}
