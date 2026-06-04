CREATE TABLE enduser_session (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    agent_id      UUID NOT NULL REFERENCES agent(id),
    title         TEXT NOT NULL DEFAULT '',
    goal          TEXT NOT NULL DEFAULT '',
    guide_message TEXT NOT NULL DEFAULT '',
    token         TEXT NOT NULL UNIQUE,
    html_content  TEXT NOT NULL DEFAULT '',
    expires_at    TIMESTAMPTZ,
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'disabled')),
    max_messages  INT,
    created_by    UUID NOT NULL REFERENCES member(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX enduser_session_token_idx ON enduser_session(token);
CREATE INDEX enduser_session_workspace_id_idx ON enduser_session(workspace_id);
CREATE INDEX enduser_session_agent_id_idx ON enduser_session(agent_id);

CREATE TABLE enduser_message (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES enduser_session(id) ON DELETE CASCADE,
    visitor_id TEXT NOT NULL,
    role       TEXT NOT NULL CHECK (role IN ('user', 'agent', 'system')),
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX enduser_message_session_id_created_at_idx ON enduser_message(session_id, created_at);
