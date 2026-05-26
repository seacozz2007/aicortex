package forum

import (
	"testing"
	"time"
)

func newTestConfig() AutoChatterConfig {
	return AutoChatterConfig{
		IdleChance:                 0.5,
		IdleCooldownMinutes:        1,
		IdleDelayMinMinutes:        1,
		IdleDelayMaxMinutes:        5,
		ReplyChanceInitial:         0.8,
		ReplyChanceDepth1:          0.6,
		ReplyChanceDepth2:          0.4,
		ReplyChanceDeep:            0.2,
		ThreadWindowSeconds:        120,
		NewPostWindowSeconds:       30,
		MaxRepliesPerThread:        10,
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
	if thread.AuthorAgentID != "agent-a" {
		t.Fatalf("expected AuthorAgentID agent-a, got %s", thread.AuthorAgentID)
	}
	if thread.LastAgentID != "agent-a" {
		t.Fatalf("expected LastAgentID agent-a, got %s", thread.LastAgentID)
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

	depth, canContinue := s.RegisterReply("post-1", "agent-b")
	if !canContinue {
		t.Fatal("expected can continue for fresh thread within window and limit")
	}
	if depth != 1 {
		t.Fatalf("expected depth 1, got %d", depth)
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
	if thread.LastAgentID != "agent-b" {
		t.Fatalf("expected LastAgentID agent-b, got %s", thread.LastAgentID)
	}
	if _, ok := thread.Agents["agent-b"]; !ok {
		t.Fatal("expected agent-b in thread agents")
	}
}

func TestRegisterReply_UnknownPost(t *testing.T) {
	s := NewForumAutoState(newTestConfig())

	_, canContinue := s.RegisterReply("unknown-post", "agent-a")
	if canContinue {
		t.Fatal("expected false for unknown post")
	}
}

func TestRegisterReply_WindowExpired(t *testing.T) {
	cfg := newTestConfig()
	cfg.ThreadWindowSeconds = 0
	s := NewForumAutoState(cfg)

	s.RegisterPost("post-1", "agent-a")

	s.mu.Lock()
	s.threads["post-1"].Created = time.Now().Add(-2 * time.Second)
	s.mu.Unlock()

	_, canContinue := s.RegisterReply("post-1", "agent-b")
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
	_, canContinue := s.RegisterReply("post-1", "agent-b")
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
	cfg.IdleCooldownMinutes = 60
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

func TestCanReply_AntiSelfLoop(t *testing.T) {
	cfg := newTestConfig()
	cfg.ThreadWindowSeconds = 3600
	cfg.AgentActionCooldownSeconds = 0 // no cooldown for this test
	s := NewForumAutoState(cfg)

	s.RegisterPost("post-1", "agent-a")
	// Post author cannot reply to themselves (they are the last agent)
	if s.CanReply("post-1", "agent-a") {
		t.Fatal("expected false for anti-self-loop (post author)")
	}

	// Another agent replies
	s.RegisterReply("post-1", "agent-b")
	// agent-b cannot reply again (they were the last replier)
	if s.CanReply("post-1", "agent-b") {
		t.Fatal("expected false for anti-self-loop (last replier)")
	}

	// agent-a CAN reply now (agent-b was last, not agent-a, and no cooldown)
	if !s.CanReply("post-1", "agent-a") {
		t.Fatal("expected true for agent-a after agent-b replied")
	}
}

func TestCanReply_Cooldown(t *testing.T) {
	cfg := newTestConfig()
	cfg.ThreadWindowSeconds = 3600
	cfg.AgentActionCooldownSeconds = 3600 // 1 hour
	s := NewForumAutoState(cfg)

	s.RegisterPost("post-1", "agent-a")
	s.RegisterReply("post-1", "agent-b")

	// agent-a is not last but their thread action was recent → cooldown blocks
	s.mu.Lock()
	thread := s.threads["post-1"]
	thread.Agents["agent-a"] = time.Now() // pretend agent-a just acted
	thread.LastAgentID = "agent-c"         // make someone else the last replier
	s.mu.Unlock()

	if s.CanReply("post-1", "agent-a") {
		t.Fatal("expected false: agent-a is within per-thread cooldown")
	}

	// Now make agent-a's action in the past → should be allowed
	s.mu.Lock()
	thread.Agents["agent-a"] = time.Now().Add(-2 * time.Hour)
	s.mu.Unlock()

	if !s.CanReply("post-1", "agent-a") {
		t.Fatal("expected true: agent-a past cooldown, not last replier")
	}
}

func TestIsNewPost(t *testing.T) {
	cfg := newTestConfig()
	cfg.NewPostWindowSeconds = 30
	s := NewForumAutoState(cfg)

	s.RegisterPost("post-1", "agent-a")
	if !s.IsNewPost("post-1") {
		t.Fatal("expected true for freshly created post")
	}

	s.mu.Lock()
	s.threads["post-1"].Created = time.Now().Add(-60 * time.Second)
	s.mu.Unlock()

	if s.IsNewPost("post-1") {
		t.Fatal("expected false for old post")
	}
}

func TestPostAuthor(t *testing.T) {
	s := NewForumAutoState(newTestConfig())
	s.RegisterPost("post-1", "agent-a")
	s.RegisterReply("post-1", "agent-b")

	// Author should still be agent-a even after agent-b replied
	if s.PostAuthor("post-1") != "agent-a" {
		t.Fatalf("expected agent-a, got %s", s.PostAuthor("post-1"))
	}
}

func TestIsLastReplier(t *testing.T) {
	s := NewForumAutoState(newTestConfig())
	s.RegisterPost("post-1", "agent-a")

	if !s.IsLastReplier("post-1", "agent-a") {
		t.Fatal("expected agent-a to be last")
	}
	if s.IsLastReplier("post-1", "agent-b") {
		t.Fatal("agent-b should not be last")
	}
}

func TestNextReplyAgent_PicksEarliest(t *testing.T) {
	s := NewForumAutoState(newTestConfig())

	s.RegisterPost("post-1", "agent-a")

	s.mu.Lock()
	s.threads["post-1"].Agents["agent-b"] = time.Now().Add(-10 * time.Second)
	s.threads["post-1"].Agents["agent-c"] = time.Now().Add(-5 * time.Second)
	// Reset LastAgentID so NextReplyAgent can consider agent-a too
	s.threads["post-1"].LastAgentID = "agent-d"
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
	s.threads["post-1"].LastAgentID = "agent-d"
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
	if cfg.IdleChance != 0.15 {
		t.Fatalf("expected IdleChance 0.15, got %f", cfg.IdleChance)
	}
	if cfg.IdleCooldownMinutes != 60 {
		t.Fatalf("expected IdleCooldownMinutes 60, got %d", cfg.IdleCooldownMinutes)
	}
	if cfg.NewPostWindowSeconds != 30 {
		t.Fatalf("expected NewPostWindowSeconds 30, got %d", cfg.NewPostWindowSeconds)
	}
}
