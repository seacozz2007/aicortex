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

// KiroACPConnOpts configures a long-lived kiro-cli ACP connection.
type KiroACPConnOpts struct {
	Cwd             string
	Model           string
	ResumeSessionID string
	Timeout         time.Duration
	CustomArgs      []string
}

func kiroACPConnOptsFromExec(opts ExecOptions) KiroACPConnOpts {
	return KiroACPConnOpts{
		Cwd:             opts.Cwd,
		Model:           opts.Model,
		ResumeSessionID: opts.ResumeSessionID,
		Timeout:         opts.Timeout,
		CustomArgs:      opts.CustomArgs,
	}
}

// KiroACPConn is a long-lived kiro-cli ACP session.
type KiroACPConn struct {
	cfg         Config
	cmd         *exec.Cmd
	stdin       io.WriteCloser
	client      *hermesClient
	sessionID   string
	model       string
	cwd         string
	providerErr *acpProviderErrorSniffer
	readerDone  chan struct{}
	stderrDone  chan struct{}
	closeOnce   sync.Once
	closed      atomic.Bool
}

// KiroACPSupported reports whether the resolved kiro CLI exposes `acp`.
func KiroACPSupported(executablePath string) bool {
	execName := executablePath
	if execName == "" {
		execName = "kiro-cli"
	}
	lookedUp, err := exec.LookPath(execName)
	if err != nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, lookedUp, "acp", "--help")
	hideAgentWindow(cmd)
	return cmd.Run() == nil
}

// OpenKiroACPConn spawns kiro-cli in ACP mode and prepares a session.
func OpenKiroACPConn(ctx context.Context, cfg Config, opts KiroACPConnOpts) (*KiroACPConn, error) {
	execPath := cfg.ExecutablePath
	if execPath == "" {
		execPath = "kiro-cli"
	}
	if _, err := exec.LookPath(execPath); err != nil {
		return nil, fmt.Errorf("kiro executable not found at %q: %w", execPath, err)
	}

	setupTimeout := opts.Timeout
	if setupTimeout == 0 {
		setupTimeout = 2 * time.Minute
	}
	setupCtx, setupCancel := context.WithTimeout(ctx, setupTimeout)
	defer setupCancel()

	kiroArgs := append([]string{"acp", "--trust-all-tools"}, filterCustomArgs(opts.CustomArgs, kiroBlockedArgs, cfg.Logger)...)
	cmd := exec.Command(execPath, kiroArgs...)
	hideAgentWindow(cmd)
	cfg.Logger.Info("agent command", "exec", execPath, "args", kiroArgs)
	cwd := opts.Cwd
	if cwd == "" {
		cwd = "."
	}
	cmd.Dir = cwd
	cmd.Env = buildEnv(cfg.Env)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("kiro acp stdout pipe: %w", err)
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("kiro acp stdin pipe: %w", err)
	}
	providerErr := newACPProviderErrorSniffer("kiro")
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("kiro acp stderr pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start kiro acp: %w", err)
	}

	stderrDone := make(chan struct{})
	go func() {
		defer close(stderrDone)
		sink := io.MultiWriter(newLogWriter(cfg.Logger, "[kiro:acp:stderr] "), providerErr)
		_, _ = io.Copy(sink, stderr)
	}()

	cfg.Logger.Info("kiro acp started", "pid", cmd.Process.Pid, "cwd", cwd)

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
		c.closeAllPending(fmt.Errorf("kiro acp process exited"))
	}()

	conn := &KiroACPConn{
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
		return nil, fmt.Errorf("kiro acp initialize failed: %w", err)
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
			return nil, fmt.Errorf("kiro acp session/load failed: %w", err)
		}
		var changed bool
		sessionID, changed = resolveResumedSessionID(opts.ResumeSessionID, result)
		if changed {
			cfg.Logger.Warn("kiro returned a different session id on resume — original was likely lost; continuing with the new id",
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
			return nil, fmt.Errorf("kiro acp session/new failed: %w", err)
		}
		sessionID = extractACPSessionID(result)
		if sessionID == "" {
			conn.Close()
			return nil, fmt.Errorf("kiro acp session/new returned no session ID")
		}
	}

	c.sessionID = sessionID
	conn.sessionID = sessionID
	cfg.Logger.Info("kiro acp session ready", "session_id", sessionID)

	if opts.Model != "" {
		if _, err := c.request(setupCtx, "session/set_model", map[string]any{
			"sessionId": sessionID,
			"modelId":   opts.Model,
		}); err != nil {
			conn.Close()
			return nil, fmt.Errorf("kiro acp set_session_model failed: %w", err)
		}
		cfg.Logger.Info("kiro acp session model set", "model", opts.Model)
	}

	return conn, nil
}

func (c *KiroACPConn) SessionID() string {
	return c.sessionID
}

// RunPrompt executes a single user turn on an already-prepared connection.
func (c *KiroACPConn) RunPrompt(ctx context.Context, prompt, systemPrompt string) (*Session, error) {
	if c.closed.Load() {
		return nil, fmt.Errorf("kiro acp connection closed")
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
		if msg.Type == MessageToolUse {
			msg.Tool = kiroToolNameFromTitle(msg.Tool)
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

		userText := prompt
		if systemPrompt != "" {
			userText = systemPrompt + "\n\n---\n\n" + prompt
		}
		promptBlocks := []map[string]any{
			{"type": "text", "text": userText},
		}
		streamingCurrentTurn.Store(true)
		_, err := c.client.request(runCtx, "session/prompt", map[string]any{
			"sessionId": c.sessionID,
			"content":   promptBlocks,
			"prompt":    promptBlocks,
		})
		if err != nil {
			if runCtx.Err() == context.DeadlineExceeded {
				finalStatus = "timeout"
				finalError = fmt.Sprintf("kiro acp timed out after %s", timeout)
			} else if runCtx.Err() == context.Canceled {
				finalStatus = "aborted"
				finalError = "execution cancelled"
			} else {
				finalStatus = "failed"
				finalError = fmt.Sprintf("kiro acp session/prompt failed: %v", err)
			}
		} else {
			select {
			case pr := <-promptDone:
				if pr.stopReason == "cancelled" {
					finalStatus = "aborted"
					finalError = "kiro acp cancelled the prompt"
				}
				c.client.usageMu.Lock()
				c.client.usage.InputTokens += pr.usage.InputTokens
				c.client.usage.OutputTokens += pr.usage.OutputTokens
				c.client.usageMu.Unlock()
			default:
			}
		}

		duration := time.Since(startTime)
		c.cfg.Logger.Info("kiro acp prompt finished", "pid", c.cmd.Process.Pid, "status", finalStatus, "duration", duration.Round(time.Millisecond).String())

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
				model = "unknown"
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

// Close shuts down the underlying kiro-cli ACP process.
func (c *KiroACPConn) Close() error {
	if c == nil {
		return nil
	}
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
	return nil
}
