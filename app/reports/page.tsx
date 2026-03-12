"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { supabase } from "@/lib/supabase";

type RoleScope = "director" | "leader" | "member";

type RoleRow = {
  id: string;
  name: string | null;
};

type ProfileRow = {
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

type PerformanceReportRow = {
  id: string;
  user_id: string | null;
  completed_percent: number | null;
  tasks: number | null;
  created_at: string | null;
  updated_at: string | null;
};

const normalizeName = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

const toRoleScopeLabel = (scope: RoleScope) => {
  if (scope === "director") {
    return "Giám đốc";
  }
  if (scope === "leader") {
    return "Trưởng nhóm";
  }
  return "Thành viên";
};

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

const formatPercent = (value: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  return `${value}%`;
};

const formatNumber = (value: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  return value.toString();
};

export default function ReportsPage() {
  const [roleScope, setRoleScope] = useState<RoleScope>("member");
  const [reports, setReports] = useState<PerformanceReportRow[]>([]);
  const [profileNameById, setProfileNameById] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadReports = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
          if (!isActive) {
            return;
          }
          setError("Không xác thực được người dùng hiện tại.");
          setReports([]);
          setProfileNameById({});
          setIsLoading(false);
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id,name")
          .eq("user_id", authData.user.id)
          .maybeSingle();

        if (profileError || !profile?.id) {
          if (!isActive) {
            return;
          }
          setError(profileError?.message ?? "Không tìm thấy hồ sơ người dùng.");
          setReports([]);
          setProfileNameById({});
          setIsLoading(false);
          return;
        }

        const currentProfileId = String(profile.id);
        const currentProfileName = profile.name ? String(profile.name) : "Không rõ";

        const { data: rolesData, error: rolesError } = await supabase.from("roles").select("id,name");
        if (rolesError) {
          throw new Error(rolesError.message || "Không tải được danh sách vai trò.");
        }

        const typedRoles = (rolesData ?? []) as RoleRow[];
        const directorRoleIds = typedRoles
          .filter((role) => normalizeName(role.name) === "giám đốc")
          .map((role) => String(role.id));
        const leaderRoleIds = typedRoles
          .filter((role) => normalizeName(role.name) === "leader")
          .map((role) => String(role.id));
        const memberRoleIds = typedRoles
          .filter((role) => normalizeName(role.name) === "member")
          .map((role) => String(role.id));

        const { data: currentUserRolesData, error: currentUserRolesError } = await supabase
          .from("user_role_in_department")
          .select("profile_id,department_id,role_id")
          .eq("profile_id", currentProfileId);

        if (currentUserRolesError) {
          throw new Error(currentUserRolesError.message || "Không tải được vai trò người dùng.");
        }

        const currentUserRoles = (currentUserRolesData ?? []) as UserRoleRow[];
        const hasDirectorRole = currentUserRoles.some(
          (row) => row.role_id && directorRoleIds.includes(String(row.role_id))
        );
        const hasLeaderRole = currentUserRoles.some(
          (row) => row.role_id && leaderRoleIds.includes(String(row.role_id))
        );

        let scopedRole: RoleScope = "member";
        if (hasDirectorRole) {
          scopedRole = "director";
        } else if (hasLeaderRole) {
          scopedRole = "leader";
        }

        if (!isActive) {
          return;
        }
        setRoleScope(scopedRole);

        let allowedProfileIds: string[] | null = null;

        if (scopedRole === "member") {
          allowedProfileIds = [currentProfileId];
        } else if (scopedRole === "leader") {
          const ownLeaderDepartmentIds = [
            ...new Set(
              currentUserRoles
                .filter((row) => row.department_id && row.role_id && leaderRoleIds.includes(String(row.role_id)))
                .map((row) => String(row.department_id))
            ),
          ];

          if (ownLeaderDepartmentIds.length === 0) {
            allowedProfileIds = [currentProfileId];
          } else {
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
              for (const childId of children) {
                if (scopedDepartmentIds.has(childId)) {
                  continue;
                }
                scopedDepartmentIds.add(childId);
                queue.push(childId);
              }
            }

            const effectiveRoleIds = [...new Set([...leaderRoleIds, ...memberRoleIds])];
            if (effectiveRoleIds.length === 0) {
              allowedProfileIds = [currentProfileId];
            } else {
              const { data: scopedUserRolesData, error: scopedUserRolesError } = await supabase
                .from("user_role_in_department")
                .select("profile_id,department_id,role_id")
                .in("department_id", Array.from(scopedDepartmentIds))
                .in("role_id", effectiveRoleIds);

              if (scopedUserRolesError) {
                throw new Error(scopedUserRolesError.message || "Không tải được nhân sự theo phạm vi Leader.");
              }

              allowedProfileIds = [
                ...new Set(
                  ((scopedUserRolesData ?? []) as UserRoleRow[])
                    .map((row) => row.profile_id)
                    .filter(Boolean)
                    .map((item) => String(item))
                ),
              ];
            }
          }
        }

        const reportsQuery = supabase
          .from("performance_reports")
          .select("id,user_id,completed_percent,tasks,created_at,updated_at")
          .order("created_at", { ascending: false });

        let reportsData: PerformanceReportRow[] = [];
        if (scopedRole === "director") {
          const { data, error: reportsError } = await reportsQuery;
          if (reportsError) {
            throw new Error(reportsError.message || "Không tải được báo cáo hiệu suất.");
          }
          reportsData = (data ?? []) as PerformanceReportRow[];
        } else {
          const scopedIds = allowedProfileIds ?? [];
          if (scopedIds.length === 0) {
            reportsData = [];
          } else {
            const { data, error: reportsError } = await reportsQuery.in("user_id", scopedIds);
            if (reportsError) {
              throw new Error(reportsError.message || "Không tải được báo cáo hiệu suất.");
            }
            reportsData = (data ?? []) as PerformanceReportRow[];
          }
        }

        if (!isActive) {
          return;
        }

        setReports(reportsData);

        const profileIdsInReports = [
          ...new Set(reportsData.map((report) => report.user_id).filter(Boolean).map((item) => String(item))),
        ];

        if (profileIdsInReports.length === 0) {
          setProfileNameById({
            [currentProfileId]: currentProfileName,
          });
          setIsLoading(false);
          return;
        }

        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id,name")
          .in("id", profileIdsInReports);

        if (profilesError) {
          throw new Error(profilesError.message || "Không tải được tên nhân sự.");
        }

        if (!isActive) {
          return;
        }

        const nameMap = ((profilesData ?? []) as ProfileRow[]).reduce<Record<string, string>>((acc, item) => {
          acc[String(item.id)] = item.name ? String(item.name) : "Không rõ";
          return acc;
        }, {});

        if (!nameMap[currentProfileId]) {
          nameMap[currentProfileId] = currentProfileName;
        }

        setProfileNameById(nameMap);
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Không tải được dữ liệu báo cáo.");
        setReports([]);
        setProfileNameById({});
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadReports();

    return () => {
      isActive = false;
    };
  }, []);

  const averageCompletedPercent = useMemo(() => {
    if (reports.length === 0) {
      return 0;
    }
    const sum = reports.reduce((acc, item) => acc + (typeof item.completed_percent === "number" ? item.completed_percent : 0), 0);
    return Number((sum / reports.length).toFixed(2));
  }, [reports]);

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="reports" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[280px]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">
                  <Link href="/dashboard" className="hover:text-slate-700">
                    Bảng điều khiển
                  </Link>
                  <span className="px-2">›</span>
                  <span className="font-semibold text-slate-700">Báo cáo</span>
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em] text-slate-900">Báo cáo hiệu suất</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Quyền xem hiện tại: <span className="font-semibold text-slate-700">{toRoleScopeLabel(roleScope)}</span>
                </p>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-7">
            <section className="grid gap-4 md:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">Tổng báo cáo</p>
                <p className="mt-2 text-4xl font-semibold tracking-[-0.02em] text-blue-700">{reports.length}</p>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">Tiến độ trung bình</p>
                <p className="mt-2 text-4xl font-semibold tracking-[-0.02em] text-emerald-600">
                  {formatPercent(averageCompletedPercent)}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">Vai trò</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.01em] text-slate-900">{toRoleScopeLabel(roleScope)}</p>
              </article>
            </section>

            <section className="mt-5 rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-2xl font-semibold text-slate-900">Báo cáo hiệu suất</h2>
              </div>

              {isLoading ? (
                <div className="px-5 py-8 text-sm text-slate-500">Đang tải báo cáo...</div>
              ) : error ? (
                <div className="px-5 py-8 text-sm text-rose-600">{error}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-left">
                    <thead>
                      <tr className="text-xs tracking-[0.08em] text-slate-400 uppercase">
                        <th className="px-5 py-3 font-semibold">Mã báo cáo</th>
                        <th className="px-5 py-3 font-semibold">Người dùng</th>
                        <th className="px-5 py-3 font-semibold">Tỷ lệ hoàn thành</th>
                        <th className="px-5 py-3 font-semibold">Số công việc</th>
                        <th className="px-5 py-3 font-semibold">Ngày tạo</th>
                        <th className="px-5 py-3 font-semibold">Ngày cập nhật</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((item) => (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="px-5 py-4 text-xs text-slate-700">{item.id}</td>
                          <td className="px-5 py-4 text-xs text-slate-700">
                            <div className="space-y-1">
                              <p>{item.user_id ?? "--"}</p>
                              <p className="text-[11px] text-slate-500">
                                {item.user_id ? profileNameById[item.user_id] ?? "Không rõ" : "--"}
                              </p>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                            {formatPercent(item.completed_percent)}
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-700">{formatNumber(item.tasks)}</td>
                          <td className="px-5 py-4 text-sm text-slate-600">{formatDateTime(item.created_at)}</td>
                          <td className="px-5 py-4 text-sm text-slate-600">{formatDateTime(item.updated_at)}</td>
                        </tr>
                      ))}

                      {reports.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                            Chưa có báo cáo nào trong phạm vi quyền hiện tại.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
