"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  BlockState,
  ReportStatusBadge,
  SectionTitle,
} from "@/app/reports/_components/reporting-ui";
import {
  REPORT_PERIOD_TYPES,
  REPORT_STATUSES,
  type PerformanceReportRow,
  type ReportingScopeDirectory,
  formatReportDateRange,
  formatReportPeriodTypeLabel,
  formatReportScopeLabel,
  formatReportScore,
  loadReportingScopeDirectory,
  normalizePerformanceReportRow,
} from "@/lib/performance-reports";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "Chưa cập nhật";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Không hợp lệ";
  }
  return format(date, "dd/MM/yyyy HH:mm");
};

const formatScoreText = (value: number | null | undefined) => {
  const formatted = formatReportScore(value);
  return formatted === "--" ? "Chưa có điểm" : formatted;
};

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  helper,
  valueClassName = "text-slate-950",
}: {
  title: string;
  value: ReactNode;
  helper: string;
  valueClassName?: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{title}</p>
      <p className={`mt-3 text-4xl font-semibold tracking-[-0.04em] ${valueClassName}`}>{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-500">{helper}</p>
    </article>
  );
}

function TableHeaderWithHint({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="font-semibold text-slate-400">{title}</p>
      {hint ? <p className="mt-1 normal-case tracking-normal text-[11px] leading-4 text-slate-400/90">{hint}</p> : null}
    </div>
  );
}

export default function ReportsPage() {
  const access = useWorkspaceAccess();
  const [scopeDirectory, setScopeDirectory] = useState<ReportingScopeDirectory | null>(null);
  const [reports, setReports] = useState<PerformanceReportRow[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [periodTypeFilter, setPeriodTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodKeyFilter, setPeriodKeyFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
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

        let reportsData: PerformanceReportRow[] = [];

        if (directory.roleScope === "director") {
          const { data, error: reportsError } = await supabase
            .from("performance_reports")
            .select(
              "id,profile_id,department_id,period_type,period_key,period_start,period_end,overall_score,business_score,support_score,execution_score,goal_count,direct_kr_count,support_kr_count,task_count,completed_task_count,overdue_task_count,self_comment,manager_comment,status,created_by,reviewed_by,created_at,updated_at",
            )
            .order("updated_at", { ascending: false });

          if (reportsError) {
            throw new Error(reportsError.message || "Không tải được lịch sử báo cáo.");
          }

          reportsData = (data ?? []).map((item) => normalizePerformanceReportRow(item as Record<string, unknown>));
        } else if (directory.accessibleProfileIds.length > 0) {
          const { data, error: reportsError } = await supabase
            .from("performance_reports")
            .select(
              "id,profile_id,department_id,period_type,period_key,period_start,period_end,overall_score,business_score,support_score,execution_score,goal_count,direct_kr_count,support_kr_count,task_count,completed_task_count,overdue_task_count,self_comment,manager_comment,status,created_by,reviewed_by,created_at,updated_at",
            )
            .in("profile_id", directory.accessibleProfileIds)
            .order("updated_at", { ascending: false });

          if (reportsError) {
            throw new Error(reportsError.message || "Không tải được lịch sử báo cáo.");
          }

          reportsData = (data ?? []).map((item) => normalizePerformanceReportRow(item as Record<string, unknown>));
        }

        const extraProfileIds = [
          ...new Set(
            reportsData
              .map((report) => report.profile_id)
              .filter((value): value is string => Boolean(value))
              .filter((value) => !directory.profileNameById[value]),
          ),
        ];

        const extraDepartmentIds = [
          ...new Set(
            reportsData
              .map((report) => report.department_id)
              .filter((value): value is string => Boolean(value))
              .filter((value) => !directory.departmentNameById[value]),
          ),
        ];

        if (extraProfileIds.length > 0) {
          const { data: extraProfiles, error: extraProfilesError } = await supabase
            .from("profiles")
            .select("id,name,email")
            .in("id", extraProfileIds);

          if (extraProfilesError) {
            throw new Error(extraProfilesError.message || "Không tải được tên nhân sự báo cáo.");
          }

          (extraProfiles ?? []).forEach((profile) => {
            directory.profileNameById[String(profile.id)] = profile.name?.trim() || profile.email?.trim() || "Không rõ";
          });
        }

        if (extraDepartmentIds.length > 0) {
          const { data: extraDepartments, error: extraDepartmentsError } = await supabase
            .from("departments")
            .select("id,name,parent_department_id")
            .in("id", extraDepartmentIds);

          if (extraDepartmentsError) {
            throw new Error(extraDepartmentsError.message || "Không tải được tên phòng ban báo cáo.");
          }

          (extraDepartments ?? []).forEach((department) => {
            directory.departmentNameById[String(department.id)] = String(department.name);
          });
        }

        if (!isActive) {
          return;
        }

        setScopeDirectory({
          ...directory,
          profileOptions: [
            ...directory.profileOptions,
            ...extraProfileIds
              .filter((id) => !directory.profileOptions.some((item) => item.id === id))
              .map((id) => ({
                id,
                name: directory.profileNameById[id] ?? "Không rõ",
                email: null,
              })),
          ].sort((a, b) => a.name.localeCompare(b.name, "vi")),
          departmentOptions: [
            ...directory.departmentOptions,
            ...extraDepartmentIds
              .filter((id) => !directory.departmentOptions.some((item) => item.id === id))
              .map((id) => ({
                id,
                name: directory.departmentNameById[id] ?? "Không rõ",
                parentDepartmentId: null,
              })),
          ].sort((a, b) => a.name.localeCompare(b.name, "vi")),
        });
        setReports(reportsData);
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
  ]);

  const filteredReports = useMemo(() => {
    return [...reports]
      .filter((report) => {
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
        if (periodKeyFilter.trim()) {
          const keyword = periodKeyFilter.trim().toLowerCase();
          const employeeName = report.profile_id ? scopeDirectory?.profileNameById[report.profile_id] ?? "" : "";
          const departmentName = report.department_id ? scopeDirectory?.departmentNameById[report.department_id] ?? "" : "";
          const searchText = `${report.period_key} ${employeeName} ${departmentName}`.toLowerCase();
          if (!searchText.includes(keyword)) {
            return false;
          }
        }
        if (dateFromFilter && report.period_end && report.period_end < dateFromFilter) {
          return false;
        }
        if (dateToFilter && report.period_start && report.period_start > dateToFilter) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aTime = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
        const bTime = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
        return bTime - aTime;
      });
  }, [dateFromFilter, dateToFilter, departmentFilter, employeeFilter, periodKeyFilter, periodTypeFilter, reports, scopeDirectory, statusFilter]);

  const summary = useMemo(() => {
    if (filteredReports.length === 0) {
      return {
        totalReports: 0,
        averageOverallScore: null as number | null,
        pendingReview: 0,
        lockedReports: 0,
      };
    }

    const scoredReports = filteredReports.filter((report) => typeof report.overall_score === "number");
    const averageOverallScore =
      scoredReports.length > 0
        ? Number(
            (
              scoredReports.reduce((sum, report) => sum + Number(report.overall_score ?? 0), 0) / scoredReports.length
            ).toFixed(1),
          )
        : null;

    return {
      totalReports: filteredReports.length,
      averageOverallScore,
      pendingReview: filteredReports.filter((report) => report.status === "submitted").length,
      lockedReports: filteredReports.filter((report) => report.status === "locked").length,
    };
  }, [filteredReports]);

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="reports" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">
                  <Link href="/dashboard" className="hover:text-slate-700">
                    Bảng điều khiển
                  </Link>
                  <span className="px-2">›</span>
                  <span className="font-semibold text-slate-700">Báo cáo hiệu suất</span>
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em] text-slate-900">Lịch sử báo cáo hiệu suất</h1>
                <p className="mt-2 text-sm text-slate-500">
                  Xem lại các báo cáo theo tuần, tháng hoặc quý của từng nhân viên trong phạm vi bạn có quyền theo dõi.
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Phạm vi đang xem:{" "}
                  <span className="font-semibold text-slate-700">
                    {scopeDirectory ? formatReportScopeLabel(scopeDirectory.roleScope) : "Đang xác định"}
                  </span>
                </p>
              </div>

            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-7">
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="grid gap-3 xl:grid-cols-5">
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

                <FilterField label="Tìm kiếm">
                  <input
                    value={periodKeyFilter}
                    onChange={(event) => setPeriodKeyFilter(event.target.value)}
                    placeholder="Tìm theo kỳ hoặc tên nhân viên"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </FilterField>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
              </div>
            </section>

            <section className="mt-5 grid gap-4 lg:grid-cols-4">
              <SummaryCard
                title="Số báo cáo"
                value={summary.totalReports}
                helper="Tổng số báo cáo trong phạm vi đang lọc."
              />
              <SummaryCard
                title="Điểm trung bình"
                value={formatScoreText(summary.averageOverallScore)}
                helper="Trung bình điểm hiệu suất của các báo cáo."
              />
              <SummaryCard
                title="Chờ duyệt"
                value={summary.pendingReview}
                helper="Số báo cáo đang chờ quản lý xem xét."
                valueClassName="text-amber-700"
              />
              <SummaryCard
                title="Đã khóa"
                value={summary.lockedReports}
                helper="Số báo cáo đã hoàn tất và không thể chỉnh sửa."
              />
            </section>

            <section className="mt-5 rounded-2xl border border-slate-200 bg-white">
              <SectionTitle
                title="Danh sách báo cáo"
                description="Mỗi dòng là một báo cáo của một nhân viên trong một kỳ cụ thể."
              />
              <div className="border-b border-slate-100 px-5 py-4 text-sm leading-6 text-slate-500">
                <span className="font-semibold text-slate-700">Giải thích cột điểm:</span> Tổng là điểm hiệu suất tổng hợp. Kinh doanh tính từ các KR trực tiếp. Hỗ trợ tính từ các KR hỗ trợ. Thực thi tổng hợp từ tiến độ công việc.
              </div>

              {isLoading || error || filteredReports.length === 0 ? (
                <BlockState
                  loading={isLoading}
                  error={error}
                  empty={filteredReports.length === 0}
                  emptyText="Chưa có báo cáo trong phạm vi này. Hãy tạo báo cáo đầu tiên để bắt đầu theo dõi hiệu suất."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1440px] text-left">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-[0.08em] text-slate-400">
                        <th className="px-5 py-3 font-semibold">
                          <TableHeaderWithHint title="Nhân sự" />
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          <TableHeaderWithHint title="Phòng ban" />
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          <TableHeaderWithHint title="Loại kỳ" />
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          <TableHeaderWithHint title="Mã kỳ" />
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          <TableHeaderWithHint title="Khoảng thời gian" />
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          <TableHeaderWithHint title="Tổng" hint="Điểm hiệu suất tổng hợp" />
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          <TableHeaderWithHint title="Kinh doanh" hint="Tính từ các KR trực tiếp" />
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          <TableHeaderWithHint title="Hỗ trợ" hint="Tính từ các KR hỗ trợ" />
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          <TableHeaderWithHint title="Thực thi" hint="Tổng hợp từ tiến độ công việc" />
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          <TableHeaderWithHint title="Trạng thái" />
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          <TableHeaderWithHint title="Cập nhật lần cuối" />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReports.map((report) => (
                        <tr key={report.id} className="border-t border-slate-100 align-top">
                          <td className="px-5 py-4">
                            <Link href={`/reports/${report.id}`} className="text-sm font-semibold text-slate-900 hover:text-blue-700">
                              {report.profile_id ? scopeDirectory?.profileNameById[report.profile_id] ?? report.profile_id : "Chưa gắn nhân viên"}
                            </Link>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600">
                            {report.department_id
                              ? scopeDirectory?.departmentNameById[report.department_id] ?? report.department_id
                              : "Không gắn phòng ban"}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600">{formatReportPeriodTypeLabel(report.period_type)}</td>
                          <td className="px-4 py-4 text-sm font-semibold text-slate-700">{report.period_key}</td>
                          <td className="px-4 py-4 text-sm text-slate-600">
                            {formatReportDateRange(report.period_start, report.period_end)}
                          </td>
                          <td className="px-4 py-4 text-sm font-semibold text-slate-900">{formatScoreText(report.overall_score)}</td>
                          <td className="px-4 py-4 text-sm text-slate-700">{formatScoreText(report.business_score)}</td>
                          <td className="px-4 py-4 text-sm text-slate-700">{formatScoreText(report.support_score)}</td>
                          <td className="px-4 py-4 text-sm text-slate-700">{formatScoreText(report.execution_score)}</td>
                          <td className="px-4 py-4">
                            <ReportStatusBadge status={report.status} />
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600">{formatDateTime(report.updated_at)}</td>
                        </tr>
                      ))}
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
