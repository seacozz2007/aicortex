import type { DevSession } from "../types/dev";

export interface DevProjectSessionLayout {
  order: string[];
  pinned: string[];
}

export type DevSessionLayoutByProject = Record<string, DevProjectSessionLayout>;

export function emptyProjectSessionLayout(): DevProjectSessionLayout {
  return { order: [], pinned: [] };
}

export function sortDevProjectSessions(
  sessions: DevSession[],
  layout: DevProjectSessionLayout,
): DevSession[] {
  const pinnedSet = new Set(layout.pinned);
  const orderIndex = new Map(layout.order.map((id, index) => [id, index]));

  return [...sessions].sort((a, b) => {
    const aPinned = pinnedSet.has(a.id);
    const bPinned = pinnedSet.has(b.id);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;

    if (aPinned && bPinned) {
      return layout.pinned.indexOf(a.id) - layout.pinned.indexOf(b.id);
    }

    const ai = orderIndex.get(a.id);
    const bi = orderIndex.get(b.id);
    if (ai != null && bi != null) return ai - bi;
    if (ai != null) return -1;
    if (bi != null) return 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

export function mergeSessionLayout(
  sessions: DevSession[],
  layout: DevProjectSessionLayout,
): DevProjectSessionLayout {
  const ids = sessions.map((s) => s.id);
  const idSet = new Set(ids);
  return {
    order: [
      ...layout.order.filter((id) => idSet.has(id)),
      ...ids.filter((id) => !layout.order.includes(id)),
    ],
    pinned: layout.pinned.filter((id) => idSet.has(id)),
  };
}

export function reorderSessionIds(ids: string[], activeId: string, overId: string): string[] {
  const oldIndex = ids.indexOf(activeId);
  const newIndex = ids.indexOf(overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return ids;
  const next = [...ids];
  const [moved] = next.splice(oldIndex, 1);
  next.splice(newIndex, 0, moved!);
  return next;
}

export function togglePinnedSession(
  layout: DevProjectSessionLayout,
  sessionId: string,
): DevProjectSessionLayout {
  const pinned = layout.pinned.includes(sessionId)
    ? layout.pinned.filter((id) => id !== sessionId)
    : [sessionId, ...layout.pinned.filter((id) => id !== sessionId)];
  return { ...layout, pinned };
}
