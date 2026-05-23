"use client";

import { useEffect, useRef } from "react";
import { subscribeToNotifications, type AppNotification } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { useAppToastStore } from "@/lib/app-toast-store";

export function NotificationRealtimeToast() {
  const workspaceAccess = useWorkspaceAccess();
  const pushToast = useAppToastStore((state) => state.pushToast);
  const lastToastIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!workspaceAccess.profileId) {
      return;
    }

    const channel = subscribeToNotifications(workspaceAccess.profileId, {
      onInsert: (notification: AppNotification) => {
        if (lastToastIdRef.current === notification.id) {
          return;
        }

        lastToastIdRef.current = notification.id;
        pushToast({
          title: notification.title,
          body: notification.body,
          href: notification.href,
        });
      },
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [pushToast, workspaceAccess.profileId]);

  return null;
}
