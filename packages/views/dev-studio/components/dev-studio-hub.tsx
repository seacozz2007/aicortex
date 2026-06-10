"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, Send, Terminal } from "lucide-react";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { useWorkspacePaths } from "@aicortex/core/paths";
import { projectDetailOptions } from "@aicortex/core/projects/queries";
import { agentListOptions, memberListOptions } from "@aicortex/core/workspace/queries";
import { api } from "@aicortex/core/api";
import { useCreateChatSession } from "@aicortex/core/chat/mutations";
import { useAuthStore } from "@aicortex/core/auth";
import { canAssignAgent } from "@aicortex/views/issues/components";
import { Button } from "@aicortex/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aicortex/ui/components/ui/dropdown-menu";
import { AppLink, useNavigation } from "../../navigation";
import { ActorAvatar } from "../../common/actor-avatar";
import { useT } from "../../i18n";

export function DevStudioHub({ projectId }: { projectId: string }) {
  const { t } = useT("dev-studio");
  const wsId = useWorkspaceId();
  const p = useWorkspacePaths();
  const user = useAuthStore((s) => s.user);
  const { push } = useNavigation();

  const { data: project } = useQuery(projectDetailOptions(wsId, projectId));
  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const { data: members = [] } = useQuery(memberListOptions(wsId));

  const createSession = useCreateChatSession();

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [brief, setBrief] = useState("");
  const [creating, setCreating] = useState(false);

  const currentMember = members.find((m) => m.user_id === user?.id);

  const availableAgents = agents.filter(
    (a) =>
      !a.archived_at &&
      canAssignAgent(a, user?.id, currentMember?.role),
  );

  const selectedAgent = availableAgents.find((a) => a.id === selectedAgentId) ?? null;

  const canSubmit = Boolean(brief.trim() && selectedAgent);

  async function handleStart() {
    if (!canSubmit || creating || createSession.isPending) return;
    setCreating(true);
    try {
      const session = await createSession.mutateAsync({
        agent_id: selectedAgent!.id,
        title: brief.trim().slice(0, 80),
        project_id: projectId,
      });
      await api.sendChatMessage(session.id, brief.trim());
      push(p.projectDevSession(projectId, session.id));
    } finally {
      setCreating(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleStart();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b px-6 py-3">
        <AppLink
          href={p.projectDetail(projectId)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {project?.title ?? projectId}
        </AppLink>
        <span className="ml-auto text-sm text-muted-foreground">
          <AppLink
            href={p.projectDetail(projectId)}
            className="hover:text-foreground"
          >
            {t(($) => $.hub.back_to_project)}
          </AppLink>
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-6 py-12">
        <div className="mb-8 text-center">
          <div className="relative mb-4 inline-flex items-center justify-center">
            <span className="absolute right-[calc(100%+8px)] flex size-[26px] items-center justify-center rounded-full border bg-card">
              <Terminal className="size-3.5 text-brand" />
            </span>
            <span className="font-serif text-base font-semibold">{t(($) => $.hub.brand_name)}</span>
          </div>
          <h1 className="font-serif text-[28px] font-semibold tracking-tight text-foreground">
            {t(($) => $.hub.hero_title)}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(($) => $.hub.hero_subtitle)}
          </p>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm">
          <textarea
            className="min-h-[120px] w-full resize-none rounded-t-2xl bg-transparent px-5 py-4 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t(($) => $.hub.composer_placeholder)}
          />
          <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2.5">
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex max-w-[200px] items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent">
                {selectedAgent ? (
                  <>
                    <ActorAvatar actorType="agent" actorId={selectedAgent.id} size={16} showStatusDot />
                    <span className="truncate">{selectedAgent.name}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">{t(($) => $.hub.select_agent)}</span>
                )}
                <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-60 w-auto max-w-56">
                <DropdownMenuGroup>
                  {availableAgents.map((agent) => (
                    <DropdownMenuItem
                      key={agent.id}
                      onClick={() => setSelectedAgentId(agent.id)}
                      className="flex items-center gap-2"
                    >
                      <ActorAvatar actorType="agent" actorId={agent.id} size={18} showStatusDot />
                      <span className="truncate flex-1 text-sm">{agent.name}</span>
                      {agent.id === selectedAgentId && (
                        <Check className="size-3.5 text-brand shrink-0" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="ml-auto">
              <Button
                type="button"
                size="sm"
                disabled={!canSubmit || creating || createSession.isPending}
                onClick={() => void handleStart()}
                className="rounded-full px-4"
              >
                <Send className="size-3.5" />
                {t(($) => $.hub.start_session)}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
