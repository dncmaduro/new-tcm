"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  BlockState,
  SectionTitle,
} from "@/app/reports/_components/reporting-ui";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  REPORT_PERIOD_TYPES,
  REPORT_STATUSES,
  buildGoalReportProfileIds,
  type PerformanceReportMetricKind,
  type PerformanceReportRoleMembershipRow,
  type PerformanceReportWithRelations,
  type ReportingScopeDirectory,
  formatReportDateRange,
  formatReportProgressValue,
  formatReportTaskCompletionText,
  formatReportTaskPointText,
  getPerformanceReportMetricKind,
  loadReportingScopeDirectory,
  normalizePerformanceReportWithRelations,
} from "@/lib/performance-reports";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";

type ReportListItem = PerformanceReportWithRelations & {
  metricKind: PerformanceReportMetricKind;
};

const REPORT_SELECT = `
  id,
  profile_id,
  department_id,
  period_type,
  period_key,
  period_start,
  period_end,
  overall_score,
  business_score,
  support_score,
  execution_score,
  goal_count,
  direct_kr_count,
  support_kr_count,
  task_count,
  completed_task_count,
  total_task_points,
  completed_task_points,
  overdue_task_count,
  self_comment,
  manager_comment,
  status,
  created_by,
  reviewed_by,
  created_at,
  updated_at,
  profile:profiles!performance_reports_profile_id_fkey(id, name, email, avatar),
  department:departments!performance_reports_department_id_fkey(id, name, parent_department_id)
`;

const formatProgressValue = (value: number | null | undefined) => formatReportProgressValue(value);

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="block text-sm font-semibold text-slate-900">
        {label}
      </span>
      {children}
    </label>
  );
}

function ReportsTableSkeleton() {
  return (
    <div className="space-y-3 px-5 py-5">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="grid animate-pulse gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 lg:grid-cols-[1.4fr_1fr_1fr_0.9fr_0.9fr_1fr_1fr]"
        >
          {Array.from({ length: 7 }).map((__, cellIndex) => (
            <div key={cellIndex} className="h-10 rounded-xl bg-slate-200/70" />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const router = useRouter();
  const access = useWorkspaceAccess();
  const [scopeDirectory, setScopeDirectory] = useState<ReportingScopeDirectory | null>(null);
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [periodTypeFilter, setPeriodTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (access.isLoading || !access.isLoaded) {
      return;
    }

    let isActive = true;

    const loadReports = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const directory = await loadReportingScopeDirectory({
          currentProfileId: access.profileId,
          currentProfileName: access.profileName,
          memberships: access.memberships,
          hasDirectorRole: access.hasDirectorRole,
          canManage: access.canManage,
          managedDepartments: access.managedDepartments,
          departments: access.departments,
        });

        let query = supabase.from("performance_reports").select(REPORT_SELECT).order("updated_at", {
          ascending: false,
        });

        if (directory.roleScope !== "director") {
          if (directory.accessibleProfileIds.length === 0) {
            if (!isActive) {
              return;
            }
            setScopeDirectory(directory);
            setReports([]);
            return;
          }

          query = query.in("profile_id", directory.accessibleProfileIds);
        }

        const { data, error: reportsError } = await query;

        if (reportsError) {
          throw new Error(reportsError.message || "Không tải được báo cáo hiệu suất.");
        }

        const normalizedReports = ((data ?? []) as Array<Record<string, unknown>>).map((item) =>
          normalizePerformanceReportWithRelations(item),
        );

        const profileIds = [
          ...new Set(
            normalizedReports
              .map((report) => report.profile_id)
              .filter((value): value is string => Boolean(value)),
          ),
        ];

        const userRoleResult =
          profileIds.length > 0
            ? await supabase
                .from("user_role_in_department")
                .select("profile_id,department_id,role_id")
                .in("profile_id", profileIds)
            : { data: [] as PerformanceReportRoleMembershipRow[], error: null };

        if (userRoleResult.error) {
          throw new Error(userRoleResult.error.message || "Không tải được vai trò nhân sự của báo cáo.");
        }

        const goalReportProfileIds = new Set(
          buildGoalReportProfileIds({
            roles: access.roles,
            departments: access.departments,
            memberships: (userRoleResult.data ?? []).map((item) => ({
              profile_id: item.profile_id ? String(item.profile_id) : null,
              department_id: item.department_id ? String(item.department_id) : null,
              role_id: item.role_id ? String(item.role_id) : null,
            })),
          }),
        );

        if (!isActive) {
          return;
        }

        setScopeDirectory(directory);
        setReports(
          normalizedReports.map((report) => ({
            ...report,
            metricKind: getPerformanceReportMetricKind(report.profile_id, goalReportProfileIds),
          })),
        );
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Không tải được dữ liệu báo cáo.");
        setReports([]);
        setScopeDirectory(null);
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
  }, [
    access.canManage,
    access.departments,
    access.hasDirectorRole,
    access.isLoaded,
    access.isLoading,
    access.managedDepartments,
    access.memberships,
    access.profileId,
    access.profileName,
    access.roles,
  ]);

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (employeeFilter !== "all" && report.profile_id !== employeeFilter) {
        return false;
      }
      if (departmentFilter !== "all" && report.department_id !== departmentFilter) {
        return false;
      }
      if (periodTypeFilter !== "all" && report.period_type !== periodTypeFilter) {
        return false;
      }
      if (statusFilter !== "all" && report.status !== statusFilter) {
        return false;
      }
      if (dateFromFilter && report.period_end && report.period_end < dateFromFilter) {
        return false;
      }
      if (dateToFilter && report.period_start && report.period_start > dateToFilter) {
        return false;
      }

      if (searchKeyword.trim()) {
        const keyword = searchKeyword.trim().toLowerCase();
        const haystack = [
          report.profile?.name ?? "",
          report.profile?.email ?? "",
          report.department?.name ?? "",
          report.period_key,
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(keyword)) {
          return false;
        }
      }

      return true;
    });
  }, [
    dateFromFilter,
    dateToFilter,
    departmentFilter,
    employeeFilter,
    periodTypeFilter,
    reports,
    searchKeyword,
    statusFilter,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    employeeFilter,
    departmentFilter,
    periodTypeFilter,
    statusFilter,
    searchKeyword,
    dateFromFilter,
    dateToFilter,
  ]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredReports.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedReports = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredReports.slice(startIndex, startIndex + pageSize);
  }, [filteredReports, safeCurrentPage]);

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="reports" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader title="Báo cáo hiệu suất" items={[{ label: "Báo cáo hiệu suất" }]} />

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-7">
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
                <FilterField label="Nhân viên">
                  <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Chọn nhân viên" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      {(scopeDirectory?.profileOptions ?? []).map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField label="Phòng ban">
                  <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Chọn phòng ban" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      {(scopeDirectory?.departmentOptions ?? []).map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField label="Loại kỳ">
                  <Select value={periodTypeFilter} onValueChange={setPeriodTypeFilter}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Chọn loại kỳ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      {REPORT_PERIOD_TYPES.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField label="Trạng thái">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Chọn trạng thái" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      {REPORT_STATUSES.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField label="Từ ngày">
                  <input
                    type="date"
                    value={dateFromFilter}
                    onChange={(event) => setDateFromFilter(event.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </FilterField>

                <FilterField label="Đến ngày">
                  <input
                    type="date"
                    value={dateToFilter}
                    onChange={(event) => setDateToFilter(event.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </FilterField>

                <FilterField label="Tìm kiếm">
                  <input
                    value={searchKeyword}
                    onChange={(event) => setSearchKeyword(event.target.value)}
                    placeholder="Tên, email, mã kỳ..."
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </FilterField>
              </div>
            </section>

            <section className="mt-5 rounded-2xl border border-slate-200 bg-white">
              <SectionTitle
                title="Danh sách báo cáo"
                description={`Trang ${safeCurrentPage}/${totalPages} · ${filteredReports.length} báo cáo`}
              />

              {isLoading ? (
                <ReportsTableSkeleton />
              ) : error || filteredReports.length === 0 ? (
                <BlockState
                  error={error}
                  empty={!error && filteredReports.length === 0}
                  emptyText="Chưa có báo cáo hiệu suất nào phù hợp."
                />
              ) : (
                <div className="overflow-x-auto px-5 pb-5">
                  <table className="w-full min-w-[1120px] text-left">
                    <thead>
                      <tr className="border-b border-slate-100 text-sm text-slate-900">
                        <th className="px-3 py-3 font-semibold">Nhân sự</th>
                        <th className="px-3 py-3 font-semibold">Phòng ban</th>
                        <th className="px-3 py-3 font-semibold">Khoảng thời gian</th>
                        <th className="px-3 py-3 font-semibold">Trung bình tiến độ Goal</th>
                        <th className="px-3 py-3 font-semibold">Trung bình tiến độ KR</th>
                        <th className="px-3 py-3 font-semibold">Task hoàn thành</th>
                        <th className="px-3 py-3 font-semibold">Điểm task</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedReports.map((report) => (
                        <tr
                          key={report.id}
                          className="cursor-pointer border-b border-slate-100 align-top transition hover:bg-slate-50/80"
                          onClick={() => router.push(`/reports/${report.id}`)}
                        >
                          <td className="px-3 py-4">
                            <p className="text-sm font-semibold text-slate-900">
                              {report.profile?.name ?? "Chưa gắn nhân sự"}
                            </p>
                            <p className="mt-1 text-sm text-slate-700">
                              {report.profile?.email ?? "Chưa có email"}
                            </p>
                          </td>
                          <td className="px-3 py-4 text-sm text-slate-700">
                            {report.department?.name ?? "Không gắn phòng ban"}
                          </td>
                          <td className="px-3 py-4 text-sm text-slate-700">
                            {formatReportDateRange(report.period_start, report.period_end)}
                          </td>
                          <td className="px-3 py-4 text-sm text-slate-700">
                            {report.metricKind === "goal" ? formatProgressValue(report.business_score) : "—"}
                          </td>
                          <td className="px-3 py-4 text-sm text-slate-700">
                            {report.metricKind === "kr" ? formatProgressValue(report.business_score) : "—"}
                          </td>
                          <td className="px-3 py-4 text-sm font-semibold text-slate-900">
                            {formatReportTaskCompletionText(report.completed_task_count, report.task_count)}
                          </td>
                          <td className="px-3 py-4 text-sm font-semibold text-slate-900">
                            {formatReportTaskPointText(report.completed_task_points, report.total_task_points)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <p className="text-sm text-slate-700">
                      Hiển thị {(safeCurrentPage - 1) * pageSize + 1}-
                      {Math.min(safeCurrentPage * pageSize, filteredReports.length)} / {filteredReports.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        disabled={safeCurrentPage <= 1}
                        className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Trước
                      </button>
                      <span className="px-2 text-sm font-medium text-slate-900">
                        {safeCurrentPage}/{totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                        disabled={safeCurrentPage >= totalPages}
                        className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Sau
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </main>
        </div>
      </div>

    </div>
  );
}
