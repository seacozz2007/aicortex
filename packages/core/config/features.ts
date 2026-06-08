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

export function useDesignStudioFeature(): boolean {
  return useConfigStore((s) => s.features.design_studio);
}

export function useDesignExportFeature(): boolean {
  return useConfigStore((s) => s.features.design_export);
}

export function useDesignJuryFeature(): boolean {
  return useConfigStore((s) => s.features.design_jury);
}
