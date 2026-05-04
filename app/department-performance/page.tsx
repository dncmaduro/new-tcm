"use client";

import { type ReactNode, useState } from "react";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  DepartmentAnalyticsSection,
  DepartmentGoalsSection,
  DepartmentKeyResultsSection,
  DepartmentRisksSection,
  DepartmentSummaryCards,
} from "@/app/department-performance/_components/department-performance-widgets";
import { useDepartmentPerformance } from "@/app/department-performance/use-department-performance";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useManagementAccess } from "@/lib/use-management-access";
import { cn } from "@/lib/utils";

function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function formatPeriodLabel(quarterFilter: string, yearFilter: string) {
  if (quarterFilter === "all" && yearFilter === "all") {
    return "Tất cả kỳ đánh giá";
  }
  if (quarterFilter !== "all" && yearFilter !== "all") {
    return `Q${quarterFilter}/${yearFilter}`;
  }
  if (quarterFilter !== "all") {
    return `Q${quarterFilter} · Tất cả năm`;
  }
  return `Năm ${yearFilter}`;
}

export default function DepartmentPerformancePage() {
  const {
    isLoading: isLoadingPermission,
    canManage,
    manageableDepartments,
    error: permissionError,
  } = useManagementAccess();

  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [quarterFilter, setQuarterFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");

  const effectiveDepartmentId = selectedDepartmentId ?? manageableDepartments[0]?.id ?? null;

  const {
    isLoading,
    error,
    summary,
    analytics,
    goals,
    directKeyResults,
    supportKeyResults,
    risks,
    filterOptions,
  } = useDepartmentPerformance({
    departmentId: effectiveDepartmentId,
    quarter: quarterFilter,
    year: yearFilter,
    goalStatus: "all",
    ownerId: "all",
    goalType: "all",
    keyResultType: "all",
    keyResultContributionType: "all",
    memberId: "all",
    search: "",
  });

  const currentDepartmentName =
    summary.departmentName ||
    manageableDepartments.find((item) => item.id === effectiveDepartmentId)?.name ||
    "Phòng ban";

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="departmentPerformance" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader
            title="Hiệu suất phòng ban"
            items={[{ label: "Hiệu suất phòng ban" }]}
          />

          <main className="space-y-8 px-4 py-6 lg:px-8 lg:py-8">
            {isLoadingPermission ? (
              <section className="rounded-3xl border border-slate-200 bg-white px-6 py-8 text-sm text-slate-500">
                Đang kiểm tra quyền truy cập...
              </section>
            ) : null}

            {!isLoadingPermission && !canManage ? (
              <section className="rounded-3xl border border-rose-200 bg-rose-50 px-6 py-8">
                <h2 className="text-xl font-semibold text-rose-900">Bạn không có quyền truy cập trang này.</h2>
                <p className="mt-2 text-sm leading-6 text-rose-700">
                  Trang hiệu suất phòng ban chỉ dành cho người có quyền quản lý tương ứng để theo dõi mục tiêu, KR và phân tích đóng góp theo phòng ban.
                </p>
                {permissionError ? <p className="mt-2 text-sm text-rose-600">{permissionError}</p> : null}
              </section>
            ) : null}

            {!isLoadingPermission && canManage ? (
              <>
                <section className="rounded-[32px] border border-slate-200 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(236,245,255,0.92))] p-6 shadow-[0_24px_60px_-45px_rgba(15,23,42,0.55)]">
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Xem nhanh</p>
                      <h2 className="mt-3 text-[34px] font-semibold leading-[1.06] tracking-[-0.04em] text-slate-950">
                        Xem nhanh phòng ban đang tốt hay cần chú ý ở đâu.
                      </h2>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-3xl border border-white bg-white/90 px-4 py-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Phòng ban đang xem</p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">{currentDepartmentName}</p>
                      </div>
                      <div className="rounded-3xl border border-white bg-white/90 px-4 py-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Kỳ đánh giá</p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">{formatPeriodLabel(quarterFilter, yearFilter)}</p>
                      </div>
                      <div className="rounded-3xl border border-white bg-white/90 px-4 py-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Mục tiêu đang theo dõi</p>
                        <p className="mt-2 text-[28px] font-semibold leading-none tracking-[-0.03em] text-slate-950">
                          {isLoading ? "..." : summary.trackedGoals}
                        </p>
                      </div>
                      <div className="rounded-3xl border border-white bg-white/90 px-4 py-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">KR trực tiếp trong phạm vi</p>
                        <p className="mt-2 text-[28px] font-semibold leading-none tracking-[-0.03em] text-slate-950">
                          {isLoading ? "..." : summary.directKrCount}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.55)]">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Bộ lọc</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Phạm vi theo dõi</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Chọn phòng ban, quý và năm để xem đúng phạm vi cần theo dõi.
                    </p>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-3">
                    <FilterField label="Phòng ban">
                      <Select
                        value={effectiveDepartmentId ?? undefined}
                        onValueChange={setSelectedDepartmentId}
                        disabled={manageableDepartments.length === 0}
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Chọn phòng ban" />
                        </SelectTrigger>
                        <SelectContent>
                          {manageableDepartments.map((department) => (
                            <SelectItem key={department.id} value={department.id}>
                              {department.pathLabel}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs leading-5 text-slate-500">
                        Hiển thị các phòng ban bạn có thể quản lý, gồm cả phòng ban con nếu có.
                      </p>
                    </FilterField>

                    <FilterField label="Quý">
                      <Select value={quarterFilter} onValueChange={setQuarterFilter}>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Tất cả quý" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tất cả quý</SelectItem>
                          {filterOptions.quarterOptions.map((quarter) => (
                            <SelectItem key={quarter} value={String(quarter)}>
                              Q{quarter}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FilterField>

                    <FilterField label="Năm">
                      <Select value={yearFilter} onValueChange={setYearFilter}>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Tất cả năm" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tất cả năm</SelectItem>
                          {filterOptions.yearOptions.map((year) => (
                            <SelectItem key={year} value={String(year)}>
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FilterField>
                  </div>
                </section>

                {error ? (
                  <section className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm leading-6 text-rose-700">
                    {error}
                  </section>
                ) : null}

                <DepartmentSummaryCards summary={summary} loading={isLoading} />
                <DepartmentAnalyticsSection analytics={analytics} loading={isLoading} error={error} />
                <DepartmentGoalsSection goals={goals} loading={isLoading} error={error} />
                <DepartmentKeyResultsSection
                  directItems={directKeyResults}
                  supportItems={supportKeyResults}
                  loading={isLoading}
                  error={error}
                />
                <DepartmentRisksSection risks={risks} loading={isLoading} error={error} />
              </>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
