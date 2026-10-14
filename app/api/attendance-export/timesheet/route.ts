import { NextResponse } from "next/server";

import {
  buildTimesDeviceFilter,
  collectAttendanceDeviceLinks,
  normalizeAttendanceId,
} from "@/lib/attendance";
import { isAttendanceExportAdminEmail } from "@/lib/attendance-export-access";
import { createServerSupabaseAuthClient, createServerSupabaseServiceRoleClient } from "@/lib/supabase-server";

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authorization.slice(7).trim();
  return token || null;
}

function parseMonth(value: string | null) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearToken, monthToken] = value.split("-");
  const year = Number(yearToken);
  const month = Number(monthToken);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  const startIso = `${yearToken}-${monthToken}-01`;
  const nextMonth = new Date(Date.UTC(year, month, 1));
  const endIso = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}-01`;

  return { startIso, endIso };
}

export async function GET(request: Request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Thiếu access token." }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const profileId = searchParams.get("profileId")?.trim() ?? "";
  const month = parseMonth(searchParams.get("selectedMonth"));
  if (!profileId || !month) {
    return NextResponse.json({ error: "Thiếu nhân sự hoặc tháng chấm công hợp lệ." }, { status: 400 });
  }

  try {
    const authClient = createServerSupabaseAuthClient();
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !authData.user?.email) {
      return NextResponse.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });
    }

    const access = isAttendanceExportAdminEmail(authData.user.email);
    if (!access.configured) {
      return NextResponse.json(
        { error: "Chưa cấu hình `ADMIN_EMAILS` trên server." },
        { status: 500 },
      );
    }
    if (!access.allowed) {
      return NextResponse.json({ error: "Bạn không có quyền xem dữ liệu xuất chấm công." }, { status: 403 });
    }

    const serviceRoleClient = createServerSupabaseServiceRoleClient();
    const [
      { data: profile, error: profileError },
      { data: attendanceLinks, error: attendanceLinksError },
      { data: timeRequests, error: timeRequestsError },
    ] = await Promise.all([
      serviceRoleClient
        .from("profiles")
        .select("id,attendance_id,is_timekeeping_enabled")
        .eq("id", profileId)
        .eq("is_timekeeping_enabled", true)
        .maybeSingle(),
      serviceRoleClient
        .from("times_profiles")
        .select("attendance_id,device_id,created_at")
        .eq("profile_id", profileId),
      serviceRoleClient
        .from("time_requests")
        .select(
          "id,date,type,leave_subtype,leave_session,requested_hours,minutes,reason,remote_check_in,remote_check_out,created_at,time_request_reviewers(is_approved,reviewed_at,created_at)",
        )
        .eq("profile_id", profileId)
        .gte("date", month.startIso)
        .lt("date", month.endIso)
        .order("created_at", { ascending: false }),
    ]);

    if (profileError) throw profileError;
    if (attendanceLinksError) throw attendanceLinksError;
    if (timeRequestsError) throw timeRequestsError;
    if (!profile) {
      return NextResponse.json({ error: "Không tìm thấy nhân sự." }, { status: 404 });
    }

    const directAttendanceId = normalizeAttendanceId(profile.attendance_id);
    const linkedDeviceBindings = collectAttendanceDeviceLinks(attendanceLinks ?? []);
    let times: unknown[] = [];

    if (linkedDeviceBindings.length > 0 || directAttendanceId !== null) {
      let timesQuery = serviceRoleClient
        .from("times")
        .select("id,attendance_id,device_id,date,check_in,check_out,created_at,updated_at")
        .gte("date", month.startIso)
        .lt("date", month.endIso);

      if (linkedDeviceBindings.length > 0) {
        timesQuery = timesQuery.or(buildTimesDeviceFilter(linkedDeviceBindings));
      } else if (directAttendanceId !== null) {
        timesQuery = timesQuery.eq("attendance_id", directAttendanceId);
      }

      const { data, error } = await timesQuery
        .order("date", { ascending: true })
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      times = data ?? [];
    }

    return NextResponse.json(
      {
        profile,
        attendanceLinks: attendanceLinks ?? [],
        times,
        timeRequests: timeRequests ?? [],
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể tải lịch chấm công." },
      { status: 500 },
    );
  }
}
