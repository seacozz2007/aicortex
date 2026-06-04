package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/aicortex/aicortex/server/internal/logger"
	"github.com/aicortex/aicortex/server/internal/util"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
	"github.com/aicortex/aicortex/server/pkg/protocol"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EndUserSessionResponse struct {
	ID           string  `json:"id"`
	WorkspaceID  string  `json:"workspace_id"`
	AgentID      string  `json:"agent_id"`
	Title        string  `json:"title"`
	Goal         string  `json:"goal"`
	GuideMessage string  `json:"guide_message"`
	Token        string  `json:"token"`
	HTMLContent  string  `json:"html_content"`
	ExpiresAt    *string `json:"expires_at"`
	Status       string  `json:"status"`
	MaxMessages  *int32  `json:"max_messages"`
	CreatedBy    string  `json:"created_by"`
	CreatedAt    string  `json:"created_at"`
	UpdatedAt    string  `json:"updated_at"`
	// Stats (populated on detail view)
	MessageCount *int64 `json:"message_count,omitempty"`
	VisitorCount *int64 `json:"visitor_count,omitempty"`
}

func endUserSessionToResponse(s db.EnduserSession) EndUserSessionResponse {
	return EndUserSessionResponse{
		ID:           uuidToString(s.ID),
		WorkspaceID:  uuidToString(s.WorkspaceID),
		AgentID:      uuidToString(s.AgentID),
		Title:        s.Title,
		Goal:         s.Goal,
		GuideMessage: s.GuideMessage,
		Token:        s.Token,
		HTMLContent:  s.HtmlContent,
		ExpiresAt:    timestampToPtr(s.ExpiresAt),
		Status:       s.Status,
		MaxMessages:  int4ToPtr(s.MaxMessages),
		CreatedBy:    uuidToString(s.CreatedBy),
		CreatedAt:    timestampToString(s.CreatedAt),
		UpdatedAt:    timestampToString(s.UpdatedAt),
	}
}

type EndUserMessageResponse struct {
	ID        string `json:"id"`
	SessionID string `json:"session_id"`
	VisitorID string `json:"visitor_id"`
	Role      string `json:"role"`
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
}

func endUserMessageToResponse(m db.EnduserMessage) EndUserMessageResponse {
	return EndUserMessageResponse{
		ID:        uuidToString(m.ID),
		SessionID: uuidToString(m.SessionID),
		VisitorID: m.VisitorID,
		Role:      m.Role,
		Content:   m.Content,
		CreatedAt: timestampToString(m.CreatedAt),
	}
}

func endUserMessagesToResponse(list []db.EnduserMessage) []EndUserMessageResponse {
	out := make([]EndUserMessageResponse, len(list))
	for i, m := range list {
		out[i] = endUserMessageToResponse(m)
	}
	return out
}

type CreateEndUserSessionRequest struct {
	AgentID      string `json:"agent_id"`
	Title        string `json:"title"`
	Goal         string `json:"goal"`
	GuideMessage string `json:"guide_message"`
	HTMLContent  string `json:"html_content"`
	ExpiresAt    *string `json:"expires_at"`
	MaxMessages  *int32  `json:"max_messages"`
}

type UpdateEndUserSessionRequest struct {
	Title        *string `json:"title"`
	Goal         *string `json:"goal"`
	GuideMessage *string `json:"guide_message"`
	HTMLContent  *string `json:"html_content"`
	ExpiresAt    *string `json:"expires_at"`
	MaxMessages  *int32  `json:"max_messages"`
	Status       *string `json:"status"`
}

const (
	endUserTokenBytes       = 16
	maxTokenGenerateRetries = 3
)

// generateEndUserToken generates a 16-byte random hex string (32 chars).
func generateEndUserToken() (string, error) {
	b := make([]byte, endUserTokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// parseQueryInt parses a query parameter as an integer with a default fallback.
func parseQueryInt(r *http.Request, key string, defaultVal int) int {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return defaultVal
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v < 0 {
		return defaultVal
	}
	return v
}

// int4ToPtr returns a pointer to an int32 from a pgtype.Int4, nil if invalid.
func int4ToPtr(v pgtype.Int4) *int32 {
	if !v.Valid {
		return nil
	}
	return &v.Int32
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func (h *Handler) getMemberID(ctx context.Context, userID, workspaceID string) (pgtype.UUID, error) {
	userUUID, err := util.ParseUUID(userID)
	if err != nil {
		return pgtype.UUID{}, err
	}
	wsUUID, err := util.ParseUUID(workspaceID)
	if err != nil {
		return pgtype.UUID{}, err
	}
	member, err := h.Queries.GetMemberByUserAndWorkspace(ctx, db.GetMemberByUserAndWorkspaceParams{
		UserID:      userUUID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		return pgtype.UUID{}, err
	}
	return member.ID, nil
}

func (h *Handler) validateAgentNotArchived(ctx context.Context, agentID pgtype.UUID) error {
	_, err := h.Queries.GetAgentNotArchived(ctx, agentID)
	return err
}

func parseExpiresAt(raw *string) (pgtype.Timestamptz, error) {
	if raw == nil || *raw == "" {
		return pgtype.Timestamptz{Valid: false}, nil
	}
	t, err := time.Parse(time.RFC3339, *raw)
	if err != nil {
		return pgtype.Timestamptz{}, errors.New("expires_at must be a valid RFC 3339 timestamp")
	}
	if t.Before(time.Now()) {
		return pgtype.Timestamptz{}, errors.New("expires_at cannot be in the past")
	}
	return pgtype.Timestamptz{Time: t, Valid: true}, nil
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// CreateEndUserSession creates a new EndUser session.
func (h *Handler) CreateEndUserSession(w http.ResponseWriter, r *http.Request) {
	var req CreateEndUserSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	workspaceID := h.resolveWorkspaceID(r)
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	if req.AgentID == "" {
		writeError(w, http.StatusBadRequest, "agent_id is required")
		return
	}
	agentUUID, ok := parseUUIDOrBadRequest(w, req.AgentID, "agent_id")
	if !ok {
		return
	}

	// Validate agent exists and is not archived.
	if err := h.validateAgentNotArchived(r.Context(), agentUUID); err != nil {
		writeError(w, http.StatusBadRequest, "agent not found or is archived")
		return
	}

	// Validate expires_at.
	expiresAt, err := parseExpiresAt(req.ExpiresAt)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Get member ID for created_by.
	memberID, err := h.getMemberID(r.Context(), userID, workspaceID)
	if err != nil {
		slog.Warn("CreateEndUserSession: failed to resolve member", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to resolve membership")
		return
	}

	// Generate token with retry for uniqueness conflicts.
	var session db.EnduserSession
	for attempt := 0; attempt < maxTokenGenerateRetries; attempt++ {
		token, err := generateEndUserToken()
		if err != nil {
			slog.Warn("CreateEndUserSession: failed to generate token", append(logger.RequestAttrs(r), "error", err)...)
			writeError(w, http.StatusInternalServerError, "failed to generate token")
			return
		}

		wsUUID := parseUUID(workspaceID)
		var maxMessages pgtype.Int4
		if req.MaxMessages != nil {
			maxMessages = pgtype.Int4{Int32: *req.MaxMessages, Valid: true}
		}

		session, err = h.Queries.CreateEndUserSession(r.Context(), db.CreateEndUserSessionParams{
			WorkspaceID:  wsUUID,
			AgentID:      agentUUID,
			Title:        req.Title,
			Goal:         req.Goal,
			GuideMessage: req.GuideMessage,
			Token:        token,
			HtmlContent:  req.HTMLContent,
			ExpiresAt:    expiresAt,
			MaxMessages:  maxMessages,
			CreatedBy:    memberID,
		})
		if err == nil {
			break
		}
		if isUniqueViolation(err) && attempt < maxTokenGenerateRetries-1 {
			continue
		}
		slog.Warn("CreateEndUserSession failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	resp := endUserSessionToResponse(session)
	h.publish(protocol.EventEndUserSessionCreated, workspaceID, "member", userID, map[string]any{"session": resp})
	writeJSON(w, http.StatusCreated, resp)
}

// ListEndUserSessions lists EndUser sessions with optional status filter and pagination.
func (h *Handler) ListEndUserSessions(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	wsUUID := parseUUID(workspaceID)

	statusFilter := r.URL.Query().Get("status")
	limit := parseQueryInt(r, "limit", 50)
	offset := parseQueryInt(r, "offset", 0)

	sessions, err := h.Queries.ListEndUserSessions(r.Context(), db.ListEndUserSessionsParams{
		WorkspaceID: wsUUID,
		Status:      strToText(statusFilter),
		Limit:       pgtype.Int4{Int32: int32(limit), Valid: true},
		Offset:      int32(offset),
	})
	if err != nil {
		slog.Warn("ListEndUserSessions failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to list sessions")
		return
	}

	total, err := h.Queries.CountEndUserSessions(r.Context(), db.CountEndUserSessionsParams{
		WorkspaceID: wsUUID,
		Status:      strToText(statusFilter),
	})
	if err != nil {
		slog.Warn("CountEndUserSessions failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to count sessions")
		return
	}

	resp := make([]EndUserSessionResponse, len(sessions))
	for i, s := range sessions {
		resp[i] = endUserSessionToResponse(s)
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": resp, "total": total})
}

// GetEndUserSession returns a single EndUser session with message and visitor counts.
func (h *Handler) GetEndUserSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	workspaceID := h.resolveWorkspaceID(r)

	idUUID, ok := parseUUIDOrBadRequest(w, id, "session id")
	if !ok {
		return
	}
	wsUUID := parseUUID(workspaceID)

	session, err := h.Queries.GetEndUserSessionInWorkspace(r.Context(), db.GetEndUserSessionInWorkspaceParams{
		ID:          idUUID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "session not found")
			return
		}
		slog.Warn("GetEndUserSession failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to get session")
		return
	}

	resp := endUserSessionToResponse(session)

	// Attach stats.
	msgCount, err := h.Queries.CountEndUserSessionMessages(r.Context(), idUUID)
	if err != nil {
		slog.Warn("GetEndUserSession: count messages failed", append(logger.RequestAttrs(r), "error", err)...)
	} else {
		resp.MessageCount = &msgCount
	}

	visitorCount, err := h.Queries.CountEndUserSessionVisitors(r.Context(), idUUID)
	if err != nil {
		slog.Warn("GetEndUserSession: count visitors failed", append(logger.RequestAttrs(r), "error", err)...)
	} else {
		resp.VisitorCount = &visitorCount
	}

	writeJSON(w, http.StatusOK, resp)
}

// UpdateEndUserSession updates an EndUser session.
func (h *Handler) UpdateEndUserSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	workspaceID := h.resolveWorkspaceID(r)

	var req UpdateEndUserSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	idUUID, ok := parseUUIDOrBadRequest(w, id, "session id")
	if !ok {
		return
	}
	wsUUID := parseUUID(workspaceID)

	params := db.UpdateEndUserSessionParams{
		ID:          idUUID,
		WorkspaceID: wsUUID,
	}

	if req.Title != nil {
		params.Title = pgtype.Text{String: *req.Title, Valid: true}
	}
	if req.Goal != nil {
		params.Goal = pgtype.Text{String: *req.Goal, Valid: true}
	}
	if req.GuideMessage != nil {
		params.GuideMessage = pgtype.Text{String: *req.GuideMessage, Valid: true}
	}
	if req.HTMLContent != nil {
		params.HtmlContent = pgtype.Text{String: *req.HTMLContent, Valid: true}
	}
	if req.MaxMessages != nil {
		params.MaxMessages = pgtype.Int4{Int32: *req.MaxMessages, Valid: true}
	}
	if req.Status != nil {
		params.Status = pgtype.Text{String: *req.Status, Valid: true}
	}
	if req.ExpiresAt != nil {
		expiresAt, err := parseExpiresAt(req.ExpiresAt)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		params.ExpiresAt = expiresAt
	}

	session, err := h.Queries.UpdateEndUserSession(r.Context(), params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "session not found")
			return
		}
		slog.Warn("UpdateEndUserSession failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to update session")
		return
	}

	resp := endUserSessionToResponse(session)
	h.publish(protocol.EventEndUserSessionUpdated, workspaceID, "member", userID, map[string]any{"session": resp})
	writeJSON(w, http.StatusOK, resp)
}

// DeleteEndUserSession soft-deletes a session (status=disabled).
func (h *Handler) DeleteEndUserSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	workspaceID := h.resolveWorkspaceID(r)

	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	idUUID, ok := parseUUIDOrBadRequest(w, id, "session id")
	if !ok {
		return
	}
	wsUUID := parseUUID(workspaceID)

	session, err := h.Queries.DeleteEndUserSession(r.Context(), db.DeleteEndUserSessionParams{
		ID:          idUUID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "session not found")
			return
		}
		slog.Warn("DeleteEndUserSession failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to delete session")
		return
	}

	h.publish(protocol.EventEndUserSessionDeleted, workspaceID, "member", userID, map[string]any{
		"session_id": uuidToString(session.ID),
	})
	w.WriteHeader(http.StatusNoContent)
}

// RegenerateEndUserToken generates a new token for a session, invalidating the old one.
func (h *Handler) RegenerateEndUserToken(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	workspaceID := h.resolveWorkspaceID(r)

	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	idUUID, ok := parseUUIDOrBadRequest(w, id, "session id")
	if !ok {
		return
	}
	wsUUID := parseUUID(workspaceID)

	var session db.EnduserSession
	var lastErr error
	for attempt := 0; attempt < maxTokenGenerateRetries; attempt++ {
		token, err := generateEndUserToken()
		if err != nil {
			slog.Warn("RegenerateEndUserToken: failed to generate token", append(logger.RequestAttrs(r), "error", err)...)
			writeError(w, http.StatusInternalServerError, "failed to generate token")
			return
		}

		session, err = h.Queries.UpdateEndUserSessionToken(r.Context(), db.UpdateEndUserSessionTokenParams{
			ID:          idUUID,
			Token:       token,
			WorkspaceID: wsUUID,
		})
		lastErr = err
		if err == nil {
			break
		}
		if isUniqueViolation(err) && attempt < maxTokenGenerateRetries-1 {
			continue
		}
	}

	if lastErr != nil {
		if errors.Is(lastErr, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "session not found")
			return
		}
		slog.Warn("RegenerateEndUserToken failed", append(logger.RequestAttrs(r), "error", lastErr)...)
		writeError(w, http.StatusInternalServerError, "failed to regenerate token")
		return
	}

	resp := endUserSessionToResponse(session)
	h.publish(protocol.EventEndUserTokenRegenerated, workspaceID, "member", userID, map[string]any{"session": resp})
	writeJSON(w, http.StatusOK, resp)
}

// ListEndUserSessionMessages lists all messages for a session.
func (h *Handler) ListEndUserSessionMessages(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	workspaceID := h.resolveWorkspaceID(r)

	idUUID, ok := parseUUIDOrBadRequest(w, id, "session id")
	if !ok {
		return
	}
	wsUUID := parseUUID(workspaceID)

	// Verify the session belongs to this workspace.
	_, err := h.Queries.GetEndUserSessionInWorkspace(r.Context(), db.GetEndUserSessionInWorkspaceParams{
		ID:          idUUID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "session not found")
			return
		}
		slog.Warn("ListEndUserSessionMessages: session lookup failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	messages, err := h.Queries.ListEndUserSessionMessages(r.Context(), idUUID)
	if err != nil {
		slog.Warn("ListEndUserSessionMessages failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to list messages")
		return
	}

	resp := endUserMessagesToResponse(messages)
	writeJSON(w, http.StatusOK, map[string]any{"messages": resp, "total": len(resp)})
}
