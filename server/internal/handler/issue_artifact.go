package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	art "github.com/aicortex/aicortex/server/internal/artifact"
)

type issueArtifactReportItem struct {
	RelPath string `json:"rel_path"`
	Kind    string `json:"kind"`
	Title   string `json:"title"`
}

type issueArtifactReportRequest struct {
	Artifacts []issueArtifactReportItem `json:"artifacts"`
}

type issueArtifactResponse struct {
	ID        string `json:"id"`
	IssueID   string `json:"issue_id"`
	TaskID    string `json:"task_id"`
	RuntimeID string `json:"runtime_id"`
	RelPath   string `json:"rel_path"`
	Kind      string `json:"kind"`
	Title     string `json:"title"`
	CreatedAt string `json:"created_at"`
}

func (h *Handler) issuePreviewEnabled(w http.ResponseWriter) bool {
	if !art.FeatureIssuePreview() {
		writeError(w, http.StatusNotFound, "not found")
		return false
	}
	return true
}

// ReportTaskArtifacts stores best-effort HTML artifacts for an issue task.
// Failures here must not affect task completion — daemon calls this after complete.
func (h *Handler) ReportTaskArtifacts(w http.ResponseWriter, r *http.Request) {
	if !h.issuePreviewEnabled(w) {
		return
	}
	taskID := chi.URLParam(r, "taskId")
	task, ok := h.requireDaemonTaskAccess(w, r, taskID)
	if !ok {
		return
	}
	if !task.IssueID.Valid {
		writeError(w, http.StatusBadRequest, "task has no issue")
		return
	}

	var req issueArtifactReportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	issue, err := h.Queries.GetIssue(r.Context(), task.IssueID)
	if err != nil {
		writeError(w, http.StatusNotFound, "issue not found")
		return
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store artifacts")
		return
	}
	defer tx.Rollback(r.Context())

	if _, err := tx.Exec(r.Context(), `DELETE FROM issue_artifact WHERE task_id = $1`, task.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store artifacts")
		return
	}

	for _, item := range req.Artifacts {
		rel := strings.TrimSpace(item.RelPath)
		if rel == "" {
			continue
		}
		if _, err := tx.Exec(r.Context(),
			`DELETE FROM issue_artifact WHERE issue_id = $1 AND rel_path = $2 AND task_id <> $3`,
			task.IssueID, rel, task.ID,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to store artifacts")
			return
		}
		kind := strings.TrimSpace(item.Kind)
		if kind == "" {
			kind = "html"
		}
		title := strings.TrimSpace(item.Title)
		if title == "" {
			title = rel
		}
		if _, err := tx.Exec(r.Context(),
			`INSERT INTO issue_artifact (workspace_id, issue_id, task_id, runtime_id, rel_path, kind, title)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			issue.WorkspaceID, task.IssueID, task.ID, task.RuntimeID, rel, kind, title,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to store artifacts")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store artifacts")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ListIssueArtifacts returns previewable artifacts linked to an issue.
func (h *Handler) ListIssueArtifacts(w http.ResponseWriter, r *http.Request) {
	if !h.issuePreviewEnabled(w) {
		return
	}
	issueID := chi.URLParam(r, "id")
	issue, ok := h.loadIssueForUser(w, r, issueID)
	if !ok {
		return
	}

	rows, err := h.DB.Query(r.Context(),
		`SELECT id, issue_id, task_id, runtime_id, rel_path, kind, title, created_at
		 FROM (
		   SELECT DISTINCT ON (rel_path) id, issue_id, task_id, runtime_id, rel_path, kind, title, created_at
		   FROM issue_artifact
		   WHERE issue_id = $1
		   ORDER BY rel_path, created_at DESC
		 ) AS deduped
		 ORDER BY created_at DESC`,
		issue.ID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list issue artifacts")
		return
	}
	defer rows.Close()

	items := []issueArtifactResponse{}
	for rows.Next() {
		var id, issID, taskID, runtimeID pgtype.UUID
		var relPath, kind, title string
		var createdAt pgtype.Timestamptz
		if err := rows.Scan(&id, &issID, &taskID, &runtimeID, &relPath, &kind, &title, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to read issue artifacts")
			return
		}
		items = append(items, issueArtifactResponse{
			ID:        uuidToString(id),
			IssueID:   uuidToString(issID),
			TaskID:    uuidToString(taskID),
			RuntimeID: uuidToString(runtimeID),
			RelPath:   relPath,
			Kind:      kind,
			Title:     title,
			CreatedAt: timestampToString(createdAt),
		})
	}
	if items == nil {
		items = []issueArtifactResponse{}
	}
	writeJSON(w, http.StatusOK, items)
}
