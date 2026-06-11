-- Dev Studio: session_kind=dev, workspace default dev agent.

ALTER TABLE workspace
    ADD COLUMN IF NOT EXISTS default_dev_agent_id UUID REFERENCES agent(id) ON DELETE SET NULL;

ALTER TABLE chat_session DROP CONSTRAINT IF EXISTS chat_session_session_kind_check;
ALTER TABLE chat_session
    ADD CONSTRAINT chat_session_session_kind_check
        CHECK (session_kind IN ('chat', 'design', 'dev'));

ALTER TABLE chat_session DROP CONSTRAINT IF EXISTS chat_session_design_requires_project;
ALTER TABLE chat_session
    ADD CONSTRAINT chat_session_studio_requires_project
        CHECK (session_kind NOT IN ('design', 'dev') OR project_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_chat_session_dev_project
    ON chat_session (project_id, updated_at DESC)
    WHERE session_kind = 'dev';

CREATE INDEX IF NOT EXISTS idx_chat_session_dev_workspace
    ON chat_session (workspace_id, creator_id, updated_at DESC)
    WHERE session_kind = 'dev';
