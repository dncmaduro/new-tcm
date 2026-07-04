import { NextResponse } from "next/server";

import {
  getEarlyLeaveMinutesFromTimeValue,
  getLeaveRequestDurationMinutes,
  getTimeRequestReviewStatus,
  isMissingTimeRequestType,
  type LeaveRequestSession,
  type LeaveRequestSubtype,
  type TimeRequestType,
} from "@/lib/constants/time-requests";
import { createServerSupabaseAuthClient, createServerSupabaseServiceRoleClient } from "@/lib/supabase-server";
import {
  canCreateTimeRequest,
  isTimeRequestDateTooFarInPast,
  TIMEKEEPING_DISABLED_MESSAGE,
  TIME_REQUEST_DATE_WINDOW_MESSAGE,
} from "@/lib/timekeeping-access";
import { calculateWorkedMinutesBetweenTimestamps } from "@/lib/work-time";

type CreateTimeRequestPayload = {
  correctionDate?: string;
  requestType?: TimeRequestType | null;
  leaveSubtype?: LeaveRequestSubtype | null;
  leaveSession?: LeaveRequestSession | null;
  requestedHours?: number | null;
  earlyLeaveTime?: string | null;
  minutes?: number | null;
  reason?: string | null;
  remoteCheckIn?: string | null;
  remoteCheckOut?: string | null;
};

type RoleRow = {
  id: string;
  name: string | null;
};

type UserRoleRow = {
  profile_id: string | null;
  department_id: string | null;
  role_id: string | null;
};

type DepartmentRow = {
  id: string;
  parent_department_id: string | null;
};

type ProfileAccessRow = {
  id: string;
  is_active: boolean | null;
  is_timekeeping_enabled: boolean | null;
};

type TimeRequestReviewerStatusRow = {
  is_approved: boolean | null;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authorization.slice(7).trim();
  return token || null;
}

function getRequestIdFromUrl(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("id")?.trim() ?? "";
}

function toMonthStartIso(isoDate: string) {
  return `${isoDate.slice(0, 7)}-01`;
}

function getAncestors(
  startDepartmentIds: string[],
  parentDepartmentById: Record<string, string | null>,
  includeSelf: boolean,
) {
  const scoped = new Set<string>();
  startDepartmentIds.forEach((startId) => {
    let cursor: string | null = startId;
    let isFirst = true;
    while (cursor) {
      if ((includeSelf || !isFirst) && !scoped.has(cursor)) {
        scoped.add(cursor);
      }
      cursor = parentDepartmentById[cursor] ?? null;
      isFirst = false;
    }
  });
  return Array.from(scoped);
}

async function fetchLeaveBalanceForMonth(
  serviceRoleClient: ReturnType<typeof createServerSupabaseServiceRoleClient>,
  profileId: string,
  correctionDateIso: string,
) {
  const targetMonth = toMonthStartIso(correctionDateIso);

  const { error: ensureError } = await serviceRoleClient.rpc(
    "ensure_leave_balance_for_profile_month",
    {
      p_profile_id: profileId,
      p_month: targetMonth,
    },
  );

  if (ensureError) {
    const message = ensureError.message || "Không thể khởi tạo quỹ phép của tháng đã chọn.";
    const isMissingRpc =
      message.includes(
        "Could not find the function public.ensure_leave_balance_for_profile_month",
      ) || message.includes("schema cache");

    if (!isMissingRpc) {
      throw new Error(message);
    }
  }

  const { data, error } = await serviceRoleClient
    .from("leave_balances")
    .select("id,profile_id,month,total_hours,used_hours,created_at")
    .eq("profile_id", profileId)
    .eq("month", targetMonth)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Không tải được quỹ phép của tháng đã chọn.");
  }

  if (!data) {
    throw new Error(
      "Chưa tìm thấy quỹ phép của tháng đã chọn. Cần apply migration leave_balances và reload schema cache của Supabase.",
    );
  }

  return data;
}

async function resolveReviewerProfileIds(
  serviceRoleClient: ReturnType<typeof createServerSupabaseServiceRoleClient>,
  requesterProfileId: string,
) {
  const [
    { data: rolesData, error: rolesError },
    { data: requesterRolesData, error: requesterRolesError },
  ] = await Promise.all([
    serviceRoleClient.from("roles").select("id,name"),
    serviceRoleClient
      .from("user_role_in_department")
      .select("profile_id,department_id,role_id")
      .eq("profile_id", requesterProfileId),
  ]);

  if (rolesError) {
    throw new Error(rolesError.message || "Không tải được danh sách vai trò.");
  }
  if (requesterRolesError) {
    throw new Error(
      requesterRolesError.message || "Không tải được vai trò của người tạo yêu cầu.",
    );
  }

  const typedRoles = (rolesData ?? []) as RoleRow[];
  const typedRequesterRoles = (requesterRolesData ?? []) as UserRoleRow[];
  const leaderRoleIds = typedRoles
    .filter((role) => {
      const roleName = normalizeText(role.name);
      return roleName === "leader" || roleName.includes("leader") || roleName.includes("truong nhom");
    })
    .map((role) => String(role.id));
  const memberRoleIds = typedRoles
    .filter((role) => {
      const roleName = normalizeText(role.name);
      return roleName === "member" || roleName.includes("member") || roleName.includes("thanh vien");
    })
    .map((role) => String(role.id));
  const directorRoleIds = typedRoles
    .filter((role) => {
      const roleName = normalizeText(role.name);
      return roleName === "giam doc" || roleName.includes("giam doc") || roleName === "director";
    })
    .map((role) => String(role.id));

  const hasDirectorRole = typedRequesterRoles.some(
    (row) => row.role_id && directorRoleIds.includes(String(row.role_id)),
  );
  const hasLeaderRole = typedRequesterRoles.some(
    (row) => row.role_id && leaderRoleIds.includes(String(row.role_id)),
  );
  const requesterScope: "member" | "leader" | "director" = hasDirectorRole
    ? "director"
    : hasLeaderRole
      ? "leader"
      : "member";

  const { data: departmentsData, error: departmentsError } = await serviceRoleClient
    .from("departments")
    .select("id,parent_department_id");

  if (departmentsError) {
    throw new Error(departmentsError.message || "Không tải được cây phòng ban.");
  }

  const parentDepartmentById = ((departmentsData ?? []) as DepartmentRow[]).reduce<
    Record<string, string | null>
  >((acc, item) => {
    acc[String(item.id)] = item.parent_department_id ? String(item.parent_department_id) : null;
    return acc;
  }, {});

  let reviewerProfileIds: string[] = [];

  if (requesterScope === "member") {
    const currentDepartmentIds = [
      ...new Set(
        typedRequesterRoles
          .filter(
            (row) => row.department_id && row.role_id && memberRoleIds.includes(String(row.role_id)),
          )
          .map((row) => String(row.department_id)),
      ),
    ];
    const fallbackDepartmentIds =
      currentDepartmentIds.length > 0
        ? currentDepartmentIds
        : [
            ...new Set(
              typedRequesterRoles
                .map((row) => row.department_id)
                .filter(Boolean)
                .map((item) => String(item)),
            ),
          ];
    const scopedDepartmentIds = getAncestors(fallbackDepartmentIds, parentDepartmentById, true);

    if (leaderRoleIds.length > 0 && scopedDepartmentIds.length > 0) {
      const { data: reviewerRows, error: reviewerError } = await serviceRoleClient
        .from("user_role_in_department")
        .select("profile_id")
        .in("department_id", scopedDepartmentIds)
        .in("role_id", leaderRoleIds);

      if (reviewerError) {
        throw new Error(reviewerError.message || "Không tải được danh sách Leader duyệt yêu cầu.");
      }

      reviewerProfileIds = [
        ...new Set(
          (reviewerRows ?? [])
            .map((row) => row.profile_id)
            .filter(Boolean)
            .map((item) => String(item))
            .filter((item) => item !== requesterProfileId),
        ),
      ];
    }
  } else if (requesterScope === "leader") {
    const ownLeaderDepartmentIds = [
      ...new Set(
        typedRequesterRoles
          .filter(
            (row) => row.department_id && row.role_id && leaderRoleIds.includes(String(row.role_id)),
          )
          .map((row) => String(row.department_id)),
      ),
    ];

    const parentDepartmentIds = getAncestors(
      ownLeaderDepartmentIds,
      parentDepartmentById,
      false,
    );
    let parentLeaders: string[] = [];
    if (leaderRoleIds.length > 0 && parentDepartmentIds.length > 0) {
      const { data: parentLeaderRows, error: parentLeaderError } = await serviceRoleClient
        .from("user_role_in_department")
        .select("profile_id")
        .in("department_id", parentDepartmentIds)
        .in("role_id", leaderRoleIds);

      if (parentLeaderError) {
        throw new Error(parentLeaderError.message || "Không tải được Leader phòng ban cha.");
      }

      parentLeaders = [
        ...new Set(
          (parentLeaderRows ?? [])
            .map((row) => row.profile_id)
            .filter(Boolean)
            .map((item) => String(item)),
        ),
      ];
    }

    let directorReviewers: string[] = [];
    if (directorRoleIds.length > 0) {
      const { data: directorRows, error: directorError } = await serviceRoleClient
        .from("user_role_in_department")
        .select("profile_id")
        .in("role_id", directorRoleIds);

      if (directorError) {
        throw new Error(
          directorError.message || "Không tải được người duyệt vai trò Giám đốc.",
        );
      }

      directorReviewers = [
        ...new Set(
          (directorRows ?? [])
            .map((row) => row.profile_id)
            .filter(Boolean)
            .map((item) => String(item)),
        ),
      ];
    }

    reviewerProfileIds = [...new Set([...parentLeaders, ...directorReviewers])].filter(
      (item) => item !== requesterProfileId,
    );
  }

  if ((requesterScope === "member" || requesterScope === "leader") && reviewerProfileIds.length === 0) {
    if (requesterScope === "leader") {
      throw new Error(
        "Không tìm thấy người duyệt cho Leader. Cần có Leader phòng ban cha hoặc role Giám đốc trong user_role_in_department.",
      );
    }

    throw new Error("Không tìm thấy người duyệt phù hợp theo cấu hình phòng ban hiện tại.");
  }

  const { data: activeReviewerRows, error: activeReviewerError } = await serviceRoleClient
    .from("profiles")
    .select("id")
    .in("id", reviewerProfileIds)
    .eq("is_active", true);

  if (activeReviewerError) {
    throw new Error(
      activeReviewerError.message || "Không thể kiểm tra trạng thái hoạt động của người duyệt.",
    );
  }

  const activeReviewerProfileIds = [
    ...new Set(
      (activeReviewerRows ?? [])
        .map((row) => row.id)
        .filter(Boolean)
        .map((item) => String(item))
        .filter((item) => item !== requesterProfileId),
    ),
  ];

  if ((requesterScope === "member" || requesterScope === "leader") && activeReviewerProfileIds.length === 0) {
    if (requesterScope === "leader") {
      throw new Error(
        "Không tìm thấy người duyệt đang hoạt động cho Leader. Cần có Leader phòng ban cha hoặc Giám đốc với profile đang hoạt động.",
      );
    }

    throw new Error("Không tìm thấy người duyệt đang hoạt động phù hợp theo cấu hình phòng ban hiện tại.");
  }

  return activeReviewerProfileIds;
}

export async function POST(request: Request) {
  let payload: CreateTimeRequestPayload;

  try {
    payload = (await request.json()) as CreateTimeRequestPayload;
  } catch {
    return NextResponse.json({ error: "Body JSON không hợp lệ." }, { status: 400 });
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Thiếu access token." }, { status: 401 });
  }

  const correctionDate = payload.correctionDate?.trim() ?? "";
  const requestType = payload.requestType ?? null;
  const normalizedReason = payload.reason?.trim() ?? "";
  const requestedHours =
    typeof payload.requestedHours === "number" && Number.isFinite(payload.requestedHours)
      ? payload.requestedHours
      : null;
  const earlyLeaveTime = payload.earlyLeaveTime?.trim() || null;
  const remoteCheckIn = payload.remoteCheckIn?.trim() || null;
  const remoteCheckOut = payload.remoteCheckOut?.trim() || null;
  const remoteMinutes =
    requestType === "remote"
      ? calculateWorkedMinutesBetweenTimestamps(remoteCheckIn, remoteCheckOut)
      : null;
  const earlyLeaveMinutes =
    isMissingTimeRequestType(requestType) && payload.leaveSubtype === "early_leave"
      ? (getEarlyLeaveMinutesFromTimeValue(earlyLeaveTime) ??
        getLeaveRequestDurationMinutes(payload.leaveSubtype ?? null, requestedHours))
      : null;
  const normalizedMinutes =
    requestType === "remote"
      ? remoteMinutes
      : isMissingTimeRequestType(requestType)
        ? payload.leaveSubtype === "early_leave"
          ? earlyLeaveMinutes
          : getLeaveRequestDurationMinutes(payload.leaveSubtype ?? null, requestedHours)
        : typeof payload.minutes === "number" && Number.isFinite(payload.minutes)
          ? Math.max(0, Math.round(payload.minutes))
          : null;

  if (!requestType || !correctionDate || !/^\d{4}-\d{2}-\d{2}$/.test(correctionDate)) {
    return NextResponse.json({ error: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400 });
  }

  if (isTimeRequestDateTooFarInPast(correctionDate)) {
    return NextResponse.json({ error: TIME_REQUEST_DATE_WINDOW_MESSAGE }, { status: 400 });
  }

  if (!normalizedReason) {
    return NextResponse.json({ error: "Vui lòng nhập lý do." }, { status: 400 });
  }

  if (requestType === "remote" && (!remoteCheckIn || !remoteCheckOut || !remoteMinutes)) {
    return NextResponse.json(
      { error: "Làm việc từ xa phải nhập đủ giờ bắt đầu và giờ kết thúc hợp lệ." },
      { status: 400 },
    );
  }

  try {
    const authClient = createServerSupabaseAuthClient();
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);

    if (authError || !authData.user?.id) {
      return NextResponse.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });
    }

    const serviceRoleClient = createServerSupabaseServiceRoleClient();
    const { data: requesterProfile, error: requesterProfileError } = await serviceRoleClient
      .from("profiles")
      .select("id,is_active,is_timekeeping_enabled")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (requesterProfileError || !requesterProfile?.id) {
      return NextResponse.json(
        { error: requesterProfileError?.message ?? "Không tìm thấy hồ sơ người dùng." },
        { status: 400 },
      );
    }

    if (!canCreateTimeRequest(requesterProfile as ProfileAccessRow)) {
      return NextResponse.json({ error: TIMEKEEPING_DISABLED_MESSAGE }, { status: 403 });
    }

    if (requestType === "approved_leave" && typeof normalizedMinutes === "number" && normalizedMinutes > 0) {
      const leaveBalanceRow = await fetchLeaveBalanceForMonth(
        serviceRoleClient,
        String(requesterProfile.id),
        correctionDate,
      );
      const totalHours =
        typeof leaveBalanceRow.total_hours === "number" ? Math.max(0, leaveBalanceRow.total_hours) : 0;
      const usedHours =
        typeof leaveBalanceRow.used_hours === "number" ? Math.max(0, leaveBalanceRow.used_hours) : 0;
      const remainingHours = Math.max(0, totalHours - usedHours);
      const requestedLeaveHours = normalizedMinutes / 60;

      if (requestedLeaveHours > remainingHours) {
        return NextResponse.json(
          {
            error: `Số giờ phép còn lại của tháng này không đủ. Còn ${remainingHours} giờ, yêu cầu ${requestedLeaveHours} giờ.`,
          },
          { status: 400 },
        );
      }
    }

    const reviewerProfileIds = await resolveReviewerProfileIds(
      serviceRoleClient,
      String(requesterProfile.id),
    );

    const { data: createdRequest, error: createRequestError } = await serviceRoleClient
      .from("time_requests")
      .insert({
        profile_id: String(requesterProfile.id),
        date: correctionDate,
        type: requestType,
        minutes: normalizedMinutes,
        reason: normalizedReason,
        request_schema_version: 2,
        leave_subtype: isMissingTimeRequestType(requestType) ? payload.leaveSubtype ?? null : null,
        leave_session: payload.leaveSession ?? null,
        requested_hours: null,
        remote_check_in: requestType === "remote" ? remoteCheckIn : null,
        remote_check_out: requestType === "remote" ? remoteCheckOut : null,
      })
      .select("id")
      .maybeSingle();

    if (createRequestError || !createdRequest?.id) {
      throw new Error(createRequestError?.message || "Không thể tạo yêu cầu thời gian.");
    }

    if (reviewerProfileIds.length > 0) {
      const reviewerPayload = reviewerProfileIds.map((reviewerProfileId) => ({
        time_request_id: String(createdRequest.id),
        profile_id: reviewerProfileId,
      }));

      const { error: insertReviewerError } = await serviceRoleClient
        .from("time_request_reviewers")
        .insert(reviewerPayload);

      if (insertReviewerError) {
        throw new Error(insertReviewerError.message || "Không thể tạo danh sách người duyệt.");
      }
    }

    return NextResponse.json({ id: String(createdRequest.id) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể tạo yêu cầu thời gian.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Thiếu access token." }, { status: 401 });
  }

  const requestId = getRequestIdFromUrl(request);
  if (!requestId) {
    return NextResponse.json({ error: "Thiếu mã yêu cầu cần xóa." }, { status: 400 });
  }

  try {
    const authClient = createServerSupabaseAuthClient();
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);

    if (authError || !authData.user?.id) {
      return NextResponse.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });
    }

    const serviceRoleClient = createServerSupabaseServiceRoleClient();
    const { data: requesterProfile, error: requesterProfileError } = await serviceRoleClient
      .from("profiles")
      .select("id")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (requesterProfileError || !requesterProfile?.id) {
      return NextResponse.json(
        { error: requesterProfileError?.message ?? "Không tìm thấy hồ sơ người dùng." },
        { status: 400 },
      );
    }

    const { data: timeRequest, error: timeRequestError } = await serviceRoleClient
      .from("time_requests")
      .select("id,profile_id,time_request_reviewers(is_approved)")
      .eq("id", requestId)
      .maybeSingle();

    if (timeRequestError) {
      throw new Error(timeRequestError.message || "Không thể tải yêu cầu thời gian.");
    }

    if (!timeRequest?.id) {
      return NextResponse.json({ error: "Không tìm thấy yêu cầu thời gian." }, { status: 404 });
    }

    if (!timeRequest.profile_id || String(timeRequest.profile_id) !== String(requesterProfile.id)) {
      return NextResponse.json(
        { error: "Bạn không có quyền xóa yêu cầu này." },
        { status: 403 },
      );
    }

    const requestStatus = getTimeRequestReviewStatus(
      (timeRequest.time_request_reviewers ?? []) as TimeRequestReviewerStatusRow[],
    );
    if (requestStatus !== "pending") {
      return NextResponse.json(
        { error: "Chỉ có thể xóa yêu cầu đang ở trạng thái chờ duyệt." },
        { status: 409 },
      );
    }

    const { error: deleteReviewersError } = await serviceRoleClient
      .from("time_request_reviewers")
      .delete()
      .eq("time_request_id", requestId);

    if (deleteReviewersError) {
      throw new Error(deleteReviewersError.message || "Không thể xóa danh sách người duyệt.");
    }

    const { error: deleteRequestError } = await serviceRoleClient
      .from("time_requests")
      .delete()
      .eq("id", requestId);

    if (deleteRequestError) {
      throw new Error(deleteRequestError.message || "Không thể xóa yêu cầu thời gian.");
    }

    return NextResponse.json({ id: requestId }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể xóa yêu cầu thời gian.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
