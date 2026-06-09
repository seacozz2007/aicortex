package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/aicortex/aicortex/server/internal/design"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

type DesignSessionResponse struct {
	ID                     string `json:"id"`
	WorkspaceID            string `json:"workspace_id"`
	ProjectID              string `json:"project_id"`
	AgentID                string `json:"agent_id"`
	CreatorID              string `json:"creator_id"`
	Title                  string `json:"title"`
	Status                 string `json:"status"`
	SessionKind            string `json:"session_kind"`
	DesignMode             string `json:"design_mode,omitempty"`
	DesignSkillID          string `json:"design_skill_id,omitempty"`
	DesignSystemResourceID string `json:"design_system_resource_id,omitempty"`
	ArtifactEntry          string `json:"artifact_entry"`
	HasUnread              bool   `json:"has_unread"`
	CreatedAt              string `json:"created_at"`
	UpdatedAt              string `json:"updated_at"`
	WorkDir                string `json:"work_dir,omitempty"`
	RuntimeID              string `json:"runtime_id,omitempty"`
	LastTaskID             string `json:"last_task_id,omitempty"`
}

type CreateDesignSessionRequest struct {
	Title                  string `json:"title"`
	DesignMode             string `json:"design_mode"`
	DesignSkillID          string `json:"design_skill_id"`
	DesignExampleID        string `json:"design_example_id"`
	DesignSystemResourceID string `json:"design_system_resource_id"`
	ArtifactEntry          string `json:"artifact_entry"`
	Brief                  string `json:"brief"`
	ContinueFromTaskID     string `json:"continue_from_task_id"`
}

var allowedDesignModes = map[string]struct{}{
	"prototype":     {},
	"deck":          {},
	"template":      {},
	"design_system": {},
	"hyperframes":   {},
}

func (h *Handler) requireDesignStudio(w http.ResponseWriter) bool {
	if !design.FeatureDesignStudio() {
		writeError(w, http.StatusNotFound, "not found")
		return false
	}
	return true
}

func designSessionFromListRow(row db.ListDesignChatSessionsByProjectRow) DesignSessionResponse {
	return designSessionFromRow(db.ChatSession{
		ID:                     row.ID,
		WorkspaceID:            row.WorkspaceID,
		AgentID:                row.AgentID,
		CreatorID:              row.CreatorID,
		Title:                  row.Title,
		SessionID:              row.SessionID,
		WorkDir:                row.WorkDir,
		Status:                 row.Status,
		CreatedAt:              row.CreatedAt,
		UpdatedAt:              row.UpdatedAt,
		UnreadSince:            row.UnreadSince,
		RuntimeID:              row.RuntimeID,
		ProjectID:              row.ProjectID,
		SessionKind:            row.SessionKind,
		DesignMode:             row.DesignMode,
		DesignSkillID:          row.DesignSkillID,
		DesignSystemResourceID: row.DesignSystemResourceID,
		ArtifactEntry:          row.ArtifactEntry,
	}, row.HasUnread)
}

func designSessionFromRow(s db.ChatSession, hasUnread bool) DesignSessionResponse {
	resp := DesignSessionResponse{
		ID:            uuidToString(s.ID),
		WorkspaceID:   uuidToString(s.WorkspaceID),
		ProjectID:     uuidToString(s.ProjectID),
		AgentID:       uuidToString(s.AgentID),
		CreatorID:     uuidToString(s.CreatorID),
		Title:         s.Title,
		Status:        s.Status,
		SessionKind:   s.SessionKind,
		ArtifactEntry: s.ArtifactEntry,
		HasUnread:     hasUnread,
		CreatedAt:     timestampToString(s.CreatedAt),
		UpdatedAt:     timestampToString(s.UpdatedAt),
	}
	if s.DesignMode.Valid {
		resp.DesignMode = s.DesignMode.String
	}
	if s.DesignSkillID.Valid {
		resp.DesignSkillID = uuidToString(s.DesignSkillID)
	}
	if s.DesignSystemResourceID.Valid {
		resp.DesignSystemResourceID = uuidToString(s.DesignSystemResourceID)
	}
	if s.WorkDir.Valid && strings.TrimSpace(s.WorkDir.String) != "" {
		resp.WorkDir = s.WorkDir.String
	}
	if s.RuntimeID.Valid {
		resp.RuntimeID = uuidToString(s.RuntimeID)
	}
	return resp
}

func (h *Handler) enrichDesignSession(ctx context.Context, resp DesignSessionResponse, sessionID pgtype.UUID) DesignSessionResponse {
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

func (h *Handler) resolveDesignAgentID(ctx context.Context, workspaceID pgtype.UUID) (pgtype.UUID, error) {
	row, err := h.Queries.GetWorkspaceDefaultDesignAgent(ctx, workspaceID)
	if err != nil {
		return pgtype.UUID{}, err
	}
	if row.Valid {
		return row, nil
	}
	// Fallback: first non-archived agent in workspace.
	agents, err := h.Queries.ListAgents(ctx, workspaceID)
	if err != nil {
		return pgtype.UUID{}, err
	}
	for _, a := range agents {
		if !a.ArchivedAt.Valid {
			return a.ID, nil
		}
	}
	return pgtype.UUID{}, errors.New("no design agent configured")
}

func (h *Handler) ListDesignSessions(w http.ResponseWriter, r *http.Request) {
	if !h.requireDesignStudio(w) {
		return
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	workspaceID := ctxWorkspaceID(r.Context())
	project, ok := h.loadProjectForResource(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	_ = userID

	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}

	rows, err := h.Queries.ListDesignChatSessionsByProject(r.Context(), db.ListDesignChatSessionsByProjectParams{
		WorkspaceID: wsUUID,
		ProjectID:   project.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list design sessions")
		return
	}

	resp := make([]DesignSessionResponse, 0, len(rows))
	for _, row := range rows {
		s := designSessionFromListRow(row)
		s = h.enrichDesignSession(r.Context(), s, row.ID)
		resp = append(resp, s)
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) GetDesignSession(w http.ResponseWriter, r *http.Request) {
	if !h.requireDesignStudio(w) {
		return
	}
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
		writeError(w, http.StatusNotFound, "design session not found")
		return
	}
	if session.SessionKind != "design" || session.ProjectID != project.ID {
		writeError(w, http.StatusNotFound, "design session not found")
		return
	}

	resp := designSessionFromRow(session, session.UnreadSince.Valid)
	resp = h.enrichDesignSession(r.Context(), resp, session.ID)
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) CreateDesignSession(w http.ResponseWriter, r *http.Request) {
	if !h.requireDesignStudio(w) {
		return
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	workspaceID := ctxWorkspaceID(r.Context())
	project, ok := h.loadProjectForResource(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var req CreateDesignSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	mode := strings.TrimSpace(req.DesignMode)
	if mode == "" {
		mode = "prototype"
	}
	if _, ok := allowedDesignModes[mode]; !ok {
		writeError(w, http.StatusBadRequest, "invalid design_mode")
		return
	}

	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}

	agentID, err := h.resolveDesignAgentID(r.Context(), wsUUID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "no design agent configured for this workspace")
		return
	}

	agent, err := h.Queries.GetAgentInWorkspace(r.Context(), db.GetAgentInWorkspaceParams{
		ID:          agentID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "design agent not found")
		return
	}
	if agent.ArchivedAt.Valid {
		writeError(w, http.StatusBadRequest, "design agent is archived")
		return
	}

	if err := design.EnsureAgentQuestionFormSkill(r.Context(), h.Queries, wsUUID, agentID); err != nil {
		slog.Warn("ensure interactive forms skill on design agent", "agent_id", uuidToString(agentID), "error", err)
	}

	var designSkillID pgtype.UUID
	if exampleID := strings.TrimSpace(req.DesignExampleID); exampleID != "" {
		skillID, _, err := design.EnsureExampleSkill(r.Context(), h.Queries, wsUUID, agentID, parseUUID(userID), exampleID)
		if err != nil {
			slog.Warn("ensure example skill for design session", "example_id", exampleID, "error", err)
			writeError(w, http.StatusBadRequest, "design example not available: "+exampleID)
			return
		}
		designSkillID = skillID
	} else if req.DesignSkillID != "" {
		var ok bool
		designSkillID, ok = parseUUIDOrBadRequest(w, req.DesignSkillID, "design_skill_id")
		if !ok {
			return
		}
	}

	var designSystemResourceID pgtype.UUID
	if req.DesignSystemResourceID != "" {
		var ok bool
		designSystemResourceID, ok = parseUUIDOrBadRequest(w, req.DesignSystemResourceID, "design_system_resource_id")
		if !ok {
			return
		}
		if _, err := h.Queries.GetDesignSystemResourceInProject(r.Context(), db.GetDesignSystemResourceInProjectParams{
			ID:          designSystemResourceID,
			ProjectID:   project.ID,
			WorkspaceID: wsUUID,
		}); err != nil {
			writeError(w, http.StatusBadRequest, "design_system resource not found in project")
			return
		}
	}

	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = "New design"
	}

	artifactEntry := strings.TrimSpace(req.ArtifactEntry)
	if artifactEntry == "" {
		artifactEntry = "index.html"
	}

	session, err := h.Queries.CreateDesignChatSession(r.Context(), db.CreateDesignChatSessionParams{
		WorkspaceID:            wsUUID,
		AgentID:                agentID,
		CreatorID:              parseUUID(userID),
		Title:                  title,
		ProjectID:              project.ID,
		DesignMode:             pgtype.Text{String: mode, Valid: true},
		DesignSkillID:          designSkillID,
		DesignSystemResourceID: designSystemResourceID,
		ArtifactEntry:          artifactEntry,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create design session")
		return
	}

	if req.ContinueFromTaskID != "" {
		if err := h.seedDesignSessionFromTask(r.Context(), session.ID, project.ID, req.ContinueFromTaskID); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		session, err = h.Queries.GetChatSessionInWorkspace(r.Context(), db.GetChatSessionInWorkspaceParams{
			ID:          session.ID,
			WorkspaceID: wsUUID,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to reload design session")
			return
		}
	}

	resp := designSessionFromRow(session, false)
	resp = h.enrichDesignSession(r.Context(), resp, session.ID)
	writeJSON(w, http.StatusCreated, resp)
}

func (h *Handler) ListDesignSystemResources(w http.ResponseWriter, r *http.Request) {
	if !h.requireDesignStudio(w) {
		return
	}
	workspaceID := ctxWorkspaceID(r.Context())
	project, ok := h.loadProjectForResource(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}

	rows, err := h.Queries.ListDesignSystemResourcesByProject(r.Context(), db.ListDesignSystemResourcesByProjectParams{
		ProjectID:   project.ID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list design system resources")
		return
	}

	resp := make([]ProjectResourceResponse, 0, len(rows))
	for _, row := range rows {
		resp = append(resp, projectResourceToResponse(row))
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) seedDesignSessionFromTask(ctx context.Context, sessionID, projectID pgtype.UUID, taskID string) error {
	taskUUID, err := parseUUIDLoose(strings.TrimSpace(taskID))
	if err != nil {
		return errors.New("invalid continue_from_task_id")
	}
	task, err := h.Queries.GetAgentTask(ctx, taskUUID)
	if err != nil {
		return errors.New("source task not found")
	}
	if !task.WorkDir.Valid || strings.TrimSpace(task.WorkDir.String) == "" {
		return errors.New("source task has no work directory")
	}
	if task.IssueID.Valid {
		issue, err := h.Queries.GetIssue(ctx, task.IssueID)
		if err != nil || issue.ProjectID != projectID {
			return errors.New("source task is not in this project")
		}
	}
	return h.Queries.UpdateChatSessionSession(ctx, db.UpdateChatSessionSessionParams{
		ID:        sessionID,
		WorkDir:   task.WorkDir,
		RuntimeID: task.RuntimeID,
	})
}
