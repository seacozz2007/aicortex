package service

import (
	"testing"
	"time"
)

func TestIsTerminalStatus(t *testing.T) {
	tests := []struct {
		status   string
		expected bool
	}{
		{"done", true},
		{"in_review", true},
		{"cancelled", true},
		{"todo", false},
		{"in_progress", false},
		{"blocked", false},
		{"", false},
	}
	for _, tt := range tests {
		if got := isTerminalStatus(tt.status); got != tt.expected {
			t.Errorf("isTerminalStatus(%q) = %v, want %v", tt.status, got, tt.expected)
		}
	}
}

func TestPollingConfigDefaults(t *testing.T) {
	cfg := DefaultPollingConfig()
	if cfg.Interval != 15*time.Minute {
		t.Errorf("default interval = %v, want 15m", cfg.Interval)
	}
	if !cfg.Enabled {
		t.Error("default enabled should be true")
	}
}

func TestPollingServiceDisabled(t *testing.T) {
	cfg := PollingConfig{Interval: 15 * time.Minute, Enabled: false}
	svc := NewPollingService(nil, nil, cfg)
	scanned, triggered := svc.ScanAndTrigger(nil)
	if scanned != 0 || triggered != 0 {
		t.Errorf("disabled service should return 0, got scanned=%d triggered=%d", scanned, triggered)
	}
}

func TestPollingServiceConfig(t *testing.T) {
	cfg := PollingConfig{Interval: 10 * time.Minute, Enabled: true}
	svc := NewPollingService(nil, nil, cfg)
	if svc.Interval != 10*time.Minute {
		t.Errorf("interval = %v, want 10m", svc.Interval)
	}
	if !svc.Enabled {
		t.Error("expected enabled")
	}
}
