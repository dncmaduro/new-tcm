"use client";

import Link from "next/link";
import { useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  DepartmentGoalExecutionTable,
  DepartmentMemberPerformance,
  DepartmentProgressOverview,
  DepartmentRecentActivity,
  DepartmentRiskPanel,
  DepartmentSummaryCards,
  DepartmentUpcomingDeadlines,
} from "@/app/department-performance/_components/department-performance-widgets";
import { useDepartmentPerformance } from "@/app/department-performance/use-department-performance";
import { useManagementAccess } from "@/lib/use-management-access";

type ViewMode = "summary" | "goals" | "members";

const executionHealthLabelMap = {
  on_track: "Đúng tiến độ",
  at_risk: "Có rủi ro",
  off_track: "Chậm tiến độ",
} as const;

const goalStatusLabelMap: Record<string, string> = {
  draft: "Nháp",
  active: "Đang hoạt động",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
  "Chưa đặt": "Chưa đặt",
};

export default function DepartmentPerformancePage() {
  const { isLoading: isLoadingPermission, canManage, managedDepartments, error: permissionError } = useManagementAccess();
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [quarterFilter, setQuarterFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [goalStatusFilter, setGoalStatusFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("summary");
  const effectiveDepartmentId = selectedDepartmentId ?? managedDepartments[0]?.id ?? null;

  const {
    isLoading,
    error,
    summary,
    goalExecution,
    memberPerformance,
    risks,
    upcomingDeadlines,
    recentActivities,
    filterOptions,
  } = useDepartmentPerformance({
    departmentId: effectiveDepartmentId,
    quarter: quarterFilter,
    year: yearFilter,
    goalStatus: goalStatusFilter,
    assigneeId: assigneeFilter,
    onlyOverdue,
    search: searchKeyword,
  });

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="departmentPerformance" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[280px]">
          <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-8">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  <Link href="/dashboard" className="hover:text-slate-700">
                    Bảng điều khiển
                  </Link>
                  <span className="px-2">›</span>
                  <span>Hiệu suất phòng ban</span>
                </p>
                <h1 className="mt-1 text-4xl font-semibold tracking-[-0.025em] text-slate-950">
                  Hiệu suất phòng ban
                </h1>
                <p className="text-sm text-slate-500">
                  Theo dõi tiến độ thực thi theo mục tiêu, KR, công việc và thành viên phụ trách.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/goals"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Đi tới mục tiêu
                </Link>
                <Link
                  href="/tasks"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Đi tới công việc
                </Link>
              </div>
            </div>
          </header>

          <main className="space-y-6 px-4 py-6 lg:px-8 lg:py-7">
            {isLoadingPermission ? (
              <section className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-sm text-slate-500">
                Đang kiểm tra quyền truy cập...
              </section>
            ) : null}

            {!isLoadingPermission && !canManage ? (
              <section className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-8">
                <h2 className="text-xl font-semibold text-rose-900">Bạn không có quyền truy cập trang này.</h2>
                <p className="mt-2 text-sm text-rose-700">
                  Trang hiệu suất phòng ban chỉ hiển thị cho người đang có cùng quyền quản lý như quyền tạo hoặc phân bổ mục tiêu và công việc trong hệ thống.
                </p>
                {permissionError ? <p className="mt-2 text-sm text-rose-600">{permissionError}</p> : null}
              </section>
            ) : null}

            {!isLoadingPermission && canManage ? (
              <>
                <section className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_0.8fr_0.8fr_0.9fr_1fr_auto_auto]">
                    <select
                      value={effectiveDepartmentId ?? ""}
                      onChange={(event) => setSelectedDepartmentId(event.target.value)}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                      {managedDepartments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={quarterFilter}
                      onChange={(event) => setQuarterFilter(event.target.value)}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
                    >
                      <option value="all">Tất cả quý</option>
                      {filterOptions.quarterOptions.map((quarter) => (
                        <option key={quarter} value={String(quarter)}>
                          Q{quarter}
                        </option>
                      ))}
                    </select>

                    <select
                      value={yearFilter}
                      onChange={(event) => setYearFilter(event.target.value)}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
                    >
                      <option value="all">Tất cả năm</option>
                      {filterOptions.yearOptions.map((year) => (
                        <option key={year} value={String(year)}>
                          {year}
                        </option>
                      ))}
                    </select>

                    <select
                      value={goalStatusFilter}
                      onChange={(event) => setGoalStatusFilter(event.target.value)}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
                    >
                      <option value="all">Tất cả trạng thái mục tiêu</option>
                      {filterOptions.statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {goalStatusLabelMap[status] ?? status}
                        </option>
                      ))}
                    </select>

                    <select
                      value={assigneeFilter}
                      onChange={(event) => setAssigneeFilter(event.target.value)}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
                    >
                      <option value="all">Tất cả thành viên</option>
                      {filterOptions.memberOptions.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>

                    <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={onlyOverdue}
                        onChange={(event) => setOnlyOverdue(event.target.checked)}
                      />
                      Chỉ quá hạn
                    </label>

                    <input
                      value={searchKeyword}
                      onChange={(event) => setSearchKeyword(event.target.value)}
                      placeholder="Tìm mục tiêu, KR, công việc, thành viên..."
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {[
                      { key: "summary", label: "Tổng quan" },
                      { key: "goals", label: "Mục tiêu / KR" },
                      { key: "members", label: "Thành viên" },
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setViewMode(item.key as ViewMode)}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                          viewMode === item.key
                            ? "bg-blue-600 text-white"
                            : "border border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </section>

                {error ? (
                  <section className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                    {error}
                  </section>
                ) : null}

                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-slate-500">Phòng ban đang xem</p>
                      <h2 className="mt-1 text-3xl font-semibold tracking-[-0.02em] text-slate-950">
                        {summary.departmentName || managedDepartments.find((item) => item.id === effectiveDepartmentId)?.name || "Phòng ban"}
                      </h2>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Quý / năm</p>
                        <p className="mt-1 text-base font-semibold text-slate-900">
                          {quarterFilter === "all" ? "Tất cả quý" : `Q${quarterFilter}`} · {yearFilter === "all" ? "Tất cả năm" : yearFilter}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Sức khỏe thực thi</p>
                        <p className="mt-1 text-base font-semibold text-slate-900">
                          {executionHealthLabelMap[summary.executionHealth]}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Tiến độ phòng ban</p>
                        <p className="mt-1 text-base font-semibold text-slate-900">{summary.departmentProgress}%</p>
                      </div>
                    </div>
                  </div>
                </section>

                <DepartmentSummaryCards summary={summary} loading={isLoading} />

                {(viewMode === "summary" || viewMode === "goals") ? (
                  <>
                    <DepartmentProgressOverview
                      summary={summary}
                      goals={goalExecution}
                      loading={isLoading}
                      error={error}
                    />
                    <DepartmentGoalExecutionTable goals={goalExecution} loading={isLoading} error={error} />
                  </>
                ) : null}

                {(viewMode === "summary" || viewMode === "members") ? (
                  <DepartmentMemberPerformance members={memberPerformance} loading={isLoading} error={error} />
                ) : null}

                <section className="grid gap-4 xl:grid-cols-3">
                  <DepartmentRiskPanel risks={risks} loading={isLoading} error={error} />
                  <DepartmentUpcomingDeadlines items={upcomingDeadlines} loading={isLoading} error={error} />
                  <DepartmentRecentActivity items={recentActivities} loading={isLoading} error={error} />
                </section>
              </>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
