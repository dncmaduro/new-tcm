import { supabase } from "@/lib/supabase";

export type TimeRequestManagementApiPayload = {
  currentProfileId?: string;
  isOwner?: boolean;
  isReviewer?: boolean;
  request?: unknown;
  requests?: unknown[];
  profiles?: unknown[];
  error?: string;
};

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Phiên đăng nhập không hợp lệ.");
  }

  return data.session.access_token;
}

async function requestManagementApi(
  path: string,
  init?: RequestInit,
): Promise<TimeRequestManagementApiPayload> {
  const accessToken = await getAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | TimeRequestManagementApiPayload
    | null;

  if (!response.ok) {
    throw new Error(payload?.error || "Không thể tải dữ liệu duyệt yêu cầu.");
  }

  return payload ?? {};
}

export function fetchTimeRequestManagement(requestId?: string) {
  const query = requestId ? `?requestId=${encodeURIComponent(requestId)}` : "";
  return requestManagementApi(`/api/time-request-management${query}`, {
    method: "GET",
    cache: "no-store",
  });
}

export function updateTimeRequestReview(requestId: string, isApproved: boolean | null) {
  return requestManagementApi("/api/time-request-management", {
    method: "PATCH",
    body: JSON.stringify({ requestId, isApproved }),
  });
}
