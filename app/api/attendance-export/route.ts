import { NextResponse } from "next/server";

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

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getDirectorRoleIds(roles: RoleRow[]) {
  return roles
    .filter((role) => {
      const roleName = normalizeText(role.name);
      return roleName === "director" || roleName.includes("director") || roleName.includes("giam doc");
    })
    .map((role) => String(role.id));
}

function getLeaderRoleIds(roles: RoleRow[]) {
  return roles
    .filter((role) => {
      const roleName = normalizeText(role.name);
      return roleName === "leader" || roleName.includes("leader") || roleName.includes("truong nhom");
    })
    .map((role) => String(role.id));
}

function getMemberRoleIds(roles: RoleRow[]) {
  return roles
    .filter((role) => {
      const roleName = normalizeText(role.name);
      return roleName === "member" || roleName.includes("member") || roleName.includes("thanh vien");
    })
    .map((role) => String(role.id));
}

function getDescendantDepartmentIds(seedDepartmentIds: string[], departments: DepartmentRow[]) {
  const childrenByParent = departments.reduce<Record<string, string[]>>((acc, department) => {
    const parentDepartmentId = department.parent_department_id ? String(department.parent_department_id) : null;
    if (!parentDepartmentId) {
      return acc;
    }
    if (!acc[parentDepartmentId]) {
      acc[parentDepartmentId] = [];
    }
    acc[parentDepartmentId].push(String(department.id));
    return acc;
  }, {});

  const scopedDepartmentIds = new Set<string>(seedDepartmentIds);
  const queue = [...seedDepartmentIds];

  while (queue.length > 0) {
    const departmentId = queue.shift() as string;
    const childDepartmentIds = childrenByParent[departmentId] ?? [];

    childDepartmentIds.forEach((childDepartmentId) => {
      if (scopedDepartmentIds.has(childDepartmentId)) {
        return;
      }
      scopedDepartmentIds.add(childDepartmentId);
      queue.push(childDepartmentId);
    });
  }

  return Array.from(scopedDepartmentIds);
}

async function resolveAttendanceExportAccess(
  serviceRoleClient: ReturnType<typeof createServerSupabaseServiceRoleClient>,
  viewerProfileId: string,
) {
  const [
    { data: rolesData, error: rolesError },
    { data: viewerMembershipsData, error: viewerMembershipsError },
    { data: departmentsData, error: departmentsError },
  ] = await Promise.all([
    serviceRoleClient.from("roles").select("id,name"),
    serviceRoleClient
      .from("user_role_in_department")
      .select("profile_id,department_id,role_id")
      .eq("profile_id", viewerProfileId),
    serviceRoleClient.from("departments").select("id,parent_department_id"),
  ]);

  if (rolesError) {
    throw new Error(rolesError.message || "Không tải được danh sách vai trò.");
  }
  if (viewerMembershipsError) {
    throw new Error(viewerMembershipsError.message || "Không tải được vai trò hiện tại.");
  }
  if (departmentsError) {
    throw new Error(departmentsError.message || "Không tải được cây phòng ban.");
  }

  const roles = (rolesData ?? []) as RoleRow[];
  const viewerMemberships = (viewerMembershipsData ?? []) as UserRoleRow[];
  const departments = (departmentsData ?? []) as DepartmentRow[];
  const directorRoleIds = getDirectorRoleIds(roles);
  const leaderRoleIds = getLeaderRoleIds(roles);
  const memberRoleIds = getMemberRoleIds(roles);
  const hasDirectorRole = viewerMemberships.some(
    (membership) => membership.role_id && directorRoleIds.includes(String(membership.role_id)),
  );

  if (hasDirectorRole) {
    return {
      canExport: true,
      roleScope: "director" as const,
      accessibleProfileIds: null,
    };
  }

  const ownLeaderDepartmentIds = [
    ...new Set(
      viewerMemberships
        .filter(
          (membership) =>
            membership.department_id &&
            membership.role_id &&
            leaderRoleIds.includes(String(membership.role_id)),
        )
        .map((membership) => String(membership.department_id)),
    ),
  ];

  if (ownLeaderDepartmentIds.length <= 0) {
    return {
      canExport: false,
      roleScope: "member" as const,
      accessibleProfileIds: [] as string[],
    };
  }

  const effectiveRoleIds = [...new Set([...leaderRoleIds, ...memberRoleIds])];
  if (effectiveRoleIds.length <= 0) {
    return {
      canExport: false,
      roleScope: "leader" as const,
      accessibleProfileIds: [] as string[],
    };
  }

  const scopedDepartmentIds = getDescendantDepartmentIds(ownLeaderDepartmentIds, departments);
  const { data: scopedMembershipsData, error: scopedMembershipsError } = await serviceRoleClient
    .from("user_role_in_department")
    .select("profile_id,department_id,role_id")
    .in("department_id", scopedDepartmentIds)
    .in("role_id", effectiveRoleIds);

  if (scopedMembershipsError) {
    throw new Error(scopedMembershipsError.message || "Không tải được phạm vi nhân sự.");
  }

  return {
    canExport: true,
    roleScope: "leader" as const,
    accessibleProfileIds: [
      ...new Set(
        ((scopedMembershipsData ?? []) as UserRoleRow[])
          .map((membership) => membership.profile_id)
          .filter(Boolean)
          .map((profileId) => String(profileId))
          .filter((profileId) => profileId !== viewerProfileId),
      ),
    ],
  };
}

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

    if (authError || !authData.user?.id) {
      return NextResponse.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });
    }

    const serviceRoleClient = createServerSupabaseServiceRoleClient();
    const { data: viewerProfile, error: viewerProfileError } = await serviceRoleClient
      .from("profiles")
      .select("id")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (viewerProfileError || !viewerProfile?.id) {
      return NextResponse.json({ error: "Không tìm thấy hồ sơ người dùng." }, { status: 403 });
    }

    const exportAccess = await resolveAttendanceExportAccess(
      serviceRoleClient,
      String(viewerProfile.id),
    );

    if (!exportAccess.canExport) {
      return NextResponse.json({ error: "Bạn không có quyền xuất chấm công." }, { status: 403 });
    }

    const requestedProfileIds = [...new Set(profiles.map((profile) => profile.id).filter(Boolean))];
    if (requestedProfileIds.length <= 0) {
      return NextResponse.json({ error: "Thiếu nhân sự hợp lệ để xuất dữ liệu." }, { status: 400 });
    }

    if (exportAccess.roleScope === "leader") {
      const allowedProfileIds = new Set(exportAccess.accessibleProfileIds ?? []);
      const hasOutOfScopeProfile = requestedProfileIds.some(
        (profileId) => !allowedProfileIds.has(profileId),
      );

      if (hasOutOfScopeProfile) {
        return NextResponse.json(
          { error: "Danh sách nhân sự cần xuất vượt quá phạm vi quản lý chấm công." },
          { status: 403 },
        );
      }
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
