CREATE TABLE terminal_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    runtime_id UUID NOT NULL REFERENCES agent_runtime(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    shell TEXT NOT NULL DEFAULT '',
    cols INT NOT NULL DEFAULT 120,
    rows INT NOT NULL DEFAULT 30,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    last_attached_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_terminal_sessions_workspace ON terminal_sessions(workspace_id, status);
CREATE INDEX idx_terminal_sessions_runtime ON terminal_sessions(runtime_id, status);
