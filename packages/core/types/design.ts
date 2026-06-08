import type { ChatSession } from "./chat";

export type DesignMode = "prototype" | "deck" | "template" | "design_system";

export interface DesignSession extends ChatSession {
  session_kind: "design";
  design_mode?: DesignMode;
  design_skill_id?: string;
  design_system_resource_id?: string;
  artifact_entry: string;
}

export interface CreateDesignSessionRequest {
  title?: string;
  design_mode: DesignMode;
  design_skill_id?: string;
  design_system_resource_id?: string;
  artifact_entry?: string;
  brief?: string;
}

export interface DesignExportResponse {
  format: string;
  artifact_entry: string;
  session: DesignSession;
  download_hint: string;
}
