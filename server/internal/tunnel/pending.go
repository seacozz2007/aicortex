package tunnel

import (
	"sync"
	"time"
)

// ProxyResponse is the daemon's answer to a single tunnel:request.
type ProxyResponse struct {
	Status  int
	Headers map[string][]string
	Body    []byte
	Error   string
}

type pendingEntry struct {
	ch       chan ProxyResponse
	deadline time.Time
}

// PendingStore correlates tunnel:request frames with waiting HTTP handlers.
type PendingStore struct {
	mu      sync.Mutex
	entries map[string]*pendingEntry
}

func NewPendingStore() *PendingStore {
	return &PendingStore{entries: make(map[string]*pendingEntry)}
}

func (s *PendingStore) Register(requestID string, timeout time.Duration) (<-chan ProxyResponse, func()) {
	ch := make(chan ProxyResponse, 1)
	deadline := time.Now().Add(timeout)
	s.mu.Lock()
	s.entries[requestID] = &pendingEntry{ch: ch, deadline: deadline}
	s.mu.Unlock()
	cancel := func() {
		s.mu.Lock()
		delete(s.entries, requestID)
		s.mu.Unlock()
	}
	return ch, cancel
}

func (s *PendingStore) Complete(requestID string, resp ProxyResponse) bool {
	s.mu.Lock()
	entry, ok := s.entries[requestID]
	if ok {
		delete(s.entries, requestID)
	}
	s.mu.Unlock()
	if !ok {
		return false
	}
	select {
	case entry.ch <- resp:
	default:
	}
	return true
}

// Expire removes stale pending entries older than their deadline.
func (s *PendingStore) Expire() {
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, entry := range s.entries {
		if now.After(entry.deadline) {
			delete(s.entries, id)
			select {
			case entry.ch <- ProxyResponse{Error: "tunnel request timed out"}:
			default:
			}
		}
	}
}
