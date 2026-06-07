import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export const runtimeTunnelKeys = {
  all: (runtimeId: string) => ["runtimes", runtimeId, "tunnels"] as const,
};

export function runtimeTunnelListOptions(runtimeId: string) {
  return {
    queryKey: runtimeTunnelKeys.all(runtimeId),
    queryFn: () => api.listRuntimeTunnels(runtimeId),
    staleTime: 30_000,
  };
}

export function useCreateRuntimeTunnel(runtimeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { port: number; title?: string }) =>
      api.createRuntimeTunnel(runtimeId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: runtimeTunnelKeys.all(runtimeId) });
    },
  });
}

export function useDeleteRuntimeTunnel(runtimeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tunnelId: string) => api.deleteRuntimeTunnel(runtimeId, tunnelId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: runtimeTunnelKeys.all(runtimeId) });
    },
  });
}

export function useRuntimeTunnels(runtimeId: string, enabled: boolean) {
  return useQuery({
    ...runtimeTunnelListOptions(runtimeId),
    enabled,
  });
}
