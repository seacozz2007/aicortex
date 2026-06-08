package handler

import (
	"context"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/aicortex/aicortex/server/internal/design"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

const exportMaxTotalBytes = 50 << 20 // 50 MiB

// DownloadDesignExport streams a packaged export (zip, pdf, pptx, html).
func (h *Handler) DownloadDesignExport(w http.ResponseWriter, r *http.Request) {
	if !h.requireDesignStudio(w) {
		return
	}
	if !design.FeatureDesignExport() {
		writeError(w, http.StatusNotFound, "export not enabled")
		return
	}

	format := strings.ToLower(strings.TrimSpace(chi.URLParam(r, "format")))
	if format == "" {
		writeError(w, http.StatusBadRequest, "format required")
		return
	}

	session, task, entry, ok := h.loadDesignExportContext(w, r)
	if !ok {
		return
	}

	files, err := h.collectTaskWorkDirFiles(r.Context(), task)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if len(files) == 0 {
		writeError(w, http.StatusNotFound, "no artifact files to export")
		return
	}

	baseName := sanitizeExportName(session.Title)
	switch format {
	case "zip":
		data, err := design.BuildZipArchive(files)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to build zip")
			return
		}
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.zip"`, baseName))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(data)
	case "html":
		body, ok := files[entry]
		if !ok {
			writeError(w, http.StatusNotFound, "artifact entry not found")
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filepath.Base(entry)))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	case "pdf":
		body, ok := files[entry]
		if !ok {
			writeError(w, http.StatusNotFound, "artifact entry not found")
			return
		}
		printHTML := design.PreparePrintHTML(body)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s-print.html"`, baseName))
		w.Header().Set("X-Export-Format", "pdf-print-ready")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(printHTML)
	case "pptx":
		data, err := design.BuildMinimalPPTX(session.Title, entry)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to build pptx")
			return
		}
		w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.pptx"`, baseName))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(data)
	default:
		writeError(w, http.StatusBadRequest, "unsupported export format")
	}
}

func (h *Handler) loadDesignExportContext(w http.ResponseWriter, r *http.Request) (db.ChatSession, db.AgentTaskQueue, string, bool) {
	workspaceID := ctxWorkspaceID(r.Context())
	project, ok := h.loadProjectForResource(w, r, chi.URLParam(r, "id"))
	if !ok {
		return db.ChatSession{}, db.AgentTaskQueue{}, "", false
	}
	sessionUUID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "sessionId"), "session id")
	if !ok {
		return db.ChatSession{}, db.AgentTaskQueue{}, "", false
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return db.ChatSession{}, db.AgentTaskQueue{}, "", false
	}

	session, err := h.Queries.GetChatSessionInWorkspace(r.Context(), db.GetChatSessionInWorkspaceParams{
		ID:          sessionUUID,
		WorkspaceID: wsUUID,
	})
	if err != nil || session.SessionKind != "design" || session.ProjectID != project.ID {
		writeError(w, http.StatusNotFound, "design session not found")
		return db.ChatSession{}, db.AgentTaskQueue{}, "", false
	}

	entry := strings.TrimSpace(session.ArtifactEntry)
	if entry == "" {
		entry = "index.html"
	}

	task, ok := h.latestDesignSessionTask(w, r, session)
	if !ok {
		return db.ChatSession{}, db.AgentTaskQueue{}, "", false
	}
	return session, task, entry, true
}

func (h *Handler) latestDesignSessionTask(w http.ResponseWriter, r *http.Request, session db.ChatSession) (db.AgentTaskQueue, bool) {
	var task db.AgentTaskQueue
	err := h.DB.QueryRow(r.Context(),
		`SELECT id, agent_id, issue_id, status, priority, dispatched_at, started_at, completed_at,
		        result, error, created_at, context, runtime_id, session_id, work_dir,
		        trigger_comment_id, chat_session_id, autopilot_run_id, attempt, max_attempts,
		        parent_task_id, failure_reason, trigger_summary, force_fresh_session, is_leader_task,
		        design_mode, design_skill_id, design_system_resource_id
		 FROM agent_task_queue
		 WHERE chat_session_id = $1
		   AND work_dir IS NOT NULL AND btrim(work_dir) <> ''
		 ORDER BY COALESCE(completed_at, started_at, dispatched_at, created_at) DESC, created_at DESC
		 LIMIT 1`,
		session.ID,
	).Scan(
		&task.ID, &task.AgentID, &task.IssueID, &task.Status, &task.Priority, &task.DispatchedAt,
		&task.StartedAt, &task.CompletedAt, &task.Result, &task.Error, &task.CreatedAt, &task.Context,
		&task.RuntimeID, &task.SessionID, &task.WorkDir, &task.TriggerCommentID, &task.ChatSessionID,
		&task.AutopilotRunID, &task.Attempt, &task.MaxAttempts, &task.ParentTaskID, &task.FailureReason,
		&task.TriggerSummary, &task.ForceFreshSession, &task.IsLeaderTask, &task.DesignMode,
		&task.DesignSkillID, &task.DesignSystemResourceID,
	)
	if err != nil {
		if session.WorkDir.Valid && strings.TrimSpace(session.WorkDir.String) != "" {
			err = h.DB.QueryRow(r.Context(),
				`SELECT id, agent_id, issue_id, status, priority, dispatched_at, started_at, completed_at,
				        result, error, created_at, context, runtime_id, session_id, work_dir,
				        trigger_comment_id, chat_session_id, autopilot_run_id, attempt, max_attempts,
				        parent_task_id, failure_reason, trigger_summary, force_fresh_session, is_leader_task,
				        design_mode, design_skill_id, design_system_resource_id
				 FROM agent_task_queue
				 WHERE work_dir = $1
				 ORDER BY created_at DESC
				 LIMIT 1`,
				session.WorkDir.String,
			).Scan(
				&task.ID, &task.AgentID, &task.IssueID, &task.Status, &task.Priority, &task.DispatchedAt,
				&task.StartedAt, &task.CompletedAt, &task.Result, &task.Error, &task.CreatedAt, &task.Context,
				&task.RuntimeID, &task.SessionID, &task.WorkDir, &task.TriggerCommentID, &task.ChatSessionID,
				&task.AutopilotRunID, &task.Attempt, &task.MaxAttempts, &task.ParentTaskID, &task.FailureReason,
				&task.TriggerSummary, &task.ForceFreshSession, &task.IsLeaderTask, &task.DesignMode,
				&task.DesignSkillID, &task.DesignSystemResourceID,
			)
		}
	}
	if err != nil {
		writeError(w, http.StatusNotFound, "design session has no exportable artifact task")
		return db.AgentTaskQueue{}, false
	}
	if _, ok := h.authorizeTaskArtifactUse(w, r, uuidToString(task.ID)); !ok {
		return db.AgentTaskQueue{}, false
	}
	return task, true
}

func (h *Handler) collectTaskWorkDirFiles(ctx context.Context, task db.AgentTaskQueue) (map[string][]byte, error) {
	out := map[string][]byte{}
	var total int64
	if err := h.walkArtifactDir(ctx, task, "", out, &total); err != nil {
		return nil, err
	}
	return out, nil
}

func (h *Handler) walkArtifactDir(ctx context.Context, task db.AgentTaskQueue, relPath string, out map[string][]byte, total *int64) error {
	resp, err := h.relayArtifactRequest(ctx, task, "list", relPath, nil)
	if err != nil {
		return err
	}
	if resp.Error != "" {
		return fmt.Errorf(resp.Error)
	}
	for _, entry := range resp.Entries {
		if entry.IsDir {
			if err := h.walkArtifactDir(ctx, task, entry.Path, out, total); err != nil {
				return err
			}
			continue
		}
		read, err := h.relayArtifactRequest(ctx, task, "read", entry.Path, nil)
		if err != nil {
			return err
		}
		if read.Error != "" {
			return fmt.Errorf(read.Error)
		}
		*total += int64(len(read.Body))
		if *total > exportMaxTotalBytes {
			return fmt.Errorf("export exceeds size limit")
		}
		out[entry.Path] = read.Body
	}
	return nil
}

func sanitizeExportName(title string) string {
	title = strings.TrimSpace(title)
	if title == "" {
		return "design-export"
	}
	var b strings.Builder
	for _, r := range title {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		} else if r == ' ' {
			b.WriteRune('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "design-export"
	}
	return out
}
