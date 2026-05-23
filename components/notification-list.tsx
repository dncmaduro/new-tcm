"use client";

import { CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppNotification } from "@/lib/notifications";
import { cn } from "@/lib/utils";

export const formatNotificationRelativeTime = (value: string) => {
  const createdAt = new Date(value);
  if (Number.isNaN(createdAt.getTime())) {
    return "Vừa xong";
  }

  const diffMs = Date.now() - createdAt.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (diffMinutes < 1) {
    return "Vừa xong";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} phút trước`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} giờ trước`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} ngày trước`;
  }

  return createdAt.toLocaleDateString("vi-VN");
};

type NotificationListItemProps = {
  item: AppNotification;
  onOpen: (item: AppNotification) => Promise<void>;
  isMarkingRead: boolean;
};

export function NotificationListItem({
  item,
  onOpen,
  isMarkingRead,
}: NotificationListItemProps) {
  return (
    <button
      type="button"
      onClick={() => void onOpen(item)}
      className={cn(
        "flex w-full flex-col rounded-xl border px-3 py-3 text-left transition",
        item.isRead
          ? "border-slate-200 bg-white hover:bg-slate-50"
          : "border-blue-200 bg-blue-50/70 hover:bg-blue-50",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
            item.isRead ? "bg-slate-300" : "bg-blue-600",
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p
              className={cn(
                "line-clamp-2 text-sm font-semibold",
                item.isRead ? "text-slate-800" : "text-slate-950",
              )}
            >
              {item.title}
            </p>
            {isMarkingRead ? (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-slate-400" />
            ) : null}
          </div>
          {item.body ? <p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.body}</p> : null}
          <p className="mt-2 text-xs font-medium text-slate-400">
            {formatNotificationRelativeTime(item.createdAt)}
          </p>
        </div>
      </div>
    </button>
  );
}

type NotificationListProps = {
  unreadCount: number;
  unreadItems: AppNotification[];
  readItems: AppNotification[];
  isLoading: boolean;
  error: string | null;
  markingReadId: string | null;
  isMarkingAllRead: boolean;
  onOpen: (item: AppNotification) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  emptyText?: string;
  className?: string;
};

export function NotificationList({
  unreadCount,
  unreadItems,
  readItems,
  isLoading,
  error,
  markingReadId,
  isMarkingAllRead,
  onOpen,
  onMarkAllRead,
  emptyText = "Chưa có thông báo nào.",
  className,
}: NotificationListProps) {
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Thông báo</h2>
            <p className="mt-1 text-xs text-slate-500">
              {unreadCount > 0
                ? `${unreadCount} thông báo chưa đọc`
                : "Bạn đã đọc hết thông báo"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onMarkAllRead()}
            disabled={unreadCount === 0 || isMarkingAllRead}
            className="gap-2"
          >
            {isMarkingAllRead ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            Đọc hết
          </Button>
        </div>
        {error ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl px-3 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang tải thông báo...
          </div>
        ) : unreadItems.length === 0 && readItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-500">
            {emptyText}
          </div>
        ) : (
          <div className="space-y-4">
            {unreadItems.length > 0 ? (
              <section className="space-y-2">
                <p className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Chưa đọc
                </p>
                {unreadItems.map((item) => (
                  <NotificationListItem
                    key={item.id}
                    item={item}
                    onOpen={onOpen}
                    isMarkingRead={markingReadId === item.id}
                  />
                ))}
              </section>
            ) : null}

            {readItems.length > 0 ? (
              <section className="space-y-2">
                <p className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Đã đọc
                </p>
                {readItems.map((item) => (
                  <NotificationListItem
                    key={item.id}
                    item={item}
                    onOpen={onOpen}
                    isMarkingRead={markingReadId === item.id}
                  />
                ))}
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
