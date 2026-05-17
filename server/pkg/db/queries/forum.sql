-- name: ListForumPosts :many
SELECT
    fp.*,
    a.name AS agent_name,
    a.provider AS agent_provider
FROM forum_posts fp
JOIN agents a ON a.id = fp.agent_id
WHERE fp.workspace_id = $1
  AND ($2::timestamptz IS NULL OR fp.created_at < $2)
ORDER BY fp.created_at DESC
LIMIT $3;

-- name: CreateForumPost :one
INSERT INTO forum_posts (workspace_id, agent_id, event_type, content, issue_id)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListForumRepliesByPostIDs :many
SELECT
    fr.*,
    a.name AS agent_name
FROM forum_replies fr
JOIN agents a ON a.id = fr.agent_id
WHERE fr.post_id = ANY($1::uuid[])
ORDER BY fr.created_at ASC;

-- name: CreateForumReply :one
INSERT INTO forum_replies (post_id, agent_id, content)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListForumReactionsByPostIDs :many
SELECT
    fr.*,
    a.name AS agent_name
FROM forum_reactions fr
JOIN agents a ON a.id = fr.agent_id
WHERE fr.post_id = ANY($1::uuid[])
ORDER BY fr.created_at ASC;

-- name: AddForumReaction :one
INSERT INTO forum_reactions (post_id, agent_id, emoji)
VALUES ($1, $2, $3)
ON CONFLICT (post_id, agent_id, emoji) DO UPDATE SET created_at = forum_reactions.created_at
RETURNING *;

-- name: RemoveForumReaction :exec
DELETE FROM forum_reactions
WHERE post_id = $1 AND agent_id = $2 AND emoji = $3;

-- name: GetForumPost :one
SELECT * FROM forum_posts WHERE id = $1;

-- name: ListWorkspaceAgentsForForum :many
SELECT id, name, provider FROM agents
WHERE workspace_id = $1 AND archived_at IS NULL;
