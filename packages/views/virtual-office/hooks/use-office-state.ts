"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspacePresenceMap } from "@aicortex/core/agents/use-agent-presence";
import { agentListOptions, squadListOptions } from "@aicortex/core/workspace/queries";
import type { AgentPresenceDetail } from "@aicortex/core/agents";
import type { Agent, Squad } from "@aicortex/core/types";
import {
  DESKS,
  LOUNGE_SPOTS,
  MEETING_SPOTS,
  OUTSIDE,
  AGENT_COLORS,
  type Position,
  type ZoneId,
} from "../constants";

export interface OfficeAgent {
  id: string;
  name: string;
  color: string;
  zone: ZoneId;
  target: Position;
  presence: AgentPresenceDetail;
}

export interface OfficeState {
  agents: OfficeAgent[];
  loading: boolean;
}

/**
 * Derives office scene state from workspace presence data.
 * Maps each agent to a zone + position based on availability/workload.
 */
export function useOfficeState(wsId: string | undefined): OfficeState {
  const { byAgent, loading: presenceLoading } = useWorkspacePresenceMap(wsId);
  const { data: agents = [], isPending: agentsPending } = useQuery({
    ...agentListOptions(wsId ?? ""),
    enabled: !!wsId,
  });
  const { data: squads = [] } = useQuery({
    ...squadListOptions(wsId ?? ""),
    enabled: !!wsId,
  });

  const officeAgents = useMemo(() => {
    if (!agents.length) return [];

    // Detect meeting heuristic: leader working + ≥2 members queued
    const meetingAgentIds = detectMeetingAgents(agents, squads, byAgent);

    let deskSlot = 0;
    let loungeSlot = 0;
    let meetingSlot = 0;

    return agents
      .filter((a) => !a.archived_at)
      .map((agent, idx): OfficeAgent => {
        const presence = byAgent.get(agent.id) ?? {
          availability: "offline" as const,
          workload: "idle" as const,
          runningCount: 0,
          queuedCount: 0,
          capacity: 0,
        };

        const zone = resolveZone(agent.id, presence, meetingAgentIds);
        let target: Position;

        switch (zone) {
          case "desks": {
            const slot = deskSlot++ % DESKS.length;
            target = { x: DESKS[slot]!.x, y: DESKS[slot]!.y + 22 };
            break;
          }
          case "lounge": {
            const slot = loungeSlot++ % LOUNGE_SPOTS.length;
            target = LOUNGE_SPOTS[slot]!;
            break;
          }
          case "meeting": {
            const slot = meetingSlot++ % MEETING_SPOTS.length;
            target = MEETING_SPOTS[slot]!;
            break;
          }
          default:
            target = OUTSIDE;
        }

        return {
          id: agent.id,
          name: agent.name,
          color: AGENT_COLORS[idx % AGENT_COLORS.length]!,
          zone,
          target,
          presence,
        };
      });
  }, [agents, squads, byAgent]);

  return {
    agents: officeAgents,
    loading: presenceLoading || agentsPending,
  };
}

function resolveZone(
  agentId: string,
  presence: AgentPresenceDetail,
  meetingAgentIds: Set<string>,
): ZoneId {
  if (presence.availability === "offline") return "outside";
  if (meetingAgentIds.has(agentId)) return "meeting";
  if (presence.workload === "working") return "desks";
  if (presence.workload === "queued") return "desks";
  return "lounge";
}

/**
 * Heuristic: if a squad leader is working and ≥2 members are queued,
 * treat them as in a meeting.
 */
function detectMeetingAgents(
  agents: readonly Agent[],
  squads: readonly Squad[],
  presenceMap: Map<string, AgentPresenceDetail>,
): Set<string> {
  const ids = new Set<string>();
  const agentIds = new Set(agents.map((a) => a.id));

  for (const squad of squads) {
    if (!agentIds.has(squad.leader_id)) continue;
    const leaderPresence = presenceMap.get(squad.leader_id);
    if (!leaderPresence || leaderPresence.workload !== "working") continue;

    // Find squad members that are agents and queued
    const queuedMembers = agents.filter(
      (a) =>
        a.id !== squad.leader_id &&
        presenceMap.get(a.id)?.workload === "queued",
    );

    if (queuedMembers.length >= 2) {
      ids.add(squad.leader_id);
      for (const m of queuedMembers.slice(0, 5)) ids.add(m.id);
    }
  }
  return ids;
}
