package issueutil

import "testing"

func TestNormalizeIssuePriority(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"", "none"},
		{"P3", "low"},
		{"p0", "urgent"},
		{"high", "high"},
		{"ASAP", "urgent"},
	}
	for _, tc := range tests {
		got, err := NormalizeIssuePriority(tc.in)
		if err != nil {
			t.Fatalf("NormalizeIssuePriority(%q): %v", tc.in, err)
		}
		if got != tc.want {
			t.Fatalf("NormalizeIssuePriority(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}

	if _, err := NormalizeIssuePriority("P9"); err == nil {
		t.Fatal("expected error for unknown priority")
	}
}
