"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@aicortex/ui/components/ui/button";
import { Input } from "@aicortex/ui/components/ui/input";
import { Label } from "@aicortex/ui/components/ui/label";
import { Textarea } from "@aicortex/ui/components/ui/textarea";
import { Checkbox } from "@aicortex/ui/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@aicortex/ui/components/ui/select";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@aicortex/ui/components/ui/dialog";
import { toast } from "sonner";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { agentListOptions } from "@aicortex/core/workspace/queries";
import { useCreateEndUserSession, useUpdateEndUserSession } from "@aicortex/core/enduser/mutations";
import type { EndUserSession } from "@aicortex/core/types";
import { useT } from "../i18n";

interface CreateEditEndUserModalProps {
  open: boolean;
  session?: EndUserSession;
  onClose: () => void;
  onSuccess: (session: EndUserSession) => void;
}

export function CreateEditEndUserModal({ open, session, onClose, onSuccess }: CreateEditEndUserModalProps) {
  const { t } = useT("enduser");
  const wsId = useWorkspaceId();
  const isEditing = !!session;

  const { data: agents } = useQuery(agentListOptions(wsId));
  const agentList = agents ?? [];
  const createMutation = useCreateEndUserSession();
  const updateMutation = useUpdateEndUserSession();

  const [title, setTitle] = useState("");
  const [agentId, setAgentId] = useState("");
  const [goal, setGoal] = useState("");
  const [guideMessage, setGuideMessage] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [neverExpire, setNeverExpire] = useState(false);
  const [maxMessages, setMaxMessages] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (session) {
        setTitle(session.title);
        setAgentId(session.agent_id);
        setGoal(session.goal);
        setGuideMessage(session.guide_message);
        setExpiresAt(session.expires_at ? session.expires_at.slice(0, 16) : "");
        setNeverExpire(!session.expires_at);
        setMaxMessages(session.max_messages ? String(session.max_messages) : "");
      } else {
        setTitle("");
        setAgentId("");
        setGoal("");
        setGuideMessage("");
        setExpiresAt("");
        setNeverExpire(false);
        setMaxMessages("");
      }
    }
  }, [open, session]);

  const handleSave = async () => {
    if (!title.trim() || !agentId || !goal.trim() || !guideMessage.trim()) return;
    setSaving(true);
    try {
      const payload = {
        workspace_id: workspace?.id ?? wsId,
        title: title.trim(),
        agent_id: agentId,
        goal: goal.trim(),
        guide_message: guideMessage.trim(),
        expires_at: neverExpire ? undefined : expiresAt || undefined,
        max_messages: maxMessages ? Number(maxMessages) : undefined,
      };

      if (isEditing) {
        const result = await updateMutation.mutateAsync({ id: session!.id, ...payload });
        toast.success(t(($) => $.toast.session_updated));
        onSuccess(result);
      } else {
        const result = await createMutation.mutateAsync(payload);
        toast.success(t(($) => $.toast.session_created));
        onSuccess(result);
      }
    } catch {
      toast.error(isEditing ? t(($) => $.toast.error_update) : t(($) => $.toast.error_create));
    } finally {
      setSaving(false);
    }
  };

  const workspace = { id: wsId } as { id: string };
  const isValid = title.trim() && agentId && goal.trim() && guideMessage.trim();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogHeader>
        <DialogTitle>{isEditing ? t(($) => $.create_modal.title_edit) : t(($) => $.create_modal.title_create)}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t(($) => $.create_modal.title_label)}</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t(($) => $.create_modal.title_placeholder)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t(($) => $.create_modal.agent_label)}</Label>
          <Select value={agentId} onValueChange={(v) => setAgentId(v ?? "")}>
            <SelectTrigger>
              <span>{agentId ? agentList.find((a) => a.id === agentId)?.name ?? agentId : t(($) => $.create_modal.agent_placeholder)}</span>
            </SelectTrigger>
            <SelectContent>
              {agentList.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t(($) => $.create_modal.goal_label)}</Label>
          <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={t(($) => $.create_modal.goal_placeholder)} rows={3} />
        </div>
        <div className="space-y-1.5">
          <Label>{t(($) => $.create_modal.guide_label)}</Label>
          <Textarea value={guideMessage} onChange={(e) => setGuideMessage(e.target.value)} placeholder={t(($) => $.create_modal.guide_placeholder)} rows={3} />
        </div>
        <div className="space-y-1.5">
          <Label>{t(($) => $.create_modal.expires_label)}</Label>
          <div className="flex items-center gap-2">
            <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} disabled={neverExpire} className="flex-1" />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
              <Checkbox checked={neverExpire} onCheckedChange={(c) => { setNeverExpire(!!c); if (c) setExpiresAt(""); }} />
              {t(($) => $.create_modal.never_expire)}
            </label>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t(($) => $.create_modal.max_messages_label)}</Label>
          <Input type="number" value={maxMessages} onChange={(e) => setMaxMessages(e.target.value)} placeholder="0 = unlimited" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>{t(($) => $.create_modal.close)}</Button>
        <Button size="sm" onClick={handleSave} disabled={!isValid || saving}>
          {saving ? t(($) => $.create_modal.saving) : t(($) => $.create_modal.save)}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
