import { NextResponse } from "next/server";

import {
  createServerSupabaseAuthClient,
  createServerSupabaseServiceRoleClient,
} from "@/lib/supabase-server";
import { canReadTimekeepingData } from "@/lib/timekeeping-access";

type RequestProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
  is_timekeeping_enabled: boolean | null;
};

type ReviewerLinkRow = {
  id: string;
  time_request_id: string;
  profile_id: string;
  is_approved: boolean | null;
  comment: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type TimeRequestRow = {
  id: string;
  profile_id: string | null;
  date: string | null;
  type: string | null;
  leave_subtype: string | null;
  leave_session: string | null;
  requested_hours: number | null;
  minutes: number | null;
  reason: string | null;
  remote_check_in: string | null;
  remote_check_out: string | null;
  created_at: string | null;
  updated_at: string | null;
  time_request_reviewers?: ReviewerLinkRow[] | null;
};

type ReviewPayload = {
  requestId?: unknown;
  isApproved?: unknown;
};

const REQUEST_SELECT =
  "id,profile_id,date,type,leave_subtype,leave_session,requested_hours,minutes,reason,remote_check_in,remote_check_out,created_at,updated_at,time_request_reviewers(id,profile_id,is_approved,comment,reviewed_at,created_at)";

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authorization.slice(7).trim();
  return token || null;
}

function getRequestId(request: Request) {
  return new URL(request.url).searchParams.get("requestId")?.trim() ?? "";
}

async function authenticate(request: Request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return {
      response: NextResponse.json({ error: "Thiếu access token." }, { status: 401 }),
    };
  }

  const authClient = createServerSupabaseAuthClient();
  const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !authData.user?.id) {
    return {
      response: NextResponse.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 }),
    };
  }

  const serviceRoleClient = createServerSupabaseServiceRoleClient();
  const { data: profile, error: profileError } = await serviceRoleClient
    .from("profiles")
    .select("id")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (profileError || !profile?.id) {
    return {
      response: NextResponse.json(
        { error: profileError?.message ?? "Không tìm thấy hồ sơ người dùng." },
        { status: 400 },
      ),
    };
  }

  return {
    serviceRoleClient,
    viewerProfileId: String(profile.id),
  };
}

async function loadEligibleProfiles(
  serviceRoleClient: ReturnType<typeof createServerSupabaseServiceRoleClient>,
  profileIds: string[],
) {
  if (profileIds.length === 0) {
    return [] as RequestProfileRow[];
  }

  const { data, error } = await serviceRoleClient
    .from("profiles")
    .select("id,name,email,is_timekeeping_enabled")
    .in("id", profileIds);

  if (error) {
    throw new Error(error.message || "Không tải được thông tin nhân sự.");
  }

  return ((data ?? []) as RequestProfileRow[]).filter((profile) =>
    canReadTimekeepingData(profile),
  );
}

export async function GET(request: Request) {
  try {
    const auth = await authenticate(request);
    if ("response" in auth) {
      return auth.response;
    }

    const { serviceRoleClient, viewerProfileId } = auth;
    const requestId = getRequestId(request);

    if (requestId) {
      const { data: requestData, error: requestError } = await serviceRoleClient
        .from("time_requests")
        .select(REQUEST_SELECT)
        .eq("id", requestId)
        .maybeSingle();

      if (requestError) {
        throw new Error(requestError.message || "Không tải được yêu cầu thời gian.");
      }

      if (!requestData?.id) {
        return NextResponse.json({ error: "Không tìm thấy yêu cầu thời gian." }, { status: 404 });
      }

      const timeRequest = requestData as TimeRequestRow;
      const { data: reviewerData, error: reviewerError } = await serviceRoleClient
        .from("time_request_reviewers")
        .select("id")
        .eq("time_request_id", requestId)
        .eq("profile_id", viewerProfileId)
        .limit(1)
        .maybeSingle();

      if (reviewerError) {
        throw new Error(reviewerError.message || "Không thể kiểm tra quyền duyệt yêu cầu.");
      }

      const isOwner =
        Boolean(timeRequest.profile_id) && String(timeRequest.profile_id) === viewerProfileId;
      const isReviewer = Boolean(reviewerData?.id);
      if (!isOwner && !isReviewer) {
        return NextResponse.json(
          { error: "Bạn không có quyền xem yêu cầu thời gian này." },
          { status: 403 },
        );
      }

      const profiles = await loadEligibleProfiles(
        serviceRoleClient,
        timeRequest.profile_id ? [String(timeRequest.profile_id)] : [],
      );
      if (timeRequest.profile_id && profiles.length === 0) {
        return NextResponse.json({ error: "Không tìm thấy yêu cầu thời gian." }, { status: 404 });
      }

      return NextResponse.json({
        currentProfileId: viewerProfileId,
        isOwner,
        isReviewer,
        request: timeRequest,
        profiles,
      });
    }

    const { data: reviewerLinksData, error: reviewerLinksError } = await serviceRoleClient
      .from("time_request_reviewers")
      .select("time_request_id")
      .eq("profile_id", viewerProfileId);

    if (reviewerLinksError) {
      throw new Error(reviewerLinksError.message || "Không tải được phạm vi duyệt yêu cầu.");
    }

    const authorizedRequestIds = [
      ...new Set(
        (reviewerLinksData ?? [])
          .map((row) => row.time_request_id)
          .filter(Boolean)
          .map((item) => String(item)),
      ),
    ];

    let requestRows: TimeRequestRow[] = [];
    if (authorizedRequestIds.length > 0) {
      const { data, error } = await serviceRoleClient
        .from("time_requests")
        .select(REQUEST_SELECT)
        .in("id", authorizedRequestIds)
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(error.message || "Không tải được yêu cầu thời gian.");
      }

      requestRows = (data ?? []) as TimeRequestRow[];
    }

    const requestProfileIds = [
      ...new Set(
        requestRows
          .map((timeRequest) => timeRequest.profile_id)
          .filter(Boolean)
          .map((item) => String(item)),
      ),
    ];
    const profiles = await loadEligibleProfiles(serviceRoleClient, requestProfileIds);
    const eligibleProfileIds = new Set(profiles.map((profile) => String(profile.id)));

    return NextResponse.json({
      currentProfileId: viewerProfileId,
      requests: requestRows.filter(
        (timeRequest) =>
          Boolean(timeRequest.profile_id) && eligibleProfileIds.has(String(timeRequest.profile_id)),
      ),
      profiles,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được dữ liệu duyệt yêu cầu." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  let payload: ReviewPayload;
  try {
    payload = (await request.json()) as ReviewPayload;
  } catch {
    return NextResponse.json({ error: "Body JSON không hợp lệ." }, { status: 400 });
  }

  const requestId = typeof payload.requestId === "string" ? payload.requestId.trim() : "";
  const isApprovedValue = payload.isApproved;
  if (
    !requestId ||
    (isApprovedValue !== true && isApprovedValue !== false && isApprovedValue !== null)
  ) {
    return NextResponse.json({ error: "Dữ liệu quyết định duyệt không hợp lệ." }, { status: 400 });
  }
  const isApproved = isApprovedValue as boolean | null;

  try {
    const auth = await authenticate(request);
    if ("response" in auth) {
      return auth.response;
    }

    const { serviceRoleClient, viewerProfileId } = auth;
    const { data: reviewerRows, error: reviewerError } = await serviceRoleClient
      .from("time_request_reviewers")
      .select("id")
      .eq("time_request_id", requestId)
      .eq("profile_id", viewerProfileId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (reviewerError) {
      throw new Error(reviewerError.message || "Không thể kiểm tra lịch sử duyệt.");
    }

    const reviewerId = reviewerRows?.[0]?.id ? String(reviewerRows[0].id) : null;
    if (!reviewerId) {
      return NextResponse.json(
        { error: "Bạn không có quyền duyệt yêu cầu này." },
        { status: 403 },
      );
    }

    const { error: updateError } = await serviceRoleClient
      .from("time_request_reviewers")
      .update({
        is_approved: isApproved,
        reviewed_at: isApproved === null ? null : new Date().toISOString(),
      })
      .eq("id", reviewerId);

    if (updateError) {
      throw new Error(updateError.message || "Không thể cập nhật quyết định duyệt.");
    }

    return NextResponse.json({ requestId, isApproved });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể cập nhật quyết định duyệt." },
      { status: 500 },
    );
  }
}
