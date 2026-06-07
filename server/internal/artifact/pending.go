package artifact

import (
	"sync"
	"time"
)

// Response is the daemon answer to a single artifact:request.
type Response struct {
	Entries     []ListEntry
	ContentType string
	Body        []byte
	Error       string
}

// ListEntry is one row in a directory listing.
type ListEntry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"is_dir"`
	Size  int64  `json:"size"`
}

type pendingEntry struct {
	ch       chan Response
	deadline time.Time
}

// PendingStore correlates artifact:request frames with waiting HTTP handlers.
type PendingStore struct {
	mu      sync.Mutex
	entries map[string]*pendingEntry
}

func NewPendingStore() *PendingStore {
	return &PendingStore{entries: make(map[string]*pendingEntry)}
}

func (s *PendingStore) Register(requestID string, timeout time.Duration) (<-chan Response, func()) {
	ch := make(chan Response, 1)
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

func (s *PendingStore) Complete(requestID string, resp Response) bool {
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
