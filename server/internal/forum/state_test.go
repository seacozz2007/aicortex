package forum

import (
	"testing"
	"time"
)

func newTestConfig() AutoChatterConfig {
	return AutoChatterConfig{
		IdleChance:                0.5,
		IdleCooldownMinutes:       1,
		IdleDelayMinMinutes:       1,
		IdleDelayMaxMinutes:       5,
		ReplyChanceInitial:        0.8,
		ReplyChanceDepth1:         0.6,
		ReplyChanceDepth2:         0.4,
		ReplyChanceDeep:           0.2,
		ThreadWindowSeconds:       120,
		MaxRepliesPerThread:       10,
		AgentActionCooldownSeconds: 60,
	}
}

func TestRegisterPost(t *testing.T) {
	s := NewForumAutoState(newTestConfig())
	s.RegisterPost("post-1", "agent-a")

	s.mu.Lock()
	defer s.mu.Unlock()

	thread, ok := s.threads["post-1"]
	if !ok {
		t.Fatal("expected thread post-1 to be registered")
	}
	if thread.PostID != "post-1" {
		t.Fatalf("expected PostID post-1, got %s", thread.PostID)
	}
	if thread.Depth != 0 {
		t.Fatalf("expected depth 0, got %d", thread.Depth)
	}
	if thread.ReplyCount != 0 {
		t.Fatalf("expected reply count 0, got %d", thread.ReplyCount)
	}
	if _, ok := thread.Agents["agent-a"]; !ok {
		t.Fatal("expected agent-a in thread agents")
	}

	if _, ok := s.agents["agent-a"]; !ok {
		t.Fatal("expected agent-a in global agents")
	}
}

func TestRegisterPost_DuplicateIsNoOp(t *testing.T) {
	s := NewForumAutoState(newTestConfig())
	s.RegisterPost("post-1", "agent-a")
	first := s.threads["post-1"]

	s.RegisterPost("post-1", "agent-b")
	second := s.threads["post-1"]

	if first != second {
		t.Fatal("duplicate RegisterPost should be a no-op (same pointer)")
	}
}

func TestRegisterReply_CanContinue(t *testing.T) {
	cfg := newTestConfig()
	cfg.ThreadWindowSeconds = 3600
	cfg.MaxRepliesPerThread = 10
	s := NewForumAutoState(cfg)

	s.RegisterPost("post-1", "agent-a")

	canContinue := s.RegisterReply("post-1", "agent-b")
	if !canContinue {
		t.Fatal("expected can continue for fresh thread within window and limit")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	thread := s.threads["post-1"]
	if thread.Depth != 1 {
		t.Fatalf("expected depth 1, got %d", thread.Depth)
	}
	if thread.ReplyCount != 1 {
		t.Fatalf("expected reply count 1, got %d", thread.ReplyCount)
	}
	if _, ok := thread.Agents["agent-b"]; !ok {
		t.Fatal("expected agent-b in thread agents")
	}
}

func TestRegisterReply_UnknownPost(t *testing.T) {
	s := NewForumAutoState(newTestConfig())

	canContinue := s.RegisterReply("unknown-post", "agent-a")
	if canContinue {
		t.Fatal("expected false for unknown post")
	}
}

func TestRegisterReply_WindowExpired(t *testing.T) {
	cfg := newTestConfig()
	cfg.ThreadWindowSeconds = 0 // effectively expired immediately
	s := NewForumAutoState(cfg)

	s.RegisterPost("post-1", "agent-a")

	// The post was just created, but window is 0 so time.Since(created) will be > 0.
	// However, the check uses "<= window" so if window is 0, it might still pass
	// depending on timing. Let's test with a historic Created time instead.
	s.mu.Lock()
	s.threads["post-1"].Created = time.Now().Add(-2 * time.Second)
	s.mu.Unlock()

	canContinue := s.RegisterReply("post-1", "agent-b")
	if canContinue {
		t.Fatal("expected false for expired window")
	}
}

func TestRegisterReply_MaxRepliesReached(t *testing.T) {
	cfg := newTestConfig()
	cfg.ThreadWindowSeconds = 3600
	cfg.MaxRepliesPerThread = 1
	s := NewForumAutoState(cfg)

	s.RegisterPost("post-1", "agent-a")
	// First reply: ReplyCount becomes 1, which equals MaxRepliesPerThread(1)
	// so underLimit = 1 < 1 = false
	canContinue := s.RegisterReply("post-1", "agent-b")
	if canContinue {
		t.Fatal("expected false when reply count reaches max")
	}
}

func TestShouldIdlePost_NoPriorAction(t *testing.T) {
	s := NewForumAutoState(newTestConfig())

	if !s.ShouldIdlePost("agent-a") {
		t.Fatal("expected true for agent with no prior action")
	}
}

func TestShouldIdlePost_WithinCooldown(t *testing.T) {
	cfg := newTestConfig()
	cfg.IdleCooldownMinutes = 60 // long cooldown
	s := NewForumAutoState(cfg)

	s.agents["agent-a"] = time.Now()
	if s.ShouldIdlePost("agent-a") {
		t.Fatal("expected false when within cooldown")
	}
}

func TestShouldIdlePost_PastCooldown(t *testing.T) {
	cfg := newTestConfig()
	cfg.IdleCooldownMinutes = 1
	s := NewForumAutoState(cfg)

	s.agents["agent-a"] = time.Now().Add(-2 * time.Minute)
	if !s.ShouldIdlePost("agent-a") {
		t.Fatal("expected true when past cooldown")
	}
}

func TestNextReplyAgent_PicksEarliest(t *testing.T) {
	s := NewForumAutoState(newTestConfig())

	s.RegisterPost("post-1", "agent-a")

	// Simulate replies at different times
	s.mu.Lock()
	s.threads["post-1"].Agents["agent-b"] = time.Now().Add(-10 * time.Second)
	s.threads["post-1"].Agents["agent-c"] = time.Now().Add(-5 * time.Second)
	s.mu.Unlock()

	agent, ok := s.NextReplyAgent("post-1", nil)
	if !ok {
		t.Fatal("expected a candidate agent")
	}
	if agent != "agent-b" {
		t.Fatalf("expected agent-b (earliest reply time), got %s", agent)
	}
}

func TestNextReplyAgent_ExcludesSpecified(t *testing.T) {
	s := NewForumAutoState(newTestConfig())

	s.RegisterPost("post-1", "agent-a")

	s.mu.Lock()
	s.threads["post-1"].Agents["agent-b"] = time.Now().Add(-10 * time.Second)
	s.threads["post-1"].Agents["agent-c"] = time.Now().Add(-5 * time.Second)
	s.mu.Unlock()

	agent, ok := s.NextReplyAgent("post-1", []string{"agent-b"})
	if !ok {
		t.Fatal("expected a candidate agent")
	}
	if agent != "agent-c" {
		t.Fatalf("expected agent-c (agent-b excluded), got %s", agent)
	}
}

func TestNextReplyAgent_AllExcluded(t *testing.T) {
	s := NewForumAutoState(newTestConfig())

	s.RegisterPost("post-1", "agent-a")

	agent, ok := s.NextReplyAgent("post-1", []string{"agent-a"})
	if ok {
		t.Fatalf("expected no candidate when all excluded, got %s", agent)
	}
}

func TestNextReplyAgent_UnknownPost(t *testing.T) {
	s := NewForumAutoState(newTestConfig())

	agent, ok := s.NextReplyAgent("unknown-post", nil)
	if ok {
		t.Fatalf("expected false for unknown post, got %s", agent)
	}
}

func TestNextReplyAgent_SingleAgent(t *testing.T) {
	s := NewForumAutoState(newTestConfig())

	s.RegisterPost("post-1", "agent-a")

	agent, ok := s.NextReplyAgent("post-1", nil)
	if !ok {
		t.Fatal("expected a candidate")
	}
	if agent != "agent-a" {
		t.Fatalf("expected agent-a, got %s", agent)
	}
}

func TestConcurrentSafety(t *testing.T) {
	cfg := newTestConfig()
	cfg.ThreadWindowSeconds = 3600
	cfg.MaxRepliesPerThread = 100
	s := NewForumAutoState(cfg)

	s.RegisterPost("post-1", "agent-a")

	done := make(chan struct{})
	for i := 0; i < 50; i++ {
		go func(idx int) {
			aid := "agent-" + string(rune('b'+idx%25))
			s.RegisterReply("post-1", aid)
			done <- struct{}{}
		}(i)
	}

	for i := 0; i < 50; i++ {
		<-done
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	thread := s.threads["post-1"]
	if thread.ReplyCount != 50 {
		t.Fatalf("expected 50 replies, got %d", thread.ReplyCount)
	}
	if thread.Depth != 50 {
		t.Fatalf("expected depth 50, got %d", thread.Depth)
	}
}

func TestDefaultAutoChatterConfig(t *testing.T) {
	cfg := DefaultAutoChatterConfig()

	if cfg.ThreadWindowSeconds != 120 {
		t.Fatalf("expected ThreadWindowSeconds 120, got %d", cfg.ThreadWindowSeconds)
	}
	if cfg.MaxRepliesPerThread != 10 {
		t.Fatalf("expected MaxRepliesPerThread 10, got %d", cfg.MaxRepliesPerThread)
	}
	if cfg.IdleChance != 0.1 {
		t.Fatalf("expected IdleChance 0.1, got %f", cfg.IdleChance)
	}
}
