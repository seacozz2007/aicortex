package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/aicortex/aicortex/server/internal/design"
	"github.com/aicortex/aicortex/server/pkg/protocol"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

type exportDesignSessionRequest struct {
	Format string `json:"format"`
}

// ExportDesignSession returns export metadata and download URLs for a design session artifact.
func (h *Handler) ExportDesignSession(w http.ResponseWriter, r *http.Request) {
	if !h.requireDesignStudio(w) {
		return
	}
	if !design.FeatureDesignExport() {
		writeError(w, http.StatusNotFound, "export not enabled")
		return
	}

	projectID := chi.URLParam(r, "id")
	sessionID := chi.URLParam(r, "sessionId")

	var req exportDesignSessionRequest
	if r.Body != nil && r.ContentLength > 0 {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	format := strings.TrimSpace(req.Format)
	if format == "" {
		format = "html"
	}

	session, task, entry, ok := h.loadDesignExportContext(w, r)
	if !ok {
		return
	}

	resp := h.buildChatSessionResponse(r.Context(), session, false)
	base := fmt.Sprintf("/api/projects/%s/design/sessions/%s/export", projectID, sessionID)
	wsSlug := strings.TrimSpace(r.URL.Query().Get("workspace_slug"))
	suffix := ""
	if wsSlug != "" {
		suffix = "?workspace_slug=" + wsSlug
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"format":          format,
		"artifact_entry":  entry,
		"session":         resp,
		"task_id":         uuidToString(task.ID),
		"download_url":    base + "/" + format + suffix,
		"download_urls": map[string]string{
			"html": base + "/html" + suffix,
			"zip":  base + "/zip" + suffix,
			"pdf":  base + "/pdf" + suffix,
			"pptx": base + "/pptx" + suffix,
		},
		"download_hint": "Use download_url for the requested format",
	})
}

type startDesignJuryRequest struct {
	Rounds int `json:"rounds"`
}

// StartDesignJury kicks off multi-round design critique via the design agent.
func (h *Handler) StartDesignJury(w http.ResponseWriter, r *http.Request) {
	if !h.requireDesignStudio(w) {
		return
	}
	if !design.FeatureDesignJury() {
		writeError(w, http.StatusNotFound, "design jury not enabled")
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
	if err != nil || session.SessionKind != "design" || session.ProjectID != project.ID {
		writeError(w, http.StatusNotFound, "design session not found")
		return
	}

	var req startDesignJuryRequest
	if r.Body != nil && r.ContentLength > 0 {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	rounds := req.Rounds
	if rounds <= 0 {
		rounds = 3
	}
	if rounds > 5 {
		rounds = 5
	}

	taskIDs := make([]string, 0, 1)
	prompt := fmt.Sprintf(
		"[Design Jury — %d rounds]\n\nRun a structured design review of the current artifact in the work directory. For each of %d rounds, output a section `## Jury Round N` covering visual hierarchy, clarity, accessibility, and brief alignment. End each round with 3 concrete improvements. Do not rewrite files unless a critical defect blocks review.",
		rounds, rounds,
	)
	taskID, err := h.enqueueDesignSessionMessage(r, userID, workspaceID, session, prompt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	taskIDs = append(taskIDs, taskID)

	writeJSON(w, http.StatusAccepted, map[string]any{
		"status":     "queued",
		"session_id": uuidToString(session.ID),
		"rounds":     rounds,
		"task_ids":   taskIDs,
		"message":    "Design jury critique rounds queued",
	})
}

func (h *Handler) enqueueDesignSessionMessage(r *http.Request, userID, workspaceID string, session db.ChatSession, content string) (string, error) {
	if session.Status != "active" {
		return "", fmt.Errorf("design session is archived")
	}
	agent, err := h.Queries.GetAgent(r.Context(), session.AgentID)
	if err != nil {
		return "", fmt.Errorf("agent not found")
	}
	if agent.ArchivedAt.Valid {
		return "", fmt.Errorf("agent is archived")
	}

	msg, err := h.Queries.CreateChatMessage(r.Context(), db.CreateChatMessageParams{
		ChatSessionID: session.ID,
		Role:          "user",
		Content:       content,
	})
	if err != nil {
		return "", fmt.Errorf("failed to create jury message")
	}

	task, err := h.TaskService.EnqueueChatTask(r.Context(), session)
	if err != nil {
		return "", fmt.Errorf("failed to enqueue jury task: %w", err)
	}

	_ = h.Queries.TouchChatSession(r.Context(), session.ID)

	resolvedSessionID := uuidToString(session.ID)
	h.publishChat(protocol.EventChatMessage, workspaceID, "member", userID, resolvedSessionID, protocol.ChatMessagePayload{
		ChatSessionID: resolvedSessionID,
		MessageID:     uuidToString(msg.ID),
		Role:          "user",
		Content:       content,
	})

	return uuidToString(task.ID), nil
}

// ListDesignPlugins returns the curated non-media plugin registry.
func (h *Handler) ListDesignPlugins(w http.ResponseWriter, r *http.Request) {
	if !h.requireDesignStudio(w) {
		return
	}
	writeJSON(w, http.StatusOK, design.PluginCatalog())
}
