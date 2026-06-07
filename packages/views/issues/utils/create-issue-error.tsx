"use client";

import { toast } from "sonner";
import { parseActiveDuplicateIssueError } from "@aicortex/core/issues";
import { StatusIcon } from "../components/status-icon";

export interface CreateIssueErrorToastMessages {
  genericFailed: string;
  duplicateTitle: string;
  duplicateBody: (identifier: string, title: string, status: string) => string;
  viewExisting: string;
}

export function showCreateIssueErrorToast(
  err: unknown,
  messages: CreateIssueErrorToastMessages,
  onViewExisting: (issueId: string) => void,
): void {
  const duplicate = parseActiveDuplicateIssueError(err);
  if (!duplicate) {
    toast.error(messages.genericFailed);
    return;
  }

  const { issue } = duplicate;
  toast.custom(
    (toastId) => (
      <div className="w-[360px] rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg">
        <p className="text-sm font-medium">{messages.duplicateTitle}</p>
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <StatusIcon status={issue.status} className="size-3.5 shrink-0" />
          <span className="truncate">
            {messages.duplicateBody(issue.identifier, issue.title, issue.status)}
          </span>
        </div>
        <button
          type="button"
          className="mt-2 cursor-pointer text-sm text-primary hover:underline"
          onClick={() => {
            onViewExisting(issue.id);
            toast.dismiss(toastId);
          }}
        >
          {messages.viewExisting}
        </button>
      </div>
    ),
    { duration: 8000 },
  );
}
