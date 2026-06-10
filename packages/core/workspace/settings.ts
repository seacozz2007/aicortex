/** Workspace JSONB settings helpers (pure, isomorphic). */

export function isWorkspaceExploreEnabled(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return false;
  return (settings as Record<string, unknown>).explore_enabled === true;
}
