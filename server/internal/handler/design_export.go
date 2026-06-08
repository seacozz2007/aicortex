package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/aicortex/aicortex/server/internal/design"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

type exportDesignSessionRequest struct {
	Format string `json:"format"`
}

// ExportDesignSession returns export metadata for a design session artifact.
func (h *Handler) ExportDesignSession(w http.ResponseWriter, r *http.Request) {
	if !h.requireDesignStudio(w) {
		return
	}
	if !design.FeatureDesignExport() {
		writeError(w, http.StatusNotFound, "export not enabled")
		return
	}

	workspaceID := ctxWorkspaceID(r.Context())
	project, ok := h.loadProjectForResource(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var req exportDesignSessionRequest
	if r.Body != nil && r.ContentLength > 0 {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	format := strings.TrimSpace(req.Format)
	if format == "" {
		format = "html"
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

	resp := h.buildChatSessionResponse(r.Context(), session, false)
	entry := session.ArtifactEntry
	if entry == "" {
		entry = "index.html"
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"format":         format,
		"artifact_entry": entry,
		"session":        resp,
		"download_hint":  "Use task artifact API to download files from work_dir",
	})
}

type startDesignJuryRequest struct {
	Rounds int `json:"rounds"`
}

// StartDesignJury kicks off a multi-agent design review when the jury flag is on.
func (h *Handler) StartDesignJury(w http.ResponseWriter, r *http.Request) {
	if !h.requireDesignStudio(w) {
		return
	}
	if !design.FeatureDesignJury() {
		writeError(w, http.StatusNotFound, "design jury not enabled")
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

	writeJSON(w, http.StatusAccepted, map[string]any{
		"status":     "queued",
		"session_id": uuidToString(session.ID),
		"rounds":     rounds,
		"message":    "Design jury orchestrator will run in a future daemon pass",
	})
}
