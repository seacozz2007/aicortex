-- name: HasUnresolvedBlockers :one
SELECT EXISTS(
    SELECT 1 FROM issue_dependency d
    JOIN issue i ON i.id = d.depends_on_issue_id
    WHERE d.issue_id = $1
      AND d.type = 'blocked_by'
      AND i.status NOT IN ('done', 'in_review', 'cancelled')
) AS has_unresolved;

-- name: ListBlockedByDependencies :many
SELECT * FROM issue_dependency
WHERE issue_id = $1 AND type = 'blocked_by';

-- name: ListBlockingIssues :many
SELECT i.* FROM issue i
JOIN issue_dependency d ON d.issue_id = i.id
WHERE d.depends_on_issue_id = $1 AND d.type = 'blocked_by';

-- name: ListPollingCandidateIssues :many
SELECT * FROM issue
WHERE status NOT IN ('done', 'in_review', 'cancelled')
  AND assignee_type = 'agent';
