"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  REPORT_PERIOD_TYPES,
  type PerformanceReportPeriodType,
  buildPerformanceReportPeriodKey,
  formatReportDateRange,
  formatReportPeriodTypeLabel,
  getSuggestedPeriodEnd,
  loadReportingScopeDirectory,
  normalizePerformanceReportRow,
  type ReportingScopeDirectory,
  validatePerformanceReportDraft,
} from "@/lib/performance-reports";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";

const today = new Date();
const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

type DuplicateReportInfo = {
  id: string;
  status: string;
};

export default function CreatePerformanceReportPage() {
  const router = useRouter();
  const access = useWorkspaceAccess();
  const [scopeDirectory, setScopeDirectory] = useState<ReportingScopeDirectory | null>(null);
  const [profileId, setProfileId] = useState("");
  const [departmentId, setDepartmentId] = useState("none");
  const [periodType, setPeriodType] = useState<PerformanceReportPeriodType>("weekly");
  const [periodStart, setPeriodStart] = useState(todayIso);
  const [periodEnd, setPeriodEnd] = useState(getSuggestedPeriodEnd("weekly", todayIso));
  const [selfComment, setSelfComment] = useState("");
  const [duplicateReport, setDuplicateReport] = useState<DuplicateReportInfo | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [isLoadingScope, setIsLoadingScope] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (access.isLoading || !access.isLoaded) {
      return;
    }

    let isActive = true;

    const loadScope = async () => {
      setIsLoadingScope(true);
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

        if (!isActive) {
          return;
        }

        setScopeDirectory(directory);

        const defaultProfileId =
          directory.roleScope === "member"
            ? access.profileId ?? directory.profileOptions[0]?.id ?? ""
            : access.profileId ?? directory.profileOptions[0]?.id ?? "";

        const inferredDepartmentId =
          defaultProfileId && directory.membershipsByProfileId[defaultProfileId]?.length
            ? directory.membershipsByProfileId[defaultProfileId][0]
            : "none";

        setProfileId(defaultProfileId);
        setDepartmentId(inferredDepartmentId);
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Không tải được phạm vi tạo báo cáo.");
        setScopeDirectory(null);
      } finally {
        if (isActive) {
          setIsLoadingScope(false);
        }
      }
    };

    void loadScope();

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

  useEffect(() => {
    setPeriodEnd(getSuggestedPeriodEnd(periodType, periodStart));
  }, [periodStart, periodType]);

  useEffect(() => {
    if (!scopeDirectory || !profileId) {
      return;
    }

    const availableDepartmentIds = scopeDirectory.membershipsByProfileId[profileId] ?? [];
    if (availableDepartmentIds.length === 0) {
      setDepartmentId("none");
      return;
    }

    if (departmentId === "none" || !availableDepartmentIds.includes(departmentId)) {
      setDepartmentId(availableDepartmentIds[0]);
    }
  }, [departmentId, profileId, scopeDirectory]);

  const periodKey = useMemo(
    () => buildPerformanceReportPeriodKey(periodType, periodStart),
    [periodStart, periodType],
  );

  useEffect(() => {
    if (!profileId || !periodKey) {
      setDuplicateReport(null);
      return;
    }

    let isActive = true;

    const checkDuplicate = async () => {
      setIsCheckingDuplicate(true);

      const { data, error: duplicateError } = await supabase
        .from("performance_reports")
        .select("id,status")
        .eq("profile_id", profileId)
        .eq("period_type", periodType)
        .eq("period_key", periodKey)
        .maybeSingle();

      if (!isActive) {
        return;
      }

      if (duplicateError) {
        setDuplicateReport(null);
        setIsCheckingDuplicate(false);
        return;
      }

      setDuplicateReport(data ? { id: String(data.id), status: String(data.status) } : null);
      setIsCheckingDuplicate(false);
    };

    void checkDuplicate();

    return () => {
      isActive = false;
    };
  }, [periodKey, periodType, profileId]);

  const availableDepartmentsForEmployee = useMemo(() => {
    if (!scopeDirectory || !profileId) {
      return [];
    }

    const employeeDepartmentIds = scopeDirectory.membershipsByProfileId[profileId] ?? [];
    if (employeeDepartmentIds.length === 0) {
      return scopeDirectory.departmentOptions;
    }

    return scopeDirectory.departmentOptions.filter((department) => employeeDepartmentIds.includes(department.id));
  }, [profileId, scopeDirectory]);

  const handleSubmit = async () => {
    if (!access.profileId) {
      setError("Không xác thực được người dùng hiện tại.");
      return;
    }

    const validationErrors = validatePerformanceReportDraft({
      profileId,
      departmentId: departmentId === "none" ? null : departmentId,
      periodType,
      periodKey,
      periodStart,
      periodEnd,
      selfComment,
    });

    if (validationErrors.length > 0) {
      setError(validationErrors[0]);
      return;
    }

    if (duplicateReport) {
      setError("Báo cáo của nhân sự này trong kỳ đã tồn tại.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { data: insertedReport, error: insertError } = await supabase
        .from("performance_reports")
        .insert({
          profile_id: profileId,
          department_id: departmentId === "none" ? null : departmentId,
          period_type: periodType,
          period_key: periodKey,
          period_start: periodStart,
          period_end: periodEnd,
          overall_score: 0,
          business_score: 0,
          support_score: 0,
          execution_score: 0,
          goal_count: 0,
          direct_kr_count: 0,
          support_kr_count: 0,
          task_count: 0,
          completed_task_count: 0,
          overdue_task_count: 0,
          self_comment: selfComment.trim() || null,
          manager_comment: null,
          status: "draft",
          created_by: access.profileId,
          reviewed_by: null,
        })
        .select(
          "id,profile_id,department_id,period_type,period_key,period_start,period_end,overall_score,business_score,support_score,execution_score,goal_count,direct_kr_count,support_kr_count,task_count,completed_task_count,overdue_task_count,self_comment,manager_comment,status,created_by,reviewed_by,created_at,updated_at",
        )
        .maybeSingle();

      if (insertError || !insertedReport) {
        throw new Error(insertError?.message || "Không tạo được báo cáo mới.");
      }

      const report = normalizePerformanceReportRow(insertedReport as Record<string, unknown>);
      router.push(`/reports/${report.id}?created=1`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không tạo được báo cáo mới.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="reports" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader
            title="Tạo báo cáo hiệu suất"
            items={[
              { label: "Báo cáo hiệu suất", href: "/reports" },
              { label: "Tạo báo cáo mới" },
            ]}
          />

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-7">
            <section className="mx-auto grid w-full max-w-[1120px] gap-6 xl:grid-cols-[1.4fr_0.9fr]">
              <article className="rounded-2xl border border-slate-200 bg-white p-5 lg:p-6">
                {isLoadingScope ? (
                  <div className="text-sm text-slate-500">Đang tải phạm vi tạo báo cáo...</div>
                ) : (
                  <>
                    {error ? (
                      <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {error}
                      </div>
                    ) : null}

                    {duplicateReport ? (
                      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        Báo cáo này đã tồn tại cho nhân sự và kỳ đánh giá đã chọn.{" "}
                        <Link href={`/reports/${duplicateReport.id}`} className="font-semibold underline">
                          Mở báo cáo hiện có
                        </Link>
                        .
                      </div>
                    ) : null}

                    <div className="space-y-5">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-800">Nhân sự</label>
                        <Select value={profileId || undefined} onValueChange={setProfileId}>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Chọn nhân sự" />
                          </SelectTrigger>
                          <SelectContent>
                            {(scopeDirectory?.profileOptions ?? []).map((profile) => (
                              <SelectItem key={profile.id} value={profile.id}>
                                {profile.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-800">Phòng ban</label>
                        <Select value={departmentId} onValueChange={setDepartmentId}>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Chọn phòng ban hoặc để trống" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Không gắn phòng ban</SelectItem>
                            {availableDepartmentsForEmployee.map((department) => (
                              <SelectItem key={department.id} value={department.id}>
                                {department.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500">
                          Nếu nhân sự đã được gắn rõ phòng ban, hệ thống sẽ tự chọn sẵn.
                        </p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-slate-800">Loại kỳ báo cáo</label>
                          <Select value={periodType} onValueChange={(value) => setPeriodType(value as PerformanceReportPeriodType)}>
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Chọn loại kỳ" />
                            </SelectTrigger>
                            <SelectContent>
                              {REPORT_PERIOD_TYPES.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-slate-800">Mã kỳ</label>
                          <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800">
                            {periodKey || "Chưa có"}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-slate-800">Ngày bắt đầu</label>
                          <input
                            type="date"
                            value={periodStart}
                            onChange={(event) => setPeriodStart(event.target.value)}
                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-slate-800">Ngày kết thúc</label>
                          <input
                            type="date"
                            value={periodEnd}
                            onChange={(event) => setPeriodEnd(event.target.value)}
                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-800">Nhận xét tự đánh giá</label>
                        <textarea
                          value={selfComment}
                          onChange={(event) => setSelfComment(event.target.value)}
                          rows={6}
                          placeholder="Ghi chú tự đánh giá cho kỳ này..."
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                        <p className="text-xs text-slate-500">
                          Sau khi dữ liệu kỳ này được tổng hợp, hệ thống sẽ bổ sung mục tiêu, KR và điểm chi tiết cho báo cáo.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <Button onClick={() => void handleSubmit()} disabled={isSubmitting || isCheckingDuplicate || Boolean(duplicateReport)}>
                          {isSubmitting ? "Đang tạo..." : "Tạo báo cáo mới"}
                        </Button>
                        <Link
                          href="/reports"
                          className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          Quay lại lịch sử
                        </Link>
                      </div>
                    </div>
                  </>
                )}
              </article>

              <aside className="space-y-4">
                <article className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Tóm tắt kỳ báo cáo</p>
                  <p className="mt-3 text-2xl font-semibold text-slate-950">
                    {formatReportPeriodTypeLabel(periodType)} · {periodKey || "Chưa có"}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">{formatReportDateRange(periodStart, periodEnd)}</p>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Trước khi tạo báo cáo</p>
                  <div className="mt-4 space-y-3 text-sm text-slate-600">
                    <p>Báo cáo mới chỉ áp dụng cho một nhân sự trong một kỳ đánh giá cụ thể.</p>
                    <p>Khi dữ liệu đã sẵn sàng, trang chi tiết sẽ hiển thị mục tiêu, KR trực tiếp, KR hỗ trợ và phần thực thi.</p>
                    <p>Hệ thống không cho tạo trùng báo cáo của cùng một nhân sự trong cùng một kỳ.</p>
                  </div>
                </article>
              </aside>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
