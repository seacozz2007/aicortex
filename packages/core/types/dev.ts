import type { ChatSession } from "./chat";

export interface DevSession extends ChatSession {
  session_kind: "dev";
  project_id: string;
  last_task_id?: string;
}

export interface CreateDevSessionRequest {
  title?: string;
  brief?: string;
  agent_id?: string;
}

export interface DevSettings {
  default_dev_agent_id?: string;
}
