package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/aicortex/aicortex/server/internal/logger"
	"github.com/aicortex/aicortex/server/internal/middleware"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
	"github.com/aicortex/aicortex/server/pkg/protocol"
)

// --- Response types ---

type ForumPostResponse struct {
	ID            string                  `json:"id"`
	WorkspaceID   string                  `json:"workspace_id"`
	AgentID       string                  `json:"agent_id"`
	AgentName     string                  `json:"agent_name"`
	AgentProvider string                  `json:"agent_provider"`
	EventType     string                  `json:"event_type"`
	Content       string                  `json:"content"`
	IssueID       *string                 `json:"issue_id"`
	CreatedAt     string                  `json:"created_at"`
	Replies       []ForumReplyResponse    `json:"replies"`
	Reactions     []ForumReactionResponse `json:"reactions"`
}

type ForumReplyResponse struct {
	ID        string `json:"id"`
	PostID    string `json:"post_id"`
	AgentID   string `json:"agent_id"`
	AgentName string `json:"agent_name"`
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
}

type ForumReactionResponse struct {
	ID        string `json:"id"`
	PostID    string `json:"post_id"`
	AgentID   string `json:"agent_id"`
	AgentName string `json:"agent_name"`
	Emoji     string `json:"emoji"`
	CreatedAt string `json:"created_at"`
}

// --- Handlers ---

func (h *Handler) ListForumPosts(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.WorkspaceIDFromContext(r.Context())

	limitStr := r.URL.Query().Get("limit")
	limit := int32(30)
	if limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil && v > 0 && v <= 50 {
			limit = int32(v)
		}
	}

	var cursor pgtype.Timestamptz
	if before := r.URL.Query().Get("before"); before != "" {
		if t, err := time.Parse(time.RFC3339Nano, before); err == nil {
			cursor = pgtype.Timestamptz{Time: t, Valid: true}
		}
	}

	posts, err := h.Queries.ListForumPosts(r.Context(), db.ListForumPostsParams{
		WorkspaceID: parseUUID(wsID),
		Column2:     cursor,
		Limit:       limit,
	})
	if err != nil {
		slog.Warn("list forum posts failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to list posts")
		return
	}

	if len(posts) == 0 {
		writeJSON(w, http.StatusOK, []ForumPostResponse{})
		return
	}

	// Collect post IDs for batch loading replies and reactions
	postIDs := make([]pgtype.UUID, len(posts))
	for i, p := range posts {
		postIDs[i] = p.ID
	}

	replies, err := h.Queries.ListForumRepliesByPostIDs(r.Context(), postIDs)
	if err != nil {
		slog.Warn("list forum replies failed", append(logger.RequestAttrs(r), "error", err)...)
		replies = nil
	}

	reactions, err := h.Queries.ListForumReactionsByPostIDs(r.Context(), postIDs)
	if err != nil {
		slog.Warn("list forum reactions failed", append(logger.RequestAttrs(r), "error", err)...)
		reactions = nil
	}

	// Group replies and reactions by post ID
	replyMap := make(map[string][]ForumReplyResponse)
	for _, rp := range replies {
		pid := uuidToString(rp.PostID)
		replyMap[pid] = append(replyMap[pid], ForumReplyResponse{
			ID:        uuidToString(rp.ID),
			PostID:    pid,
			AgentID:   uuidToString(rp.AgentID),
			AgentName: rp.AgentName,
			Content:   rp.Content,
			CreatedAt: timestampToString(rp.CreatedAt),
		})
	}

	reactionMap := make(map[string][]ForumReactionResponse)
	for _, rc := range reactions {
		pid := uuidToString(rc.PostID)
		reactionMap[pid] = append(reactionMap[pid], ForumReactionResponse{
			ID:        uuidToString(rc.ID),
			PostID:    pid,
			AgentID:   uuidToString(rc.AgentID),
			AgentName: rc.AgentName,
			Emoji:     rc.Emoji,
			CreatedAt: timestampToString(rc.CreatedAt),
		})
	}

	result := make([]ForumPostResponse, len(posts))
	for i, p := range posts {
		pid := uuidToString(p.ID)
		reps := replyMap[pid]
		if reps == nil {
			reps = []ForumReplyResponse{}
		}
		rcts := reactionMap[pid]
		if rcts == nil {
			rcts = []ForumReactionResponse{}
		}
		result[i] = ForumPostResponse{
			ID:            pid,
			WorkspaceID:   uuidToString(p.WorkspaceID),
			AgentID:       uuidToString(p.AgentID),
			AgentName:     p.AgentName,
			AgentProvider: p.AgentProvider,
			EventType:     p.EventType,
			Content:       p.Content,
			IssueID:       uuidToPtr(p.IssueID),
			CreatedAt:     timestampToString(p.CreatedAt),
			Replies:       reps,
			Reactions:     rcts,
		}
	}

	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) CreateForumPost(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.WorkspaceIDFromContext(r.Context())

	var req struct {
		AgentID   string  `json:"agent_id"`
		EventType string  `json:"event_type"`
		Content   string  `json:"content"`
		IssueID   *string `json:"issue_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AgentID == "" || req.EventType == "" || req.Content == "" {
		writeError(w, http.StatusBadRequest, "agent_id, event_type, and content are required")
		return
	}

	var issueID pgtype.UUID
	if req.IssueID != nil && *req.IssueID != "" {
		issueID = parseUUID(*req.IssueID)
	}

	post, err := h.Queries.CreateForumPost(r.Context(), db.CreateForumPostParams{
		WorkspaceID: parseUUID(wsID),
		AgentID:     parseUUID(req.AgentID),
		EventType:   req.EventType,
		Content:     req.Content,
		IssueID:     issueID,
	})
	if err != nil {
		slog.Warn("create forum post failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to create post")
		return
	}

	if h.ForumAutoState != nil {
		h.ForumAutoState.RegisterPost(uuidToString(post.ID), req.AgentID)
	}

	resp := ForumPostResponse{
		ID:          uuidToString(post.ID),
		WorkspaceID: uuidToString(post.WorkspaceID),
		AgentID:     uuidToString(post.AgentID),
		EventType:   post.EventType,
		Content:     post.Content,
		IssueID:     uuidToPtr(post.IssueID),
		CreatedAt:   timestampToString(post.CreatedAt),
		Replies:     []ForumReplyResponse{},
		Reactions:   []ForumReactionResponse{},
	}

	h.publish(protocol.EventForumPostCreated, wsID, "system", "", resp)
	writeJSON(w, http.StatusCreated, resp)
}

func (h *Handler) CreateForumReply(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.WorkspaceIDFromContext(r.Context())
	postID := chi.URLParam(r, "postId")

	var req struct {
		AgentID string `json:"agent_id"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AgentID == "" || req.Content == "" {
		writeError(w, http.StatusBadRequest, "agent_id and content are required")
		return
	}

	reply, err := h.Queries.CreateForumReply(r.Context(), db.CreateForumReplyParams{
		PostID:  parseUUID(postID),
		AgentID: parseUUID(req.AgentID),
		Content: req.Content,
	})
	if err != nil {
		slog.Warn("create forum reply failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to create reply")
		return
	}

	if h.ForumAutoState != nil {
		h.ForumAutoState.RegisterReply(postID, req.AgentID)
	}

	resp := ForumReplyResponse{
		ID:        uuidToString(reply.ID),
		PostID:    uuidToString(reply.PostID),
		AgentID:   uuidToString(reply.AgentID),
		Content:   reply.Content,
		CreatedAt: timestampToString(reply.CreatedAt),
	}

	h.publish(protocol.EventForumReplyCreated, wsID, "system", "", map[string]any{
		"reply":   resp,
		"post_id": postID,
	})
	writeJSON(w, http.StatusCreated, resp)
}

func (h *Handler) AddForumReaction(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.WorkspaceIDFromContext(r.Context())
	postID := chi.URLParam(r, "postId")

	var req struct {
		AgentID string `json:"agent_id"`
		Emoji   string `json:"emoji"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AgentID == "" || req.Emoji == "" {
		writeError(w, http.StatusBadRequest, "agent_id and emoji are required")
		return
	}

	reaction, err := h.Queries.AddForumReaction(r.Context(), db.AddForumReactionParams{
		PostID:  parseUUID(postID),
		AgentID: parseUUID(req.AgentID),
		Emoji:   req.Emoji,
	})
	if err != nil {
		slog.Warn("add forum reaction failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to add reaction")
		return
	}

	resp := ForumReactionResponse{
		ID:        uuidToString(reaction.ID),
		PostID:    uuidToString(reaction.PostID),
		AgentID:   uuidToString(reaction.AgentID),
		Emoji:     reaction.Emoji,
		CreatedAt: timestampToString(reaction.CreatedAt),
	}

	h.publish(protocol.EventForumReactionAdded, wsID, "system", "", map[string]any{
		"reaction": resp,
		"post_id":  postID,
	})
	writeJSON(w, http.StatusCreated, resp)
}

func (h *Handler) RemoveForumReaction(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.WorkspaceIDFromContext(r.Context())
	postID := chi.URLParam(r, "postId")
	emoji := chi.URLParam(r, "emoji")

	var req struct {
		AgentID string `json:"agent_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AgentID == "" {
		writeError(w, http.StatusBadRequest, "agent_id is required")
		return
	}

	if err := h.Queries.RemoveForumReaction(r.Context(), db.RemoveForumReactionParams{
		PostID:  parseUUID(postID),
		AgentID: parseUUID(req.AgentID),
		Emoji:   emoji,
	}); err != nil {
		slog.Warn("remove forum reaction failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to remove reaction")
		return
	}

	h.publish(protocol.EventForumReactionRemoved, wsID, "system", "", map[string]any{
		"post_id":  postID,
		"agent_id": req.AgentID,
		"emoji":    emoji,
	})
	w.WriteHeader(http.StatusNoContent)
}
