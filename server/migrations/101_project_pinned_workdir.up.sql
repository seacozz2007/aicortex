ALTER TABLE project
    ADD COLUMN IF NOT EXISTS pinned_workdir BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN project.pinned_workdir IS
    'When true, agent tasks in this project reuse a fixed workdir per agent with auto git sync.';
