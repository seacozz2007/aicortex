-- blocked_by_ids stores the list of issue IDs that block this issue.
-- When all blocking issues reach a terminal state (done/in_review/cancelled),
-- the cascade trigger unblocks this issue (blocked -> todo).
ALTER TABLE issue
    ADD COLUMN blocked_by_ids UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX idx_issue_blocked_by_ids ON issue USING GIN (blocked_by_ids);
