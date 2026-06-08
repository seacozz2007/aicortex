package daemon

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/aicortex/aicortex/server/pkg/agent"
)

type cursorChatPool struct {
	enabled     bool
	idleTimeout time.Duration
	maxEntries  int
	logger      *slog.Logger

	mu      sync.Mutex
	entries map[string]*cursorChatPoolEntry
}

type cursorChatPoolEntry struct {
	key       string
	chatID    string
	agentID   string
	workDir   string
	model     string
	agentCfg  agent.Config
	conn      *agent.CursorACPConn
	lastUsed  time.Time
	turnMu    sync.Mutex
}

func newCursorChatPool(cfg Config, logger *slog.Logger) *cursorChatPool {
	maxEntries := cfg.ChatACPMaxConnections
	if maxEntries <= 0 {
		maxEntries = 50
	}
	idle := cfg.ChatACPIdleTimeout
	if idle <= 0 {
		idle = 5 * time.Minute
	}
	enabled := cfg.CursorACPEnabled
	if enabled {
		if entry, ok := cfg.Agents["cursor"]; ok {
			enabled = agent.CursorACPSupported(entry.Path)
		} else {
			enabled = false
		}
	}
	return &cursorChatPool{
		enabled:     enabled,
		idleTimeout: idle,
		maxEntries:  maxEntries,
		logger:      logger,
		entries:     make(map[string]*cursorChatPoolEntry),
	}
}

func (d *Daemon) cursorChatPoolEnabled() bool {
	return d != nil && d.cursorChatPool != nil && d.cursorChatPool.enabledForChat()
}

func (p *cursorChatPool) enabledForChat() bool {
	return p != nil && p.enabled
}

func cursorChatPoolKey(chatSessionID, agentID, workDir string) string {
	return strings.Join([]string{chatSessionID, agentID, workDir}, "\x00")
}

func agentIDFromTask(task Task) string {
	if task.Agent != nil {
		return task.Agent.ID
	}
	return ""
}

func (p *cursorChatPool) runTask(
	ctx context.Context,
	d *Daemon,
	task Task,
	prompt string,
	opts agent.ExecOptions,
	agentCfg agent.Config,
	taskLog *slog.Logger,
) (agent.Result, int32, error) {
	agentID := ""
	if task.Agent != nil {
		agentID = task.Agent.ID
	}
	key := cursorChatPoolKey(task.ChatSessionID, agentID, opts.Cwd)

	entry := p.getOrCreateEntry(key, task.ChatSessionID, agentID, opts.Cwd, opts.Model, agentCfg)
	entry.turnMu.Lock()
	defer entry.turnMu.Unlock()

	if entry.conn == nil || entry.model != opts.Model {
		if entry.conn != nil {
			_ = entry.conn.Close()
			entry.conn = nil
		}
		conn, err := agent.OpenCursorACPConn(ctx, agentCfg, agent.CursorACPConnOpts{
			Cwd:             opts.Cwd,
			Model:           opts.Model,
			ResumeSessionID: opts.ResumeSessionID,
			Timeout:         opts.Timeout,
			CustomArgs:      opts.CustomArgs,
		})
		if err != nil {
			p.removeEntry(key)
			return agent.Result{}, 0, err
		}
		entry.conn = conn
		entry.model = opts.Model
		taskLog.Info("cursor chat acp pool miss", "chat_session", shortID(task.ChatSessionID))
	} else {
		taskLog.Info("cursor chat acp pool hit", "chat_session", shortID(task.ChatSessionID))
	}

	entry.lastUsed = time.Now()

	agentCtx, agentCancel := context.WithCancel(ctx)
	defer agentCancel()

	session, err := entry.conn.RunPrompt(agentCtx, prompt)
	if err != nil {
		p.removeEntry(key)
		return agent.Result{}, 0, err
	}

	result, tools, err := d.drainSession(agentCtx, session, opts, taskLog, task.ID)
	if err != nil {
		p.removeEntry(key)
		return agent.Result{}, tools, err
	}

	if result.SessionID == "" && entry.conn.SessionID() != "" {
		result.SessionID = entry.conn.SessionID()
	}

	if result.Status == "failed" && opts.ResumeSessionID != "" && result.SessionID == "" {
		taskLog.Warn("cursor chat acp resume failed, evicting pooled connection", "error", result.Error)
		p.removeEntry(key)
	}

	entry.lastUsed = time.Now()
	return result, tools, nil
}

func (p *cursorChatPool) getOrCreateEntry(key, chatID, agentID, workDir, model string, agentCfg agent.Config) *cursorChatPoolEntry {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.evictIdleLocked(time.Now())

	if e, ok := p.entries[key]; ok {
		return e
	}

	if len(p.entries) >= p.maxEntries {
		p.evictOldestLocked()
	}

	e := &cursorChatPoolEntry{
		key:      key,
		chatID:   chatID,
		agentID:  agentID,
		workDir:  workDir,
		model:    model,
		agentCfg: agentCfg,
		lastUsed: time.Now(),
	}
	p.entries[key] = e
	return e
}

func (p *cursorChatPool) removeEntry(key string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if e, ok := p.entries[key]; ok {
		if e.conn != nil {
			_ = e.conn.Close()
		}
		delete(p.entries, key)
	}
}

func (p *cursorChatPool) evictIdleLocked(now time.Time) {
	for key, e := range p.entries {
		if now.Sub(e.lastUsed) <= p.idleTimeout {
			continue
		}
		if e.conn != nil {
			_ = e.conn.Close()
		}
		delete(p.entries, key)
		p.logger.Info("cursor chat acp pool evicted idle connection", "chat_session", shortID(e.chatID))
	}
}

func (p *cursorChatPool) evictOldestLocked() {
	var oldestKey string
	var oldestTime time.Time
	first := true
	for key, e := range p.entries {
		if first || e.lastUsed.Before(oldestTime) {
			oldestKey = key
			oldestTime = e.lastUsed
			first = false
		}
	}
	if oldestKey == "" {
		return
	}
	if e, ok := p.entries[oldestKey]; ok {
		if e.conn != nil {
			_ = e.conn.Close()
		}
		delete(p.entries, oldestKey)
		p.logger.Info("cursor chat acp pool evicted oldest connection", "chat_session", shortID(e.chatID))
	}
}

func (p *cursorChatPool) evictChatSession(chatSessionID string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	for key, e := range p.entries {
		if e.chatID != chatSessionID {
			continue
		}
		if e.conn != nil {
			_ = e.conn.Close()
		}
		delete(p.entries, key)
	}
}

func (p *cursorChatPool) closeAll() {
	p.mu.Lock()
	defer p.mu.Unlock()
	for key, e := range p.entries {
		if e.conn != nil {
			_ = e.conn.Close()
		}
		delete(p.entries, key)
	}
}

func (p *cursorChatPool) runTaskSafe(
	ctx context.Context,
	d *Daemon,
	task Task,
	prompt string,
	opts agent.ExecOptions,
	agentCfg agent.Config,
	taskLog *slog.Logger,
) (agent.Result, int32, error) {
	if !p.enabledForChat() {
		return agent.Result{}, 0, fmt.Errorf("cursor chat acp pool disabled")
	}
	return p.runTask(ctx, d, task, prompt, opts, agentCfg, taskLog)
}
