CREATE TABLE runtime_tunnel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    runtime_id UUID NOT NULL REFERENCES agent_runtime(id) ON DELETE CASCADE,
    port INTEGER NOT NULL CHECK (port >= 1024 AND port <= 65535),
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_by UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (runtime_id, port)
);

CREATE INDEX idx_runtime_tunnel_workspace ON runtime_tunnel(workspace_id);
CREATE INDEX idx_runtime_tunnel_runtime ON runtime_tunnel(runtime_id);
