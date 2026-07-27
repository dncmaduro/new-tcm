"use client";

import { supabase } from "@/lib/supabase";

export type ITAdminAccessResult = {
  configured: boolean;
  allowed: boolean;
};

export async function fetchITAdminAccess(): Promise<ITAdminAccessResult> {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (error || !accessToken) {
    return { configured: true, allowed: false };
  }

  const response = await fetch("/api/it-admin/access", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    return { configured: true, allowed: false };
  }

  const payload = (await response.json()) as Partial<ITAdminAccessResult>;
  return {
    configured: payload.configured !== false,
    allowed: payload.allowed === true,
  };
}
