"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type UseLeaveFormConfirmOptions = {
  enabled?: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type UseLeaveFormConfirmResult = {
  leaveConfirmDialog: ReactNode;
  runWithoutConfirm: (action: () => void) => void;
};

const isModifiedClick = (event: MouseEvent) =>
  event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

const getCurrentUrl = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

export const useLeaveFormConfirm = ({
  enabled = true,
  title = "Rời trang biểu mẫu?",
  description = "Dữ liệu bạn đang nhập có thể chưa được lưu. Bạn có chắc muốn chuyển trang?",
  confirmLabel = "Rời trang",
  cancelLabel = "Ở lại",
}: UseLeaveFormConfirmOptions = {}): UseLeaveFormConfirmResult => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const pendingHrefRef = useRef<string | null>(null);
  const bypassGuardRef = useRef(false);
  const currentUrlRef = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    currentUrlRef.current = getCurrentUrl();
  });

  const shouldGuard = useCallback(() => enabled && !bypassGuardRef.current, [enabled]);

  const runWithoutConfirm = useCallback((action: () => void) => {
    bypassGuardRef.current = true;
    action();
    window.setTimeout(() => {
      bypassGuardRef.current = false;
    }, 0);
  }, []);

  const closeDialog = useCallback(() => {
    pendingHrefRef.current = null;
    setIsOpen(false);
  }, []);

  const confirmDialogNavigation = useCallback(() => {
    const nextHref = pendingHrefRef.current;
    pendingHrefRef.current = null;
    setIsOpen(false);
    if (!nextHref) {
      return;
    }

    runWithoutConfirm(() => {
      router.push(nextHref);
    });
  }, [router, runWithoutConfirm]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleAnchorNavigation = (event: MouseEvent) => {
      if (!shouldGuard()) {
        return;
      }
      if (event.defaultPrevented || event.button !== 0 || isModifiedClick(event)) {
        return;
      }

      const target = event.target as Element | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) {
        return;
      }
      if (anchor.target && anchor.target !== "_self") {
        return;
      }
      if (anchor.hasAttribute("download") || anchor.getAttribute("data-leave-confirm-ignore")) {
        return;
      }

      let nextUrl: URL;
      try {
        nextUrl = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (nextUrl.origin !== window.location.origin) {
        return;
      }

      const nextHref = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      const currentHref = getCurrentUrl();

      if (nextHref === currentHref) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      pendingHrefRef.current = nextHref;
      setIsOpen(true);
    };

    document.addEventListener("click", handleAnchorNavigation, true);
    return () => {
      document.removeEventListener("click", handleAnchorNavigation, true);
    };
  }, [shouldGuard]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePopState = () => {
      if (!shouldGuard()) {
        currentUrlRef.current = getCurrentUrl();
        return;
      }

      const attemptedHref = getCurrentUrl();
      if (attemptedHref === currentUrlRef.current) {
        return;
      }

      window.history.pushState(null, "", currentUrlRef.current);
      pendingHrefRef.current = attemptedHref;
      setIsOpen(true);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [shouldGuard]);

  const leaveConfirmDialog = isOpen ? (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">{description}</p>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={closeDialog}
            className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={confirmDialogNavigation}
            className="inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return {
    leaveConfirmDialog,
    runWithoutConfirm,
  };
};
