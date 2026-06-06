"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Copy, Pencil, Trash2 } from "lucide-react";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { chatShareLinksOptions } from "@aicortex/core/chat-share/queries";
import { useDeleteChatShareLink } from "@aicortex/core/chat-share";
import { Button } from "@aicortex/ui/components/ui/button";
import { Badge } from "@aicortex/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@aicortex/ui/components/ui/table";
import { toast } from "sonner";
import type { ChatShareLink } from "@aicortex/core/types";
import { CreateEditChatShareModal } from "./CreateEditChatShareModal";
import { useT } from "../i18n";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active": return "default";
    case "disabled": return "secondary";
    case "expired": return "destructive";
    default: return "outline";
  }
}

export function ChatShareManagementPage() {
  const { t } = useT("chat-share");
  const wsId = useWorkspaceId();
  const { data: links = [], isLoading } = useQuery(chatShareLinksOptions(wsId));
  const deleteMutation = useDeleteChatShareLink();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<ChatShareLink | undefined>(undefined);

  const handleCreate = () => {
    setEditingLink(undefined);
    setModalOpen(true);
  };

  const handleEdit = (link: ChatShareLink) => {
    setEditingLink(link);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Share link deleted.");
    } catch {
      // handled by mutation
    }
  };

  const handleCopyLink = (token: string) => {
    const url = `${window.location.origin}/e/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success(t(($) => $.management.copied));
    }).catch(() => {});
  };

  const formatExpires = (expiresAt: string | null) => {
    if (!expiresAt) return "—";
    return new Date(expiresAt).toLocaleDateString();
  };

  const formatUses = (useCount: number, maxUses: number | null) => {
    if (maxUses == null) return String(useCount);
    return `${useCount} / ${maxUses}`;
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t(($) => $.management.title)}</h1>
          <p className="text-sm text-muted-foreground">{t(($) => $.management.description)}</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-1" />
          {t(($) => $.management.create)}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : links.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p>{t(($) => $.management.empty)}</p>
          <Button variant="outline" className="mt-4" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            {t(($) => $.management.create)}
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t(($) => $.management.table.title)}</TableHead>
              <TableHead>{t(($) => $.management.table.token)}</TableHead>
              <TableHead>{t(($) => $.management.table.uses)}</TableHead>
              <TableHead>{t(($) => $.management.table.expires)}</TableHead>
              <TableHead>{t(($) => $.management.table.status)}</TableHead>
              <TableHead className="w-[120px]">{t(($) => $.management.table.actions)}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.map((link) => (
              <TableRow key={link.id}>
                <TableCell className="font-medium">{link.title}</TableCell>
                <TableCell className="font-mono text-xs">{link.token}</TableCell>
                <TableCell>{formatUses(link.use_count, link.max_uses)}</TableCell>
                <TableCell>{formatExpires(link.expires_at)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(link.status)}>
                    {link.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleCopyLink(link.token)}
                      title={t(($) => $.management.copy_link)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(link)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(link.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CreateEditChatShareModal
        open={modalOpen}
        link={editingLink}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
