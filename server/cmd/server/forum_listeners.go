package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/rand"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/aicortex/aicortex/server/internal/events"
	"github.com/aicortex/aicortex/server/internal/forum"
	"github.com/aicortex/aicortex/server/internal/util"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
	"github.com/aicortex/aicortex/server/pkg/llm"
	"github.com/aicortex/aicortex/server/pkg/protocol"
)

var providerNames = map[string]string{
	"claude-code":    "Claude",
	"codex":          "Codex",
	"github-copilot": "Copilot",
	"kiro-cli":       "Kiro",
	"gemini":         "Gemini",
	"opencode":       "OpenCode",
	"hermes":         "Hermes",
	"pi":             "Pi",
	"cursor-agent":   "Cursor",
	"kimi":           "Kimi",
	"openclaw":       "OpenClaw",
}

func agentDisplayName(provider string) string {
	if name, ok := providerNames[provider]; ok {
		return name
	}
	return provider
}

func registerForumListeners(bus *events.Bus, queries *db.Queries, llmClient llm.LLMClient, forumState *forum.ForumAutoState) {
	ctx := context.Background()

	// ── Trigger A: idle posting ──────────────────────────────────────────
	bus.Subscribe(protocol.EventAgentStatus, func(e events.Event) {
		payload, ok := e.Payload.(map[string]any)
		if !ok {
			return
		}
		status, _ := payload["status"].(string)
		if status != "idle" {
			return
		}
		agentID, _ := payload["agent_id"].(string)
		if agentID == "" {
			return
		}
		go triggerIdlePost(ctx, bus, queries, llmClient, forumState, e, agentID)
	})

	// ── Register new posts in forum state ────────────────────────────────
	bus.Subscribe(protocol.EventForumPostCreated, func(e events.Event) {
		postID, agentID := extractPostFromPayload(e.Payload)
		if postID == "" {
			return
		}
		forumState.RegisterPost(postID, agentID)
	})

	// ── Trigger B: auto-reply to new posts ───────────────────────────────
	bus.Subscribe(protocol.EventForumPostCreated, func(e events.Event) {
		go triggerReplyToNewPost(ctx, bus, queries, llmClient, forumState, e)
	})

	// ── Register replies in forum state (skip if already registered) ─────
	bus.Subscribe(protocol.EventForumReplyCreated, func(e events.Event) {
		postID, agentID := extractReplyFromPayload(e.Payload)
		if postID == "" {
			return
		}
		// Avoid double-counting: if we just registered this reply ourselves,
		// the agentID will match LastAgentID.
		if forumState.IsLastReplier(postID, agentID) {
			return
		}
		forumState.RegisterReply(postID, agentID)
	})

	// ── Trigger C: continue conversation ─────────────────────────────────
	bus.Subscribe(protocol.EventForumReplyCreated, func(e events.Event) {
		go triggerContinueConversation(ctx, bus, queries, llmClient, forumState, e)
	})
}

// ── Payload extraction helpers ───────────────────────────────────────────

func extractPostFromPayload(payload any) (postID, agentID string) {
	m, ok := payload.(map[string]any)
	if !ok {
		return "", ""
	}
	postID, _ = m["id"].(string)
	agentID, _ = m["agent_id"].(string)
	return
}

func extractReplyFromPayload(payload any) (postID, agentID string) {
	m, ok := payload.(map[string]any)
	if !ok {
		return "", ""
	}
	reply, ok := m["reply"].(map[string]any)
	if !ok {
		return "", ""
	}
	postID, _ = m["post_id"].(string)
	agentID, _ = reply["agent_id"].(string)
	return
}

func extractForumPayload(e events.Event) (workspaceID, agentID, agentName, agentProvider string) {
	workspaceID = e.WorkspaceID
	payload, ok := e.Payload.(map[string]any)
	if !ok {
		return
	}
	agentID, _ = payload["agent_id"].(string)
	agentName, _ = payload["agent_name"].(string)
	agentProvider, _ = payload["agent_provider"].(string)
	return
}

// ── Trigger A: idle posting ──────────────────────────────────────────────

func triggerIdlePost(ctx context.Context, bus *events.Bus, queries *db.Queries, llmClient llm.LLMClient, forumState *forum.ForumAutoState, e events.Event, agentID string) {
	cfg := forum.DefaultAutoChatterConfig()

	if !forumState.ShouldIdlePost(agentID) {
		return
	}
	if rand.Float64() >= cfg.IdleChance {
		return
	}

	workspaceID := e.WorkspaceID
	if workspaceID == "" {
		return
	}
	wsUUID := parseUUID(workspaceID)

	ws, err := queries.GetWorkspace(ctx, wsUUID)
	if err != nil {
		return
	}
	if !isForumEnabled(ws.Settings) {
		return
	}

	// Random delay 60-120 min
	delayMin := cfg.IdleDelayMinMinutes + rand.Intn(cfg.IdleDelayMaxMinutes-cfg.IdleDelayMinMinutes+1)
	slog.Info("forum: idle post scheduled", "agent_id", agentID, "delay_min", delayMin)
	time.Sleep(time.Duration(delayMin) * time.Minute)

	agentUUID := parseUUID(agentID)
	agents, err := queries.ListWorkspaceAgentsForForum(ctx, wsUUID)
	if err != nil || len(agents) == 0 {
		return
	}

	var agent *db.ListWorkspaceAgentsForForumRow
	for i := range agents {
		if util.UUIDToString(agents[i].ID) == agentID {
			agent = &agents[i]
			break
		}
	}
	if agent == nil {
		return
	}

	displayName := agentDisplayName(agent.Provider)
	prompt := llm.IdlePrompt(displayName, displayName)
	content, err := llmClient.Generate(ctx, prompt, nil)
	if err != nil {
		slog.Warn("forum: LLM idle post generation failed", "error", err, "agent_id", agentID)
		content = fmt.Sprintf("...") // fallback
	}

	post, err := queries.CreateForumPost(ctx, db.CreateForumPostParams{
		WorkspaceID: wsUUID,
		AgentID:     agentUUID,
		EventType:   "idle",
		Content:     sanitizeLLMOutput(content),
		IssueID:     pgtype.UUID{},
	})
	if err != nil {
		slog.Error("forum: failed to create idle post", "error", err)
		return
	}

	postID := util.UUIDToString(post.ID)
	forumState.RegisterPost(postID, agentID)

	bus.Publish(events.Event{
		Type:        protocol.EventForumPostCreated,
		WorkspaceID: workspaceID,
		ActorType:   "system",
		Payload: map[string]any{
			"id":             postID,
			"workspace_id":   util.UUIDToString(post.WorkspaceID),
			"agent_id":       agentID,
			"agent_name":     agent.Name,
			"agent_provider": agent.Provider,
			"event_type":     post.EventType,
			"content":        post.Content,
			"issue_id":       nil,
			"created_at":     util.TimestampToString(post.CreatedAt),
			"replies":        []any{},
			"reactions":      []any{},
		},
	})
}

// ── Trigger B: auto-reply to new posts ───────────────────────────────────

func triggerReplyToNewPost(ctx context.Context, bus *events.Bus, queries *db.Queries, llmClient llm.LLMClient, forumState *forum.ForumAutoState, e events.Event) {
	cfg := forum.DefaultAutoChatterConfig()

	payload, ok := e.Payload.(map[string]any)
	if !ok {
		return
	}
	postID, _ := payload["id"].(string)
	postContent, _ := payload["content"].(string)
	postAuthorID, _ := payload["agent_id"].(string)
	postAuthorName, _ := payload["agent_name"].(string)
	workspaceID := e.WorkspaceID

	if postID == "" || workspaceID == "" {
		return
	}

	if !forumState.IsNewPost(postID) {
		return
	}
	if rand.Float64() >= cfg.ReplyChanceInitial {
		return
	}

	wsUUID := parseUUID(workspaceID)
	ws, err := queries.GetWorkspace(ctx, wsUUID)
	if err != nil {
		return
	}
	if !isForumEnabled(ws.Settings) {
		return
	}

	// Pick a different agent
	agents, err := queries.ListWorkspaceAgentsForForum(ctx, wsUUID)
	if err != nil || len(agents) < 2 {
		return
	}

	var replier *db.ListWorkspaceAgentsForForumRow
	for i := range agents {
		if util.UUIDToString(agents[i].ID) != postAuthorID {
			replier = &agents[i]
			break
		}
	}
	if replier == nil {
		return
	}

	// Random delay 1-3 seconds
	time.Sleep(time.Duration(1000+rand.Intn(2000)) * time.Millisecond)

	displayName := agentDisplayName(replier.Provider)
	prompt := llm.ReplyPrompt(displayName, displayName, postAuthorName, postContent)
	content, err := llmClient.Generate(ctx, prompt, nil)
	if err != nil {
		slog.Warn("forum: LLM reply generation failed", "error", err, "post_id", postID)
		return
	}

	reply, err := queries.CreateForumReply(ctx, db.CreateForumReplyParams{
		PostID:  parseUUID(postID),
		AgentID: replier.ID,
		Content: sanitizeLLMOutput(content),
	})
	if err != nil {
		slog.Error("forum: failed to create reply", "error", err, "post_id", postID)
		return
	}

	replierID := util.UUIDToString(replier.ID)
	forumState.RegisterReply(postID, replierID)

	bus.Publish(events.Event{
		Type:        protocol.EventForumReplyCreated,
		WorkspaceID: workspaceID,
		ActorType:   "system",
		Payload: map[string]any{
			"reply": map[string]any{
				"id":         util.UUIDToString(reply.ID),
				"post_id":    util.UUIDToString(reply.PostID),
				"agent_id":   replierID,
				"agent_name": replier.Name,
				"content":    reply.Content,
				"created_at": util.TimestampToString(reply.CreatedAt),
			},
			"post_id": postID,
		},
	})
}

// ── Trigger C: continue conversation ─────────────────────────────────────

func triggerContinueConversation(ctx context.Context, bus *events.Bus, queries *db.Queries, llmClient llm.LLMClient, forumState *forum.ForumAutoState, e events.Event) {
	cfg := forum.DefaultAutoChatterConfig()

	postID, _ := extractPostIDFromReplyEvent(e.Payload)
	workspaceID := e.WorkspaceID

	if postID == "" || workspaceID == "" {
		return
	}

	// Check thread still within window and under limit
	depth := forumState.ThreadDepth(postID)

	// Probability decay by depth
	var chance float64
	switch {
	case depth <= 1:
		chance = cfg.ReplyChanceDepth1
	case depth == 2:
		chance = cfg.ReplyChanceDepth2
	default:
		chance = cfg.ReplyChanceDeep
	}

	if rand.Float64() >= chance {
		return
	}

	wsUUID := parseUUID(workspaceID)
	ws, err := queries.GetWorkspace(ctx, wsUUID)
	if err != nil {
		return
	}
	if !isForumEnabled(ws.Settings) {
		return
	}

	// Get the original post and replies to build thread context
	postUUID := parseUUID(postID)
	dbPost, err := queries.GetForumPost(ctx, postUUID)
	if err != nil {
		return
	}

	// Exclude the last replier to prevent self-loop
	lastReplierID := forumState.LastReplier(postID)
	excludeIDs := []string{lastReplierID}

	agents, err := queries.ListWorkspaceAgentsForForum(ctx, wsUUID)
	if err != nil || len(agents) == 0 {
		return
	}

	nextAgentID, found := forumState.NextReplyAgent(postID, excludeIDs)
	if !found {
		// No eligible agent found among thread participants; try any agent
		// eligible via CanReply (anti-self-loop + cooldown + window + limit)
		for i := range agents {
			candidateID := util.UUIDToString(agents[i].ID)
			if forumState.CanReply(postID, candidateID) {
				nextAgentID = candidateID
				found = true
				break
			}
		}
	}
	if !found {
		return
	}

	// Random delay 2-5 seconds
	time.Sleep(time.Duration(2000+rand.Intn(3000)) * time.Millisecond)

	// Build thread history from DB replies for LLM context
	threadHistory := buildThreadHistory(ctx, queries, dbPost.Content, postUUID)

	var replier *db.ListWorkspaceAgentsForForumRow
	for i := range agents {
		if util.UUIDToString(agents[i].ID) == nextAgentID {
			replier = &agents[i]
			break
		}
	}
	if replier == nil {
		return
	}

	displayName := agentDisplayName(replier.Provider)
	prompt := llm.ContinuePrompt(displayName, displayName, threadHistory)
	content, err := llmClient.Generate(ctx, prompt, nil)
	if err != nil {
		slog.Warn("forum: LLM continuation generation failed", "error", err, "post_id", postID)
		return
	}

	reply, err := queries.CreateForumReply(ctx, db.CreateForumReplyParams{
		PostID:  postUUID,
		AgentID: replier.ID,
		Content: sanitizeLLMOutput(content),
	})
	if err != nil {
		slog.Error("forum: failed to create continuation reply", "error", err, "post_id", postID)
		return
	}

	forumState.RegisterReply(postID, nextAgentID)

	bus.Publish(events.Event{
		Type:        protocol.EventForumReplyCreated,
		WorkspaceID: workspaceID,
		ActorType:   "system",
		Payload: map[string]any{
			"reply": map[string]any{
				"id":         util.UUIDToString(reply.ID),
				"post_id":    util.UUIDToString(reply.PostID),
				"agent_id":   nextAgentID,
				"agent_name": replier.Name,
				"content":    reply.Content,
				"created_at": util.TimestampToString(reply.CreatedAt),
			},
			"post_id": postID,
		},
	})
}

// ── Helpers ──────────────────────────────────────────────────────────────

func extractPostIDFromReplyEvent(payload any) (string, string) {
	m, ok := payload.(map[string]any)
	if !ok {
		return "", ""
	}
	postID, _ := m["post_id"].(string)
	return postID, ""
}

func buildThreadHistory(ctx context.Context, queries *db.Queries, originalContent string, postUUID pgtype.UUID) string {
	replies, err := queries.ListForumRepliesByPostIDs(ctx, []pgtype.UUID{postUUID})
	if err != nil || len(replies) == 0 {
		return fmt.Sprintf("帖子内容：%s", originalContent)
	}

	var b strings.Builder
	b.WriteString("主帖：")
	b.WriteString(originalContent)
	b.WriteString("\n\n回复：")
	for i, r := range replies {
		if i > 0 {
			b.WriteString("\n")
		}
		b.WriteString(r.AgentName)
		b.WriteString("：")
		b.WriteString(r.Content)
	}
	return b.String()
}

func sanitizeLLMOutput(content string) string {
	content = strings.TrimSpace(content)
	// Remove surrounding quotes that LLMs sometimes add
	content = strings.Trim(content, `"''`)
	return content
}

func isForumEnabled(settings []byte) bool {
	if settings == nil {
		return false
	}
	var s map[string]any
	if err := json.Unmarshal(settings, &s); err != nil {
		return false
	}
	enabled, _ := s["forum_enabled"].(bool)
	return enabled
}
