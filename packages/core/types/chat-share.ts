/** Configuration for a chat share link (management view). */
export interface ChatShareLink {
  id: string;
  workspace_id: string;
  agent_id: string;
  title: string;
  guide_message: string;
  token: string;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  allow_new_sessions: boolean;
  status: "active" | "disabled";
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Info returned by GET /e/{token} for the public page. */
export interface ChatSharePublicInfo {
  title: string;
  guide_message: string;
  agent_name: string;
  agent_avatar_url: string;
  status: "active" | "expired" | "disabled" | "max_reached" | "invalid";
  allow_new_sessions: boolean;
  /** Present only when status is not "active". */
  message?: string;
}

/** Parameters for creating a share link. */
export interface CreateChatShareLinkParams {
  agent_id: string;
  title: string;
  guide_message?: string;
  expires_at?: string;
  max_uses?: number;
  allow_new_sessions?: boolean;
}

/** Parameters for updating a share link. */
export interface UpdateChatShareLinkParams {
  title?: string;
  guide_message?: string;
  expires_at?: string | null;
  max_uses?: number | null;
  allow_new_sessions?: boolean;
  status?: "active" | "disabled";
}
