/**
 * Dev Studio — lightweight store for session state.
 *
 * Keeps the selected project/agent/session across navigation within the
 * dev studio context. The terminal output lines are accumulated locally
 * within the session component (not persisted here).
 */

// Shared singleton — created once, imported by all dev-studio components.
// This avoids prop drilling the session/agent/project selection through
// the hub → session flow.
import { create } from "zustand";

export interface DevStudioStore {
  activeSessionId: string | null;
  selectedAgentId: string | null;
  selectedProjectId: string | null;
  setActiveSession: (id: string | null) => void;
  setSelectedAgentId: (id: string | null) => void;
  setSelectedProjectId: (id: string | null) => void;
}

export const useDevStudioStore = create<DevStudioStore>((set) => ({
  activeSessionId: null,
  selectedAgentId: null,
  selectedProjectId: null,
  setActiveSession: (id) => set({ activeSessionId: id }),
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
}));
