import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import {
  isMissingTaskError,
  isTransientDaemonError,
  transientDaemonRetryDelay,
} from "../api/query-errors";

export const artifactKeys = {
  sources: (runtimeId: string) => ["runtimes", runtimeId, "artifact-sources"] as const,
  list: (taskId: string, path: string) => ["tasks", taskId, "artifacts", path] as const,
};

export function useRuntimeArtifactSources(runtimeId: string, enabled: boolean) {
  return useQuery({
    queryKey: artifactKeys.sources(runtimeId),
    queryFn: () => api.listRuntimeArtifactSources(runtimeId),
    enabled,
    staleTime: 30_000,
  });
}

export function useTaskArtifacts(
  taskId: string | null,
  path: string,
  enabled: boolean,
  options?: { runtimeOnline?: boolean },
) {
  const runtimeOnline = options?.runtimeOnline !== false;
  return useQuery({
    queryKey: artifactKeys.list(taskId ?? "", path),
    queryFn: async () => {
      try {
        return await api.listTaskArtifacts(taskId!, path);
      } catch (err) {
        if (isMissingTaskError(err)) {
          return { path, entries: [] as Awaited<ReturnType<typeof api.listTaskArtifacts>>["entries"] };
        }
        throw err;
      }
    },
    enabled: enabled && !!taskId && runtimeOnline,
    staleTime: 10_000,
    retry: (count, err) => isTransientDaemonError(err) && count < 8,
    retryDelay: transientDaemonRetryDelay,
  });
}
