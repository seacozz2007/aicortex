DROP INDEX IF EXISTS idx_issue_blocked_by_ids;
ALTER TABLE issue
    DROP COLUMN blocked_by_ids;
