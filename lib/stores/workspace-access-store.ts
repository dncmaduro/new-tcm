"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { supabase } from "@/lib/supabase";

const CACHE_TTL_MS = 5 * 60 * 1000;

export type WorkspaceRole = {
  id: string;
  name: string | null;
};

export type WorkspaceDepartment = {
  id: string;
  name: string;
  parentDepartmentId: string | null;
};

export type WorkspaceMembership = {
  profileId: string;
  departmentId: string | null;
  roleId: string | null;
};

export type ManagedDepartment = {
  id: string;
  name: string;
  parentDepartmentId: string | null;
};

type WorkspaceProfile = {
  id: string;
  name: string | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
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
  name: string;
  parent_department_id: string | null;
};

type WorkspaceAccessStore = {
  isLoading: boolean;
  isLoaded: boolean;
  error: string | null;
  lastLoadedAt: number | null;
  authUserId: string | null;
  authEmail: string | null;
  profile: WorkspaceProfile | null;
  roles: WorkspaceRole[];
  memberships: WorkspaceMembership[];
  departments: WorkspaceDepartment[];
  managedDepartments: ManagedDepartment[];
  load: (options?: { force?: boolean }) => Promise<void>;
  reset: () => void;
};

const defaultState = {
  isLoading: false,
  isLoaded: false,
  error: null,
  lastLoadedAt: null,
  authUserId: null,
  authEmail: null,
  profile: null,
  roles: [],
  memberships: [],
  departments: [],
  managedDepartments: [],
} satisfies Omit<WorkspaceAccessStore, "load" | "reset">;

let inFlightLoad: Promise<void> | null = null;

const normalizeRoleName = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

export const getLeaderRoleIds = (roles: WorkspaceRole[]) =>
  roles
    .filter((role) => {
      const roleName = normalizeRoleName(role.name);
      return roleName === "leader" || roleName.includes("leader");
    })
    .map((role) => role.id);

export const getDirectorRoleIds = (roles: WorkspaceRole[]) =>
  roles
    .filter((role) => {
      const roleName = normalizeRoleName(role.name);
      return roleName === "director" || roleName.includes("director") || roleName.includes("giam doc");
    })
    .map((role) => role.id);

const getRootDepartmentId = (
  departmentId: string,
  departmentsById: Record<string, WorkspaceDepartment>,
) => {
  let currentDepartmentId: string | null = departmentId;
  const visitedDepartmentIds = new Set<string>();

  while (currentDepartmentId) {
    if (visitedDepartmentIds.has(currentDepartmentId)) {
      break;
    }

    visitedDepartmentIds.add(currentDepartmentId);
    const currentDepartment = departmentsById[currentDepartmentId];

    if (!currentDepartment) {
      return departmentId;
    }

    if (!currentDepartment.parentDepartmentId) {
      return currentDepartment.id;
    }

    currentDepartmentId = currentDepartment.parentDepartmentId;
  }

  return departmentId;
};

const buildManagedDepartments = (
  memberships: WorkspaceMembership[],
  departments: WorkspaceDepartment[],
  leaderRoleIds: string[],
) => {
  const departmentsById = departments.reduce<Record<string, WorkspaceDepartment>>((acc, department) => {
    acc[department.id] = department;
    return acc;
  }, {});

  const rootDepartmentIds = new Set(
    memberships
      .filter((membership) => membership.departmentId && membership.roleId && leaderRoleIds.includes(membership.roleId))
      .map((membership) =>
        getRootDepartmentId(membership.departmentId as string, departmentsById),
      ),
  );

  return departments.filter((department) => !department.parentDepartmentId && rootDepartmentIds.has(department.id));
};

export const useWorkspaceAccessStore = create<WorkspaceAccessStore>((set, get) => ({
  ...defaultState,
  async load(options) {
    const force = options?.force ?? false;
    const current = get();
    const isFresh =
      current.isLoaded &&
      current.lastLoadedAt !== null &&
      Date.now() - current.lastLoadedAt < CACHE_TTL_MS;

    if (!force && isFresh) {
      return;
    }

    if (inFlightLoad) {
      return inFlightLoad;
    }

    inFlightLoad = (async () => {
      set((state) => ({ ...state, isLoading: true, error: null }));

      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
          throw new Error(authError?.message || "Không xác thực được người dùng.");
        }

        const [profileResult, rolesResult] = await Promise.all([
          supabase.from("profiles").select("id,name").eq("user_id", authData.user.id).maybeSingle(),
          supabase.from("roles").select("id,name"),
        ]);

        if (profileResult.error || !profileResult.data?.id) {
          throw new Error(profileResult.error?.message || "Không tìm thấy hồ sơ người dùng.");
        }

        const roles = ((rolesResult.data ?? []) as RoleRow[]).map((role) => ({
          id: String(role.id),
          name: typeof role.name === "string" ? role.name : null,
        }));
        const leaderRoleIds = getLeaderRoleIds(roles);

        const profile = profileResult.data as ProfileRow;
        let memberships: WorkspaceMembership[] = [];
        let departments: WorkspaceDepartment[] = [];

        const membershipResult = await supabase
          .from("user_role_in_department")
          .select("profile_id,department_id,role_id")
          .eq("profile_id", profile.id);

        if (membershipResult.error) {
          throw new Error(membershipResult.error.message || "Không tải được vai trò phòng ban.");
        }

        memberships = ((membershipResult.data ?? []) as UserRoleRow[]).map((item) => ({
          profileId: item.profile_id ? String(item.profile_id) : String(profile.id),
          departmentId: item.department_id ? String(item.department_id) : null,
          roleId: item.role_id ? String(item.role_id) : null,
        }));

        const departmentResult = await supabase
          .from("departments")
          .select("id,name,parent_department_id");

        if (departmentResult.error) {
          throw new Error(departmentResult.error.message || "Không tải được danh sách phòng ban.");
        }

        departments = ((departmentResult.data ?? []) as DepartmentRow[]).map((department) => ({
          id: String(department.id),
          name: String(department.name),
          parentDepartmentId: department.parent_department_id ? String(department.parent_department_id) : null,
        }));

        set({
          isLoading: false,
          isLoaded: true,
          error: null,
          lastLoadedAt: Date.now(),
          authUserId: authData.user.id,
          authEmail: authData.user.email ? String(authData.user.email) : null,
          profile: {
            id: String(profile.id),
            name: profile.name?.trim() || null,
          },
          roles,
          memberships,
          departments,
          managedDepartments: buildManagedDepartments(memberships, departments, leaderRoleIds),
        });
      } catch (error) {
        set((state) => ({
          ...state,
          isLoading: false,
          isLoaded: true,
          error: error instanceof Error ? error.message : "Không tải được quyền truy cập.",
        }));
      } finally {
        inFlightLoad = null;
      }
    })();

    return inFlightLoad;
  },
  reset() {
    inFlightLoad = null;
    set(defaultState);
  },
}));

export function useWorkspaceAccess() {
  const state = useWorkspaceAccessStore();
  const load = useWorkspaceAccessStore((snapshot) => snapshot.load);

  useEffect(() => {
    void load();
  }, [load]);

  const leaderRoleIds = getLeaderRoleIds(state.roles);
  const directorRoleIds = getDirectorRoleIds(state.roles);
  const hasLeaderRole = state.memberships.some(
    (membership) => membership.roleId && leaderRoleIds.includes(membership.roleId),
  );
  const hasDirectorRole = state.memberships.some(
    (membership) => membership.roleId && directorRoleIds.includes(membership.roleId),
  );

  return {
    ...state,
    profileId: state.profile?.id ?? null,
    profileName: state.profile?.name ?? null,
    leaderRoleIds,
    directorRoleIds,
    hasLeaderRole,
    hasDirectorRole,
    canManage: state.managedDepartments.length > 0,
    canManageAttendance: hasLeaderRole || hasDirectorRole,
  };
}

export function buildWorkspaceAccessDebug(params: {
  authUserId: string | null;
  profileId: string | null;
  profileName: string | null;
  leaderRoleIds: string[];
  roles: WorkspaceRole[];
  memberships: WorkspaceMembership[];
  departments: WorkspaceDepartment[];
  managedDepartments: ManagedDepartment[];
  canManage: boolean;
  error: string | null;
  lastLoadedAt: number | null;
}) {
  return {
    checkedAt: params.lastLoadedAt ? new Date(params.lastLoadedAt).toISOString() : new Date().toISOString(),
    step: params.error ? "failed.cached" : params.canManage ? "done.cached" : "done.no_access",
    authUserId: params.authUserId,
    profileId: params.profileId,
    profileName: params.profileName,
    leaderRoleIds: params.leaderRoleIds,
    leaderRolesRaw: params.roles.map((role) => ({ id: role.id, name: role.name })),
    userRoleRows: params.memberships.map((membership) => ({
      department_id: membership.departmentId,
      role_id: membership.roleId,
    })),
    departments: params.departments.map((department) => ({
      id: department.id,
      name: department.name,
      parent_department_id: department.parentDepartmentId,
    })),
    rootDepartments: params.managedDepartments.map((department) => ({
      id: department.id,
      name: department.name,
    })),
    error: params.error,
  };
}
