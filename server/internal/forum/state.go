package forum

import (
	"sync"
	"time"
)

// ThreadState holds the in-memory state for a single forum thread.
type ThreadState struct {
	PostID        string
	AuthorAgentID string
	Depth         int
	LastAgentID   string
	Agents        map[string]time.Time
	Created       time.Time
	ReplyCount    int
}

// ForumAutoState manages in-memory state for auto-chatter threads.
type ForumAutoState struct {
	mu      sync.Mutex
	threads map[string]*ThreadState
	agents  map[string]time.Time
	config  AutoChatterConfig
}

// NewForumAutoState creates a new ForumAutoState with the given config.
func NewForumAutoState(config AutoChatterConfig) *ForumAutoState {
	return &ForumAutoState{
		threads: make(map[string]*ThreadState),
		agents:  make(map[string]time.Time),
		config:  config,
	}
}

// RegisterPost registers a new forum post for the given agent. Idempotent.
func (s *ForumAutoState) RegisterPost(postID, agentID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.threads[postID]; exists {
		return
	}

	now := time.Now()
	s.threads[postID] = &ThreadState{
		PostID:        postID,
		AuthorAgentID: agentID,
		Depth:         0,
		LastAgentID:   agentID,
		Agents:        map[string]time.Time{agentID: now},
		Created:       now,
		ReplyCount:    0,
	}
	s.agents[agentID] = now
}

// RegisterReply registers a reply from agentID on the thread identified by
// postID. It returns the new depth and true if the thread can continue;
// otherwise returns 0 and false.
func (s *ForumAutoState) RegisterReply(postID, agentID string) (int, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	thread, exists := s.threads[postID]
	if !exists {
		return 0, false
	}

	now := time.Now()
	thread.Depth++
	thread.ReplyCount++
	thread.LastAgentID = agentID
	thread.Agents[agentID] = now
	s.agents[agentID] = now

	withinWindow := now.Sub(thread.Created) <= time.Duration(s.config.ThreadWindowSeconds)*time.Second
	underLimit := thread.ReplyCount < s.config.MaxRepliesPerThread

	if !withinWindow || !underLimit {
		return thread.Depth, false
	}
	return thread.Depth, true
}

// ShouldIdlePost checks whether the given agent is past its idle cooldown
// and may post an idle message.
func (s *ForumAutoState) ShouldIdlePost(agentID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	lastAction, exists := s.agents[agentID]
	if !exists {
		return true
	}

	cooldown := time.Duration(s.config.IdleCooldownMinutes) * time.Minute
	return time.Since(lastAction) >= cooldown
}

// CanReply checks if agentID can reply to the post.
// Returns false when: thread doesn't exist, agent is the last replier
// (anti-self-loop), agent is within the per-thread cooldown, thread is
// beyond its window, or reply count is at the limit.
func (s *ForumAutoState) CanReply(postID, agentID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	thread, exists := s.threads[postID]
	if !exists {
		return false
	}

	// Anti-self-loop: same agent cannot reply consecutively
	if thread.LastAgentID == agentID {
		return false
	}

	// Per-thread cooldown for same agent
	if lastTime, ok := thread.Agents[agentID]; ok {
		cooldown := time.Duration(s.config.AgentActionCooldownSeconds) * time.Second
		if time.Since(lastTime) < cooldown {
			return false
		}
	}

	// Thread window check
	if time.Since(thread.Created) > time.Duration(s.config.ThreadWindowSeconds)*time.Second {
		return false
	}

	// Reply limit
	if thread.ReplyCount >= s.config.MaxRepliesPerThread {
		return false
	}

	return true
}

// ThreadDepth returns the current depth of the thread (0 for no replies yet).
func (s *ForumAutoState) ThreadDepth(postID string) int {
	s.mu.Lock()
	defer s.mu.Unlock()

	if thread, exists := s.threads[postID]; exists {
		return thread.Depth
	}
	return 0
}

// IsNewPost checks if a post was created within the new-post reply window.
func (s *ForumAutoState) IsNewPost(postID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	thread, exists := s.threads[postID]
	if !exists {
		return false
	}

	return time.Since(thread.Created) <= time.Duration(s.config.NewPostWindowSeconds)*time.Second
}

// PostAuthor returns the agent ID of the post's original author.
func (s *ForumAutoState) PostAuthor(postID string) string {
	s.mu.Lock()
	defer s.mu.Unlock()

	if thread, exists := s.threads[postID]; exists {
		return thread.AuthorAgentID
	}
	return ""
}

// LastReplier returns the agent ID of the last agent who replied in the thread.
func (s *ForumAutoState) LastReplier(postID string) string {
	s.mu.Lock()
	defer s.mu.Unlock()

	if thread, exists := s.threads[postID]; exists {
		return thread.LastAgentID
	}
	return ""
}

// IsLastReplier returns true if agentID is the last agent who replied in the thread.
func (s *ForumAutoState) IsLastReplier(postID, agentID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	thread, exists := s.threads[postID]
	if !exists {
		return false
	}
	return thread.LastAgentID == agentID
}

// NextReplyAgent picks the next agent to reply in a thread, excluding the
// specified agent IDs. It returns the agent ID and true if a candidate was
// found; otherwise it returns ("", false).
func (s *ForumAutoState) NextReplyAgent(postID string, excludeAgentIDs []string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	thread, exists := s.threads[postID]
	if !exists {
		return "", false
	}

	exclude := make(map[string]bool, len(excludeAgentIDs))
	for _, id := range excludeAgentIDs {
		exclude[id] = true
	}

	var bestAgent string
	var earliest time.Time
	found := false

	for agentID, lastReply := range thread.Agents {
		if exclude[agentID] {
			continue
		}
		if !found || lastReply.Before(earliest) {
			bestAgent = agentID
			earliest = lastReply
			found = true
		}
	}

	return bestAgent, found
}
