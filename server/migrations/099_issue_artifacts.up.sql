CREATE TABLE issue_artifact (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    issue_id UUID NOT NULL REFERENCES issue(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES agent_task_queue(id) ON DELETE CASCADE,
    runtime_id UUID NOT NULL REFERENCES agent_runtime(id) ON DELETE CASCADE,
    rel_path TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'html' CHECK (kind IN ('html', 'file')),
    title TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (task_id, rel_path)
);

CREATE INDEX idx_issue_artifact_issue ON issue_artifact(issue_id, created_at DESC);
CREATE INDEX idx_issue_artifact_workspace ON issue_artifact(workspace_id);
