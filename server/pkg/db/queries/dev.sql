-- name: CreateDevChatSession :one
INSERT INTO chat_session (
    workspace_id,
    agent_id,
    creator_id,
    title,
    runtime_id,
    project_id,
    session_kind
)
VALUES (
    $1,
    $2,
    $3,
    $4,
    (SELECT runtime_id FROM agent WHERE id = $2),
    $5,
    'dev'
)
RETURNING *;

-- name: ListDevChatSessionsByProject :many
SELECT cs.*,
       (cs.unread_since IS NOT NULL)::bool AS has_unread
FROM chat_session cs
WHERE cs.workspace_id = $1
  AND cs.project_id = $2
  AND cs.session_kind = 'dev'
  AND cs.status = 'active'
ORDER BY cs.updated_at DESC;

-- name: ListDevChatSessionsByCreator :many
SELECT cs.*,
       (cs.unread_since IS NOT NULL)::bool AS has_unread
FROM chat_session cs
WHERE cs.workspace_id = $1
  AND cs.creator_id = $2
  AND cs.session_kind = 'dev'
  AND cs.status = 'active'
ORDER BY cs.updated_at DESC;

-- name: SetWorkspaceDefaultDevAgent :exec
UPDATE workspace
SET default_dev_agent_id = $2, updated_at = now()
WHERE id = $1;

-- name: GetWorkspaceDefaultDevAgent :one
SELECT default_dev_agent_id FROM workspace WHERE id = $1;
