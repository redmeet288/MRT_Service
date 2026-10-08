import { create } from "zustand";

export type ViewKey =
  | "dashboard"
  | "doctors"
  | "requests"
  | "calendar"
  | "reports"
  | "dictionaries"
  | "import"
  | "users"
  | "audit"
  | "docs";

interface UiState {
  activeView: ViewKey;
  setActiveView: (v: ViewKey) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeView: "dashboard",
  setActiveView: (v) => set({ activeView: v }),
}));
