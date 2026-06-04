-- name: CreateEndUserSession :one
INSERT INTO enduser_session (
    workspace_id, agent_id, title, goal, guide_message,
    token, html_content, expires_at, max_messages, created_by
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9, $10
) RETURNING *;

-- name: GetEndUserSession :one
SELECT * FROM enduser_session
WHERE id = $1;

-- name: GetEndUserSessionInWorkspace :one
SELECT * FROM enduser_session
WHERE id = $1 AND workspace_id = $2;

-- name: ListEndUserSessions :many
SELECT * FROM enduser_session
WHERE workspace_id = $1
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
ORDER BY created_at DESC
LIMIT sqlc.narg('limit')::int OFFSET sqlc.arg('offset')::int;

-- name: CountEndUserSessions :one
SELECT count(*) FROM enduser_session
WHERE workspace_id = $1
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'));

-- name: UpdateEndUserSession :one
UPDATE enduser_session SET
    title = COALESCE(sqlc.narg('title'), title),
    goal = COALESCE(sqlc.narg('goal'), goal),
    guide_message = COALESCE(sqlc.narg('guide_message'), guide_message),
    html_content = COALESCE(sqlc.narg('html_content'), html_content),
    expires_at = sqlc.narg('expires_at'),
    max_messages = sqlc.narg('max_messages'),
    status = COALESCE(sqlc.narg('status'), status),
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: DeleteEndUserSession :one
UPDATE enduser_session SET status = 'disabled', updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: UpdateEndUserSessionToken :one
UPDATE enduser_session SET token = $2, updated_at = now()
WHERE id = $1 AND workspace_id = $3
RETURNING *;

-- name: GetAgentNotArchived :one
SELECT * FROM agent
WHERE id = $1 AND archived_at IS NULL;

-- name: CreateEndUserMessage :one
INSERT INTO enduser_message (
    session_id, visitor_id, role, content
) VALUES (
    $1, $2, $3, $4
) RETURNING *;

-- name: ListEndUserSessionMessages :many
SELECT * FROM enduser_message
WHERE session_id = $1
ORDER BY created_at ASC;

-- name: CountEndUserSessionMessages :one
SELECT count(*) FROM enduser_message
WHERE session_id = $1;

-- name: CountEndUserSessionVisitors :one
SELECT count(DISTINCT visitor_id) FROM enduser_message
WHERE session_id = $1;
