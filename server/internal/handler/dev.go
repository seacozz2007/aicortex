package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

type DevSessionResponse struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspace_id"`
	ProjectID   string `json:"project_id"`
	AgentID     string `json:"agent_id"`
	CreatorID   string `json:"creator_id"`
	Title       string `json:"title"`
	Status      string `json:"status"`
	SessionKind string `json:"session_kind"`
	HasUnread   bool   `json:"has_unread"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
	WorkDir     string `json:"work_dir,omitempty"`
	RuntimeID   string `json:"runtime_id,omitempty"`
	LastTaskID  string `json:"last_task_id,omitempty"`
}

type CreateDevSessionRequest struct {
	Title   string `json:"title"`
	Brief   string `json:"brief"`
	AgentID string `json:"agent_id,omitempty"`
}

func devSessionFromListRow(row db.ListDevChatSessionsByProjectRow) DevSessionResponse {
	return devSessionFromRow(db.ChatSession{
		ID:          row.ID,
		WorkspaceID: row.WorkspaceID,
		AgentID:     row.AgentID,
		CreatorID:   row.CreatorID,
		Title:       row.Title,
		SessionID:   row.SessionID,
		WorkDir:     row.WorkDir,
		Status:      row.Status,
		CreatedAt:   row.CreatedAt,
		UpdatedAt:   row.UpdatedAt,
		UnreadSince: row.UnreadSince,
		RuntimeID:   row.RuntimeID,
		ProjectID:   row.ProjectID,
		SessionKind: row.SessionKind,
	}, row.HasUnread)
}

func devSessionFromCreatorListRow(row db.ListDevChatSessionsByCreatorRow) DevSessionResponse {
	return devSessionFromRow(db.ChatSession{
		ID:          row.ID,
		WorkspaceID: row.WorkspaceID,
		AgentID:     row.AgentID,
		CreatorID:   row.CreatorID,
		Title:       row.Title,
		SessionID:   row.SessionID,
		WorkDir:     row.WorkDir,
		Status:      row.Status,
		CreatedAt:   row.CreatedAt,
		UpdatedAt:   row.UpdatedAt,
		UnreadSince: row.UnreadSince,
		RuntimeID:   row.RuntimeID,
		ProjectID:   row.ProjectID,
		SessionKind: row.SessionKind,
	}, row.HasUnread)
}

func devSessionFromRow(s db.ChatSession, hasUnread bool) DevSessionResponse {
	resp := DevSessionResponse{
		ID:          uuidToString(s.ID),
		WorkspaceID: uuidToString(s.WorkspaceID),
		ProjectID:   uuidToString(s.ProjectID),
		AgentID:     uuidToString(s.AgentID),
		CreatorID:   uuidToString(s.CreatorID),
		Title:       s.Title,
		Status:      s.Status,
		SessionKind: s.SessionKind,
		HasUnread:   hasUnread,
		CreatedAt:   timestampToString(s.CreatedAt),
		UpdatedAt:   timestampToString(s.UpdatedAt),
	}
	if s.WorkDir.Valid && strings.TrimSpace(s.WorkDir.String) != "" {
		resp.WorkDir = s.WorkDir.String
	}
	if s.RuntimeID.Valid {
		resp.RuntimeID = uuidToString(s.RuntimeID)
	}
	return resp
}

func (h *Handler) enrichDevSession(ctx context.Context, resp DevSessionResponse, sessionID pgtype.UUID) DevSessionResponse {
	if h.DB == nil {
		return resp
	}
	var taskID pgtype.UUID
	var workDir pgtype.Text
	err := h.DB.QueryRow(ctx,
		`SELECT id, work_dir FROM agent_task_queue
		 WHERE chat_session_id = $1
		   AND work_dir IS NOT NULL AND btrim(work_dir) <> ''
		 ORDER BY COALESCE(completed_at, started_at, dispatched_at, created_at) DESC, created_at DESC
		 LIMIT 1`,
		sessionID,
	).Scan(&taskID, &workDir)
	if err == nil {
		resp.LastTaskID = uuidToString(taskID)
		if resp.WorkDir == "" && workDir.Valid && strings.TrimSpace(workDir.String) != "" {
			resp.WorkDir = strings.TrimSpace(workDir.String)
		}
	}
	return resp
}

func (h *Handler) resolveDevAgentID(ctx context.Context, workspaceID pgtype.UUID) (pgtype.UUID, error) {
	row, err := h.Queries.GetWorkspaceDefaultDevAgent(ctx, workspaceID)
	if err != nil {
		return pgtype.UUID{}, err
	}
	if row.Valid {
		return row, nil
	}
	agents, err := h.Queries.ListAgents(ctx, workspaceID)
	if err != nil {
		return pgtype.UUID{}, err
	}
	for _, a := range agents {
		if !a.ArchivedAt.Valid {
			return a.ID, nil
		}
	}
	return pgtype.UUID{}, errors.New("no dev agent configured")
}

func (h *Handler) ListDevSessions(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	workspaceID := ctxWorkspaceID(r.Context())
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}

	rows, err := h.Queries.ListDevChatSessionsByCreator(r.Context(), db.ListDevChatSessionsByCreatorParams{
		WorkspaceID: wsUUID,
		CreatorID:   parseUUID(userID),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list dev sessions")
		return
	}

	resp := make([]DevSessionResponse, 0, len(rows))
	for _, row := range rows {
		s := devSessionFromCreatorListRow(row)
		s = h.enrichDevSession(r.Context(), s, row.ID)
		resp = append(resp, s)
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) ListProjectDevSessions(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	_ = userID
	workspaceID := ctxWorkspaceID(r.Context())
	project, ok := h.loadProjectForResource(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}

	rows, err := h.Queries.ListDevChatSessionsByProject(r.Context(), db.ListDevChatSessionsByProjectParams{
		WorkspaceID: wsUUID,
		ProjectID:   project.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list dev sessions")
		return
	}

	resp := make([]DevSessionResponse, 0, len(rows))
	for _, row := range rows {
		s := devSessionFromListRow(row)
		s = h.enrichDevSession(r.Context(), s, row.ID)
		resp = append(resp, s)
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) GetDevSession(w http.ResponseWriter, r *http.Request) {
	workspaceID := ctxWorkspaceID(r.Context())
	project, ok := h.loadProjectForResource(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	sessionUUID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "sessionId"), "session id")
	if !ok {
		return
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}

	session, err := h.Queries.GetChatSessionInWorkspace(r.Context(), db.GetChatSessionInWorkspaceParams{
		ID:          sessionUUID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "dev session not found")
		return
	}
	if session.SessionKind != "dev" || session.ProjectID != project.ID {
		writeError(w, http.StatusNotFound, "dev session not found")
		return
	}

	resp := devSessionFromRow(session, session.UnreadSince.Valid)
	resp = h.enrichDevSession(r.Context(), resp, session.ID)
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) CreateDevSession(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	workspaceID := ctxWorkspaceID(r.Context())
	project, ok := h.loadProjectForResource(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var req CreateDevSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}

	var agentID pgtype.UUID
	if strings.TrimSpace(req.AgentID) != "" {
		parsed, valid := parseUUIDOrBadRequest(w, req.AgentID, "agent_id")
		if !valid {
			return
		}
		agentID = parsed
	} else {
		var resolveErr error
		agentID, resolveErr = h.resolveDevAgentID(r.Context(), wsUUID)
		if resolveErr != nil {
			writeError(w, http.StatusBadRequest, "no dev agent configured for this workspace")
			return
		}
	}

	agent, err := h.Queries.GetAgentInWorkspace(r.Context(), db.GetAgentInWorkspaceParams{
		ID:          agentID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "dev agent not found")
		return
	}
	if agent.ArchivedAt.Valid {
		writeError(w, http.StatusBadRequest, "dev agent is archived")
		return
	}

	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = strings.TrimSpace(req.Brief)
	}
	if title == "" {
		title = "New dev session"
	}
	if len(title) > 80 {
		title = title[:80]
	}

	session, err := h.Queries.CreateDevChatSession(r.Context(), db.CreateDevChatSessionParams{
		WorkspaceID: wsUUID,
		AgentID:     agentID,
		CreatorID:   parseUUID(userID),
		Title:       title,
		ProjectID:   project.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create dev session")
		return
	}

	resp := devSessionFromRow(session, false)
	resp = h.enrichDevSession(r.Context(), resp, session.ID)
	writeJSON(w, http.StatusCreated, resp)
}
