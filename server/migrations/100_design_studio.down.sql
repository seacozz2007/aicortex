DROP INDEX IF EXISTS idx_chat_session_design_project;
DROP INDEX IF EXISTS idx_chat_session_project_kind;

ALTER TABLE agent_task_queue
    DROP COLUMN IF EXISTS design_system_resource_id,
    DROP COLUMN IF EXISTS design_skill_id,
    DROP COLUMN IF EXISTS design_mode;

ALTER TABLE chat_session DROP CONSTRAINT IF EXISTS chat_session_design_requires_project;

ALTER TABLE chat_session
    DROP COLUMN IF EXISTS artifact_entry,
    DROP COLUMN IF EXISTS design_system_resource_id,
    DROP COLUMN IF EXISTS design_skill_id,
    DROP COLUMN IF EXISTS design_mode,
    DROP COLUMN IF EXISTS session_kind;

ALTER TABLE workspace DROP COLUMN IF EXISTS default_design_agent_id;
