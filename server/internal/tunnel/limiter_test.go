package tunnel

import (
	"testing"
	"time"
)

func TestProxyLimiterAllow(t *testing.T) {
	l := NewProxyLimiter()
	key := "runtime:5173"
	window := time.Minute
	max := 3

	for i := 0; i < max; i++ {
		if !l.Allow(key, max, window) {
			t.Fatalf("expected allow on attempt %d", i+1)
		}
	}
	if l.Allow(key, max, window) {
		t.Fatal("expected rate limit after max requests")
	}
}
