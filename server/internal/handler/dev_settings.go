package handler

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/aicortex/aicortex/server/internal/middleware"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

type devSettingsResponse struct {
	DefaultDevAgentID string `json:"default_dev_agent_id,omitempty"`
}

type updateDevSettingsRequest struct {
	DefaultDevAgentID string `json:"default_dev_agent_id"`
}

func (h *Handler) GetDevSettings(w http.ResponseWriter, r *http.Request) {
	workspaceID := ctxWorkspaceID(r.Context())
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}

	agentID, err := h.Queries.GetWorkspaceDefaultDevAgent(r.Context(), wsUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load dev settings")
		return
	}

	resp := devSettingsResponse{}
	if agentID.Valid {
		resp.DefaultDevAgentID = uuidToString(agentID)
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) UpdateDevSettings(w http.ResponseWriter, r *http.Request) {
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

	var req updateDevSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var agentUUID pgtype.UUID
	if req.DefaultDevAgentID != "" {
		parsed, valid := parseUUIDOrBadRequest(w, req.DefaultDevAgentID, "default_dev_agent_id")
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

	if err := h.Queries.SetWorkspaceDefaultDevAgent(r.Context(), db.SetWorkspaceDefaultDevAgentParams{
		ID:                wsUUID,
		DefaultDevAgentID: agentUUID,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update dev settings")
		return
	}

	writeJSON(w, http.StatusOK, devSettingsResponse{
		DefaultDevAgentID: req.DefaultDevAgentID,
	})
}
