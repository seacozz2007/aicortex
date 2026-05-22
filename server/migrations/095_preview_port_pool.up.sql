CREATE TABLE preview_port_pool (
    port INTEGER PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'free',
    env_id UUID REFERENCES preview_environments(id),
    allocated_at TIMESTAMPTZ,
    CHECK (port >= 30000 AND port <= 30100)
);

INSERT INTO preview_port_pool (port, status)
SELECT generate_series(30000, 30100), 'free';
