import { ApiError } from "../api/client";
import type { Issue } from "../types";

export interface ActiveDuplicateIssuePayload {
  code: "active_duplicate_issue";
  error: string;
  issue: Issue;
}

/** Parses a 409 active_duplicate_issue response from create-issue. */
export function parseActiveDuplicateIssueError(
  err: unknown,
): ActiveDuplicateIssuePayload | null {
  if (!(err instanceof ApiError) || err.status !== 409) {
    return null;
  }
  const body = err.body as Partial<ActiveDuplicateIssuePayload> | undefined;
  if (
    !body ||
    body.code !== "active_duplicate_issue" ||
    !body.issue?.id ||
    !body.issue.identifier
  ) {
    return null;
  }
  return body as ActiveDuplicateIssuePayload;
}
