DROP INDEX IF EXISTS idx_terminal_sessions_chat_lookup;
DROP INDEX IF EXISTS idx_terminal_sessions_chat_scope;

ALTER TABLE terminal_sessions
    DROP COLUMN IF EXISTS bootstrapped,
    DROP COLUMN IF EXISTS scope,
    DROP COLUMN IF EXISTS chat_session_id;
