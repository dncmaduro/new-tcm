import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";

import { isAttendanceExportAdminEmail } from "@/lib/attendance-export-access";
import { getAuthEmailsByUserIds } from "@/lib/auth-user-email";
import { buildAttendanceWorkbookBuffer, type AttendanceExportProfile } from "@/lib/attendance-export-workbook";
import {
  createServerSupabaseAuthClient,
  createServerSupabaseServiceRoleClient,
} from "@/lib/supabase-server";
import { loadTimesheetExportContext } from "@/lib/timesheet-export";

type PrepareRequestPayload = {
  selectedMonth?: string;
  profiles?: AttendanceExportProfile[];
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

  const [yearToken, monthToken] = value.split("-");
  const year = Number(yearToken);
  const month = Number(monthToken);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return new Date(year, month - 1, 1);
}

function sanitizeFileSegment(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function buildFileName(profileName: string, selectedMonth: Date) {
  const safeName = sanitizeFileSegment(profileName) || "nhan-su";
  return `Bang-cham-cong-${safeName}-${String(selectedMonth.getMonth() + 1).padStart(2, "0")}-${selectedMonth.getFullYear()}.xlsx`;
}

export async function POST(request: Request) {
  let payload: PrepareRequestPayload;
  try {
    payload = (await request.json()) as PrepareRequestPayload;
  } catch {
    return NextResponse.json({ error: "Body JSON không hợp lệ." }, { status: 400 });
  }

  const selectedMonth = parseSelectedMonth(payload.selectedMonth);
  const profiles = Array.isArray(payload.profiles) ? payload.profiles : [];
  if (!selectedMonth) {
    return NextResponse.json({ error: "Tháng xuất không hợp lệ." }, { status: 400 });
  }
  if (profiles.length === 0) {
    return NextResponse.json({ error: "Thiếu danh sách nhân sự cần chuẩn bị." }, { status: 400 });
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
      return NextResponse.json({ error: "Bạn không có quyền gửi file chấm công." }, { status: 403 });
    }

    const serviceRoleClient = createServerSupabaseServiceRoleClient();
    const requestedProfileIds = [...new Set(profiles.map((profile) => profile.id).filter(Boolean))];
    if (requestedProfileIds.length === 0) {
      return NextResponse.json({ error: "Danh sách nhân sự không hợp lệ." }, { status: 400 });
    }
    const { data: profileRows, error: profileError } = await serviceRoleClient
      .from("profiles")
      .select("id,user_id,name")
      .in("id", requestedProfileIds);
    if (profileError) {
      throw profileError;
    }

    const profileById = new Map(
      (profileRows ?? []).map((profile) => [String(profile.id), profile]),
    );
    const authEmailByUserId = await getAuthEmailsByUserIds(
      serviceRoleClient,
      (profileRows ?? []).map((profile) => profile.user_id),
    );
    const files = [];

    for (const profile of profiles) {
      const databaseProfile = profileById.get(profile.id);
      if (!databaseProfile) {
        files.push({
          profileId: profile.id,
          name: profile.name,
          email: null,
          fileName: buildFileName(profile.name, selectedMonth),
          status: "failed" as const,
          error: "Không tìm thấy nhân sự.",
        });
        continue;
      }

      const exportProfile = {
        ...profile,
        name: databaseProfile.name?.trim() || profile.name,
        email: authEmailByUserId.get(databaseProfile.user_id ?? "") || null,
      } satisfies AttendanceExportProfile;

      try {
        const exportContext = await loadTimesheetExportContext(profile.id, selectedMonth, {
          supabaseClient: serviceRoleClient,
        });
        const workbookBuffer = Buffer.from(await buildAttendanceWorkbookBuffer([
          { profile: exportProfile, exportContext },
        ]));

        files.push({
          profileId: profile.id,
          name: exportProfile.name,
          email: exportProfile.email,
          fileName: buildFileName(exportProfile.name, selectedMonth),
          sizeBytes: workbookBuffer.length,
          status: exportProfile.email ? ("ready" as const) : ("missing_email" as const),
          error: exportProfile.email ? null : "Nhân sự chưa có email.",
        });
      } catch (error) {
        files.push({
          profileId: profile.id,
          name: exportProfile.name,
          email: exportProfile.email,
          fileName: buildFileName(exportProfile.name, selectedMonth),
          status: "failed" as const,
          error: error instanceof Error ? error.message : "Không thể tạo file.",
        });
      }
    }

    return NextResponse.json(
      {
        selectedMonth: payload.selectedMonth,
        preparedAt: new Date().toISOString(),
        files,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể tạo file chấm công." },
      { status: 500 },
    );
  }
}
