"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@aicortex/ui/components/ui/dialog";
import { Button } from "@aicortex/ui/components/ui/button";
import { Input } from "@aicortex/ui/components/ui/input";
import { Label } from "@aicortex/ui/components/ui/label";
import { Textarea } from "@aicortex/ui/components/ui/textarea";
import { Switch } from "@aicortex/ui/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aicortex/ui/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { agentListOptions } from "@aicortex/core/workspace/queries";
import {
  useCreateChatShareLink,
  useUpdateChatShareLink,
} from "@aicortex/core/chat-share";
import type { ChatShareLink, Agent } from "@aicortex/core/types";
import { useT } from "../i18n";

interface CreateEditChatShareModalProps {
  open: boolean;
  link?: ChatShareLink;
  onClose: () => void;
}

export function CreateEditChatShareModal({
  open,
  link,
  onClose,
}: CreateEditChatShareModalProps) {
  const { t } = useT("chat-share");
  const wsId = useWorkspaceId();
  const isEditing = !!link;

  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const availableAgents = useMemo(
    () => agents.filter((a: Agent) => !a.archived_at),
    [agents],
  );

  const createMutation = useCreateChatShareLink();
  const updateMutation = useUpdateChatShareLink();

  // Use null for empty — Base UI Select shows raw value when given ""
  const [agentId, setAgentId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [guideMessage, setGuideMessage] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [neverExpire, setNeverExpire] = useState(true);
  const [maxUses, setMaxUses] = useState("");
  const [allowNewSessions, setAllowNewSessions] = useState(true);
  const [saving, setSaving] = useState(false);

  // Compute selected agent name for display fallback
  const selectedAgentName = useMemo(
    () => availableAgents.find((a) => a.id === agentId)?.name,
    [availableAgents, agentId],
  );

  useEffect(() => {
    if (!open) return;
    if (link) {
      setTitle(link.title);
      setAgentId(link.agent_id);
      setGuideMessage(link.guide_message);
      setExpiresAt(link.expires_at ? link.expires_at.slice(0, 16) : "");
      setNeverExpire(!link.expires_at);
      setMaxUses(link.max_uses != null ? String(link.max_uses) : "");
      setAllowNewSessions(link.allow_new_sessions);
    } else {
      setTitle("");
      setAgentId(availableAgents[0]?.id ?? null);
      setGuideMessage("");
      setExpiresAt("");
      setNeverExpire(true);
      setMaxUses("");
      setAllowNewSessions(true);
    }
  }, [open, link, availableAgents]);

  const handleSubmit = async () => {
    if (!title.trim() || !agentId) return;
    setSaving(true);
    try {
      const payload = {
        agent_id: agentId,
        title: title.trim(),
        guide_message: guideMessage.trim() || undefined,
        expires_at: neverExpire ? undefined : new Date(expiresAt).toISOString(),
        max_uses: maxUses ? parseInt(maxUses, 10) : undefined,
        allow_new_sessions: allowNewSessions,
      };

      if (isEditing) {
        await updateMutation.mutateAsync({ id: link!.id, ...payload });
        toast.success(t(($) => $.management.form.update_success));
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(t(($) => $.management.form.create_success));
      }
      onClose();
    } catch {
      // Error handled by mutation
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t(($) => $.management.edit) : t(($) => $.management.create)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Agent */}
          <div className="space-y-1.5">
            <Label>{t(($) => $.management.form.agent_label)}</Label>
            <Select
              value={agentId}
              onValueChange={(v) => setAgentId(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t(($) => $.management.form.agent_placeholder)}>
                  {selectedAgentName}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableAgents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label>{t(($) => $.management.form.title_label)}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t(($) => $.management.form.title_placeholder)}
            />
          </div>

          {/* Guide Message */}
          <div className="space-y-1.5">
            <Label>{t(($) => $.management.form.guide_message_label)}</Label>
            <Textarea
              value={guideMessage}
              onChange={(e) => setGuideMessage(e.target.value)}
              placeholder={t(($) => $.management.form.guide_message_placeholder)}
              rows={3}
            />
          </div>

          {/* Expires At */}
          <div className="space-y-1.5">
            <Label>{t(($) => $.management.form.expires_label)}</Label>
            <div className="flex items-center gap-3">
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                disabled={neverExpire}
                className="flex-1"
              />
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <Switch checked={neverExpire} onCheckedChange={setNeverExpire} />
                {t(($) => $.management.form.never_expire)}
              </label>
            </div>
          </div>

          {/* Max Uses */}
          <div className="space-y-1.5">
            <Label>{t(($) => $.management.form.max_uses_label)}</Label>
            <Input
              type="number"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder={t(($) => $.management.form.max_uses_placeholder)}
              min={1}
            />
          </div>

          {/* Allow New Sessions */}
          <div className="flex items-center justify-between">
            <div>
              <Label>{t(($) => $.management.form.allow_new_sessions_label)}</Label>
              <p className="text-xs text-muted-foreground">
                {t(($) => $.management.form.allow_new_sessions_description)}
              </p>
            </div>
            <Switch checked={allowNewSessions} onCheckedChange={setAllowNewSessions} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !title.trim() || !agentId}>
            {isEditing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
