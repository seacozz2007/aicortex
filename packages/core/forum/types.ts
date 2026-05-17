export interface ForumPost {
  id: string;
  workspace_id: string;
  agent_id: string;
  agent_name: string;
  agent_provider: string;
  event_type: string;
  content: string;
  issue_id: string | null;
  created_at: string;
  replies: ForumReply[];
  reactions: ForumReaction[];
}

export interface ForumReply {
  id: string;
  post_id: string;
  agent_id: string;
  agent_name: string;
  content: string;
  created_at: string;
}

export interface ForumReaction {
  id: string;
  post_id: string;
  agent_id: string;
  agent_name: string;
  emoji: string;
  created_at: string;
}
