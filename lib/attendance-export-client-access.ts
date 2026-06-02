"use client";

import { supabase } from "@/lib/supabase";

export type AttendanceExportAccessResult = {
  configured: boolean;
  allowed: boolean;
};

export async function fetchAttendanceExportAccess(): Promise<AttendanceExportAccessResult> {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (error || !accessToken) {
    return {
      configured: true,
      allowed: false,
    };
  }

  const response = await fetch("/api/attendance-export/access", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return {
      configured: true,
      allowed: false,
    };
  }

  const payload = (await response.json()) as Partial<AttendanceExportAccessResult>;

  return {
    configured: payload.configured !== false,
    allowed: payload.allowed === true,
  };
}
