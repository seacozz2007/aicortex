package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/aicortex/aicortex/server/internal/middleware"
	"github.com/aicortex/aicortex/server/pkg/protocol"
)

type terminalSessionResponse struct {
	ID             string  `json:"id"`
	WorkspaceID    string  `json:"workspace_id"`
	RuntimeID      string  `json:"runtime_id"`
	UserID         string  `json:"user_id"`
	Title          string  `json:"title"`
	Status         string  `json:"status"`
	Shell          string  `json:"shell"`
	Cols           int     `json:"cols"`
	Rows           int     `json:"rows"`
	CreatedAt      string  `json:"created_at"`
	ClosedAt       *string `json:"closed_at,omitempty"`
	LastAttachedAt string  `json:"last_attached_at"`
}

func (h *Handler) CreateTerminalSession(w http.ResponseWriter, r *http.Request) {
	member, ok := middleware.MemberFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		RuntimeID string `json:"runtime_id"`
		Title     string `json:"title"`
		Shell     string `json:"shell"`
		Cols      int    `json:"cols"`
		Rows      int    `json:"rows"`
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

	sessionID := uuid.New().String()
	wsID := uuidToString(member.WorkspaceID)

	// Insert into DB
	_, err := h.DB.Exec(r.Context(),
		`INSERT INTO terminal_sessions (id, workspace_id, runtime_id, user_id, title, shell, cols, rows)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		sessionID, wsID, req.RuntimeID, uuidToString(member.UserID), req.Title, req.Shell, req.Cols, req.Rows,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	// Send terminal:open to daemon via daemonws hub
	if h.DaemonHub != nil {
		payload, _ := json.Marshal(protocol.TerminalOpenPayload{
			SessionID: sessionID,
			RuntimeID: req.RuntimeID,
			Title:     req.Title,
			Cols:      req.Cols,
			Rows:      req.Rows,
			Shell:     req.Shell,
		})
		h.DaemonHub.SendToRuntime(req.RuntimeID, protocol.Message{
			Type:    protocol.EventTerminalOpen,
			Payload: payload,
		})
	}

	writeJSON(w, http.StatusCreated, terminalSessionResponse{
		ID:             sessionID,
		WorkspaceID:    wsID,
		RuntimeID:      req.RuntimeID,
		UserID:         uuidToString(member.UserID),
		Title:          req.Title,
		Status:         "active",
		Shell:          req.Shell,
		Cols:           req.Cols,
		Rows:           req.Rows,
		CreatedAt:      time.Now().UTC().Format(time.RFC3339),
		LastAttachedAt: time.Now().UTC().Format(time.RFC3339),
	})
}

func (h *Handler) ListTerminalSessions(w http.ResponseWriter, r *http.Request) {
	member, ok := middleware.MemberFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	wsID := uuidToString(member.WorkspaceID)
	rows, err := h.DB.Query(r.Context(),
		`SELECT id, workspace_id, runtime_id, user_id, title, status, shell, cols, rows, created_at, closed_at, last_attached_at
		 FROM terminal_sessions
		 WHERE workspace_id = $1 AND user_id = $2
		 ORDER BY created_at DESC
		 LIMIT 50`, wsID, uuidToString(member.UserID),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list sessions")
		return
	}
	defer rows.Close()

	sessions := []terminalSessionResponse{}
	for rows.Next() {
		var s terminalSessionResponse
		var wsUUID, rtUUID, userUUID pgtype.UUID
		var createdAt, lastAttached time.Time
		var closedAt *time.Time
		if err := rows.Scan(&s.ID, &wsUUID, &rtUUID, &userUUID, &s.Title, &s.Status, &s.Shell, &s.Cols, &s.Rows, &createdAt, &closedAt, &lastAttached); err != nil {
			continue
		}
		s.WorkspaceID = uuidToString(wsUUID)
		s.RuntimeID = uuidToString(rtUUID)
		s.UserID = uuidToString(userUUID)
		s.CreatedAt = createdAt.Format(time.RFC3339)
		s.LastAttachedAt = lastAttached.Format(time.RFC3339)
		if closedAt != nil {
			t := closedAt.Format(time.RFC3339)
			s.ClosedAt = &t
		}
		sessions = append(sessions, s)
	}

	writeJSON(w, http.StatusOK, sessions)
}

func (h *Handler) CloseTerminalSession(w http.ResponseWriter, r *http.Request) {
	member, ok := middleware.MemberFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	sessionID := chi.URLParam(r, "sessionId")
	wsID := uuidToString(member.WorkspaceID)

	// Get session to find runtime_id
	var runtimeID string
	err := h.DB.QueryRow(r.Context(),
		`SELECT runtime_id FROM terminal_sessions WHERE id = $1 AND workspace_id = $2`,
		sessionID, wsID,
	).Scan(&runtimeID)
	if err != nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	// Update DB
	_, _ = h.DB.Exec(r.Context(),
		`UPDATE terminal_sessions SET status = 'closed', closed_at = now() WHERE id = $1`,
		sessionID,
	)

	// Send close to daemon
	if h.DaemonHub != nil {
		payload, _ := json.Marshal(protocol.TerminalClosePayload{
			SessionID: sessionID,
			Reason:    "user_closed",
		})
		h.DaemonHub.SendToRuntime(runtimeID, protocol.Message{
			Type:    protocol.EventTerminalClose,
			Payload: payload,
		})
	}

	w.WriteHeader(http.StatusNoContent)
}
