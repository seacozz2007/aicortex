import { useCallback, useState } from "react";
import { api } from "@aicortex/core/api";
import type { Agent, Skill } from "@aicortex/core/types";
import { toast } from "sonner";
import { useT } from "../../i18n";
import type { WorkspaceAgentExport } from "../utils/export-schema";

export function useAgentExport(agents: Agent[], sourceWorkspace: string) {
  const { t } = useT("agents");
  const [isExporting, setIsExporting] = useState(false);

  const exportData = useCallback(async () => {
    if (isExporting || agents.length === 0) return;
    setIsExporting(true);

    const loadingToastId = toast.loading(t(($) => $.export.loading));

    try {
      const skillIds = new Set<string>();
      for (const agent of agents) {
        for (const skill of agent.skills) {
          skillIds.add(skill.id);
        }
      }

      // Fetch full skill data for each unique skill
      const skillMap = new Map<string, Skill>();
      if (skillIds.size > 0) {
        const skillResults = await Promise.allSettled(
          Array.from(skillIds).map((id) => api.getSkill(id)),
        );
        for (const result of skillResults) {
          if (result.status === "fulfilled") {
            skillMap.set(result.value.id, result.value);
          }
        }
      }

      // Fetch all squads and members
      const squads = await api.listSquads();
      const squadMemberLists = await Promise.all(
        squads.map((s) =>
          api.listSquadMembers(s.id).catch(() => [] as never),
        ),
      );

      // Build agent_id -> { squadName, role } map
      const agentSquadMap = new Map<
        string,
        { squad_name: string; squad_role: string }
      >();
      for (let i = 0; i < squads.length; i++) {
        const squad = squads[i];
        if (!squad) continue;
        const members = squadMemberLists[i] ?? [];
        for (const member of members) {
          if (member.member_type === "agent") {
            agentSquadMap.set(member.member_id, {
              squad_name: squad.name,
              squad_role: member.role,
            });
          }
        }
      }

      // Collect all skills that are referenced by agents (deduped by name)
      const skillNameSet = new Set<string>();
      const exportSkills: WorkspaceAgentExport["skills"] = [];
      for (const agent of agents) {
        for (const s of agent.skills) {
          if (skillNameSet.has(s.name)) continue;
          skillNameSet.add(s.name);
          const full = skillMap.get(s.id);
          exportSkills.push({
            name: s.name,
            description: s.description,
            content: full?.content ?? "",
            files: full?.files ?? [],
          });
        }
      }

      // Build squad export data
      const agentNameById = new Map(agents.map((a) => [a.id, a.name]));
      const exportSquads: WorkspaceAgentExport["squads"] = [];
      for (let i = 0; i < squads.length; i++) {
        const squad = squads[i];
        if (!squad) continue;
        const members = squadMemberLists[i] ?? [];
        const agentMembers = members
          .filter((m) => m.member_type === "agent")
          .map((m) => ({
            agent_name: agentNameById.get(m.member_id) ?? m.member_id,
            role: m.role,
          }));
        exportSquads.push({
          name: squad.name,
          description: squad.description,
          members: agentMembers,
        });
      }

      // Build agent export data
      const exportAgents: WorkspaceAgentExport["agents"] = agents.map((a) => {
        const squad = agentSquadMap.get(a.id);
        return {
          name: a.name,
          description: a.description,
          instructions: a.instructions,
          model: a.model,
          visibility: a.visibility,
          max_concurrent_tasks: a.max_concurrent_tasks,
          custom_env: a.custom_env,
          custom_args: a.custom_args,
          skill_names: a.skills.map((s) => s.name),
          squad_name: squad?.squad_name ?? null,
          squad_role: squad?.squad_role ?? null,
        };
      });

      const result: WorkspaceAgentExport = {
        version: "1.0",
        exported_at: new Date().toISOString(),
        source_workspace: sourceWorkspace,
        agents: exportAgents,
        skills: exportSkills,
        squads: exportSquads,
      };

      // Trigger browser download
      const blob = new Blob([JSON.stringify(result, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `workspace-agents-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.dismiss(loadingToastId);
      toast.success(
        t(($) => $.export.success, {
          agentCount: exportAgents.length,
          skillCount: exportSkills.length,
          squadCount: exportSquads.length,
        }),
      );
    } catch (err) {
      toast.dismiss(loadingToastId);
      toast.error(
        err instanceof Error ? err.message : t(($) => $.export.failed),
      );
    } finally {
      setIsExporting(false);
    }
  }, [agents, isExporting, sourceWorkspace, t]);

  return { exportData, isExporting };
}
