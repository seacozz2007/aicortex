package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	art "github.com/aicortex/aicortex/server/internal/artifact"
	"github.com/aicortex/aicortex/server/pkg/protocol"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

type artifactSourceResponse struct {
	TaskID      string `json:"task_id"`
	IssueID     string `json:"issue_id,omitempty"`
	WorkDir     string `json:"work_dir"`
	Label       string `json:"label"`
	CreatedAt   string `json:"created_at"`
	CompletedAt string `json:"completed_at,omitempty"`
}

type artifactListResponse struct {
	Path    string              `json:"path"`
	Entries []art.ListEntry     `json:"entries"`
}

func (h *Handler) artifactBrowseEnabled(w http.ResponseWriter) bool {
	if !art.FeatureArtifactBrowse() {
		writeError(w, http.StatusNotFound, "not found")
		return false
	}
	return true
}

func (h *Handler) artifactServingEnabled(w http.ResponseWriter) bool {
	if !art.FeatureArtifactServing() {
		writeError(w, http.StatusNotFound, "not found")
		return false
	}
	return true
}

func (h *Handler) authorizeTaskArtifactUse(w http.ResponseWriter, r *http.Request, taskID string) (db.AgentTaskQueue, bool) {
	taskUUID, valid := parseUUIDOrBadRequest(w, taskID, "task_id")
	if !valid {
		return db.AgentTaskQueue{}, false
	}
	task, err := h.Queries.GetAgentTask(r.Context(), taskUUID)
	if err != nil {
		writeError(w, http.StatusNotFound, "task not found")
		return db.AgentTaskQueue{}, false
	}
	wsID := h.TaskService.ResolveTaskWorkspaceID(r.Context(), task)
	if wsID == "" {
		writeError(w, http.StatusNotFound, "task not found")
		return db.AgentTaskQueue{}, false
	}
	if _, ok := h.requireWorkspaceMember(w, r, wsID, "task not found"); !ok {
		return db.AgentTaskQueue{}, false
	}
	if !task.WorkDir.Valid || strings.TrimSpace(task.WorkDir.String) == "" {
		writeError(w, http.StatusNotFound, "task has no work directory")
		return db.AgentTaskQueue{}, false
	}
	return task, true
}

// ListRuntimeArtifactSources returns recent tasks on a runtime that have a work_dir.
func (h *Handler) ListRuntimeArtifactSources(w http.ResponseWriter, r *http.Request) {
	if !h.artifactBrowseEnabled(w) {
		return
	}
	runtimeID := chi.URLParam(r, "runtimeId")
	_, rt, ok := h.authorizeRuntimeTunnelUse(w, r, runtimeID)
	if !ok {
		return
	}

	rows, err := h.DB.Query(r.Context(),
		`SELECT id, issue_id, work_dir, created_at, completed_at
		 FROM agent_task_queue
		 WHERE runtime_id = $1
		   AND work_dir IS NOT NULL
		   AND btrim(work_dir) <> ''
		 ORDER BY created_at DESC
		 LIMIT 20`,
		rt.ID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list artifact sources")
		return
	}
	defer rows.Close()

	items := []artifactSourceResponse{}
	for rows.Next() {
		var id, issueID pgtype.UUID
		var workDir string
		var createdAt, completedAt pgtype.Timestamptz
		if err := rows.Scan(&id, &issueID, &workDir, &createdAt, &completedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to read artifact source")
			return
		}
		item := artifactSourceResponse{
			TaskID:    uuidToString(id),
			WorkDir:   workDir,
			Label:     filepath.Base(workDir),
			CreatedAt: timestampToString(createdAt),
		}
		if issueID.Valid {
			item.IssueID = uuidToString(issueID)
		}
		if completedAt.Valid {
			item.CompletedAt = timestampToString(completedAt)
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

// ListTaskArtifacts lists files under a task work directory.
func (h *Handler) ListTaskArtifacts(w http.ResponseWriter, r *http.Request) {
	if !h.artifactBrowseEnabled(w) {
		return
	}
	taskID := chi.URLParam(r, "taskId")
	task, ok := h.authorizeTaskArtifactUse(w, r, taskID)
	if !ok {
		return
	}
	relPath := strings.TrimSpace(r.URL.Query().Get("path"))
	resp, err := h.relayArtifactRequest(r.Context(), task, "list", relPath)
	if err != nil {
		writeError(w, http.StatusGatewayTimeout, err.Error())
		return
	}
	if resp.Error != "" {
		writeError(w, http.StatusBadGateway, resp.Error)
		return
	}
	writeJSON(w, http.StatusOK, artifactListResponse{
		Path:    relPath,
		Entries: resp.Entries,
	})
}

// ServeTaskArtifactRaw returns one file from a task work directory.
func (h *Handler) ServeTaskArtifactRaw(w http.ResponseWriter, r *http.Request) {
	if !h.artifactServingEnabled(w) {
		return
	}
	taskID := chi.URLParam(r, "taskId")
	task, ok := h.authorizeTaskArtifactUse(w, r, taskID)
	if !ok {
		return
	}
	relPath := strings.TrimPrefix(chi.URLParam(r, "*"), "/")
	resp, err := h.relayArtifactRequest(r.Context(), task, "read", relPath)
	if err != nil {
		writeArtifactError(w, http.StatusGatewayTimeout, err.Error())
		return
	}
	if resp.Error != "" {
		writeArtifactError(w, http.StatusBadGateway, resp.Error)
		return
	}
	prepareArtifactEmbedResponse(w)
	if resp.ContentType != "" {
		w.Header().Set("Content-Type", resp.ContentType)
	}
	w.WriteHeader(http.StatusOK)
	if len(resp.Body) > 0 {
		_, _ = w.Write(resp.Body)
	}
}

func prepareArtifactEmbedResponse(w http.ResponseWriter) {
	w.Header().Del("Content-Security-Policy")
}

func writeArtifactError(w http.ResponseWriter, status int, msg string) {
	prepareArtifactEmbedResponse(w)
	writeError(w, status, msg)
}

func (h *Handler) relayArtifactRequest(
	ctx context.Context,
	task db.AgentTaskQueue,
	op, relPath string,
) (art.Response, error) {
	if h.DaemonHub == nil || h.ArtifactPending == nil {
		return art.Response{}, fmt.Errorf("daemon relay unavailable")
	}
	runtimeID := uuidToString(task.RuntimeID)
	if h.DaemonHub.RuntimeConnectionCount(runtimeID) == 0 {
		return art.Response{}, fmt.Errorf("daemon websocket not connected for this runtime")
	}

	requestID := uuid.New().String()
	timeout := time.Duration(art.RequestTimeout) * time.Second
	ch, cancel := h.ArtifactPending.Register(requestID, timeout)
	defer cancel()

	payload := protocol.ArtifactRequestPayload{
		RequestID: requestID,
		Op:        op,
		RootPath:  task.WorkDir.String,
		RelPath:   relPath,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return art.Response{}, fmt.Errorf("failed to encode artifact request")
	}
	h.DaemonHub.SendToRuntime(runtimeID, protocol.Message{
		Type:    protocol.EventArtifactRequest,
		Payload: raw,
	})

	select {
	case resp := <-ch:
		return resp, nil
	case <-time.After(timeout):
		return art.Response{}, fmt.Errorf("daemon did not respond")
	case <-ctx.Done():
		return art.Response{}, ctx.Err()
	}
}

// HandleArtifactResponse completes a pending browse request when the daemon answers.
func (h *Handler) HandleArtifactResponse(msg protocol.Message) {
	if h.ArtifactPending == nil {
		return
	}
	var payload protocol.ArtifactResponsePayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil || payload.RequestID == "" {
		return
	}
	resp := art.Response{ContentType: payload.ContentType, Error: payload.Error}
	for _, entry := range payload.Entries {
		resp.Entries = append(resp.Entries, art.ListEntry{
			Name:  entry.Name,
			Path:  entry.Path,
			IsDir: entry.IsDir,
			Size:  entry.Size,
		})
	}
	if payload.Body != "" {
		body, err := base64.StdEncoding.DecodeString(payload.Body)
		if err != nil {
			resp.Error = "invalid response body encoding"
		} else {
			resp.Body = body
		}
	}
	h.ArtifactPending.Complete(payload.RequestID, resp)
}
