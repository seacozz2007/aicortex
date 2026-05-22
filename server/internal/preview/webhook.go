package preview

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// WebhookHandler processes GitHub pull request webhook events for preview environments.
type WebhookHandler struct {
	manager   *Manager
	queries   Querier
	workspace string // workspace slug or ID to associate PRs with
}

// NewWebhookHandler creates a WebhookHandler for GitHub PR events.
func NewWebhookHandler(manager *Manager, queries Querier, workspace string) *WebhookHandler {
	return &WebhookHandler{
		manager:   manager,
		queries:   queries,
		workspace: workspace,
	}
}

// GitHubPRWebhookPayload represents a GitHub pull_request webhook event.
type GitHubPRWebhookPayload struct {
	Action      string `json:"action"`
	Number      int    `json:"number"`
	PullRequest struct {
		HTMLURL string `json:"html_url"`
		Title   string `json:"title"`
		Head    struct {
			Ref  string `json:"ref"`
			SHA  string `json:"sha"`
			Repo *RepoInfo `json:"repo"`
		} `json:"head"`
		Base struct {
			Ref  string `json:"ref"`
			Repo *RepoInfo `json:"repo"`
		} `json:"base"`
		Merged bool   `json:"merged"`
		State  string `json:"state"`
	} `json:"pull_request"`
	Repository *RepoInfo `json:"repository"`
}

// RepoInfo captures GitHub repository identifiers.
type RepoInfo struct {
	FullName string `json:"full_name"`
	Owner    struct {
		Login string `json:"login"`
	} `json:"owner"`
	Name    string `json:"name"`
	HTMLURL string `json:"html_url"`
}

// HandleWebhook dispatches a GitHub webhook event based on its action.
func (wh *WebhookHandler) HandleWebhook(ctx context.Context, payload []byte) error {
	var event GitHubPRWebhookPayload
	if err := json.Unmarshal(payload, &event); err != nil {
		return err
	}

	switch event.Action {
	case "opened", "reopened", "synchronize":
		return wh.handlePROpened(ctx, event)
	case "closed":
		return wh.handlePRClosed(ctx, event)
	default:
		slog.Debug("webhook: ignoring PR event", "action", event.Action)
		return nil
	}
}

// handlePROpened triggers preview environment creation for a new/updated PR.
func (wh *WebhookHandler) handlePROpened(ctx context.Context, event GitHubPRWebhookPayload) error {
	repoOwner, repoName := parseRepoFullName(event.Repository)
	if repoOwner == "" || repoName == "" {
		return nil
	}

	prID := prIdentifier(repoOwner, repoName, event.Number)

	// Check if a preview env already exists for this PR
	existing, err := wh.queries.GetPreviewEnvironmentByPR(ctx, wh.workspace, prID)
	if err == nil {
		// Already exists — update commit SHA and re-deploy
		slog.Info("webhook: updating existing preview env",
			"env_id", existing.ID,
			"pr", prID,
		)
		return wh.manager.ReDeploy(ctx, existing)
	}

	// Create a new preview environment
	env, err := wh.manager.Create(ctx, wh.workspace, prID, repoOwner, repoName, int32(event.Number), event.PullRequest.Head.Ref)
	if err != nil {
		return err
	}

	slog.Info("webhook: triggered preview deployment",
		"env_id", env.ID,
		"pr", prID,
	)

	return nil
}

// handlePRClosed triggers preview environment cleanup for a closed/merged PR.
func (wh *WebhookHandler) handlePRClosed(ctx context.Context, event GitHubPRWebhookPayload) error {
	repoOwner, repoName := parseRepoFullName(event.Repository)
	if repoOwner == "" || repoName == "" {
		return nil
	}

	prID := prIdentifier(repoOwner, repoName, event.Number)

	env, err := wh.queries.GetPreviewEnvironmentByPR(ctx, wh.workspace, prID)
	if err != nil {
		slog.Debug("webhook: no preview env found for closed PR", "pr", prID)
		return nil
	}

	return wh.manager.Destroy(ctx, env)
}

// ServeHTTP handles incoming GitHub webhook HTTP requests.
func (wh *WebhookHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ct := r.Header.Get("Content-Type")
	if !strings.Contains(ct, "application/json") {
		http.Error(w, "expected application/json", http.StatusUnsupportedMediaType)
		return
	}

	body := http.MaxBytesReader(w, r.Body, 10<<20)
	defer body.Close()

	bodyBytes, err := io.ReadAll(body)
	if err != nil {
		http.Error(w, "cannot read body", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	if err := wh.HandleWebhook(ctx, bodyBytes); err != nil {
		slog.Error("webhook: handling failed", "error", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

// parseRepoFullName extracts owner and name from a repository reference.
func parseRepoFullName(repo *RepoInfo) (string, string) {
	if repo == nil {
		return "", ""
	}
	if repo.Owner.Login != "" {
		return repo.Owner.Login, repo.Name
	}
	parts := strings.SplitN(repo.FullName, "/", 2)
	if len(parts) == 2 {
		return parts[0], parts[1]
	}
	return "", ""
}

// prIdentifier creates a unique PR identifier string.
func prIdentifier(owner, repo string, number int) string {
	return strings.ToLower(owner + "/" + repo + "#" + itoa(number))
}

// itoa is a simple int to string conversion.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := false
	if n < 0 {
		neg = true
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
