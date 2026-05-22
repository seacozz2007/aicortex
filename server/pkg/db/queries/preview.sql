-- =====================
-- Preview Environments
-- =====================

-- name: ListPreviewEnvironments :many
SELECT * FROM preview_environments
ORDER BY created_at DESC;

-- name: ListPreviewEnvironmentsByWorkspace :many
SELECT * FROM preview_environments
WHERE workspace_id = $1
ORDER BY created_at DESC;

-- name: GetPreviewEnvironment :one
SELECT * FROM preview_environments
WHERE id = $1;

-- name: GetPreviewEnvironmentByPR :one
SELECT * FROM preview_environments
WHERE workspace_id = $1 AND pr_id = $2;

-- name: CreatePreviewEnvironment :one
INSERT INTO preview_environments (
    workspace_id, pr_id, repo_owner, repo_name, pr_number, branch
) VALUES (
    $1, $2, $3, $4, $5, $6
)
RETURNING *;

-- name: UpdatePreviewEnvironmentStatus :one
UPDATE preview_environments SET
    status = $2,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdatePreviewEnvironmentPort :one
UPDATE preview_environments SET
    port = $2,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdatePreviewEnvironmentError :one
UPDATE preview_environments SET
    status = $2,
    error_message = $3,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdatePreviewEnvironmentCommit :one
UPDATE preview_environments SET
    commit_sha = $2,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdatePreviewEnvironmentDbName :one
UPDATE preview_environments SET
    db_name = $2,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: TouchPreviewEnvironment :exec
UPDATE preview_environments SET
    last_activity_at = now()
WHERE id = $1;

-- name: DeletePreviewEnvironment :exec
DELETE FROM preview_environments WHERE id = $1;

-- name: CountActivePreviewEnvironments :one
SELECT COUNT(*) FROM preview_environments
WHERE status NOT IN ('deleted', 'failed');

-- name: ListStalePreviewEnvironments :many
SELECT * FROM preview_environments
WHERE status NOT IN ('deleted', 'failed')
  AND last_activity_at < $1
ORDER BY last_activity_at ASC;

-- name: ListBuildingPreviewEnvironments :many
SELECT * FROM preview_environments
WHERE status = 'building'
ORDER BY updated_at ASC;

-- =====================
-- Preview Port Pool
-- =====================

-- name: AllocatePort :one
UPDATE preview_port_pool SET
    status = 'allocated',
    env_id = $1,
    allocated_at = now()
WHERE port = (
    SELECT port FROM preview_port_pool
    WHERE status = 'free'
    ORDER BY port ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING *;

-- name: ReleasePort :exec
UPDATE preview_port_pool SET
    status = 'free',
    env_id = NULL,
    allocated_at = NULL
WHERE env_id = $1;

-- name: ReleasePortByPort :exec
UPDATE preview_port_pool SET
    status = 'free',
    env_id = NULL,
    allocated_at = NULL
WHERE port = $1;

-- name: GetPortByEnvID :one
SELECT * FROM preview_port_pool
WHERE env_id = $1;

-- name: CountAllocatedPorts :one
SELECT COUNT(*) FROM preview_port_pool
WHERE status = 'allocated';
