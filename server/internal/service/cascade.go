package service

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/aicortex/aicortex/server/internal/util"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

// CascadeOnStatusChange runs the cascade trigger when an issue transitions to
// done or in_review. It performs two steps:
//
//	Step 1 — Upward bubbling: if the issue has a parent and all siblings are
//	         terminal, activate the parent (todo, assign to QA Diana).
//	Step 2 — Downward propagation: unblock issues whose blocked_by_ids are
//	         all resolved.
//
// Idempotent: re-checks current state before each mutation so concurrent
// completions of sibling/blocker tasks don't double-activate.
func (s *TaskService) CascadeOnStatusChange(ctx context.Context, issue db.Issue, prevStatus string) {
	if issue.Status != "done" && issue.Status != "in_review" {
		return
	}
	if prevStatus == issue.Status {
		return
	}

	s.cascadeUpward(ctx, issue)
	s.cascadeDownward(ctx, issue)
}

func (s *TaskService) cascadeUpward(ctx context.Context, issue db.Issue) {
	if !issue.ParentIssueID.Valid {
		return
	}

	// Re-query parent for idempotency: skip if already unblocked by a
	// concurrent sibling completion.
	parent, err := s.Queries.GetIssue(ctx, issue.ParentIssueID)
	if err != nil {
		slog.Warn("cascade upward: parent lookup failed",
			"issue_id", util.UUIDToString(issue.ID),
			"parent_id", util.UUIDToString(issue.ParentIssueID),
			"error", err,
		)
		return
	}
	if parent.Status != "blocked" {
		return
	}

	siblings, err := s.Queries.ListChildIssues(ctx, issue.ParentIssueID)
	if err != nil {
		slog.Warn("cascade upward: sibling lookup failed",
			"parent_id", util.UUIDToString(issue.ParentIssueID),
			"error", err,
		)
		return
	}
	if len(siblings) == 0 {
		return
	}

	allTerminal := true
	hasCancelled := false
	for _, child := range siblings {
		if !isTerminalStatus(child.Status) {
			allTerminal = false
			break
		}
		if child.Status == "cancelled" {
			hasCancelled = true
		}
	}
	if !allTerminal {
		return
	}

	qaAgentID := s.findQAAgent(ctx, parent.WorkspaceID)

	updated, err := s.Queries.UpdateIssue(ctx, db.UpdateIssueParams{
		ID:            parent.ID,
		AssigneeType:  pgtype.Text{String: "agent", Valid: qaAgentID.Valid},
		AssigneeID:    qaAgentID,
		Status:        pgtype.Text{String: "todo", Valid: true},
		BlockedByIds:  []pgtype.UUID{},
		DueDate:       parent.DueDate,
		ParentIssueID: parent.ParentIssueID,
		ProjectID:     parent.ProjectID,
	})
	if err != nil {
		slog.Warn("cascade upward: parent update failed",
			"parent_id", util.UUIDToString(parent.ID),
			"error", err,
		)
		return
	}

	slog.Info("cascade upward: parent activated",
		"parent_id", util.UUIDToString(parent.ID),
		"trigger_issue_id", util.UUIDToString(issue.ID),
	)

	s.broadcastIssueUpdated(updated)

	commentBody := "All child tasks completed. Parent task activated and assigned to QA."
	if hasCancelled {
		commentBody += "\nNote: one or more child tasks were cancelled."
	}
	s.createAgentComment(ctx, parent.ID, issue.AssigneeID, commentBody, "system", pgtype.UUID{})
}

func (s *TaskService) cascadeDownward(ctx context.Context, issue db.Issue) {
	blocked, err := s.Queries.ListIssuesBlockedBy(ctx, []pgtype.UUID{issue.ID})
	if err != nil {
		slog.Warn("cascade downward: list blocked failed",
			"issue_id", util.UUIDToString(issue.ID),
			"error", err,
		)
		return
	}

	for _, t := range blocked {
		if t.Status != "blocked" {
			continue
		}
		if !s.allBlockersResolved(ctx, t, issue.ID) {
			continue
		}

		updated, err := s.Queries.UpdateIssueBlockedBy(ctx, db.UpdateIssueBlockedByParams{
			ID:           t.ID,
			BlockedByIds: []pgtype.UUID{},
			Status:       pgtype.Text{String: "todo", Valid: true},
		})
		if err != nil {
			slog.Warn("cascade downward: unblock failed",
				"issue_id", util.UUIDToString(t.ID),
				"error", err,
			)
			continue
		}

		slog.Info("cascade downward: issue unblocked",
			"issue_id", util.UUIDToString(t.ID),
			"trigger_issue_id", util.UUIDToString(issue.ID),
		)

		s.broadcastIssueUpdated(updated)

		commentBody := fmt.Sprintf("Blocking condition resolved — all dependencies completed.")
		s.createAgentComment(ctx, t.ID, issue.AssigneeID, commentBody, "system", pgtype.UUID{})
	}
}

func (s *TaskService) allBlockersResolved(ctx context.Context, t db.Issue, completedID pgtype.UUID) bool {
	for _, blockerID := range t.BlockedByIds {
		if blockerID == completedID {
			continue
		}
		blocker, err := s.Queries.GetIssue(ctx, blockerID)
		if err != nil || !isTerminalStatus(blocker.Status) {
			return false
		}
	}
	return true
}

// findQAAgent looks up an agent named "Diana" in the workspace.
func (s *TaskService) findQAAgent(ctx context.Context, workspaceID pgtype.UUID) pgtype.UUID {
	agents, err := s.Queries.ListAgents(ctx, workspaceID)
	if err != nil {
		return pgtype.UUID{}
	}
	for _, a := range agents {
		if a.Name == "Diana" {
			return a.ID
		}
	}
	return pgtype.UUID{}
}

func isTerminalStatus(status string) bool {
	return status == "done" || status == "in_review" || status == "cancelled"
}
