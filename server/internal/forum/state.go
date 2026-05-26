package forum

import (
	"sync"
	"time"
)

// ThreadState holds the in-memory state for a single forum thread.
type ThreadState struct {
	PostID     string
	Depth      int
	Agents     map[string]time.Time
	Created    time.Time
	ReplyCount int
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

// RegisterPost registers a new forum post for the given agent.
func (s *ForumAutoState) RegisterPost(postID, agentID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.threads[postID]; exists {
		return
	}

	now := time.Now()
	s.threads[postID] = &ThreadState{
		PostID:     postID,
		Depth:      0,
		Agents:     map[string]time.Time{agentID: now},
		Created:    now,
		ReplyCount: 0,
	}
	s.agents[agentID] = now
}

// RegisterReply registers a reply from agentID on the thread identified by
// postID. It returns true if the thread can continue (within window, under
// reply limit); false otherwise.
func (s *ForumAutoState) RegisterReply(postID, agentID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	thread, exists := s.threads[postID]
	if !exists {
		return false
	}

	now := time.Now()
	thread.Depth++
	thread.ReplyCount++
	thread.Agents[agentID] = now
	s.agents[agentID] = now

	withinWindow := now.Sub(thread.Created) <= time.Duration(s.config.ThreadWindowSeconds)*time.Second
	underLimit := thread.ReplyCount < s.config.MaxRepliesPerThread

	return withinWindow && underLimit
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
