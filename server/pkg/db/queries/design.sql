-- name: CreateDesignChatSession :one
INSERT INTO chat_session (
    workspace_id,
    agent_id,
    creator_id,
    title,
    runtime_id,
    project_id,
    session_kind,
    design_mode,
    design_skill_id,
    design_system_resource_id,
    artifact_entry
)
VALUES (
    $1,
    $2,
    $3,
    $4,
    (SELECT runtime_id FROM agent WHERE id = $2),
    $5,
    'design',
    $6,
    $7,
    $8,
    COALESCE(sqlc.narg('artifact_entry'), 'index.html')
)
RETURNING *;

-- name: ListDesignChatSessionsByProject :many
SELECT cs.*,
       (cs.unread_since IS NOT NULL)::bool AS has_unread
FROM chat_session cs
WHERE cs.workspace_id = $1
  AND cs.project_id = $2
  AND cs.session_kind = 'design'
  AND cs.status = 'active'
ORDER BY cs.updated_at DESC;

-- name: GetDesignSystemResourceInProject :one
SELECT * FROM project_resource
WHERE id = $1
  AND project_id = $2
  AND workspace_id = $3
  AND resource_type = 'design_system';

-- name: ListDesignSystemResourcesByProject :many
SELECT * FROM project_resource
WHERE project_id = $1
  AND workspace_id = $2
  AND resource_type = 'design_system'
ORDER BY position ASC, created_at ASC;

-- name: SetWorkspaceDefaultDesignAgent :exec
UPDATE workspace
SET default_design_agent_id = $2, updated_at = now()
WHERE id = $1;

-- name: GetWorkspaceDefaultDesignAgent :one
SELECT default_design_agent_id FROM workspace WHERE id = $1;
