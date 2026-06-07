export function buildArtifactRawURL(
  taskId: string,
  relPath: string,
  workspaceSlug: string,
): string {
  const params = new URLSearchParams({ workspace_slug: workspaceSlug });
  const trimmed = relPath.replace(/^\/+/, "");
  return `/api/tasks/${taskId}/artifacts/raw/${trimmed}?${params.toString()}`;
}

export function isHtmlArtifact(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".html") || lower.endsWith(".htm");
}
