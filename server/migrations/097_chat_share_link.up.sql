CREATE TABLE chat_share_link (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    agent_id      UUID NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    title         TEXT NOT NULL DEFAULT '',
    guide_message TEXT NOT NULL DEFAULT '',
    token         TEXT NOT NULL UNIQUE,
    expires_at    TIMESTAMPTZ,
    max_uses      INT,
    use_count     INT NOT NULL DEFAULT 0,
    allow_new_sessions BOOLEAN NOT NULL DEFAULT true,
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_by    UUID NOT NULL REFERENCES member(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX chat_share_link_token_idx ON chat_share_link(token);
CREATE INDEX chat_share_link_workspace_idx ON chat_share_link(workspace_id);
CREATE INDEX chat_share_link_agent_idx ON chat_share_link(agent_id);
