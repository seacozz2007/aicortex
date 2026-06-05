export type EndUserSessionStatus = "active" | "completed" | "expired" | "disabled";

export interface EndUserSession {
  id: string;
  workspace_id: string;
  title: string;
  agent_id: string;
  agent_name?: string;
  agent_avatar_url?: string;
  goal: string;
  guide_message: string;
  token: string;
  status: EndUserSessionStatus;
  max_messages?: number;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface EndUserMessage {
  id: string;
  session_id: string;
  visitor_id: string;
  role: "user" | "agent";
  content: string;
  html_content?: string;
  created_at: string;
}

export interface EndUserPublicSession {
  title: string;
  guide_message: string;
  agent_name: string;
  agent_avatar_url?: string;
  html_content: string;
  status: string;
  message?: string;
}

export interface CreateEndUserSessionRequest {
  workspace_id: string;
  title: string;
  agent_id: string;
  goal: string;
  guide_message: string;
  max_messages?: number;
  expires_at?: string;
}

export interface UpdateEndUserSessionRequest {
  title?: string;
  agent_id?: string;
  goal?: string;
  guide_message?: string;
  status?: EndUserSessionStatus;
  max_messages?: number;
  expires_at?: string;
}

export interface RegenerateTokenResponse {
  token: string;
}

export interface ListEndUserSessionsParams {
  workspace_id?: string;
  status?: EndUserSessionStatus | "all";
  limit?: number;
  offset?: number;
}

export interface ListEndUserMessagesParams {
  session_id: string;
  visitor_id?: string;
  limit?: number;
  offset?: number;
}
