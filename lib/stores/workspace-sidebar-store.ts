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
  setCollapsed: (isCollapsed: boolean) => void;
  toggleCollapsed: () => void;
};

export const useWorkspaceSidebarStore = create<WorkspaceSidebarStore>((set) => ({
  isCollapsed: readStoredCollapsed(),
  setCollapsed: (isCollapsed) => {
    writeStoredCollapsed(isCollapsed);
    set({ isCollapsed });
  },
  toggleCollapsed: () =>
    set((state) => {
      const nextValue = !state.isCollapsed;
      writeStoredCollapsed(nextValue);
      return { isCollapsed: nextValue };
    }),
}));
