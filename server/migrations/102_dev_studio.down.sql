DROP INDEX IF EXISTS idx_chat_session_dev_workspace;
DROP INDEX IF EXISTS idx_chat_session_dev_project;

ALTER TABLE chat_session DROP CONSTRAINT IF EXISTS chat_session_studio_requires_project;
ALTER TABLE chat_session
    ADD CONSTRAINT chat_session_design_requires_project
        CHECK (session_kind <> 'design' OR project_id IS NOT NULL);

ALTER TABLE chat_session DROP CONSTRAINT IF EXISTS chat_session_session_kind_check;
ALTER TABLE chat_session
    ADD CONSTRAINT chat_session_session_kind_check
        CHECK (session_kind IN ('chat', 'design'));

ALTER TABLE workspace DROP COLUMN IF EXISTS default_dev_agent_id;
