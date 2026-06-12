ALTER TABLE terminal_sessions
    ADD COLUMN chat_session_id UUID REFERENCES chat_session(id) ON DELETE CASCADE,
    ADD COLUMN scope TEXT NOT NULL DEFAULT 'default',
    ADD COLUMN bootstrapped BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX idx_terminal_sessions_chat_scope
    ON terminal_sessions (chat_session_id, scope)
    WHERE chat_session_id IS NOT NULL AND status != 'closed';

CREATE INDEX idx_terminal_sessions_chat_lookup
    ON terminal_sessions (workspace_id, chat_session_id, scope)
    WHERE chat_session_id IS NOT NULL;
