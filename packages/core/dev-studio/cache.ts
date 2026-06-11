import type { QueryClient } from "@tanstack/react-query";
import type { DevSession } from "../types/dev";
import { devKeys } from "./queries";

/** Keep workspace + per-project dev session lists in sync after create/update. */
export function upsertDevSessionInCache(
  qc: QueryClient,
  wsId: string,
  session: DevSession,
) {
  qc.setQueryData<DevSession[]>(devKeys.sessions(wsId), (prev) => {
    const list = prev ?? [];
    const idx = list.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      const next = [...list];
      next[idx] = { ...next[idx], ...session };
      return next;
    }
    return [session, ...list];
  });

  if (session.project_id) {
    qc.setQueryData<DevSession[]>(
      devKeys.projectSessions(wsId, session.project_id),
      (prev) => {
        const list = prev ?? [];
        const idx = list.findIndex((s) => s.id === session.id);
        if (idx >= 0) {
          const next = [...list];
          next[idx] = { ...next[idx], ...session };
          return next;
        }
        return [session, ...list];
      },
    );
  }
}
