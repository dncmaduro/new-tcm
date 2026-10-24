"use client";

import { useEffect } from "react";
import { pushAppErrorToast } from "@/lib/app-toast-store";

export function AppErrorToast({
  message,
  title = "Có lỗi xảy ra",
}: {
  message: string | null | undefined;
  title?: string;
}) {
  useEffect(() => {
    if (message?.trim()) {
      pushAppErrorToast(message, title);
    }
  }, [message, title]);

  return null;
}
