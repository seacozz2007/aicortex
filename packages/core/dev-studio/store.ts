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

import type { DevSessionLayoutByProject, DevProjectSessionLayout } from "./session-layout";

export type DevStudioMainView = "chat" | "cli";

export interface DevStudioStore {
  selectedProjectId: string | null;
  activeSessionId: string | null;
  /** Projects the user has opened in the dev studio sidebar (multi-root workspace). */
  openedProjectIds: string[];
  sessionLayoutByProject: DevSessionLayoutByProject;
  sidebarOpen: boolean;
  toolsOpen: boolean;
  toolsTab: "terminal" | "files" | "preview";
  /** Left main panel: chat composer vs embedded agent CLI terminal. */
  mainView: DevStudioMainView;
  /** Per chat session: whether the left panel shows CLI terminal. */
  cliMainViewBySessionId: Record<string, boolean>;
  expandedProjectIds: string[];
  setSelectedProjectId: (id: string | null) => void;
  setActiveSession: (id: string | null) => void;
  setOpenedProjectIds: (ids: string[]) => void;
  setSessionLayoutByProject: (layout: DevSessionLayoutByProject | ((current: DevSessionLayoutByProject) => DevSessionLayoutByProject)) => void;
  setProjectSessionLayout: (projectId: string, layout: DevProjectSessionLayout) => void;
  openProject: (id: string) => void;
  setSidebarOpen: (open: boolean) => void;
  setToolsOpen: (open: boolean) => void;
  setToolsTab: (tab: "terminal" | "files" | "preview") => void;
  setMainView: (view: DevStudioMainView) => void;
  setCliMainViewForSession: (sessionId: string, open: boolean) => void;
  setCliMainViewBySessionId: (map: Record<string, boolean>) => void;
  toggleProjectExpanded: (projectId: string) => void;
}

export const useDevStudioStore = create<DevStudioStore>((set, get) => ({
  selectedProjectId: null,
  activeSessionId: null,
  openedProjectIds: [],
  sessionLayoutByProject: {},
  sidebarOpen: true,
  toolsOpen: true,
  toolsTab: "files",
  mainView: "chat",
  cliMainViewBySessionId: {},
  expandedProjectIds: [],
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  setOpenedProjectIds: (ids) => set({ openedProjectIds: ids }),
  setSessionLayoutByProject: (layout) =>
    set((state) => {
      const next =
        typeof layout === "function" ? layout(state.sessionLayoutByProject) : layout;
      if (next === state.sessionLayoutByProject) return state;
      return { sessionLayoutByProject: next };
    }),
  setProjectSessionLayout: (projectId, layout) =>
    set((state) => ({
      sessionLayoutByProject: { ...state.sessionLayoutByProject, [projectId]: layout },
    })),
  openProject: (id) => {
    const current = get().openedProjectIds;
    if (current.includes(id)) return;
    set({ openedProjectIds: [...current, id] });
  },
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setToolsOpen: (open) => set({ toolsOpen: open }),
  setToolsTab: (tab) => set({ toolsTab: tab }),
  setMainView: (view) => set({ mainView: view }),
  setCliMainViewForSession: (sessionId, open) =>
    set((state) => ({
      cliMainViewBySessionId: { ...state.cliMainViewBySessionId, [sessionId]: open },
      mainView: open ? "cli" : "chat",
    })),
  setCliMainViewBySessionId: (map) => set({ cliMainViewBySessionId: map }),
  toggleProjectExpanded: (projectId) => {
    const current = get().expandedProjectIds;
    set({
      expandedProjectIds: current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId],
    });
  },
}));
