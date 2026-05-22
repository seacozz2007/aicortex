package preview

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// WebhookHandler processes GitHub pull request webhook events for preview environments.
type WebhookHandler struct {
	manager    *Manager
	queries    Querier
	workspace  string // workspace slug or ID to associate PRs with
	secret     string // HMAC-SHA256 secret for signature verification
	issuePrefix string // workspace issue prefix (e.g. "WOR") for PR-issue linking
}

// NewWebhookHandler creates a WebhookHandler for GitHub PR events.
func NewWebhookHandler(manager *Manager, queries Querier, workspace, secret, issuePrefix string) *WebhookHandler {
	return &WebhookHandler{
		manager:     manager,
		queries:     queries,
		workspace:   workspace,
		secret:      secret,
		issuePrefix: issuePrefix,
	}
}

// GitHubPRWebhookPayload represents a GitHub pull_request webhook event.
type GitHubPRWebhookPayload struct {
	Action      string `json:"action"`
	Number      int    `json:"number"`
	PullRequest struct {
		HTMLURL string `json:"html_url"`
		Title   string `json:"title"`
		Body    string `json:"body"`
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
	Repository   *RepoInfo    `json:"repository"`
	Installation struct {
		ID int64 `json:"id"`
	} `json:"installation"`
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

	// Upsert the PR into github_pull_request and link to any matching issue
	wh.linkPRToIssue(ctx, event, repoOwner, repoName)

	slog.Info("webhook: triggered preview deployment",
		"env_id", env.ID,
		"pr", prID,
	)

	return nil
}

// linkPRToIssue upserts the PR into the github_pull_request table and links it
// to any matching issue found by scanning the PR title for issue identifiers.
func (wh *WebhookHandler) linkPRToIssue(ctx context.Context, event GitHubPRWebhookPayload, repoOwner, repoName string) {
	if wh.issuePrefix == "" || event.Installation.ID == 0 {
		return
	}

	prID, err := wh.queries.UpsertGitHubPullRequest(ctx, wh.workspace, event.Installation.ID,
		repoOwner, repoName, int32(event.Number),
		event.PullRequest.Title, event.PullRequest.HTMLURL, event.PullRequest.Head.Ref, "open",
	)
	if err != nil {
		slog.Warn("webhook: failed to upsert pull request", "error", err)
		return
	}

	// Extract issue identifiers from PR title and body
	identifiers := extractIssueIdentifiers(wh.issuePrefix, event.PullRequest.Title, event.PullRequest.Body, event.PullRequest.Head.Ref)
	for _, ident := range identifiers {
		parts := strings.SplitN(ident, "-", 2)
		if len(parts) != 2 {
			continue
		}
		num, err := strconv.Atoi(parts[1])
		if err != nil {
			continue
		}

		issueID, err := wh.queries.GetIssueByNumber(ctx, wh.workspace, int32(num))
		if err != nil {
			slog.Debug("webhook: no matching issue found for PR link",
				"identifier", ident,
				"pr_id", prID,
			)
			continue
		}

		if err := wh.queries.LinkIssueToPullRequest(ctx, issueID, prID); err != nil {
			slog.Warn("webhook: failed to link PR to issue",
				"issue_id", issueID,
				"pr_id", prID,
				"error", err,
			)
		}
	}
}

// extractIssueIdentifiers pulls every "PREFIX-NUMBER" match from the supplied strings.
func extractIssueIdentifiers(prefix string, parts ...string) []string {
	seen := map[string]struct{}{}
	var out []string
	prefixUpper := strings.ToUpper(prefix)

	for _, src := range parts {
		upper := strings.ToUpper(src)
		idx := 0
		for {
			pos := strings.Index(upper[ idx:], prefixUpper+"-")
			if pos < 0 {
				break
			}
			start := idx + pos
			rest := upper[start+len(prefixUpper)+1:]
			end := 0
			for end < len(rest) && rest[end] >= '0' && rest[end] <= '9' {
				end++
			}
			if end > 0 {
				ident := prefixUpper + "-" + rest[:end]
				if _, dup := seen[ident]; !dup {
					seen[ident] = struct{}{}
					out = append(out, ident)
				}
			}
			idx = start + 1
		}
	}
	return out
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
// It verifies the X-Hub-Signature-256 HMAC before processing.
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

	// Verify HMAC-SHA256 signature when secret is configured
	if wh.secret != "" {
		sig := r.Header.Get("X-Hub-Signature-256")
		if sig == "" {
			http.Error(w, "missing X-Hub-Signature-256", http.StatusUnauthorized)
			return
		}
		if !verifyHMAC256(bodyBytes, []byte(wh.secret), sig) {
			http.Error(w, "invalid signature", http.StatusUnauthorized)
			return
		}
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

// verifyHMAC256 validates an HMAC-SHA256 signature against a payload and secret.
func verifyHMAC256(payload, secret []byte, expectedSig string) bool {
	mac := hmac.New(sha256.New, secret)
	mac.Write(payload)
	computed := hex.EncodeToString(mac.Sum(nil))

	// Strip "sha256=" prefix if present
	if len(expectedSig) > 7 && expectedSig[:7] == "sha256=" {
		expectedSig = expectedSig[7:]
	}

	return hmac.Equal([]byte(computed), []byte(expectedSig))
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
