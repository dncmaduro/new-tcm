"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { TimesheetOverview } from "@/components/timesheet/timesheet-overview";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";

type RoleScope = "director" | "leader" | "member";

type UserRoleRow = {
  profile_id: string | null;
  department_id: string | null;
  role_id: string | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type ViewableProfile = {
  id: string;
  name: string;
  email: string | null;
  roleLabel: string;
  departmentLabel: string;
  rawRolePriority: number;
};

const normalizeText = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const toRolePriority = (roleName: string) => {
  const normalized = normalizeText(roleName);
  if (normalized.includes("giam doc") || normalized.includes("director")) {
    return 0;
  }
  if (normalized.includes("leader") || normalized.includes("truong nhom") || normalized.includes("manager")) {
    return 1;
  }
  if (normalized.includes("member") || normalized.includes("thanh vien")) {
    return 2;
  }
  return 3;
};

const toRoleScopeLabel = (scope: RoleScope) => {
  if (scope === "director") {
    return "Giám đốc";
  }
  if (scope === "leader") {
    return "Trưởng nhóm";
  }
  return "Thành viên";
};

const getDescendantDepartmentIds = (
  seedDepartmentIds: string[],
  departments: Array<{ id: string; parentDepartmentId: string | null }>,
) => {
  const childrenByParent = departments.reduce<Record<string, string[]>>((acc, department) => {
    if (!department.parentDepartmentId) {
      return acc;
    }
    if (!acc[department.parentDepartmentId]) {
      acc[department.parentDepartmentId] = [];
    }
    acc[department.parentDepartmentId].push(department.id);
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
};

export default function AttendanceManagementPage() {
  const workspaceAccess = useWorkspaceAccess();
  const [roleScope, setRoleScope] = useState<RoleScope>("member");
  const [viewableProfiles, setViewableProfiles] = useState<ViewableProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const canViewAttendanceManagement = workspaceAccess.canManage && !workspaceAccess.error;
  const permissionError =
    workspaceAccess.error ??
    (!workspaceAccess.isLoading && !workspaceAccess.canManage
      ? "Bạn chưa có quyền xem quản lý chấm công theo phạm vi quản lý hiện tại."
      : null);

  const memberRoleIds = useMemo(
    () =>
      workspaceAccess.roles
        .filter((role) => {
          const roleName = normalizeText(role.name);
          return roleName === "member" || roleName.includes("member") || roleName.includes("thanh vien");
        })
        .map((role) => role.id),
    [workspaceAccess.roles],
  );

  useEffect(() => {
    if (workspaceAccess.isLoading) {
      return;
    }

    if (!canViewAttendanceManagement) {
      setIsLoadingProfiles(false);
      setViewableProfiles([]);
      setSelectedProfileId(null);
      setLoadError(null);
      return;
    }

    let isActive = true;

    const loadViewableProfiles = async () => {
      setIsLoadingProfiles(true);
      setLoadError(null);

      try {
        if (!workspaceAccess.profileId) {
          throw new Error("Không xác định được hồ sơ người dùng hiện tại.");
        }

        let nextRoleScope: RoleScope = "member";
        if (workspaceAccess.hasDirectorRole) {
          nextRoleScope = "director";
        } else if (workspaceAccess.hasLeaderRole) {
          nextRoleScope = "leader";
        }

        if (!isActive) {
          return;
        }
        setRoleScope(nextRoleScope);

        if (nextRoleScope === "member") {
          setViewableProfiles([]);
          setSelectedProfileId(null);
          setIsLoadingProfiles(false);
          return;
        }

        let targetProfiles: ProfileRow[] = [];
        let targetMemberships: UserRoleRow[] = [];

        if (nextRoleScope === "director") {
          const [{ data: profilesData, error: profilesError }, { data: membershipsData, error: membershipsError }] =
            await Promise.all([
              supabase.from("profiles").select("id,name,email").order("name", { ascending: true }),
              supabase.from("user_role_in_department").select("profile_id,department_id,role_id"),
            ]);

          if (profilesError) {
            throw new Error(profilesError.message || "Không tải được danh sách nhân sự.");
          }
          if (membershipsError) {
            throw new Error(membershipsError.message || "Không tải được dữ liệu phân quyền phòng ban.");
          }

          targetProfiles = (profilesData ?? []) as ProfileRow[];
          targetMemberships = (membershipsData ?? []) as UserRoleRow[];
        } else {
          const ownLeaderDepartmentIds = [
            ...new Set(
              workspaceAccess.memberships
                .filter(
                  (membership) =>
                    membership.departmentId &&
                    membership.roleId &&
                    workspaceAccess.leaderRoleIds.includes(membership.roleId),
                )
                .map((membership) => membership.departmentId as string),
            ),
          ];

          if (ownLeaderDepartmentIds.length === 0) {
            setViewableProfiles([]);
            setSelectedProfileId(null);
            setIsLoadingProfiles(false);
            return;
          }

          const scopedDepartmentIds = getDescendantDepartmentIds(ownLeaderDepartmentIds, workspaceAccess.departments);
          const effectiveRoleIds = [...new Set([...workspaceAccess.leaderRoleIds, ...memberRoleIds])];

          const { data: scopedMembershipsData, error: scopedMembershipsError } = await supabase
            .from("user_role_in_department")
            .select("profile_id,department_id,role_id")
            .in("department_id", scopedDepartmentIds)
            .in("role_id", effectiveRoleIds);

          if (scopedMembershipsError) {
            throw new Error(scopedMembershipsError.message || "Không tải được danh sách nhân sự trong phạm vi.");
          }

          targetMemberships = (scopedMembershipsData ?? []) as UserRoleRow[];
          const targetProfileIds = [
            ...new Set(
              targetMemberships
                .map((membership) => membership.profile_id)
                .filter(Boolean)
                .map((profileId) => String(profileId)),
            ),
          ];

          if (targetProfileIds.length === 0) {
            setViewableProfiles([]);
            setSelectedProfileId(null);
            setIsLoadingProfiles(false);
            return;
          }

          const { data: profilesData, error: profilesError } = await supabase
            .from("profiles")
            .select("id,name,email")
            .in("id", targetProfileIds)
            .order("name", { ascending: true });

          if (profilesError) {
            throw new Error(profilesError.message || "Không tải được hồ sơ nhân sự.");
          }

          targetProfiles = (profilesData ?? []) as ProfileRow[];
        }

        if (!isActive) {
          return;
        }

        const roleNameById = workspaceAccess.roles.reduce<Record<string, string>>((acc, role) => {
          acc[role.id] = role.name?.trim() || "Chưa gán vai trò";
          return acc;
        }, {});
        const departmentNameById = workspaceAccess.departments.reduce<Record<string, string>>((acc, department) => {
          acc[department.id] = department.name || "Không rõ phòng ban";
          return acc;
        }, {});
        const membershipsByProfileId = targetMemberships.reduce<Record<string, UserRoleRow[]>>((acc, membership) => {
          if (!membership.profile_id) {
            return acc;
          }
          const profileId = String(membership.profile_id);
          if (!acc[profileId]) {
            acc[profileId] = [];
          }
          acc[profileId].push(membership);
          return acc;
        }, {});

        const mappedProfiles = targetProfiles
          .map((profile) => {
            const profileId = String(profile.id);
            const assignments = (membershipsByProfileId[profileId] ?? [])
              .map((membership) => ({
                roleLabel: membership.role_id
                  ? roleNameById[String(membership.role_id)] ?? "Chưa gán vai trò"
                  : "Chưa gán vai trò",
                departmentLabel: membership.department_id
                  ? departmentNameById[String(membership.department_id)] ?? "Không rõ phòng ban"
                  : "Không thuộc phòng ban",
              }))
              .sort((a, b) => {
                const byPriority = toRolePriority(a.roleLabel) - toRolePriority(b.roleLabel);
                if (byPriority !== 0) {
                  return byPriority;
                }
                const byRole = a.roleLabel.localeCompare(b.roleLabel, "vi");
                if (byRole !== 0) {
                  return byRole;
                }
                return a.departmentLabel.localeCompare(b.departmentLabel, "vi");
              });

            const primaryAssignment = assignments[0] ?? {
              roleLabel: "Chưa gán vai trò",
              departmentLabel: "Không thuộc phòng ban",
            };

            return {
              id: profileId,
              name: profile.name?.trim() || profile.email?.trim() || "Không rõ",
              email: profile.email?.trim() || null,
              roleLabel: primaryAssignment.roleLabel,
              departmentLabel: primaryAssignment.departmentLabel,
              rawRolePriority: toRolePriority(primaryAssignment.roleLabel),
            } satisfies ViewableProfile;
          })
          .sort((a, b) => {
            const byPriority = a.rawRolePriority - b.rawRolePriority;
            if (byPriority !== 0) {
              return byPriority;
            }
            return a.name.localeCompare(b.name, "vi");
          });

        setViewableProfiles(mappedProfiles);
        setSelectedProfileId((prev) => {
          if (prev && mappedProfiles.some((item) => item.id === prev)) {
            return prev;
          }
          return mappedProfiles[0]?.id ?? null;
        });
      } catch (error) {
        if (!isActive) {
          return;
        }
        setViewableProfiles([]);
        setSelectedProfileId(null);
        setLoadError(error instanceof Error ? error.message : "Không tải được dữ liệu quản lý chấm công.");
      } finally {
        if (isActive) {
          setIsLoadingProfiles(false);
        }
      }
    };

    void loadViewableProfiles();

    return () => {
      isActive = false;
    };
  }, [
    canViewAttendanceManagement,
    memberRoleIds,
    workspaceAccess.departments,
    workspaceAccess.hasDirectorRole,
    workspaceAccess.hasLeaderRole,
    workspaceAccess.isLoading,
    workspaceAccess.leaderRoleIds,
    workspaceAccess.memberships,
    workspaceAccess.profileId,
    workspaceAccess.roles,
  ]);

  const filteredProfiles = useMemo(() => {
    const normalizedKeyword = normalizeText(searchKeyword);
    if (!normalizedKeyword) {
      return viewableProfiles;
    }

    return viewableProfiles.filter((profile) =>
      [profile.name, profile.email ?? "", profile.roleLabel, profile.departmentLabel]
        .map((value) => normalizeText(value))
        .some((value) => value.includes(normalizedKeyword)),
    );
  }, [searchKeyword, viewableProfiles]);

  const selectedProfile = useMemo(
    () => viewableProfiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [selectedProfileId, viewableProfiles],
  );

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="attendanceManagement" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">
                  <Link href="/dashboard" className="hover:text-slate-700">
                    Bảng điều khiển
                  </Link>
                  <span className="px-2">›</span>
                  <span className="font-semibold text-slate-700">Quản lý chấm công</span>
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em] text-slate-900">
                  Quản lý chấm công
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Vai trò hiện tại: <span className="font-semibold text-slate-700">{toRoleScopeLabel(roleScope)}</span>
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Director xem toàn bộ nhân sự. Leader xem member và leader cùng phòng ban hoặc phòng ban con.
                </p>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-7 xl:overflow-hidden">
            {workspaceAccess.isLoading || isLoadingProfiles ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
                Đang tải phạm vi quản lý chấm công...
              </div>
            ) : null}

            {!workspaceAccess.isLoading && !canViewAttendanceManagement ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
                {permissionError}
              </div>
            ) : null}

            {!workspaceAccess.isLoading && loadError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                {loadError}
              </div>
            ) : null}

            {!workspaceAccess.isLoading && !isLoadingProfiles && canViewAttendanceManagement && !loadError ? (
              <div className="grid gap-5 xl:h-full xl:min-h-0 xl:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="space-y-4 xl:min-h-0">
                  <section className="rounded-2xl border border-slate-200 bg-white xl:flex xl:h-full xl:min-h-0 xl:flex-col">
                    <div className="border-b border-slate-100 px-5 py-4">
                      <h2 className="text-xl font-semibold text-slate-900">Nhân sự trong phạm vi</h2>
                      <p className="mt-1 text-sm text-slate-500">{viewableProfiles.length} người có thể xem</p>
                    </div>
                    <div className="border-b border-slate-100 px-5 py-4">
                      <input
                        value={searchKeyword}
                        onChange={(event) => setSearchKeyword(event.target.value)}
                        placeholder="Tìm theo tên, email, vai trò..."
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <div className="max-h-[calc(100vh-280px)] space-y-3 overflow-y-auto px-4 py-4 xl:max-h-none xl:min-h-0 xl:flex-1">
                      {filteredProfiles.length > 0 ? (
                        filteredProfiles.map((profile) => {
                          const isActive = profile.id === selectedProfileId;
                          return (
                            <button
                              key={profile.id}
                              type="button"
                              onClick={() => setSelectedProfileId(profile.id)}
                              className={`w-full rounded-2xl border p-4 text-left transition ${
                                isActive
                                  ? "border-blue-200 bg-blue-50 shadow-[0_18px_40px_-30px_rgba(37,99,235,0.6)]"
                                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">{profile.name}</p>
                                  <p className="mt-1 text-xs text-slate-500">{profile.email ?? "Không có email"}</p>
                                </div>
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                    isActive ? "bg-white text-blue-700" : "bg-slate-100 text-slate-600"
                                  }`}
                                >
                                  {profile.roleLabel}
                                </span>
                              </div>
                              <p className="mt-3 text-xs text-slate-500">{profile.departmentLabel}</p>
                            </button>
                          );
                        })
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                          Không tìm thấy nhân sự phù hợp.
                        </div>
                      )}
                    </div>
                  </section>
                </aside>

                <section className="min-w-0 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
                  {selectedProfile ? (
                    <>
                      <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm text-slate-500">Đang xem lịch chấm công của</p>
                            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-slate-900">
                              {selectedProfile.name}
                            </h2>
                            <p className="mt-1 text-sm text-slate-500">{selectedProfile.email ?? "Không có email"}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-700">
                              {selectedProfile.roleLabel}
                            </span>
                            <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                              {selectedProfile.departmentLabel}
                            </span>
                          </div>
                        </div>
                      </article>

                      <div className="mt-5">
                        <TimesheetOverview
                          profileId={selectedProfile.id}
                          showExportButton
                          exportFileLabel={selectedProfile.name}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500">
                      Chọn một nhân sự ở cột bên trái để xem lịch chấm công.
                    </div>
                  )}
                </section>
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
