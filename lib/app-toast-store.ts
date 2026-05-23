"use client";

import { create } from "zustand";

export type AppToast = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
};

type AppToastStore = {
  toasts: AppToast[];
  pushToast: (toast: Omit<AppToast, "id">) => string;
  removeToast: (id: string) => void;
};

const AUTO_DISMISS_MS = 5000;

export const useAppToastStore = create<AppToastStore>((set) => ({
  toasts: [],
  pushToast: (toast) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    set((state) => ({
      toasts: [
        {
          id,
          ...toast,
        },
        ...state.toasts,
      ].slice(0, 4),
    }));

    window.setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((item) => item.id !== id),
      }));
    }, AUTO_DISMISS_MS);

    return id;
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((item) => item.id !== id),
    }));
  },
}));
