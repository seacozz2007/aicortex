package handler

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

const chatShareLinkTitleMaxLen = 200

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

type CreateChatShareLinkRequest struct {
	AgentID           string  `json:"agent_id"`
	Title             string  `json:"title"`
	GuideMessage      string  `json:"guide_message"`
	ExpiresAt         *string `json:"expires_at"`
	MaxUses           *int32  `json:"max_uses"`
	AllowNewSessions  bool    `json:"allow_new_sessions"`
}

type UpdateChatShareLinkRequest struct {
	Title             *string `json:"title"`
	GuideMessage      *string `json:"guide_message"`
	ExpiresAt         *string `json:"expires_at"`
	MaxUses           *int32  `json:"max_uses"`
	AllowNewSessions  *bool   `json:"allow_new_sessions"`
	Status            *string `json:"status"`
}

type ChatShareLinkResponse struct {
	ID                string  `json:"id"`
	WorkspaceID       string  `json:"workspace_id"`
	AgentID           string  `json:"agent_id"`
	Title             string  `json:"title"`
	GuideMessage      string  `json:"guide_message"`
	Token             string  `json:"token"`
	ExpiresAt         *string `json:"expires_at"`
	MaxUses           *int32  `json:"max_uses"`
	UseCount          int32   `json:"use_count"`
	AllowNewSessions  bool    `json:"allow_new_sessions"`
	Status            string  `json:"status"`
	CreatedBy         string  `json:"created_by"`
	CreatedAt         string  `json:"created_at"`
	UpdatedAt         string  `json:"updated_at"`
}

func chatShareLinkToResponse(s db.ChatShareLink) ChatShareLinkResponse {
	resp := ChatShareLinkResponse{
		ID:               uuidToString(s.ID),
		WorkspaceID:      uuidToString(s.WorkspaceID),
		AgentID:          uuidToString(s.AgentID),
		Title:            s.Title,
		GuideMessage:     s.GuideMessage,
		Token:            s.Token,
		UseCount:         s.UseCount,
		AllowNewSessions: s.AllowNewSessions,
		Status:           s.Status,
		CreatedBy:        uuidToString(s.CreatedBy),
		CreatedAt:        timestampToString(s.CreatedAt),
		UpdatedAt:        timestampToString(s.UpdatedAt),
	}
	if s.ExpiresAt.Valid {
		t := s.ExpiresAt.Time.Format(time.RFC3339)
		resp.ExpiresAt = &t
	}
	if s.MaxUses.Valid {
		resp.MaxUses = &s.MaxUses.Int32
	}
	return resp
}

// generateToken produces a URL-safe random token of the given byte length.
func generateToken(byteLen int) (string, error) {
	b := make([]byte, byteLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// ---------------------------------------------------------------------------
// POST /api/chat/share-links
// ---------------------------------------------------------------------------

func (h *Handler) CreateChatShareLink(w http.ResponseWriter, r *http.Request) {
	_, ok := requireUserID(w, r)
	if !ok {
		return
	}
	workspaceID := ctxWorkspaceID(r.Context())

	var req CreateChatShareLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AgentID == "" {
		writeError(w, http.StatusBadRequest, "agent_id is required")
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}

	agentID, ok := parseUUIDOrBadRequest(w, req.AgentID, "agent_id")
	if !ok {
		return
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}

	// Verify agent exists in workspace.
	agent, err := h.Queries.GetAgentInWorkspace(r.Context(), db.GetAgentInWorkspaceParams{
		ID:          agentID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "agent not found")
		return
	}
	if agent.ArchivedAt.Valid {
		writeError(w, http.StatusBadRequest, "agent is archived")
		return
	}

	// Resolve the member for created_by.
	member, ok := h.workspaceMember(w, r, workspaceID)
	if !ok {
		return
	}

	// Generate a unique token.
	token, err := generateToken(24) // 32-char base64url token
	if err != nil {
		slog.Error("generate token failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	params := db.CreateChatShareLinkParams{
		WorkspaceID:      wsUUID,
		AgentID:          agentID,
		Title:            req.Title,
		GuideMessage:     req.GuideMessage,
		Token:            token,
		AllowNewSessions: req.AllowNewSessions,
		CreatedBy:        member.ID,
	}
	if req.ExpiresAt != nil {
		t, err := time.Parse(time.RFC3339, *req.ExpiresAt)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid expires_at format, use RFC3339")
			return
		}
		params.ExpiresAt = pgtype.Timestamptz{Time: t, Valid: true}
	}
	if req.MaxUses != nil {
		params.MaxUses = pgtype.Int4{Int32: *req.MaxUses, Valid: true}
	}

	link, err := h.Queries.CreateChatShareLink(r.Context(), params)
	if err != nil {
		slog.Error("create chat share link failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create share link")
		return
	}

	writeJSON(w, http.StatusCreated, chatShareLinkToResponse(link))
}

// ---------------------------------------------------------------------------
// GET /api/chat/share-links
// ---------------------------------------------------------------------------

func (h *Handler) ListChatShareLinks(w http.ResponseWriter, r *http.Request) {
	workspaceID := ctxWorkspaceID(r.Context())

	links, err := h.Queries.ListChatShareLinks(r.Context(), parseUUID(workspaceID))
	if err != nil {
		slog.Error("list chat share links failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list share links")
		return
	}

	resp := make([]ChatShareLinkResponse, 0, len(links))
	for _, l := range links {
		resp = append(resp, chatShareLinkToResponse(l))
	}
	writeJSON(w, http.StatusOK, resp)
}

// ---------------------------------------------------------------------------
// GET /api/chat/share-links/{id}
// ---------------------------------------------------------------------------

func (h *Handler) GetChatShareLink(w http.ResponseWriter, r *http.Request) {
	workspaceID := ctxWorkspaceID(r.Context())
	linkID := chi.URLParam(r, "id")

	idUUID, ok := parseUUIDOrBadRequest(w, linkID, "id")
	if !ok {
		return
	}

	link, err := h.Queries.GetChatShareLinkInWorkspace(r.Context(), db.GetChatShareLinkInWorkspaceParams{
		ID:          idUUID,
		WorkspaceID: parseUUID(workspaceID),
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "share link not found")
		return
	}

	writeJSON(w, http.StatusOK, chatShareLinkToResponse(link))
}

// ---------------------------------------------------------------------------
// PATCH /api/chat/share-links/{id}
// ---------------------------------------------------------------------------

func (h *Handler) UpdateChatShareLink(w http.ResponseWriter, r *http.Request) {
	workspaceID := ctxWorkspaceID(r.Context())
	linkID := chi.URLParam(r, "id")

	idUUID, ok := parseUUIDOrBadRequest(w, linkID, "id")
	if !ok {
		return
	}

	// Verify it exists in this workspace.
	_, err := h.Queries.GetChatShareLinkInWorkspace(r.Context(), db.GetChatShareLinkInWorkspaceParams{
		ID:          idUUID,
		WorkspaceID: parseUUID(workspaceID),
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "share link not found")
		return
	}

	var req UpdateChatShareLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	params := db.UpdateChatShareLinkParams{
		ID: idUUID,
	}
	if req.Title != nil {
		params.Title = pgtype.Text{String: *req.Title, Valid: true}
	}
	if req.GuideMessage != nil {
		params.GuideMessage = pgtype.Text{String: *req.GuideMessage, Valid: true}
	}
	if req.ExpiresAt != nil {
		t, err := time.Parse(time.RFC3339, *req.ExpiresAt)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid expires_at format, use RFC3339")
			return
		}
		params.ExpiresAt = pgtype.Timestamptz{Time: t, Valid: true}
	}
	if req.MaxUses != nil {
		params.MaxUses = pgtype.Int4{Int32: *req.MaxUses, Valid: true}
	}
	if req.AllowNewSessions != nil {
		params.AllowNewSessions = pgtype.Bool{Bool: *req.AllowNewSessions, Valid: true}
	}
	if req.Status != nil {
		if *req.Status != "active" && *req.Status != "disabled" {
			writeError(w, http.StatusBadRequest, "status must be 'active' or 'disabled'")
			return
		}
		params.Status = pgtype.Text{String: *req.Status, Valid: true}
	}

	link, err := h.Queries.UpdateChatShareLink(r.Context(), params)
	if err != nil {
		slog.Error("update chat share link failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update share link")
		return
	}

	writeJSON(w, http.StatusOK, chatShareLinkToResponse(link))
}

// ---------------------------------------------------------------------------
// DELETE /api/chat/share-links/{id}
// ---------------------------------------------------------------------------

func (h *Handler) DeleteChatShareLink(w http.ResponseWriter, r *http.Request) {
	workspaceID := ctxWorkspaceID(r.Context())
	linkID := chi.URLParam(r, "id")

	idUUID, ok := parseUUIDOrBadRequest(w, linkID, "id")
	if !ok {
		return
	}

	// Verify it exists in this workspace.
	_, err := h.Queries.GetChatShareLinkInWorkspace(r.Context(), db.GetChatShareLinkInWorkspaceParams{
		ID:          idUUID,
		WorkspaceID: parseUUID(workspaceID),
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "share link not found")
		return
	}

	if err := h.Queries.DeleteChatShareLink(r.Context(), idUUID); err != nil {
		slog.Error("delete chat share link failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete share link")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
