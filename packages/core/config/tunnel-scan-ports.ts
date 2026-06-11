import { useConfigStore } from "./index";

export function useTunnelScanPorts(): number[] {
  return useConfigStore((s) => s.tunnelScanPorts);
}
