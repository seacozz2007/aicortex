package service

import (
	"context"
	"log/slog"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/aicortex/aicortex/server/internal/util"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

// PollingService periodically scans for eligible agent-assigned issues and
// triggers execution runs when conditions are met.
type PollingService struct {
	Queries  *db.Queries
	TaskSvc  *TaskService
	Interval time.Duration
	Enabled  bool
}

// PollingConfig holds tunable parameters for the polling scan.
type PollingConfig struct {
	Interval time.Duration
	Enabled  bool
}

// DefaultPollingConfig returns the default configuration (15 minutes, enabled).
func DefaultPollingConfig() PollingConfig {
	return PollingConfig{
		Interval: 15 * time.Minute,
		Enabled:  true,
	}
}

// PollingConfigFromEnv reads configuration from environment variables.
// POLLING_ENABLED: "true" / "false" (default true)
// POLLING_INTERVAL_MINUTES: integer minutes (default 15)
func PollingConfigFromEnv() PollingConfig {
	cfg := DefaultPollingConfig()

	if v := os.Getenv("POLLING_ENABLED"); v != "" {
		cfg.Enabled = v != "false" && v != "0"
	}

	if v := os.Getenv("POLLING_INTERVAL_MINUTES"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.Interval = time.Duration(n) * time.Minute
		} else {
			slog.Warn("invalid POLLING_INTERVAL_MINUTES, using default",
				"value", v, "default_minutes", 15)
		}
	}

	return cfg
}

// NewPollingService creates a PollingService with the given config.
func NewPollingService(q *db.Queries, taskSvc *TaskService, cfg PollingConfig) *PollingService {
	return &PollingService{
		Queries:  q,
		TaskSvc:  taskSvc,
		Interval: cfg.Interval,
		Enabled:  cfg.Enabled,
	}
}

// ScanAndTrigger runs one polling cycle: finds eligible issues and triggers
// execution runs for their assigned agents. Returns the number of issues
// scanned and the number of runs triggered.
func (s *PollingService) ScanAndTrigger(ctx context.Context) (scanned int, triggered int) {
	if !s.Enabled {
		return 0, 0
	}

	candidates, err := s.Queries.ListPollingCandidateIssues(ctx)
	if err != nil {
		slog.Warn("polling: failed to list candidate issues", "error", err)
		return 0, 0
	}

	if len(candidates) == 0 {
		return 0, 0
	}

	for _, issue := range candidates {
		scanned++

		if !s.isEligible(ctx, issue) {
			continue
		}

		_, err := s.TaskSvc.EnqueueTaskForIssue(ctx, issue)
		if err != nil {
			slog.Warn("polling: failed to enqueue task",
				"issue_id", util.UUIDToString(issue.ID),
				"agent_id", util.UUIDToString(issue.AssigneeID),
				"error", err,
			)
			continue
		}

		triggered++
		slog.Info("polling: triggered agent run",
			"issue_id", util.UUIDToString(issue.ID),
			"agent_id", util.UUIDToString(issue.AssigneeID),
			"workspace_id", util.UUIDToString(issue.WorkspaceID),
		)
	}

	return scanned, triggered
}

// isEligible checks whether an issue meets all polling trigger conditions.
func (s *PollingService) isEligible(ctx context.Context, issue db.Issue) bool {
	if !issue.AssigneeID.Valid {
		return false
	}

	// Condition 2: no active agent run (queued, dispatched, or running)
	hasActive, err := s.Queries.HasActiveTaskForIssue(ctx, issue.ID)
	if err != nil {
		slog.Warn("polling: failed to check active tasks",
			"issue_id", util.UUIDToString(issue.ID),
			"error", err,
		)
		return false
	}
	if hasActive {
		return false
	}

	// Condition 3: not blocked by unresolved dependencies
	hasBlockers, err := s.Queries.HasUnresolvedBlockers(ctx, issue.ID)
	if err != nil {
		slog.Warn("polling: failed to check blockers",
			"issue_id", util.UUIDToString(issue.ID),
			"error", err,
		)
		return false
	}
	if hasBlockers {
		return false
	}

	// Condition 4: not a parent with incomplete children
	if isBlockedByIncompleteChildren(ctx, s.Queries, issue.ID) {
		return false
	}

	return true
}

// isBlockedByIncompleteChildren returns true if the issue is a parent with
// at least one child that is not in a terminal state.
func isBlockedByIncompleteChildren(ctx context.Context, q *db.Queries, issueID pgtype.UUID) bool {
	children, err := q.ListChildIssues(ctx, issueID)
	if err != nil {
		slog.Warn("polling: failed to list child issues",
			"issue_id", util.UUIDToString(issueID),
			"error", err,
		)
		return true
	}
	if len(children) == 0 {
		return false
	}
	for _, child := range children {
		if !isTerminalStatus(child.Status) {
			return true
		}
	}
	return false
}

