package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestIdlePrompt(t *testing.T) {
	result := IdlePrompt("Claude", "nerdy")
	if result == "" {
		t.Error("IdlePrompt returned empty string")
	}
	if !strings.Contains(result, "Claude") {
		t.Error("IdlePrompt should contain agent name")
	}
	if !strings.Contains(result, "nerdy") {
		t.Error("IdlePrompt should contain tone")
	}
}

func TestReplyPrompt(t *testing.T) {
	result := ReplyPrompt("Claude", "cheerful", "Copilot", "今天代码写得不错")
	if result == "" {
		t.Error("ReplyPrompt returned empty string")
	}
	if !strings.Contains(result, "Claude") {
		t.Error("ReplyPrompt should contain agent name")
	}
	if !strings.Contains(result, "Copilot") {
		t.Error("ReplyPrompt should contain post author name")
	}
	if !strings.Contains(result, "今天代码写得不错") {
		t.Error("ReplyPrompt should contain post content")
	}
}

func TestContinuePrompt(t *testing.T) {
	result := ContinuePrompt("Claude", "dramatic", "A: 今天好累\nB: 是啊，写了一整天代码")
	if result == "" {
		t.Error("ContinuePrompt returned empty string")
	}
	if !strings.Contains(result, "Claude") {
		t.Error("ContinuePrompt should contain agent name")
	}
	if !strings.Contains(result, "dramatic") {
		t.Error("ContinuePrompt should contain tone")
	}
}

func TestPromptsWithEmptyInputs(t *testing.T) {
	t.Run("IdlePrompt with empty inputs", func(t *testing.T) {
		result := IdlePrompt("", "")
		if result == "" {
			t.Error("IdlePrompt returned empty string with empty inputs")
		}
	})

	t.Run("ReplyPrompt with empty inputs", func(t *testing.T) {
		result := ReplyPrompt("", "", "", "")
		if result == "" {
			t.Error("ReplyPrompt returned empty string with empty inputs")
		}
	})

	t.Run("ContinuePrompt with empty inputs", func(t *testing.T) {
		result := ContinuePrompt("", "", "")
		if result == "" {
			t.Error("ContinuePrompt returned empty string with empty inputs")
		}
	})
}

func TestOpenAIClient_Generate_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.URL.Path != "/v1/chat/completions" {
			t.Errorf("expected /v1/chat/completions, got %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-api-key" {
			t.Errorf("expected Authorization header, got %s", r.Header.Get("Authorization"))
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("expected Content-Type application/json, got %s", r.Header.Get("Content-Type"))
		}

		resp := chatResponse{
			Choices: []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			}{
				{Message: struct {
					Content string `json:"content"`
				}{Content: "大家好，今天天气不错！"}},
			},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewOpenAIClient(Config{
		APIKey:  "test-api-key",
		Model:   "deepseek-chat",
		BaseURL: server.URL,
	})

	result, err := client.Generate(context.Background(), "发个帖子", &GenerateOptions{
		SystemPrompt: "你是一个友好的AI助手",
		Temperature:  0.8,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != "大家好，今天天气不错！" {
		t.Errorf("unexpected result: %q", result)
	}
}

func TestOpenAIClient_Generate_NoAPIKey(t *testing.T) {
	client := NewOpenAIClient(Config{
		APIKey: "",
		Model:  "deepseek-chat",
	})

	_, err := client.Generate(context.Background(), "hello", nil)
	if err == nil {
		t.Fatal("expected error for missing API key")
	}
	if err.Error() != "llm: LLM_API_KEY is not set" {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestOpenAIClient_Generate_HTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"error": {"message": "Invalid API key", "type": "authentication_error"}}`))
	}))
	defer server.Close()

	client := NewOpenAIClient(Config{
		APIKey:  "bad-key",
		Model:   "deepseek-chat",
		BaseURL: server.URL,
	})

	_, err := client.Generate(context.Background(), "hello", nil)
	if err == nil {
		t.Fatal("expected error for HTTP error response")
	}
}

func TestOpenAIClient_Generate_APIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := chatResponse{
			Error: &struct {
				Message string `json:"message"`
				Type    string `json:"type"`
			}{
				Message: "Model overloaded",
				Type:    "server_error",
			},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewOpenAIClient(Config{
		APIKey:  "test-key",
		Model:   "deepseek-chat",
		BaseURL: server.URL,
	})

	_, err := client.Generate(context.Background(), "hello", nil)
	if err == nil {
		t.Fatal("expected error for API error response")
	}
}

func TestOpenAIClient_Generate_InvalidJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("not json"))
	}))
	defer server.Close()

	client := NewOpenAIClient(Config{
		APIKey:  "test-key",
		Model:   "deepseek-chat",
		BaseURL: server.URL,
	})

	_, err := client.Generate(context.Background(), "hello", nil)
	if err == nil {
		t.Fatal("expected error for invalid JSON response")
	}
}

func TestOpenAIClient_Generate_EmptyChoices(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := chatResponse{Choices: nil}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewOpenAIClient(Config{
		APIKey:  "test-key",
		Model:   "deepseek-chat",
		BaseURL: server.URL,
	})

	_, err := client.Generate(context.Background(), "hello", nil)
	if err == nil {
		t.Fatal("expected error for empty choices")
	}
}

func TestOpenAIClient_Generate_SystemPrompt(t *testing.T) {
	var receivedMessages []chatMessage
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req chatRequest
		json.NewDecoder(r.Body).Decode(&req)
		receivedMessages = req.Messages

		resp := chatResponse{
			Choices: []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			}{
				{Message: struct {
					Content string `json:"content"`
				}{Content: "ok"}},
			},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewOpenAIClient(Config{
		APIKey:  "test-key",
		Model:   "deepseek-chat",
		BaseURL: server.URL,
	})

	_, err := client.Generate(context.Background(), "hello", &GenerateOptions{
		SystemPrompt: "You are helpful",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(receivedMessages) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(receivedMessages))
	}
	if receivedMessages[0].Role != "system" || receivedMessages[0].Content != "You are helpful" {
		t.Errorf("expected system message, got role=%q content=%q", receivedMessages[0].Role, receivedMessages[0].Content)
	}
	if receivedMessages[1].Role != "user" || receivedMessages[1].Content != "hello" {
		t.Errorf("expected user message, got role=%q content=%q", receivedMessages[1].Role, receivedMessages[1].Content)
	}
}

func TestOpenAIClient_Generate_DefaultTemperature(t *testing.T) {
	var receivedReq chatRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&receivedReq)
		resp := chatResponse{
			Choices: []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			}{
				{Message: struct {
					Content string `json:"content"`
				}{Content: "ok"}},
			},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewOpenAIClient(Config{
		APIKey:  "test-key",
		Model:   "deepseek-chat",
		BaseURL: server.URL,
	})

	_, err := client.Generate(context.Background(), "hello", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if receivedReq.Temperature != 0.7 {
		t.Errorf("expected default temperature 0.7, got %f", receivedReq.Temperature)
	}
}

func TestOpenAIClient_Generate_ContextCancellation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {}
	}))
	defer server.Close()

	client := NewOpenAIClient(Config{
		APIKey:  "test-key",
		Model:   "deepseek-chat",
		BaseURL: server.URL,
	})

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := client.Generate(ctx, "hello", nil)
	if err == nil {
		t.Fatal("expected error for cancelled context")
	}
}

func TestConfigFromEnv(t *testing.T) {
	t.Setenv("LLM_API_KEY", "sk-test")
	t.Setenv("LLM_MODEL", "gpt-4")
	t.Setenv("LLM_BASE_URL", "https://api.openai.com")

	cfg := ConfigFromEnv()
	if cfg.APIKey != "sk-test" {
		t.Errorf("APIKey = %q, want %q", cfg.APIKey, "sk-test")
	}
	if cfg.Model != "gpt-4" {
		t.Errorf("Model = %q, want %q", cfg.Model, "gpt-4")
	}
	if cfg.BaseURL != "https://api.openai.com" {
		t.Errorf("BaseURL = %q, want %q", cfg.BaseURL, "https://api.openai.com")
	}
}

func TestConfigFromEnv_Defaults(t *testing.T) {
	cfg := ConfigFromEnv()
	if cfg.Model != "deepseek-chat" {
		t.Errorf("default Model = %q, want %q", cfg.Model, "deepseek-chat")
	}
	if cfg.BaseURL != "https://api.deepseek.com" {
		t.Errorf("default BaseURL = %q, want %q", cfg.BaseURL, "https://api.deepseek.com")
	}
}

func TestNewClientFromEnv_ReturnsClient(t *testing.T) {
	t.Setenv("LLM_API_KEY", "sk-test")
	client := NewClientFromEnv()
	if client == nil {
		t.Fatal("NewClientFromEnv returned nil")
	}
}
