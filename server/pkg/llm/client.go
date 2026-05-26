package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// GenerateOptions holds optional parameters for a generation request.
type GenerateOptions struct {
	SystemPrompt string
	Temperature  float64
}

// LLMClient is the interface for generating text from an LLM.
type LLMClient interface {
	Generate(ctx context.Context, prompt string, opts *GenerateOptions) (string, error)
}

// Config holds the configuration for creating an LLM client.
type Config struct {
	APIKey  string
	Model   string
	BaseURL string
}

// ConfigFromEnv reads LLM configuration from environment variables.
func ConfigFromEnv() Config {
	return Config{
		APIKey:  os.Getenv("LLM_API_KEY"),
		Model:   envOrDefault("LLM_MODEL", "deepseek-chat"),
		BaseURL: envOrDefault("LLM_BASE_URL", "https://api.deepseek.com"),
	}
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature,omitempty"`
	Stream      bool          `json:"stream"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error,omitempty"`
}

// OpenAIClient implements LLMClient for OpenAI-compatible APIs (DeepSeek, OpenAI, etc.).
type OpenAIClient struct {
	apiKey  string
	model   string
	baseURL string
	client  *http.Client
}

// NewOpenAIClient creates a new OpenAIClient from the given config.
func NewOpenAIClient(cfg Config) *OpenAIClient {
	return &OpenAIClient{
		apiKey:  cfg.APIKey,
		model:   cfg.Model,
		baseURL: cfg.BaseURL,
		client: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

// NewClientFromEnv creates a new LLMClient from environment configuration.
func NewClientFromEnv() LLMClient {
	return NewOpenAIClient(ConfigFromEnv())
}

// Generate sends a prompt to the LLM and returns the generated text.
func (c *OpenAIClient) Generate(ctx context.Context, prompt string, opts *GenerateOptions) (string, error) {
	if c.apiKey == "" {
		return "", fmt.Errorf("llm: LLM_API_KEY is not set")
	}

	messages := []chatMessage{
		{Role: "user", Content: prompt},
	}

	temperature := 0.7
	if opts != nil {
		if opts.SystemPrompt != "" {
			messages = append([]chatMessage{{Role: "system", Content: opts.SystemPrompt}}, messages...)
		}
		if opts.Temperature > 0 {
			temperature = opts.Temperature
		}
	}

	body := chatRequest{
		Model:       c.model,
		Messages:    messages,
		Temperature: temperature,
		Stream:      false,
	}

	reqBody, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("llm: failed to marshal request: %w", err)
	}

	url := c.baseURL + "/v1/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(reqBody))
	if err != nil {
		return "", fmt.Errorf("llm: failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("llm: request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("llm: failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("llm: API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var cr chatResponse
	if err := json.Unmarshal(respBody, &cr); err != nil {
		return "", fmt.Errorf("llm: failed to parse response: %w", err)
	}

	if cr.Error != nil {
		return "", fmt.Errorf("llm: API error (%s): %s", cr.Error.Type, cr.Error.Message)
	}

	if len(cr.Choices) == 0 {
		return "", fmt.Errorf("llm: no choices in response")
	}

	return cr.Choices[0].Message.Content, nil
}

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
