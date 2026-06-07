import { useConfigStore } from "./index";

export function useRuntimeTunnelFeature(): boolean {
  return useConfigStore((s) => s.features.runtime_tunnel);
}

export function useArtifactBrowseFeature(): boolean {
  return useConfigStore((s) => s.features.artifact_browse);
}

export function useIssuePreviewFeature(): boolean {
  return useConfigStore((s) => s.features.issue_preview);
}
