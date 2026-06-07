import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

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

export function useTaskArtifacts(taskId: string | null, path: string, enabled: boolean) {
  return useQuery({
    queryKey: artifactKeys.list(taskId ?? "", path),
    queryFn: () => api.listTaskArtifacts(taskId!, path),
    enabled: enabled && !!taskId,
    staleTime: 10_000,
  });
}
