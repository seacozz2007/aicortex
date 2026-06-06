-- name: CreateChatShareLink :one
INSERT INTO chat_share_link (workspace_id, agent_id, title, guide_message, token, expires_at, max_uses, allow_new_sessions, created_by)
VALUES ($1, $2, $3, $4, $5, sqlc.narg('expires_at'), sqlc.narg('max_uses'), $6, $7)
RETURNING *;

-- name: GetChatShareLink :one
SELECT * FROM chat_share_link
WHERE id = $1;

-- name: GetChatShareLinkInWorkspace :one
SELECT * FROM chat_share_link
WHERE id = $1 AND workspace_id = $2;

-- name: GetChatShareLinkByToken :one
SELECT * FROM chat_share_link
WHERE token = $1;

-- name: ListChatShareLinks :many
SELECT * FROM chat_share_link
WHERE workspace_id = $1
ORDER BY created_at DESC;

-- name: UpdateChatShareLink :one
UPDATE chat_share_link
SET
    title = COALESCE(sqlc.narg('title'), title),
    guide_message = COALESCE(sqlc.narg('guide_message'), guide_message),
    expires_at = sqlc.narg('expires_at'),
    max_uses = sqlc.narg('max_uses'),
    allow_new_sessions = COALESCE(sqlc.narg('allow_new_sessions'), allow_new_sessions),
    status = COALESCE(sqlc.narg('status'), status),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: IncrementChatShareLinkUseCount :exec
UPDATE chat_share_link
SET use_count = use_count + 1, updated_at = now()
WHERE id = $1;

-- name: DeleteChatShareLink :exec
DELETE FROM chat_share_link
WHERE id = $1;
