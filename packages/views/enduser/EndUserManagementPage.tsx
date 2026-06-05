"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Plus, Copy, Pencil, Trash2, RefreshCw, MessageSquare, Power, PowerOff } from "lucide-react";
import { Button } from "@aicortex/ui/components/ui/button";
import { Input } from "@aicortex/ui/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@aicortex/ui/components/ui/select";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@aicortex/ui/components/ui/dialog";
import { toast } from "sonner";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { useAuthStore } from "@aicortex/core/auth";
import { memberListOptions } from "@aicortex/core/workspace/queries";
import { endUserSessionsOptions } from "@aicortex/core/enduser/queries";
import { useUpdateEndUserSession, useDeleteEndUserSession, useRegenerateEndUserToken } from "@aicortex/core/enduser/mutations";
import type { EndUserSession, EndUserSessionStatus } from "@aicortex/core/types";
import { CreateEditEndUserModal } from "./CreateEditEndUserModal";
import { EndUserMessageHistoryDialog } from "./EndUserMessageHistoryDialog";
import { useT } from "../i18n";

const STATUS_OPTIONS: (EndUserSessionStatus | "all")[] = ["all", "active", "completed", "expired", "disabled"];

function statusColor(status: EndUserSessionStatus): string {
  switch (status) {
    case "active": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "completed": return "bg-muted text-muted-foreground";
    case "expired": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "disabled": return "bg-destructive/10 text-destructive";
  }
}

export function EndUserManagementPage() {
  const { t } = useT("enduser");
  const wsId = useWorkspaceId();
  const user = useAuthStore((s) => s.user);

  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const { data: sessions = [], isLoading, error } = useQuery(endUserSessionsOptions(wsId));

  const updateMutation = useUpdateEndUserSession();
  const deleteMutation = useDeleteEndUserSession();
  const regenerateMutation = useRegenerateEndUserToken();

  const [statusFilter, setStatusFilter] = useState<EndUserSessionStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<EndUserSession | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EndUserSession | null>(null);
  const [regenerateTarget, setRegenerateTarget] = useState<EndUserSession | null>(null);
  const [messagesTarget, setMessagesTarget] = useState<EndUserSession | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const currentMember = members.find((m) => m.user_id === user?.id) ?? null;
  const canManage = currentMember?.role === "owner" || currentMember?.role === "admin";

  const filtered = sessions
    .filter((s) => statusFilter === "all" || s.status === statusFilter)
    .filter((s) => !search || s.title.toLowerCase().includes(search.toLowerCase()));

  const handleCopyLink = useCallback((token: string) => {
    const url = `${window.location.origin}/e/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success(t(($) => $.toast.link_copied));
    }).catch(() => {
      toast.error(t(($) => $.toast.link_copied));
    });
  }, [t]);

  const handleToggleStatus = useCallback((session: EndUserSession) => {
    const newStatus: EndUserSessionStatus = session.status === "disabled" ? "active" : "disabled";
    updateMutation.mutate({ id: session.id, status: newStatus });
  }, [updateMutation]);

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t(($) => $.toast.session_deleted));
        setDeleteTarget(null);
      },
      onError: () => toast.error(t(($) => $.toast.error_delete)),
    });
  }, [deleteTarget, deleteMutation, t]);

  const handleRegenerate = useCallback(() => {
    if (!regenerateTarget) return;
    regenerateMutation.mutate(regenerateTarget.id, {
      onSuccess: () => {
        toast.success(t(($) => $.toast.token_regenerated));
        setRegenerateTarget(null);
      },
      onError: () => toast.error(t(($) => $.toast.error_regenerate)),
    });
  }, [regenerateTarget, regenerateMutation, t]);

  const handleCreateSuccess = useCallback((session: EndUserSession) => {
    setCreateOpen(false);
    setCreatedUrl(`${window.location.origin}/e/${session.token}`);
    toast.success(t(($) => $.toast.session_created));
  }, [t]);

  if (error) {
    toast.error(t(($) => $.toast.error_load));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t(($) => $.management.title)}</h2>
          <p className="text-xs text-muted-foreground">{t(($) => $.management.description)}</p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t(($) => $.management.create)}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as EndUserSessionStatus | "all")}>
          <SelectTrigger className="w-32">
            <span>{t(($) => $.management[`filter_${statusFilter}`])}</span>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{t(($) => $.management[`filter_${s}`])}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder={t(($) => $.management.search_placeholder)}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48"
        />
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">{t(($) => $.public.loading)}</div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">{t(($) => $.management.empty)}</div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2">{t(($) => $.table.title)}</th>
                <th className="px-3 py-2">{t(($) => $.table.agent)}</th>
                <th className="px-3 py-2">{t(($) => $.table.status)}</th>
                <th className="px-3 py-2">{t(($) => $.table.expires)}</th>
                <th className="px-3 py-2">{t(($) => $.table.created)}</th>
                <th className="px-3 py-2">{t(($) => $.table.actions)}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((session) => (
                <tr key={session.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{session.title}</td>
                  <td className="px-3 py-2 text-muted-foreground">{session.agent_name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(session.status)}`}>
                      {t(($) => $.status[session.status])}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {session.expires_at ? new Date(session.expires_at).toLocaleDateString() : t(($) => $.table.never_expires)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(session.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" title={t(($) => $.table.copy_link)} onClick={() => handleCopyLink(session.token)}>
                        <Link className="h-3.5 w-3.5" />
                      </Button>
                      {canManage && (
                        <>
                          <Button variant="ghost" size="icon" title={t(($) => $.table.edit)} onClick={() => setEditingSession(session)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            title={session.status === "disabled" ? t(($) => $.table.enable) : t(($) => $.table.disable)}
                            onClick={() => handleToggleStatus(session)}
                          >
                            {session.status === "disabled" ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                          </Button>
                          <Button variant="ghost" size="icon" title={t(($) => $.table.regenerate_token)} onClick={() => setRegenerateTarget(session)}>
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" title={t(($) => $.table.view_messages)} onClick={() => setMessagesTarget(session)}>
                            <MessageSquare className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" title={t(($) => $.table.delete)} onClick={() => setDeleteTarget(session)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateEditEndUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={handleCreateSuccess}
      />
      {editingSession && (
        <CreateEditEndUserModal
          open
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onSuccess={() => setEditingSession(null)}
        />
      )}

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogHeader>
          <DialogTitle>{t(($) => $.delete_dialog.title)}</DialogTitle>
          <DialogDescription>
            {t(($) => $.delete_dialog.description, { title: deleteTarget?.title ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
            {t(($) => $.delete_dialog.cancel)}
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteMutation.isPending}>
            {t(($) => $.delete_dialog.confirm)}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!regenerateTarget} onOpenChange={() => setRegenerateTarget(null)}>
        <DialogHeader>
          <DialogTitle>{t(($) => $.regenerate_dialog.title)}</DialogTitle>
          <DialogDescription>
            {t(($) => $.regenerate_dialog.description, { title: regenerateTarget?.title ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setRegenerateTarget(null)}>
            {t(($) => $.regenerate_dialog.cancel)}
          </Button>
          <Button size="sm" onClick={handleRegenerate} disabled={regenerateMutation.isPending}>
            {t(($) => $.regenerate_dialog.confirm)}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!createdUrl} onOpenChange={() => setCreatedUrl(null)}>
        <DialogHeader>
          <DialogTitle>{t(($) => $.create_modal.created_url_title)}</DialogTitle>
          <DialogDescription>{t(($) => $.create_modal.created_url_description)}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input value={createdUrl ?? ""} readOnly className="flex-1 font-mono text-xs" />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (createdUrl) {
                navigator.clipboard.writeText(createdUrl);
                toast.success(t(($) => $.toast.link_copied));
              }
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <DialogFooter>
          <Button size="sm" onClick={() => setCreatedUrl(null)}>{t(($) => $.create_modal.close)}</Button>
        </DialogFooter>
      </Dialog>

      {messagesTarget && (
        <EndUserMessageHistoryDialog
          session={messagesTarget}
          onClose={() => setMessagesTarget(null)}
        />
      )}
    </div>
  );
}
