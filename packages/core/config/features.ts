import { useConfigStore } from "./index";

export function useRuntimeTunnelFeature(): boolean {
  return useConfigStore((s) => s.features.runtime_tunnel);
}
