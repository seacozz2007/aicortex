package handler

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/aicortex/aicortex/server/internal/design"
	"github.com/aicortex/aicortex/server/internal/middleware"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

type designSettingsResponse struct {
	DefaultDesignAgentID string `json:"default_design_agent_id,omitempty"`
}

type updateDesignSettingsRequest struct {
	DefaultDesignAgentID string `json:"default_design_agent_id"`
}

// GetDesignSettings returns workspace-level Design Studio configuration.
func (h *Handler) GetDesignSettings(w http.ResponseWriter, r *http.Request) {
	if !h.requireDesignStudio(w) {
		return
	}
	workspaceID := ctxWorkspaceID(r.Context())
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}

	agentID, err := h.Queries.GetWorkspaceDefaultDesignAgent(r.Context(), wsUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load design settings")
		return
	}

	resp := designSettingsResponse{}
	if agentID.Valid {
		resp.DefaultDesignAgentID = uuidToString(agentID)
	}
	writeJSON(w, http.StatusOK, resp)
}

// UpdateDesignSettings sets the workspace default Design Agent.
func (h *Handler) UpdateDesignSettings(w http.ResponseWriter, r *http.Request) {
	if !h.requireDesignStudio(w) {
		return
	}
	member, ok := middleware.MemberFromContext(r.Context())
	if !ok || !roleAllowed(member.Role, "owner", "admin") {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}

	workspaceID := ctxWorkspaceID(r.Context())
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}

	var req updateDesignSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var agentUUID pgtype.UUID
	if req.DefaultDesignAgentID != "" {
		parsed, valid := parseUUIDOrBadRequest(w, req.DefaultDesignAgentID, "default_design_agent_id")
		if !valid {
			return
		}
		agent, err := h.Queries.GetAgentInWorkspace(r.Context(), db.GetAgentInWorkspaceParams{
			ID:          parsed,
			WorkspaceID: wsUUID,
		})
		if err != nil {
			writeError(w, http.StatusBadRequest, "agent not found in workspace")
			return
		}
		if agent.ArchivedAt.Valid {
			writeError(w, http.StatusBadRequest, "agent is archived")
			return
		}
		agentUUID = parsed
	}

	if err := h.Queries.SetWorkspaceDefaultDesignAgent(r.Context(), db.SetWorkspaceDefaultDesignAgentParams{
		ID:                   wsUUID,
		DefaultDesignAgentID: agentUUID,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update design settings")
		return
	}

	writeJSON(w, http.StatusOK, designSettingsResponse{
		DefaultDesignAgentID: req.DefaultDesignAgentID,
	})
}

// ListDesignTemplates returns the built-in template catalog.
func (h *Handler) ListDesignTemplates(w http.ResponseWriter, r *http.Request) {
	if !h.requireDesignStudio(w) {
		return
	}
	writeJSON(w, http.StatusOK, design.TemplateCatalog())
}
