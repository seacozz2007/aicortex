package main

import (
	"encoding/json"
	"testing"

	"github.com/aicortex/aicortex/server/internal/events"
)

func TestSanitizeLLMOutput(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"plain text", "今天天气不错", "今天天气不错"},
		{"trim whitespace", "  你好  ", "你好"},
		{"remove double quotes", `"大家好"`, "大家好"},
		{"remove single quotes", "'hello'", "hello"},
		{"unicode smart quotes left", "“你好”", "“你好”"},
		{"mixed quotes", "\"'test'\"", "test"},
		{"empty string", "", ""},
		{"whitespace only", "   ", ""},
		{"newlines preserved", "line1\nline2\n", "line1\nline2"},
		{"code block content", "```go\nfunc main() {}\n```", "```go\nfunc main() {}\n```"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := sanitizeLLMOutput(tt.input)
			if result != tt.expected {
				t.Errorf("sanitizeLLMOutput(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestExtractPostFromPayload(t *testing.T) {
	tests := []struct {
		name           string
		payload        any
		expectedPostID string
		expectedAgent  string
	}{
		{
			name: "valid payload",
			payload: map[string]any{
				"id":       "post-123",
				"agent_id": "agent-a",
			},
			expectedPostID: "post-123",
			expectedAgent:  "agent-a",
		},
		{
			name: "missing id",
			payload: map[string]any{
				"agent_id": "agent-a",
			},
			expectedPostID: "",
			expectedAgent:  "agent-a",
		},
		{
			name:           "nil payload",
			payload:        nil,
			expectedPostID: "",
			expectedAgent:  "",
		},
		{
			name:           "string payload (wrong type)",
			payload:        "not a map",
			expectedPostID: "",
			expectedAgent:  "",
		},
		{
			name: "numeric id",
			payload: map[string]any{
				"id":       42,
				"agent_id": "agent-a",
			},
			expectedPostID: "",
			expectedAgent:  "agent-a",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			postID, agentID := extractPostFromPayload(tt.payload)
			if postID != tt.expectedPostID {
				t.Errorf("postID = %q, want %q", postID, tt.expectedPostID)
			}
			if agentID != tt.expectedAgent {
				t.Errorf("agentID = %q, want %q", agentID, tt.expectedAgent)
			}
		})
	}
}

func TestExtractReplyFromPayload(t *testing.T) {
	tests := []struct {
		name           string
		payload        any
		expectedPostID string
		expectedAgent  string
	}{
		{
			name: "valid payload",
			payload: map[string]any{
				"post_id": "post-123",
				"reply": map[string]any{
					"id":       "reply-456",
					"agent_id": "agent-b",
					"content":  "hello",
				},
			},
			expectedPostID: "post-123",
			expectedAgent:  "agent-b",
		},
		{
			name: "missing reply map",
			payload: map[string]any{
				"post_id": "post-123",
			},
			expectedPostID: "",
			expectedAgent:  "",
		},
		{
			name:           "nil payload",
			payload:        nil,
			expectedPostID: "",
			expectedAgent:  "",
		},
		{
			name: "reply is not a map",
			payload: map[string]any{
				"post_id": "post-123",
				"reply":   "not a map",
			},
			expectedPostID: "",
			expectedAgent:  "",
		},
		{
			name: "missing agent_id in reply",
			payload: map[string]any{
				"post_id": "post-123",
				"reply": map[string]any{
					"id": "reply-456",
				},
			},
			expectedPostID: "post-123",
			expectedAgent:  "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			postID, agentID := extractReplyFromPayload(tt.payload)
			if postID != tt.expectedPostID {
				t.Errorf("postID = %q, want %q", postID, tt.expectedPostID)
			}
			if agentID != tt.expectedAgent {
				t.Errorf("agentID = %q, want %q", agentID, tt.expectedAgent)
			}
		})
	}
}

func TestIsForumEnabled(t *testing.T) {
	tests := []struct {
		name     string
		settings []byte
		expected bool
	}{
		{
			name:     "explicitly true",
			settings: []byte(`{"forum_enabled": true}`),
			expected: true,
		},
		{
			name:     "explicitly false",
			settings: []byte(`{"forum_enabled": false}`),
			expected: false,
		},
		{
			name:     "nil settings",
			settings: nil,
			expected: false,
		},
		{
			name:     "empty settings",
			settings: []byte(`{}`),
			expected: false,
		},
		{
			name:     "invalid json",
			settings: []byte(`not json`),
			expected: false,
		},
		{
			name:     "other keys present",
			settings: []byte(`{"other_key": "value", "forum_enabled": true}`),
			expected: true,
		},
		{
			name:     "forum_enabled as string (not bool)",
			settings: []byte(`{"forum_enabled": "true"}`),
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isForumEnabled(tt.settings)
			if result != tt.expected {
				t.Errorf("isForumEnabled(%s) = %v, want %v", tt.settings, result, tt.expected)
			}
		})
	}
}

func TestIsForumEnabled_ValidJSON(t *testing.T) {
	// Verify valid JSON with forum_enabled = true round-trips correctly
	raw := json.RawMessage(`{"forum_enabled":true}`)
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	enabled, ok := decoded["forum_enabled"].(bool)
	if !ok || !enabled {
		t.Fatalf("expected forum_enabled=true, got ok=%v val=%v", ok, enabled)
	}
}

func TestExtractForumPayload(t *testing.T) {
	// Test the payload extraction helper with a complete payload
	payload := map[string]any{
		"agent_id":       "agent-1",
		"agent_name":     "Claude",
		"agent_provider": "claude-code",
		"content":        "Hello",
	}
	workspaceID, agentID, agentName, agentProvider := extractForumPayload(events.Event{
		WorkspaceID: "ws-1",
		Payload:     payload,
	})

	if workspaceID != "ws-1" {
		t.Errorf("workspaceID = %q, want ws-1", workspaceID)
	}
	if agentID != "agent-1" {
		t.Errorf("agentID = %q, want agent-1", agentID)
	}
	if agentName != "Claude" {
		t.Errorf("agentName = %q, want Claude", agentName)
	}
	if agentProvider != "claude-code" {
		t.Errorf("agentProvider = %q, want claude-code", agentProvider)
	}
}

func TestExtractPostIDFromReplyEvent(t *testing.T) {
	postID, _ := extractPostIDFromReplyEvent(map[string]any{
		"post_id": "post-789",
		"reply":   map[string]any{"id": "reply-1"},
	})
	if postID != "post-789" {
		t.Errorf("postID = %q, want post-789", postID)
	}

	postID, _ = extractPostIDFromReplyEvent(nil)
	if postID != "" {
		t.Errorf("expected empty for nil payload, got %q", postID)
	}
}

func TestAgentDisplayName(t *testing.T) {
	if name := agentDisplayName("claude-code"); name != "Claude" {
		t.Errorf("expected Claude, got %s", name)
	}
	if name := agentDisplayName("unknown-provider"); name != "unknown-provider" {
		t.Errorf("expected unknown-provider, got %s", name)
	}
}
