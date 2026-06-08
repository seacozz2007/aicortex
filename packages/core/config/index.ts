import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

export interface AppFeatureFlags {
  runtime_tunnel: boolean;
  artifact_browse: boolean;
  issue_preview: boolean;
  design_studio: boolean;
  design_export: boolean;
  design_jury: boolean;
}

interface ConfigState {
  cdnDomain: string;
  allowSignup: boolean;
  googleClientId: string;
  features: AppFeatureFlags;
  setCdnDomain: (domain: string) => void;
  setAuthConfig: (config: { allowSignup: boolean; googleClientId?: string }) => void;
  setFeatures: (features: Partial<AppFeatureFlags>) => void;
}

const defaultFeatures: AppFeatureFlags = {
  runtime_tunnel: false,
  artifact_browse: true,
  issue_preview: false,
  design_studio: true,
  design_export: true,
  design_jury: true,
};

export const configStore = createStore<ConfigState>((set) => ({
  cdnDomain: "",
  allowSignup: true,
  googleClientId: "",
  features: defaultFeatures,
  setCdnDomain: (domain) => set({ cdnDomain: domain }),
  setAuthConfig: ({ allowSignup, googleClientId = "" }) =>
    set({ allowSignup, googleClientId }),
  setFeatures: (features) =>
    set((state) => ({ features: { ...state.features, ...features } })),
}));

export function useConfigStore(): ConfigState;
export function useConfigStore<T>(selector: (state: ConfigState) => T): T;
export function useConfigStore<T>(selector?: (state: ConfigState) => T) {
  return useStore(configStore, selector as (state: ConfigState) => T);
}
