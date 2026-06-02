import { NextResponse } from "next/server";

import { isAttendanceExportAdminEmail } from "@/lib/attendance-export-access";
import { buildAttendanceWorkbookBuffer, type AttendanceExportProfile } from "@/lib/attendance-export-workbook";
import { loadTimesheetExportContext } from "@/lib/timesheet-export";
import {
  createServerSupabaseAuthClient,
  createServerSupabaseServiceRoleClient,
} from "@/lib/supabase-server";
import { canReadTimekeepingData } from "@/lib/timekeeping-access";

type ExportRequestPayload = {
  selectedMonth?: string;
  profiles?: AttendanceExportProfile[];
  fileName?: string;
};

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authorization.slice(7).trim();
  return token || null;
}

function parseSelectedMonth(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearValue, monthValue] = value.split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return new Date(year, month - 1, 1);
}

function sanitizeFileName(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  if (!normalized) {
    return fallback;
  }

  return normalized.replace(/[\\/:*?"<>|]+/g, "-");
}

export async function POST(request: Request) {
  let payload: ExportRequestPayload;

  try {
    payload = (await request.json()) as ExportRequestPayload;
  } catch {
    return NextResponse.json({ error: "Body JSON không hợp lệ." }, { status: 400 });
  }

  const selectedMonth = parseSelectedMonth(payload.selectedMonth);
  const profiles = Array.isArray(payload.profiles) ? payload.profiles : [];

  if (!selectedMonth) {
    return NextResponse.json({ error: "Tháng xuất không hợp lệ." }, { status: 400 });
  }

  if (profiles.length <= 0) {
    return NextResponse.json({ error: "Thiếu danh sách nhân sự cần xuất." }, { status: 400 });
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Thiếu access token." }, { status: 401 });
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
      return NextResponse.json({ error: "Bạn không có quyền xuất chấm công." }, { status: 403 });
    }

    const serviceRoleClient = createServerSupabaseServiceRoleClient();
    const requestedProfileIds = [...new Set(profiles.map((profile) => profile.id).filter(Boolean))];
    if (requestedProfileIds.length <= 0) {
      return NextResponse.json({ error: "Thiếu nhân sự hợp lệ để xuất dữ liệu." }, { status: 400 });
    }

    const { data: eligibleProfileRows, error: eligibleProfilesError } = await serviceRoleClient
      .from("profiles")
      .select("id,is_timekeeping_enabled")
      .in("id", requestedProfileIds);

    if (eligibleProfilesError) {
      throw eligibleProfilesError;
    }

    const eligibleProfileIds = new Set(
      (eligibleProfileRows ?? [])
        .filter((profile) => canReadTimekeepingData(profile))
        .map((profile) => String(profile.id)),
    );
    const exportProfiles = profiles.filter((profile) => eligibleProfileIds.has(profile.id));

    if (exportProfiles.length <= 0) {
      return NextResponse.json(
        { error: "Không có nhân sự nào được bật tính công để xuất dữ liệu." },
        { status: 400 },
      );
    }

    const workbookEntries = await Promise.all(
      exportProfiles.map(async (profile) => ({
        profile,
        exportContext: await loadTimesheetExportContext(profile.id, selectedMonth, {
          supabaseClient: serviceRoleClient,
        }),
      })),
    );

    const fileName = sanitizeFileName(
      payload.fileName,
      `attendance-export-${payload.selectedMonth}.xlsx`,
    );
    const workbookBuffer = await buildAttendanceWorkbookBuffer(workbookEntries);

    return new NextResponse(workbookBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-Export-File-Name": encodeURIComponent(fileName),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Không thể xuất file chấm công.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
