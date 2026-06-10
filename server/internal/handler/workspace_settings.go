package handler

import (
	"context"
	"encoding/json"
	"net/http"

	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

func workspaceExploreEnabled(settings []byte) bool {
	if len(settings) == 0 {
		return false
	}
	var s map[string]any
	if err := json.Unmarshal(settings, &s); err != nil {
		return false
	}
	enabled, ok := s["explore_enabled"].(bool)
	return ok && enabled
}

func (h *Handler) workspaceExploreEnabledForMember(ctx context.Context, member db.Member) bool {
	ws, err := h.Queries.GetWorkspace(ctx, member.WorkspaceID)
	if err != nil {
		return false
	}
	return workspaceExploreEnabled(ws.Settings)
}

func (h *Handler) requireWorkspaceExplore(w http.ResponseWriter, r *http.Request, member db.Member) bool {
	if !h.workspaceExploreEnabledForMember(r.Context(), member) {
		writeError(w, http.StatusNotFound, "not found")
		return false
	}
	return true
}
