"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AppNotification,
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
} from "@/lib/notifications";
import { supabase } from "@/lib/supabase";

type UseNotificationsOptions = {
  profileId: string | null;
  limit?: number;
};

export function useNotifications({
  profileId,
  limit = 20,
}: UseNotificationsOptions) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);

  const refresh = useCallback(async () => {
    if (!profileId) {
      setNotifications([]);
      setUnreadCount(0);
      setError(null);
      return;
    }

    setError(null);

    const [notificationsResult, unreadCountResult] = await Promise.allSettled([
      fetchNotifications(limit),
      fetchUnreadNotificationCount(),
    ]);

    if (notificationsResult.status === "fulfilled") {
      setNotifications(notificationsResult.value);
    }

    if (unreadCountResult.status === "fulfilled") {
      setUnreadCount(unreadCountResult.value);
    }

    const nextError =
      notificationsResult.status === "rejected"
        ? notificationsResult.reason instanceof Error
          ? notificationsResult.reason.message
          : "Không thể tải thông báo."
        : unreadCountResult.status === "rejected"
          ? unreadCountResult.reason instanceof Error
            ? unreadCountResult.reason.message
            : "Không thể tải thông báo."
          : null;

    setError(nextError);
  }, [limit, profileId]);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      if (!profileId) {
        setNotifications([]);
        setUnreadCount(0);
        setError(null);
        return;
      }

      setIsLoading(true);
      try {
        await refresh();
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isActive = false;
    };
  }, [profileId, refresh]);

  useEffect(() => {
    if (!profileId) {
      return;
    }

    const channel = subscribeToNotifications(profileId, () => {
      void refresh();
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profileId, refresh]);

  const unreadItems = useMemo(
    () => notifications.filter((item) => !item.isRead),
    [notifications],
  );
  const readItems = useMemo(
    () => notifications.filter((item) => item.isRead),
    [notifications],
  );

  const openNotification = useCallback(async (item: AppNotification) => {
    if (item.isRead) {
      return;
    }

    setMarkingReadId(item.id);
    setError(null);

    try {
      await markNotificationRead(item.id);
      setNotifications((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                isRead: true,
                readAt: new Date().toISOString(),
              }
            : entry,
        ),
      );
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch (markError) {
      setError(
        markError instanceof Error
          ? markError.message
          : "Không thể đánh dấu thông báo đã đọc.",
      );
      throw markError;
    } finally {
      setMarkingReadId(null);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    if (unreadCount === 0 || isMarkingAllRead) {
      return;
    }

    setIsMarkingAllRead(true);
    setError(null);

    try {
      await markAllNotificationsRead();
      setNotifications((current) =>
        current.map((item) =>
          item.isRead
            ? item
            : {
                ...item,
                isRead: true,
                readAt: new Date().toISOString(),
              },
        ),
      );
      setUnreadCount(0);
    } catch (markError) {
      setError(
        markError instanceof Error
          ? markError.message
          : "Không thể đánh dấu tất cả thông báo đã đọc.",
      );
    } finally {
      setIsMarkingAllRead(false);
    }
  }, [isMarkingAllRead, unreadCount]);

  return {
    notifications,
    unreadItems,
    readItems,
    unreadCount,
    isLoading,
    error,
    markingReadId,
    isMarkingAllRead,
    refresh,
    openNotification,
    markAllRead,
  };
}
