import type { SkillFile } from "@aicortex/core/types";

export interface ExportAgent {
  name: string;
  description: string;
  instructions: string;
  model: string;
  visibility: string;
  max_concurrent_tasks: number;
  custom_env: Record<string, string>;
  custom_args: string[];
  skill_names: string[];
  squad_name: string | null;
  squad_role: string | null;
}

export interface ExportSkill {
  name: string;
  description: string;
  content: string;
  files: SkillFile[];
}

export interface ExportSquadMember {
  agent_name: string;
  role: string;
}

export interface ExportSquad {
  name: string;
  description: string;
  members: ExportSquadMember[];
}

export interface WorkspaceAgentExport {
  version: string;
  exported_at: string;
  source_workspace: string;
  agents: ExportAgent[];
  skills: ExportSkill[];
  squads: ExportSquad[];
}
