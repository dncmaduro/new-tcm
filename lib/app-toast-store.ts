"use client";

import { create } from "zustand";

export type AppToast = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  tone?: "info" | "success" | "error";
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
    const normalizedBody = toast.body?.trim() || null;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let duplicateId: string | null = null;

    set((state) => {
      const duplicate = state.toasts.find(
        (item) => item.title === toast.title && item.body === normalizedBody,
      );
      if (duplicate) {
        duplicateId = duplicate.id;
        return state;
      }

      return {
        toasts: [
          {
            id,
            ...toast,
            body: normalizedBody,
          },
          ...state.toasts,
        ].slice(0, 4),
      };
    });

    if (duplicateId) {
      return duplicateId;
    }

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

export function pushAppErrorToast(body: string, title = "Có lỗi xảy ra") {
  return useAppToastStore.getState().pushToast({
    title,
    body,
    href: null,
    tone: "error",
  });
}
