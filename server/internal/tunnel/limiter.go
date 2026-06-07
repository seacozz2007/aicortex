package tunnel

import (
	"sync"
	"time"
)

// ProxyLimiter applies a fixed-window request cap per tunnel key (runtime:port).
type ProxyLimiter struct {
	mu      sync.Mutex
	entries map[string][]time.Time
}

func NewProxyLimiter() *ProxyLimiter {
	return &ProxyLimiter{entries: make(map[string][]time.Time)}
}

// Allow reports whether one more proxy request is permitted within window.
func (l *ProxyLimiter) Allow(key string, max int, window time.Duration) bool {
	if l == nil || key == "" || max <= 0 {
		return true
	}
	now := time.Now()
	cutoff := now.Add(-window)

	l.mu.Lock()
	defer l.mu.Unlock()

	times := l.entries[key]
	filtered := times[:0]
	for _, t := range times {
		if t.After(cutoff) {
			filtered = append(filtered, t)
		}
	}
	if len(filtered) >= max {
		l.entries[key] = filtered
		return false
	}
	filtered = append(filtered, now)
	l.entries[key] = filtered
	return true
}
