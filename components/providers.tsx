"use client";

import { MantineProvider } from "@mantine/core";
import { AppToastRegion } from "@/components/app-toast-region";
import { NotificationRealtimeToast } from "@/components/notification-realtime-toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider>
      {children}
      <NotificationRealtimeToast />
      <AppToastRegion />
    </MantineProvider>
  );
}
