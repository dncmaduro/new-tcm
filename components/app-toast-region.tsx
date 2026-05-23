"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppToastStore } from "@/lib/app-toast-store";
import { cn } from "@/lib/utils";

export function AppToastRegion() {
  const router = useRouter();
  const toasts = useAppToastStore((state) => state.toasts);
  const removeToast = useAppToastStore((state) => state.removeToast);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[140] flex w-full max-w-[360px] flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_-30px_rgba(15,23,42,0.55)]",
            "animate-[panel-in_220ms_ease-out]",
          )}
        >
          <div className="flex items-start gap-3 px-4 py-3">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-950">{toast.title}</p>
              {toast.body ? (
                <p className="mt-1 text-sm text-slate-600">{toast.body}</p>
              ) : null}

              <div className="mt-3 flex items-center gap-2">
                {toast.href ? (
                  <button
                    type="button"
                    onClick={() => {
                      removeToast(toast.id);
                      router.push(toast.href as string);
                      router.refresh();
                    }}
                    className="inline-flex h-8 items-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700"
                  >
                    Xem ngay
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              aria-label="Đóng thông báo"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
