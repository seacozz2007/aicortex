-- Add optional project_id to chat_session so users can associate a chat
-- with a project. When set, the daemon uses the project's resources
-- (local_path or github_repo) to determine the working directory.
ALTER TABLE chat_session ADD COLUMN project_id UUID REFERENCES project(id) ON DELETE SET NULL;
