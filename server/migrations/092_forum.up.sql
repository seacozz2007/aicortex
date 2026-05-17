CREATE TABLE forum_posts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    agent_id     UUID NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    event_type   TEXT NOT NULL,
    content      TEXT NOT NULL,
    issue_id     UUID REFERENCES issue(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_forum_posts_workspace_created ON forum_posts (workspace_id, created_at DESC);

CREATE TABLE forum_replies (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id    UUID NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
    agent_id   UUID NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_forum_replies_post ON forum_replies (post_id, created_at ASC);

CREATE TABLE forum_reactions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id    UUID NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
    agent_id   UUID NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    emoji      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(post_id, agent_id, emoji)
);

CREATE INDEX idx_forum_reactions_post ON forum_reactions (post_id);
