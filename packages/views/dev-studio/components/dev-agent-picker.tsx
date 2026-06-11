"use client";

import { Check, ChevronDown } from "lucide-react";
import type { Agent } from "@aicortex/core/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aicortex/ui/components/ui/dropdown-menu";
import { ActorAvatar } from "../../common/actor-avatar";
import { useT } from "../../i18n";

export function DevAgentPicker({
  agents,
  selectedAgent,
  onSelect,
  disabled,
  size = "sm",
}: {
  agents: Agent[];
  selectedAgent: Agent | null;
  onSelect: (agent: Agent) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const { t } = useT("dev-studio");
  const avatarSize = size === "md" ? 20 : 16;

  if (agents.length === 0) {
    return (
      <span className="text-xs text-destructive">{t(($) => $.shell.no_dev_agent)}</span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className="inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50 aria-expanded:bg-accent aria-expanded:text-foreground"
      >
        {selectedAgent ? (
          <>
            <ActorAvatar
              actorType="agent"
              actorId={selectedAgent.id}
              size={avatarSize}
              showStatusDot
            />
            <span className="max-w-[120px] truncate">{selectedAgent.name}</span>
          </>
        ) : (
          <span>{t(($) => $.hub.select_agent)}</span>
        )}
        <ChevronDown className="size-3 shrink-0 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="max-h-60 w-auto max-w-56">
        <DropdownMenuGroup>
          {agents.map((agent) => (
            <DropdownMenuItem
              key={agent.id}
              onClick={() => onSelect(agent)}
              className="flex items-center gap-2"
            >
              <ActorAvatar actorType="agent" actorId={agent.id} size={20} showStatusDot />
              <span className="min-w-0 flex-1 truncate text-sm">{agent.name}</span>
              {agent.id === selectedAgent?.id && (
                <Check className="size-3.5 shrink-0 text-brand" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
