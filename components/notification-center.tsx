"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationList } from "@/components/notification-list";
import type { AppNotification } from "@/lib/notifications";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { useNotifications } from "@/lib/use-notifications";

export function NotificationCenter() {
  const router = useRouter();
  const workspaceAccess = useWorkspaceAccess();
  const {
    unreadItems,
    readItems,
    unreadCount,
    isLoading,
    error,
    markingReadId,
    isMarkingAllRead,
    openNotification,
    markAllRead,
  } = useNotifications({
    profileId: workspaceAccess.profileId,
    limit: 12,
  });

  const handleOpen = async (item: AppNotification) => {
    await openNotification(item);
    if (item.href) {
      router.push(item.href);
      router.refresh();
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Mở thông báo"
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[380px] p-0">
        <NotificationList
          unreadCount={unreadCount}
          unreadItems={unreadItems}
          readItems={readItems}
          isLoading={isLoading}
          error={error}
          markingReadId={markingReadId}
          isMarkingAllRead={isMarkingAllRead}
          onOpen={handleOpen}
          onMarkAllRead={markAllRead}
        />

        <div className="border-t border-slate-200 px-3 py-3">
          <Link
            href="/notifications"
            className={cn(
              "inline-flex h-9 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100",
            )}
          >
            Xem tất cả thông báo
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
