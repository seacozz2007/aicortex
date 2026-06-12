package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/aicortex/aicortex/server/internal/middleware"
	"github.com/aicortex/aicortex/server/pkg/protocol"
)

type terminalSessionResponse struct {
	ID             string  `json:"id"`
	WorkspaceID    string  `json:"workspace_id"`
	RuntimeID      string  `json:"runtime_id"`
	UserID         string  `json:"user_id"`
	ChatSessionID  *string `json:"chat_session_id,omitempty"`
	Scope          string  `json:"scope"`
	Bootstrapped   bool    `json:"bootstrapped"`
	Title          string  `json:"title"`
	Status         string  `json:"status"`
	Shell          string  `json:"shell"`
	Cols           int     `json:"cols"`
	Rows           int     `json:"rows"`
	CreatedAt      string  `json:"created_at"`
	ClosedAt       *string `json:"closed_at,omitempty"`
	LastAttachedAt string  `json:"last_attached_at"`
}

const terminalSessionSelectCols = `id, workspace_id, runtime_id, user_id, chat_session_id, scope, bootstrapped,
	title, status, shell, cols, rows, created_at, closed_at, last_attached_at`

func normalizeTerminalScope(scope string) string {
	scope = strings.TrimSpace(scope)
	if scope == "" {
		return "default"
	}
	return scope
}

func scanTerminalSessionRow(
	rows pgx.Row,
) (terminalSessionResponse, error) {
	var s terminalSessionResponse
	var wsUUID, rtUUID, userUUID pgtype.UUID
	var chatSessionUUID pgtype.UUID
	var createdAt, lastAttached time.Time
	var closedAt *time.Time
	if err := rows.Scan(
		&s.ID, &wsUUID, &rtUUID, &userUUID, &chatSessionUUID, &s.Scope, &s.Bootstrapped,
		&s.Title, &s.Status, &s.Shell, &s.Cols, &s.Rows, &createdAt, &closedAt, &lastAttached,
	); err != nil {
		return terminalSessionResponse{}, err
	}
	s.WorkspaceID = uuidToString(wsUUID)
	s.RuntimeID = uuidToString(rtUUID)
	s.UserID = uuidToString(userUUID)
	if chatSessionUUID.Valid {
		id := uuidToString(chatSessionUUID)
		s.ChatSessionID = &id
	}
	s.CreatedAt = createdAt.Format(time.RFC3339)
	s.LastAttachedAt = lastAttached.Format(time.RFC3339)
	if closedAt != nil {
		t := closedAt.Format(time.RFC3339)
		s.ClosedAt = &t
	}
	return s, nil
}

func (h *Handler) findTerminalSessionByContext(
	ctx context.Context,
	wsID, userID, chatSessionID, scope, runtimeID string,
) (terminalSessionResponse, bool, error) {
	row := h.DB.QueryRow(ctx,
		`SELECT `+terminalSessionSelectCols+`
		 FROM terminal_sessions
		 WHERE workspace_id = $1 AND user_id = $2 AND chat_session_id = $3 AND scope = $4
		   AND runtime_id = $5 AND status != 'closed'`,
		wsID, userID, chatSessionID, scope, runtimeID,
	)
	s, err := scanTerminalSessionRow(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return terminalSessionResponse{}, false, nil
		}
		return terminalSessionResponse{}, false, err
	}
	return s, true, nil
}

func (h *Handler) sendTerminalOpen(runtimeID string, payload protocol.TerminalOpenPayload) {
	if h.DaemonHub == nil {
		return
	}
	raw, _ := json.Marshal(payload)
	h.DaemonHub.SendToRuntime(runtimeID, protocol.Message{
		Type:    protocol.EventTerminalOpen,
		Payload: raw,
	})
}

func (h *Handler) CreateTerminalSession(w http.ResponseWriter, r *http.Request) {
	member, ok := middleware.MemberFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !h.requireWorkspaceExplore(w, r, member) {
		return
	}

	var req struct {
		RuntimeID     string `json:"runtime_id"`
		ChatSessionID string `json:"chat_session_id"`
		Scope         string `json:"scope"`
		Title         string `json:"title"`
		Shell         string `json:"shell"`
		Cols          int    `json:"cols"`
		Rows          int    `json:"rows"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RuntimeID == "" {
		writeError(w, http.StatusBadRequest, "runtime_id is required")
		return
	}
	if req.Cols <= 0 {
		req.Cols = 120
	}
	if req.Rows <= 0 {
		req.Rows = 30
	}

	wsID := uuidToString(member.WorkspaceID)
	userID := uuidToString(member.UserID)
	scope := normalizeTerminalScope(req.Scope)

	if req.ChatSessionID != "" {
		if existing, found, err := h.findTerminalSessionByContext(
			r.Context(), wsID, userID, req.ChatSessionID, scope, req.RuntimeID,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to lookup session")
			return
		} else if found {
			writeJSON(w, http.StatusOK, existing)
			return
		}
	}

	sessionID := uuid.New().String()
	var chatSessionParam any
	if req.ChatSessionID != "" {
		chatSessionParam = req.ChatSessionID
	}

	_, err := h.DB.Exec(r.Context(),
		`INSERT INTO terminal_sessions (id, workspace_id, runtime_id, user_id, chat_session_id, scope, title, shell, cols, rows)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		sessionID, wsID, req.RuntimeID, userID, chatSessionParam, scope, req.Title, req.Shell, req.Cols, req.Rows,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	h.sendTerminalOpen(req.RuntimeID, protocol.TerminalOpenPayload{
		SessionID: sessionID,
		RuntimeID: req.RuntimeID,
		Title:     req.Title,
		Cols:      req.Cols,
		Rows:      req.Rows,
		Shell:     req.Shell,
	})

	resp := terminalSessionResponse{
		ID:             sessionID,
		WorkspaceID:    wsID,
		RuntimeID:      req.RuntimeID,
		UserID:         userID,
		Scope:          scope,
		Bootstrapped:   false,
		Title:          req.Title,
		Status:         "active",
		Shell:          req.Shell,
		Cols:           req.Cols,
		Rows:           req.Rows,
		CreatedAt:      time.Now().UTC().Format(time.RFC3339),
		LastAttachedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if req.ChatSessionID != "" {
		resp.ChatSessionID = &req.ChatSessionID
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (h *Handler) ListTerminalSessions(w http.ResponseWriter, r *http.Request) {
	member, ok := middleware.MemberFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !h.requireWorkspaceExplore(w, r, member) {
		return
	}

	wsID := uuidToString(member.WorkspaceID)
	userID := uuidToString(member.UserID)
	chatSessionID := strings.TrimSpace(r.URL.Query().Get("chat_session_id"))
	scope := normalizeTerminalScope(r.URL.Query().Get("scope"))

	query := `SELECT ` + terminalSessionSelectCols + `
		 FROM terminal_sessions
		 WHERE workspace_id = $1 AND user_id = $2`
	args := []any{wsID, userID}
	if chatSessionID != "" {
		query += ` AND chat_session_id = $3`
		args = append(args, chatSessionID)
		if scope != "" {
			query += ` AND scope = $4`
			args = append(args, scope)
		}
	}
	query += ` ORDER BY created_at DESC LIMIT 50`

	rows, err := h.DB.Query(r.Context(), query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list sessions")
		return
	}
	defer rows.Close()

	sessions := []terminalSessionResponse{}
	for rows.Next() {
		s, err := scanTerminalSessionRow(rows)
		if err != nil {
			continue
		}
		sessions = append(sessions, s)
	}

	writeJSON(w, http.StatusOK, sessions)
}

func (h *Handler) UpdateTerminalSession(w http.ResponseWriter, r *http.Request) {
	member, ok := middleware.MemberFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !h.requireWorkspaceExplore(w, r, member) {
		return
	}

	sessionID := chi.URLParam(r, "sessionId")
	wsID := uuidToString(member.WorkspaceID)

	var req struct {
		Title        *string `json:"title"`
		Bootstrapped *bool   `json:"bootstrapped"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Title != nil {
		_, err := h.DB.Exec(r.Context(),
			`UPDATE terminal_sessions SET title = $1 WHERE id = $2 AND workspace_id = $3`,
			*req.Title, sessionID, wsID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update session")
			return
		}
	}
	if req.Bootstrapped != nil && *req.Bootstrapped {
		_, err := h.DB.Exec(r.Context(),
			`UPDATE terminal_sessions SET bootstrapped = true WHERE id = $1 AND workspace_id = $2`,
			sessionID, wsID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update session")
			return
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) CloseTerminalSession(w http.ResponseWriter, r *http.Request) {
	member, ok := middleware.MemberFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !h.requireWorkspaceExplore(w, r, member) {
		return
	}

	sessionID := chi.URLParam(r, "sessionId")
	wsID := uuidToString(member.WorkspaceID)

	var runtimeID string
	err := h.DB.QueryRow(r.Context(),
		`SELECT runtime_id FROM terminal_sessions WHERE id = $1 AND workspace_id = $2`,
		sessionID, wsID,
	).Scan(&runtimeID)
	if err != nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	h.closeTerminalSessionRecord(r.Context(), sessionID, runtimeID, "user_closed")
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) closeTerminalSessionRecord(ctx context.Context, sessionID, runtimeID, reason string) {
	_, _ = h.DB.Exec(ctx,
		`UPDATE terminal_sessions SET status = 'closed', closed_at = now() WHERE id = $1`,
		sessionID,
	)
	if h.DaemonHub != nil && runtimeID != "" {
		payload, _ := json.Marshal(protocol.TerminalClosePayload{
			SessionID: sessionID,
			Reason:    reason,
		})
		h.DaemonHub.SendToRuntime(runtimeID, protocol.Message{
			Type:    protocol.EventTerminalClose,
			Payload: payload,
		})
	}
}

// HandleTerminalLifecycleEvent updates persisted session state for attach/detach/close.
func (h *Handler) HandleTerminalLifecycleEvent(ctx context.Context, msgType, sessionID string) {
	if sessionID == "" {
		return
	}
	switch msgType {
	case protocol.EventTerminalAttach:
		_, _ = h.DB.Exec(ctx,
			`UPDATE terminal_sessions SET status = 'active', last_attached_at = now()
			 WHERE id = $1 AND status != 'closed'`,
			sessionID,
		)
	case protocol.EventTerminalDetach:
		_, _ = h.DB.Exec(ctx,
			`UPDATE terminal_sessions SET status = 'detached', last_attached_at = now()
			 WHERE id = $1 AND status != 'closed'`,
			sessionID,
		)
	case protocol.EventTerminalClose:
		_, _ = h.DB.Exec(ctx,
			`UPDATE terminal_sessions SET status = 'closed', closed_at = now() WHERE id = $1`,
			sessionID,
		)
	}
}

// CloseIdleTerminalSessions marks long-detached sessions closed in the database.
func (h *Handler) CloseIdleTerminalSessions(ctx context.Context, idleSince time.Time) {
	rows, err := h.DB.Query(ctx,
		`SELECT id, runtime_id::text FROM terminal_sessions
		 WHERE status = 'detached' AND last_attached_at < $1`,
		idleSince,
	)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var sessionID, runtimeID string
		if err := rows.Scan(&sessionID, &runtimeID); err != nil {
			continue
		}
		h.closeTerminalSessionRecord(ctx, sessionID, runtimeID, "idle_timeout")
	}
}
