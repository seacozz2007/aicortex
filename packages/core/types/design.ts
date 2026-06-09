import type { ChatSession } from "./chat";

export type DesignMode = "prototype" | "deck" | "template" | "design_system" | "hyperframes";

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
  design_example_id?: string;
  design_system_resource_id?: string;
  artifact_entry?: string;
  brief?: string;
  continue_from_task_id?: string;
}

export interface DesignExportResponse {
  format: string;
  artifact_entry: string;
  session: DesignSession;
  task_id?: string;
  download_url?: string;
  download_urls?: Record<string, string>;
  download_hint: string;
}

export interface DesignPluginEntry {
  id: string;
  title: string;
  description: string;
  intent: string;
  subcategory?: string;
  mode: DesignMode;
  brief: string;
  artifact_entry?: string;
  preview_path?: string;
}

export interface DesignParameterDef {
  id: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step?: number;
}
