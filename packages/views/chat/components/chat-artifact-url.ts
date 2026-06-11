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

export function isMarkdownArtifact(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".mdx");
}

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".svg",
  ".avif",
]);

export function isImageArtifact(path: string): boolean {
  const lower = path.toLowerCase();
  const base = lower.split("/").pop() ?? lower;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return false;
  return IMAGE_EXTENSIONS.has(base.slice(dot));
}
