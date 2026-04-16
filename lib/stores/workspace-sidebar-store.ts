"use client";

import { create } from "zustand";

const SIDEBAR_STORAGE_KEY = "workspace-sidebar-collapsed";

const readStoredCollapsed = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
};

const writeStoredCollapsed = (isCollapsed: boolean) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SIDEBAR_STORAGE_KEY, isCollapsed ? "1" : "0");
};

type WorkspaceSidebarStore = {
  isCollapsed: boolean;
  hasHydrated: boolean;
  hydrateFromStorage: () => void;
  setCollapsed: (isCollapsed: boolean) => void;
  toggleCollapsed: () => void;
};

export const useWorkspaceSidebarStore = create<WorkspaceSidebarStore>((set, get) => ({
  isCollapsed: false,
  hasHydrated: false,
  hydrateFromStorage: () => {
    if (get().hasHydrated) {
      return;
    }

    set({
      isCollapsed: readStoredCollapsed(),
      hasHydrated: true,
    });
  },
  setCollapsed: (isCollapsed) => {
    writeStoredCollapsed(isCollapsed);
    set({ isCollapsed, hasHydrated: true });
  },
  toggleCollapsed: () =>
    set((state) => {
      const nextValue = !state.isCollapsed;
      writeStoredCollapsed(nextValue);
      return { isCollapsed: nextValue, hasHydrated: true };
    }),
}));
