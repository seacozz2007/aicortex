-- Design Studio: session_kind, design metadata, workspace default design agent.

ALTER TABLE workspace
    ADD COLUMN IF NOT EXISTS default_design_agent_id UUID REFERENCES agent(id) ON DELETE SET NULL;

ALTER TABLE chat_session
    ADD COLUMN IF NOT EXISTS session_kind TEXT NOT NULL DEFAULT 'chat'
        CHECK (session_kind IN ('chat', 'design')),
    ADD COLUMN IF NOT EXISTS design_mode TEXT
        CHECK (design_mode IS NULL OR design_mode IN ('prototype', 'deck', 'template', 'design_system')),
    ADD COLUMN IF NOT EXISTS design_skill_id UUID REFERENCES skill(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS design_system_resource_id UUID REFERENCES project_resource(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS artifact_entry TEXT NOT NULL DEFAULT 'index.html';

ALTER TABLE chat_session
    ADD CONSTRAINT chat_session_design_requires_project
        CHECK (session_kind <> 'design' OR project_id IS NOT NULL);

ALTER TABLE agent_task_queue
    ADD COLUMN IF NOT EXISTS design_mode TEXT,
    ADD COLUMN IF NOT EXISTS design_skill_id UUID,
    ADD COLUMN IF NOT EXISTS design_system_resource_id UUID;

CREATE INDEX IF NOT EXISTS idx_chat_session_project_kind
    ON chat_session (project_id, session_kind)
    WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_session_design_project
    ON chat_session (project_id, updated_at DESC)
    WHERE session_kind = 'design';
