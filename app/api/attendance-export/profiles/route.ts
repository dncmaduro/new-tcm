import { NextResponse } from "next/server";

import { isAttendanceExportAdminEmail } from "@/lib/attendance-export-access";
import { collectAttendanceIds } from "@/lib/attendance";
import { getAuthEmailsByUserIds } from "@/lib/auth-user-email";
import { createServerSupabaseAuthClient, createServerSupabaseServiceRoleClient } from "@/lib/supabase-server";

type ProfileRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  attendance_id: number | null;
  is_timekeeping_enabled: boolean | null;
};

type MembershipRow = {
  profile_id: string | null;
  department_id: string | null;
  role_id: string | null;
};

type RoleRow = {
  id: string;
  name: string | null;
};

type DepartmentRow = {
  id: string;
  name: string | null;
};

type AttendanceLinkRow = {
  profile_id: string | null;
  attendance_id: number | null;
};

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authorization.slice(7).trim();
  return token || null;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function toRolePriority(roleName: string) {
  const normalized = normalizeText(roleName);
  if (normalized.includes("giam doc") || normalized.includes("director")) {
    return 0;
  }
  if (
    normalized.includes("leader") ||
    normalized.includes("truong nhom") ||
    normalized.includes("manager")
  ) {
    return 1;
  }
  if (normalized.includes("member") || normalized.includes("thanh vien")) {
    return 2;
  }
  return 3;
}

export async function GET(request: Request) {
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
      return NextResponse.json({ error: "Bạn không có quyền xem dữ liệu xuất chấm công." }, { status: 403 });
    }

    const serviceRoleClient = createServerSupabaseServiceRoleClient();
    const [
      { data: profilesData, error: profilesError },
      { data: membershipsData, error: membershipsError },
      { data: rolesData, error: rolesError },
      { data: departmentsData, error: departmentsError },
    ] = await Promise.all([
      serviceRoleClient
        .from("profiles")
        .select("id,user_id,name,attendance_id,is_timekeeping_enabled")
        .order("name", { ascending: true }),
      serviceRoleClient.from("user_role_in_department").select("profile_id,department_id,role_id"),
      serviceRoleClient.from("roles").select("id,name"),
      serviceRoleClient.from("departments").select("id,name"),
    ]);

    if (profilesError) throw profilesError;
    if (membershipsError) throw membershipsError;
    if (rolesError) throw rolesError;
    if (departmentsError) throw departmentsError;

    const profiles = (profilesData ?? []) as ProfileRow[];
    const authEmailByUserId = await getAuthEmailsByUserIds(
      serviceRoleClient,
      profiles.map((profile) => profile.user_id),
    );
    const profileIds = profiles.map((profile) => String(profile.id));
    const { data: attendanceLinksData, error: attendanceLinksError } =
      profileIds.length > 0
        ? await serviceRoleClient
            .from("times_profiles")
            .select("profile_id,attendance_id")
            .in("profile_id", profileIds)
        : { data: [], error: null };

    if (attendanceLinksError) throw attendanceLinksError;

    const roleNameById = ((rolesData ?? []) as RoleRow[]).reduce<Record<string, string>>(
      (acc, role) => {
        acc[String(role.id)] = role.name?.trim() || "Chưa gán vai trò";
        return acc;
      },
      {},
    );
    const departmentNameById = ((departmentsData ?? []) as DepartmentRow[]).reduce<
      Record<string, string>
    >((acc, department) => {
      acc[String(department.id)] = department.name?.trim() || "Không rõ phòng ban";
      return acc;
    }, {});
    const membershipsByProfileId = ((membershipsData ?? []) as MembershipRow[]).reduce<
      Record<string, MembershipRow[]>
    >((acc, membership) => {
      if (!membership.profile_id) return acc;
      const profileId = String(membership.profile_id);
      (acc[profileId] ??= []).push(membership);
      return acc;
    }, {});
    const linksByProfileId = ((attendanceLinksData ?? []) as AttendanceLinkRow[]).reduce<
      Record<string, AttendanceLinkRow[]>
    >((acc, link) => {
      if (!link.profile_id) return acc;
      const profileId = String(link.profile_id);
      (acc[profileId] ??= []).push(link);
      return acc;
    }, {});

    const viewableProfiles = profiles
      .map((profile) => {
        const profileId = String(profile.id);
        const assignments = (membershipsByProfileId[profileId] ?? [])
          .map((membership) => ({
            roleLabel: membership.role_id
              ? (roleNameById[String(membership.role_id)] ?? "Chưa gán vai trò")
              : "Chưa gán vai trò",
            departmentLabel: membership.department_id
              ? (departmentNameById[String(membership.department_id)] ?? "Không rõ phòng ban")
              : "Không thuộc phòng ban",
          }))
          .sort((a, b) => {
            const byPriority = toRolePriority(a.roleLabel) - toRolePriority(b.roleLabel);
            if (byPriority !== 0) return byPriority;
            const byRole = a.roleLabel.localeCompare(b.roleLabel, "vi");
            if (byRole !== 0) return byRole;
            return a.departmentLabel.localeCompare(b.departmentLabel, "vi");
          });
        const primaryAssignment = assignments[0] ?? {
          roleLabel: "Chưa gán vai trò",
          departmentLabel: "Không thuộc phòng ban",
        };

        return {
          id: profileId,
          name: profile.name?.trim() || authEmailByUserId.get(profile.user_id ?? "") || "Không rõ",
          email: authEmailByUserId.get(profile.user_id ?? "") || null,
          roleLabel: primaryAssignment.roleLabel,
          departmentLabel: primaryAssignment.departmentLabel,
          rawRolePriority: toRolePriority(primaryAssignment.roleLabel),
          attendanceIds: collectAttendanceIds([
            profile.attendance_id,
            ...(linksByProfileId[profileId] ?? []),
          ]),
          isTimekeepingEnabled: profile.is_timekeeping_enabled === true,
        };
      })
      .sort((a, b) => {
        const byPriority = a.rawRolePriority - b.rawRolePriority;
        if (byPriority !== 0) return byPriority;
        return a.name.localeCompare(b.name, "vi");
      });

    return NextResponse.json(
      { profiles: viewableProfiles },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể tải dữ liệu xuất chấm công." },
      { status: 500 },
    );
  }
}
