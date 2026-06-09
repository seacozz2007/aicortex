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

type chatACPPool struct {
	cursorEnabled bool
	kiroEnabled   bool
	idleTimeout   time.Duration
	maxEntries    int
	logger        *slog.Logger

	mu      sync.Mutex
	entries map[string]*chatACPPoolEntry
}

type chatACPPoolEntry struct {
	key      string
	provider string
	chatID   string
	agentID  string
	workDir  string
	model    string
	agentCfg agent.Config
	conn     agent.ACPChatConn
	lastUsed time.Time
	turnMu   sync.Mutex
}

func newChatACPPool(cfg Config, logger *slog.Logger) *chatACPPool {
	maxEntries := cfg.ChatACPMaxConnections
	if maxEntries <= 0 {
		maxEntries = 50
	}
	idle := cfg.ChatACPIdleTimeout
	if idle <= 0 {
		idle = 5 * time.Minute
	}

	cursorEnabled := cfg.CursorACPEnabled
	if cursorEnabled {
		if entry, ok := cfg.Agents["cursor"]; ok {
			cursorEnabled = agent.CursorACPSupported(entry.Path)
		} else {
			cursorEnabled = false
		}
	}

	kiroEnabled := cfg.KiroACPEnabled
	if kiroEnabled {
		if entry, ok := cfg.Agents["kiro"]; ok {
			kiroEnabled = agent.KiroACPSupported(entry.Path)
		} else {
			kiroEnabled = false
		}
	}

	return &chatACPPool{
		cursorEnabled: cursorEnabled,
		kiroEnabled:   kiroEnabled,
		idleTimeout:   idle,
		maxEntries:    maxEntries,
		logger:        logger,
		entries:       make(map[string]*chatACPPoolEntry),
	}
}

func (d *Daemon) chatACPPoolEnabled(provider string) bool {
	return d != nil && d.chatACPPool != nil && d.chatACPPool.enabledForProvider(provider)
}

func (p *chatACPPool) enabledForProvider(provider string) bool {
	if p == nil {
		return false
	}
	switch provider {
	case "cursor":
		return p.cursorEnabled
	case "kiro":
		return p.kiroEnabled
	default:
		return false
	}
}

func chatACPPoolKey(provider, chatSessionID, agentID, workDir string) string {
	return strings.Join([]string{provider, chatSessionID, agentID, workDir}, "\x00")
}

func agentIDFromTask(task Task) string {
	if task.Agent != nil {
		return task.Agent.ID
	}
	return ""
}

func (p *chatACPPool) runTask(
	ctx context.Context,
	d *Daemon,
	provider string,
	task Task,
	prompt string,
	opts agent.ExecOptions,
	agentCfg agent.Config,
	taskLog *slog.Logger,
) (agent.Result, int32, error) {
	agentID := agentIDFromTask(task)
	key := chatACPPoolKey(provider, task.ChatSessionID, agentID, opts.Cwd)

	entry := p.getOrCreateEntry(key, provider, task.ChatSessionID, agentID, opts.Cwd, opts.Model, agentCfg)
	entry.turnMu.Lock()
	defer entry.turnMu.Unlock()

	if entry.conn == nil || entry.model != opts.Model {
		if entry.conn != nil {
			_ = entry.conn.Close()
			entry.conn = nil
		}
		conn, err := p.openConn(ctx, provider, agentCfg, opts)
		if err != nil {
			p.removeEntry(key)
			return agent.Result{}, 0, err
		}
		entry.conn = conn
		entry.model = opts.Model
		taskLog.Info(provider+" chat acp pool miss", "chat_session", shortID(task.ChatSessionID))
	} else {
		taskLog.Info(provider+" chat acp pool hit", "chat_session", shortID(task.ChatSessionID))
	}

	entry.lastUsed = time.Now()

	agentCtx, agentCancel := context.WithCancel(ctx)
	defer agentCancel()

	session, err := entry.conn.RunPrompt(agentCtx, prompt, opts.SystemPrompt)
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
		taskLog.Warn(provider+" chat acp resume failed, evicting pooled connection", "error", result.Error)
		p.removeEntry(key)
	}

	entry.lastUsed = time.Now()
	return result, tools, nil
}

func (p *chatACPPool) openConn(ctx context.Context, provider string, agentCfg agent.Config, opts agent.ExecOptions) (agent.ACPChatConn, error) {
	switch provider {
	case "cursor":
		return agent.OpenCursorACPConn(ctx, agentCfg, agent.CursorACPConnOpts{
			Cwd:             opts.Cwd,
			Model:           opts.Model,
			ResumeSessionID: opts.ResumeSessionID,
			Timeout:         opts.Timeout,
			CustomArgs:      opts.CustomArgs,
		})
	case "kiro":
		return agent.OpenKiroACPConn(ctx, agentCfg, agent.KiroACPConnOpts{
			Cwd:             opts.Cwd,
			Model:           opts.Model,
			ResumeSessionID: opts.ResumeSessionID,
			Timeout:         opts.Timeout,
			CustomArgs:      opts.CustomArgs,
		})
	default:
		return nil, fmt.Errorf("chat acp pool: unsupported provider %q", provider)
	}
}

func (p *chatACPPool) getOrCreateEntry(key, provider, chatID, agentID, workDir, model string, agentCfg agent.Config) *chatACPPoolEntry {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.evictIdleLocked(time.Now())

	if e, ok := p.entries[key]; ok {
		return e
	}

	if len(p.entries) >= p.maxEntries {
		p.evictOldestLocked()
	}

	e := &chatACPPoolEntry{
		key:      key,
		provider: provider,
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

func (p *chatACPPool) removeEntry(key string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if e, ok := p.entries[key]; ok {
		if e.conn != nil {
			_ = e.conn.Close()
		}
		delete(p.entries, key)
	}
}

func (p *chatACPPool) evictIdleLocked(now time.Time) {
	for key, e := range p.entries {
		if now.Sub(e.lastUsed) <= p.idleTimeout {
			continue
		}
		if e.conn != nil {
			_ = e.conn.Close()
		}
		delete(p.entries, key)
		p.logger.Info("chat acp pool evicted idle connection", "provider", e.provider, "chat_session", shortID(e.chatID))
	}
}

func (p *chatACPPool) evictOldestLocked() {
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
		p.logger.Info("chat acp pool evicted oldest connection", "provider", e.provider, "chat_session", shortID(e.chatID))
	}
}

func (p *chatACPPool) evictChatSession(chatSessionID string) {
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

func (p *chatACPPool) closeAll() {
	p.mu.Lock()
	defer p.mu.Unlock()
	for key, e := range p.entries {
		if e.conn != nil {
			_ = e.conn.Close()
		}
		delete(p.entries, key)
	}
}
