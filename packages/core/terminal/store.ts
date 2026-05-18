import { create } from "zustand";

interface TerminalStore {
  activeSessionId: string | null;
  setActiveSession: (id: string | null) => void;
}

export const useTerminalStore = create<TerminalStore>((set) => ({
  activeSessionId: null,
  setActiveSession: (id) => set({ activeSessionId: id }),
}));
