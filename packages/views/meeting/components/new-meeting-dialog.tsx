"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@aicortex/core/hooks";
import {
  memberListOptions,
  agentListOptions,
} from "@aicortex/core/workspace/queries";
import { labelListOptions } from "@aicortex/core/labels/queries";
import { useCreateIssue } from "@aicortex/core/issues/mutations";
import { api } from "@aicortex/core/api";
import { useNavigation } from "../../navigation";
import { useWorkspacePaths } from "@aicortex/core/paths";
import {
  DialogContent,
  DialogTitle,
} from "@aicortex/ui/components/ui/dialog";
import { Button } from "@aicortex/ui/components/ui/button";
import { Checkbox } from "@aicortex/ui/components/ui/checkbox";
import { toast } from "sonner";
import { X, Bot, Check, Loader2 } from "lucide-react";
import { cn } from "@aicortex/ui/lib/utils";
import type { Label } from "@aicortex/core/types";
import { ActorAvatar } from "../../common/actor-avatar";

// ---------------------------------------------------------------------------
// NewMeetingDialog
// ---------------------------------------------------------------------------

export function NewMeetingDialog({ onClose }: { onClose: () => void }) {
  const wsId = useWorkspaceId();
  const paths = useWorkspacePaths();
  const navigation = useNavigation();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState(
    "你是一名会议主持人。使用Issue作为会议容器，通过以下流程组织多Agent讨论：\n"
      + "\n"
      + "发言令牌 → 每次 @mention 一个Agent，其发言后改assignee归还\n"
      + "状态跟踪 → description 维护状态表（角色|状态|摘要），每轮更新\n"
      + "超时熔断 → 各阶段设超时，超时强制推进下一阶段\n"
      + "上下文裁剪 → 每轮结束更新摘要到description顶部，标注共识与已排除项\n"
      + "\n"
      + "三阶段：\n"
      + "1. 轮流发言 — @mention 逐个发言，每人围绕议题发表看法\n"
      + "2. 自由讨论 — 互相评论补充，最多2轮\n"
      + "3. 总结产出 — 纪要+行动项+知识结晶",
  );
  const [hostType, setHostType] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [participantIds, setParticipantIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [hostOpen, setHostOpen] = useState(false);

  // Data
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const { data: labels = [] } = useQuery({
    ...labelListOptions(wsId),
    enabled: !!wsId,
  });

  const createIssueMutation = useCreateIssue();

  // Filter for non-archived agents
  const activeAgents = agents.filter((a) => !a.archived_at);

  // All selectable actors for host
  const hostOptions = [
    ...members.map((m) => ({
      type: "member" as const,
      id: m.user_id,
      name: m.name,
    })),
    ...activeAgents.map((a) => ({
      type: "agent" as const,
      id: a.id,
      name: a.name,
    })),
  ];

  const selectedHost = hostOptions.find((o) => o.id === hostId && o.type === hostType);
  const isMemberParticipant = (userId: string) => participantIds.has(userId);
  const isAgentParticipant = (agentId: string) => participantIds.has(agentId);

  const toggleParticipant = (id: string) => {
    setParticipantIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);

    try {
      // Find the meeting label
      const meetingLabel = labels.find(
        (l: Label) => l.name.toLowerCase() === "meeting",
      );
      if (!meetingLabel) {
        toast.error("Meeting label not found. Please create a 'meeting' label first.");
        setSubmitting(false);
        return;
      }

      const issue = await createIssueMutation.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        status: "todo",
        assignee_type: hostType as "member" | "agent" | undefined,
        assignee_id: hostId ?? undefined,
      });

      // Attach meeting label
      await api.attachLabel(issue.id, meetingLabel.id);

      toast.success(`Meeting "${issue.title}" created`);
      onClose();
      navigation.push(paths.meetingDetail(issue.id));
    } catch {
      toast.error("Failed to create meeting");
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = title.trim().length > 0 && hostId !== null;

  // Selected participant names for chips
  const selectedParticipants = [
    ...members
      .filter((m) => participantIds.has(m.user_id))
      .map((m) => ({ type: "member" as const, id: m.user_id, name: m.name })),
    ...activeAgents
      .filter((a) => participantIds.has(a.id))
      .map((a) => ({ type: "agent" as const, id: a.id, name: a.name })),
  ];

  return (
    <DialogContent
      finalFocus={false}
      showCloseButton={false}
      className="sm:max-w-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-2">
        <DialogTitle className="text-base font-semibold">New Meeting</DialogTitle>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm p-1 opacity-70 hover:opacity-100 hover:bg-accent/60 transition-all cursor-pointer"
        >
          <X className="size-4" />
        </button>
      </div>
      {/* Form */}
      <div className="space-y-4 px-6 pb-2">
        {/* Title */}
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">
            Meeting subject <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Sprint Planning"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            autoFocus
          />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">
            Description
          </label>
          <textarea
            placeholder="Meeting agenda, goals, notes..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        {/* Host */}
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">
            Host <span className="text-destructive">*</span>
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setHostOpen(!hostOpen)}
              className={cn(
                "flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-foreground hover:bg-accent/50",
                !selectedHost && "text-muted-foreground",
              )}
            >
              {selectedHost ? (
                <>
                  <ActorAvatar
                    actorType={selectedHost.type}
                    actorId={selectedHost.id}
                    size={16}
                  />
                  <span>{selectedHost.name}</span>
                </>
              ) : (
                "Select meeting host..."
              )}
            </button>
            {hostOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setHostOpen(false)}
                />
                <div className="absolute top-full left-0 z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-popover shadow-lg">
                  {/* Members section */}
                  {members.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Members
                      </div>
                      {members.map((m) => (
                        <button
                          key={`member-${m.user_id}`}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent",
                            hostType === "member" && hostId === m.user_id && "bg-accent/60 font-medium",
                          )}
                          onClick={() => {
                            setHostType("member");
                            setHostId(m.user_id);
                            setHostOpen(false);
                          }}
                        >
                          <ActorAvatar actorType="member" actorId={m.user_id} size={16} />
                          {m.name}
                          {hostType === "member" && hostId === m.user_id && (
                            <Check className="ml-auto size-3.5 text-brand" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Agents section */}
                  {activeAgents.length > 0 && (
                    <div>
                      <div className="border-t border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Agents
                      </div>
                      {activeAgents.map((a) => (
                        <button
                          key={`agent-${a.id}`}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent",
                            hostType === "agent" && hostId === a.id && "bg-accent/60 font-medium",
                          )}
                          onClick={() => {
                            setHostType("agent");
                            setHostId(a.id);
                            setHostOpen(false);
                          }}
                        >
                          <ActorAvatar actorType="agent" actorId={a.id} size={16} />
                          {a.name}
                          {hostType === "agent" && hostId === a.id && (
                            <Check className="ml-auto size-3.5 text-brand" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Participants */}
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">
            Participants
          </label>

          {/* Selected chips */}
          {selectedParticipants.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {selectedParticipants.map((p) => (
                <span
                  key={`${p.type}-${p.id}`}
                  className="inline-flex items-center gap-1 rounded-full border bg-accent/30 px-2 py-0.5 text-xs"
                >
                  <ActorAvatar actorType={p.type} actorId={p.id} size={12} />
                  {p.name}
                  <button
                    type="button"
                    onClick={() => toggleParticipant(p.id)}
                    className="ml-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Participant list */}
          <div className="max-h-36 overflow-y-auto rounded-lg border border-border">
            {/* Members */}
            {members.map((m) => (
              <label
                key={`p-member-${m.user_id}`}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50"
              >
                <Checkbox
                  checked={isMemberParticipant(m.user_id)}
                  onCheckedChange={() => toggleParticipant(m.user_id)}
                />
                <ActorAvatar actorType="member" actorId={m.user_id} size={16} />
                {m.name}
              </label>
            ))}
            {/* Agents */}
            {activeAgents.map((a) => (
              <label
                key={`p-agent-${a.id}`}
                className="flex cursor-pointer items-center gap-2 border-t border-border px-3 py-2 text-sm hover:bg-accent/50"
              >
                <Checkbox
                  checked={isAgentParticipant(a.id)}
                  onCheckedChange={() => toggleParticipant(a.id)}
                />
                <ActorAvatar actorType="agent" actorId={a.id} size={16} />
                <Bot className="size-3 text-purple-500" />
                {a.name}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Participants will be subscribed to the meeting issue.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t px-6 py-3">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={!isValid || submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-1 size-3 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Meeting"
          )}
        </Button>
      </div>
    </DialogContent>
  );
}

export function NewMeetingButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Button size="sm" onClick={onClick}>
      + New Meeting
    </Button>
  );
}
