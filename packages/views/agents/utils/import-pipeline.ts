import { api } from "@aicortex/core/api";
import type { Agent, AgentVisibility, Skill, Squad } from "@aicortex/core/types";

// ---- JSON import payload types ----

export interface ImportSkill {
  name: string;
  description?: string;
  content?: string;
  config?: Record<string, unknown>;
  files?: { path: string; content: string }[];
}

export interface ImportAgent {
  name: string;
  description?: string;
  instructions?: string;
  visibility?: AgentVisibility;
  model?: string;
  custom_env?: Record<string, string>;
  custom_args?: string[];
  max_concurrent_tasks?: number;
  skill_names?: string[];
}

export interface ImportSquadMember {
  agent_name: string;
  role?: string;
}

export interface ImportSquad {
  name: string;
  description?: string;
  instructions?: string;
  leader_agent_name?: string;
  avatar_url?: string;
  members?: ImportSquadMember[];
}

export interface ImportPayload {
  version: number;
  exported_at?: string;
  skills?: ImportSkill[];
  agents?: ImportAgent[];
  squads?: ImportSquad[];
}

// ---- Result types ----

export interface ImportStepResult {
  name: string;
  success: boolean;
  error?: string;
}

export interface ImportResult {
  skills: { total: number; created: number; skipped: number; failures: ImportStepResult[] };
  agents: { total: number; created: number; failures: ImportStepResult[] };
  squads: { total: number; created: number; failures: ImportStepResult[] };
}

// ---- Validation ----

export interface ValidationError {
  message: string;
}

export function validateImportPayload(data: unknown): { ok: true; payload: ImportPayload } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!data || typeof data !== "object") {
    return { ok: false, errors: [{ message: "Invalid JSON: expected an object" }] };
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.version !== "number") {
    errors.push({ message: "Missing or invalid 'version' field (must be a number)" });
  }

  if ("skills" in obj && obj.skills !== undefined && !Array.isArray(obj.skills)) {
    errors.push({ message: "'skills' must be an array" });
  }

  if ("agents" in obj && obj.agents !== undefined && !Array.isArray(obj.agents)) {
    errors.push({ message: "'agents' must be an array" });
  }

  if ("squads" in obj && obj.squads !== undefined && !Array.isArray(obj.squads)) {
    errors.push({ message: "'squads' must be an array" });
  }

  // Validate individual entries
  if (Array.isArray(obj.skills)) {
    (obj.skills as unknown[]).forEach((s, i) => {
      const skill = s as Record<string, unknown>;
      if (!skill.name || typeof skill.name !== "string") {
        errors.push({ message: `Skill at index ${i}: missing or invalid 'name'` });
      }
    });
  }

  if (Array.isArray(obj.agents)) {
    (obj.agents as unknown[]).forEach((a, i) => {
      const agent = a as Record<string, unknown>;
      if (!agent.name || typeof agent.name !== "string") {
        errors.push({ message: `Agent at index ${i}: missing or invalid 'name'` });
      }
    });
  }

  if (Array.isArray(obj.squads)) {
    (obj.squads as unknown[]).forEach((s, i) => {
      const squad = s as Record<string, unknown>;
      if (!squad.name || typeof squad.name !== "string") {
        errors.push({ message: `Squad at index ${i}: missing or invalid 'name'` });
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, payload: obj as unknown as ImportPayload };
}

// ---- Import pipeline ----

export async function runImportPipeline(
  payload: ImportPayload,
  runtimeId: string,
  existingSkillNames: Set<string>,
  onProgress: (step: string) => void,
): Promise<ImportResult> {
  const result: ImportResult = {
    skills: { total: payload.skills?.length ?? 0, created: 0, skipped: 0, failures: [] },
    agents: { total: payload.agents?.length ?? 0, created: 0, failures: [] },
    squads: { total: payload.squads?.length ?? 0, created: 0, failures: [] },
  };

  // Step 1: Create skills (skip if same name exists)
  const skillNameToId = new Map<string, string>();
  if (payload.skills?.length) {
    onProgress("Creating skills...");
    for (const s of payload.skills) {
      if (existingSkillNames.has(s.name)) {
        result.skills.skipped++;
        continue;
      }
      try {
        const created: Skill = await api.createSkill({
          name: s.name,
          description: s.description,
          content: s.content,
          config: s.config,
          files: s.files,
        });
        skillNameToId.set(s.name, created.id);
        result.skills.created++;
      } catch (err) {
        result.skills.failures.push({
          name: s.name,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  }

  // Step 2: Create agents
  const agentNameToId = new Map<string, string>();
  if (payload.agents?.length) {
    onProgress("Creating agents...");
    for (const a of payload.agents) {
      try {
        const created: Agent = await api.createAgent({
          name: a.name,
          description: a.description,
          instructions: a.instructions,
          visibility: a.visibility,
          model: a.model,
          runtime_id: runtimeId,
          custom_env: a.custom_env,
          custom_args: a.custom_args,
          max_concurrent_tasks: a.max_concurrent_tasks,
        });
        agentNameToId.set(a.name, created.id);
        result.agents.created++;

        // Step 2b: Bind skills to this agent
        if (a.skill_names?.length) {
          const skillIds: string[] = [];
          for (const sn of a.skill_names) {
            const sid = skillNameToId.get(sn);
            if (sid) skillIds.push(sid);
          }
          if (skillIds.length > 0) {
            try {
              await api.setAgentSkills(created.id, { skill_ids: skillIds });
            } catch {
              // Non-fatal: skills can be added later
            }
          }
        }
      } catch (err) {
        result.agents.failures.push({
          name: a.name,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  }

  // Step 3: Create squads
  if (payload.squads?.length) {
    onProgress("Creating squads...");
    for (const s of payload.squads) {
      try {
        const leaderAgentId = s.leader_agent_name
          ? agentNameToId.get(s.leader_agent_name)
          : undefined;

        const createdSquad: Squad = await api.createSquad({
          name: s.name,
          description: s.description,
          leader_id: leaderAgentId ?? "", // backend requires leader_id
          avatar_url: s.avatar_url,
        });
        result.squads.created++;

        // Update squad instructions if provided
        if (s.instructions) {
          try {
            await api.updateSquad(createdSquad.id, { instructions: s.instructions });
          } catch {
            // Non-fatal
          }
        }

        // Add members
        if (s.members?.length) {
          for (const m of s.members) {
            const memberAgentId = agentNameToId.get(m.agent_name);
            if (memberAgentId) {
              try {
                await api.addSquadMember(createdSquad.id, {
                  member_type: "agent",
                  member_id: memberAgentId,
                  role: m.role,
                });
              } catch {
                // Non-fatal: member can be added later
              }
            }
          }
        }
      } catch (err) {
        result.squads.failures.push({
          name: s.name,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  }

  return result;
}
