import { supabase } from "@/lib/supabase";

export type TimeRequestRoleScope = "director" | "leader" | "member";

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

type TimeRequestManagementScope = {
  roleScope: TimeRequestRoleScope;
  managedProfileIds: string[] | null;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function buildTimeRequestSharePath(requestId: string) {
  return `/time-requests/${encodeURIComponent(requestId)}`;
}

export async function resolveCurrentViewerProfileId() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error("Không xác thực được người dùng.");
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (profileError || !profileData?.id) {
    throw new Error(profileError?.message ?? "Không tìm thấy hồ sơ người dùng.");
  }

  return String(profileData.id);
}

export async function resolveTimeRequestManagementScope(
  viewerProfileId: string,
): Promise<TimeRequestManagementScope> {
  const { data: rolesData, error: rolesError } = await supabase.from("roles").select("id,name");
  if (rolesError) {
    throw new Error(rolesError.message || "Không tải được danh sách vai trò.");
  }

  const typedRoles = (rolesData ?? []) as RoleRow[];
  const directorRoleIds = typedRoles
    .filter((role) => {
      const roleName = normalizeText(role.name);
      return roleName === "giam doc" || roleName.includes("giam doc") || roleName === "director";
    })
    .map((role) => String(role.id));
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

  const { data: currentUserRolesData, error: currentUserRolesError } = await supabase
    .from("user_role_in_department")
    .select("profile_id,department_id,role_id")
    .eq("profile_id", viewerProfileId);

  if (currentUserRolesError) {
    throw new Error(currentUserRolesError.message || "Không tải được vai trò hiện tại.");
  }

  const currentUserRoles = (currentUserRolesData ?? []) as UserRoleRow[];
  const hasDirectorRole = currentUserRoles.some(
    (row) => row.role_id && directorRoleIds.includes(String(row.role_id)),
  );
  const hasLeaderRole = currentUserRoles.some(
    (row) => row.role_id && leaderRoleIds.includes(String(row.role_id)),
  );

  if (hasDirectorRole) {
    return {
      roleScope: "director",
      managedProfileIds: null,
    };
  }

  if (!hasLeaderRole) {
    return {
      roleScope: "member",
      managedProfileIds: [],
    };
  }

  const ownLeaderDepartmentIds = [
    ...new Set(
      currentUserRoles
        .filter((row) => row.department_id && row.role_id && leaderRoleIds.includes(String(row.role_id)))
        .map((row) => String(row.department_id)),
    ),
  ];

  if (ownLeaderDepartmentIds.length === 0) {
    return {
      roleScope: "leader",
      managedProfileIds: [],
    };
  }

  const { data: allDepartmentsData, error: allDepartmentsError } = await supabase
    .from("departments")
    .select("id,parent_department_id");

  if (allDepartmentsError) {
    throw new Error(allDepartmentsError.message || "Không tải được cây phòng ban.");
  }

  const typedDepartments = (allDepartmentsData ?? []) as DepartmentRow[];
  const childrenByParent = typedDepartments.reduce<Record<string, string[]>>((acc, department) => {
    const parentId = department.parent_department_id ? String(department.parent_department_id) : null;
    if (!parentId) {
      return acc;
    }
    if (!acc[parentId]) {
      acc[parentId] = [];
    }
    acc[parentId].push(String(department.id));
    return acc;
  }, {});

  const scopedDepartmentIds = new Set<string>(ownLeaderDepartmentIds);
  const queue = [...ownLeaderDepartmentIds];
  while (queue.length > 0) {
    const departmentId = queue.shift() as string;
    const children = childrenByParent[departmentId] ?? [];
    children.forEach((childId) => {
      if (scopedDepartmentIds.has(childId)) {
        return;
      }
      scopedDepartmentIds.add(childId);
      queue.push(childId);
    });
  }

  const effectiveRoleIds = [...new Set([...leaderRoleIds, ...memberRoleIds])];
  if (effectiveRoleIds.length === 0) {
    return {
      roleScope: "leader",
      managedProfileIds: [],
    };
  }

  const { data: scopedUserRolesData, error: scopedUserRolesError } = await supabase
    .from("user_role_in_department")
    .select("profile_id,department_id,role_id")
    .in("department_id", Array.from(scopedDepartmentIds))
    .in("role_id", effectiveRoleIds);

  if (scopedUserRolesError) {
    throw new Error(scopedUserRolesError.message || "Không tải được danh sách cấp dưới.");
  }

  return {
    roleScope: "leader",
    managedProfileIds: [
      ...new Set(
        ((scopedUserRolesData ?? []) as UserRoleRow[])
          .map((row) => row.profile_id)
          .filter(Boolean)
          .map((item) => String(item))
          .filter((item) => item !== viewerProfileId),
      ),
    ],
  };
}

export function canManageTimeRequestProfile(
  viewerProfileId: string,
  requestProfileId: string | null | undefined,
  scope: TimeRequestManagementScope,
) {
  if (!requestProfileId || requestProfileId === viewerProfileId) {
    return false;
  }

  if (scope.roleScope === "director") {
    return true;
  }

  return (scope.managedProfileIds ?? []).includes(requestProfileId);
}
