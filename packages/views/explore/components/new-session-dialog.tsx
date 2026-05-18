"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useCreateTerminalSession } from "@aicortex/core/terminal";
import { runtimeListOptions } from "@aicortex/core/runtimes/queries";
import { useCurrentWorkspace } from "@aicortex/core/paths";

interface NewSessionDialogProps {
  onClose: () => void;
  onCreated: (sessionId: string) => void;
}

export function NewSessionDialog({ onClose, onCreated }: NewSessionDialogProps) {
  const [runtimeId, setRuntimeId] = useState("");
  const [title, setTitle] = useState("");
  const [shell, setShell] = useState("");
  const createSession = useCreateTerminalSession();
  const workspace = useCurrentWorkspace();

  const { data: runtimes = [] } = useQuery({
    ...runtimeListOptions(workspace?.id ?? ""),
    enabled: !!workspace?.id,
  });

  const onlineRuntimes = runtimes.filter((r) => r.status === "online");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runtimeId) return;

    const result = await createSession.mutateAsync({
      runtime_id: runtimeId,
      title: title || undefined,
      shell: shell || undefined,
      cols: 120,
      rows: 30,
    });
    onCreated(result.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border rounded-lg shadow-lg w-96 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">New Terminal Session</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Runner</label>
            <select
              value={runtimeId}
              onChange={(e) => setRuntimeId(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              required
            >
              <option value="">Select a runner...</option>
              {onlineRuntimes.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. debug-session"
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Shell (optional)</label>
            <input
              type="text"
              value={shell}
              onChange={(e) => setShell(e.target.value)}
              placeholder="e.g. /bin/bash, kiro-cli"
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded-md hover:bg-accent">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!runtimeId || createSession.isPending}
              className="px-3 py-1.5 text-sm rounded-md bg-brand text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              {createSession.isPending ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
