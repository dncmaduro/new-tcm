"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  BlockState,
  CompactMetricCard,
  ReportItemGroup,
  ReportStatusBadge,
  ReportTopSummary,
  SectionTitle,
} from "@/app/reports/_components/reporting-ui";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  type PerformanceReportItemRow,
  type PerformanceReportRow,
  type ReportingScopeDirectory,
  canOwnerEditReport,
  formatReportDateRange,
  formatReportPeriodTypeLabel,
  formatReportScopeLabel,
  formatReportStatusLabel,
  getManagerStatusChoices,
  getOwnerStatusChoices,
  isReportLocked,
  loadReportingScopeDirectory,
  normalizePerformanceReportItemRow,
  normalizePerformanceReportRow,
} from "@/lib/performance-reports";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "Chưa cập nhật";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Chưa cập nhật";
  }
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

export default function PerformanceReportDetailPage() {
  const params = useParams<{ reportId: string }>();
  const searchParams = useSearchParams();
  const access = useWorkspaceAccess();
  const reportId = params.reportId ? String(params.reportId) : "";

  const [scopeDirectory, setScopeDirectory] = useState<ReportingScopeDirectory | null>(null);
  const [report, setReport] = useState<PerformanceReportRow | null>(null);
  const [items, setItems] = useState<PerformanceReportItemRow[]>([]);
  const [profileNameById, setProfileNameById] = useState<Record<string, string>>({});
  const [departmentNameById, setDepartmentNameById] = useState<Record<string, string>>({});
  const [selfCommentDraft, setSelfCommentDraft] = useState("");
  const [managerCommentDraft, setManagerCommentDraft] = useState("");
  const [managerStatusDraft, setManagerStatusDraft] = useState<string>("draft");
  const [notice, setNotice] = useState<string | null>(searchParams.get("created") === "1" ? "Đã tạo báo cáo mới." : null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSelf, setIsSavingSelf] = useState(false);
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (access.isLoading || !access.isLoaded || !reportId) {
      return;
    }

    let isActive = true;

    const loadDetail = async () => {
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

        const { data: reportData, error: reportError } = await supabase
          .from("performance_reports")
          .select(
            "id,profile_id,department_id,period_type,period_key,period_start,period_end,overall_score,business_score,support_score,execution_score,goal_count,direct_kr_count,support_kr_count,task_count,completed_task_count,overdue_task_count,self_comment,manager_comment,status,created_by,reviewed_by,created_at,updated_at",
          )
          .eq("id", reportId)
          .maybeSingle();

        if (reportError || !reportData) {
          throw new Error(reportError?.message || "Không tìm thấy báo cáo.");
        }

        const normalizedReport = normalizePerformanceReportRow(reportData as Record<string, unknown>);
        const canViewReport =
          directory.roleScope === "director" ||
          (normalizedReport.profile_id ? directory.accessibleProfileIds.includes(normalizedReport.profile_id) : false);

        if (!canViewReport) {
          throw new Error("Bạn không có quyền xem báo cáo này.");
        }

        const { data: itemData, error: itemError } = await supabase
          .from("performance_report_items")
          .select(
            "id,performance_report_id,item_type,reference_id,name,target_value,current_value,unit,progress_percent,weight,score,meta_json,created_at,updated_at",
          )
          .eq("performance_report_id", reportId)
          .order("item_type", { ascending: true });

        if (itemError) {
          throw new Error(itemError.message || "Không tải được dữ liệu chi tiết của báo cáo.");
        }

        const extraProfileIds = [
          ...new Set(
            [normalizedReport.profile_id, normalizedReport.created_by, normalizedReport.reviewed_by]
              .filter((value): value is string => Boolean(value))
              .filter((value) => !directory.profileNameById[value]),
          ),
        ];

        const extraDepartmentIds = [
          ...new Set(
            [normalizedReport.department_id]
              .filter((value): value is string => Boolean(value))
              .filter((value) => !directory.departmentNameById[value]),
          ),
        ];

        const nextProfileNameById = { ...directory.profileNameById };
        const nextDepartmentNameById = { ...directory.departmentNameById };

        if (extraProfileIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from("profiles")
            .select("id,name,email")
            .in("id", extraProfileIds);

          if (profilesError) {
            throw new Error(profilesError.message || "Không tải được tên người liên quan.");
          }

          (profilesData ?? []).forEach((profile) => {
            nextProfileNameById[String(profile.id)] = profile.name?.trim() || profile.email?.trim() || "Không rõ";
          });
        }

        if (extraDepartmentIds.length > 0) {
          const { data: departmentsData, error: departmentsError } = await supabase
            .from("departments")
            .select("id,name")
            .in("id", extraDepartmentIds);

          if (departmentsError) {
            throw new Error(departmentsError.message || "Không tải được phòng ban của báo cáo.");
          }

          (departmentsData ?? []).forEach((department) => {
            nextDepartmentNameById[String(department.id)] = String(department.name);
          });
        }

        if (!isActive) {
          return;
        }

        setScopeDirectory(directory);
        setProfileNameById(nextProfileNameById);
        setDepartmentNameById(nextDepartmentNameById);
        setReport(normalizedReport);
        setItems((itemData ?? []).map((item) => normalizePerformanceReportItemRow(item as Record<string, unknown>)));
        setSelfCommentDraft(normalizedReport.self_comment ?? "");
        setManagerCommentDraft(normalizedReport.manager_comment ?? "");
        setManagerStatusDraft(normalizedReport.status);
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Không tải được báo cáo.");
        setReport(null);
        setItems([]);
        setScopeDirectory(null);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadDetail();

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
    reportId,
  ]);

  const groupedItems = useMemo(() => {
    const initial = {
      goal: [] as PerformanceReportItemRow[],
      direct_kr: [] as PerformanceReportItemRow[],
      support_kr: [] as PerformanceReportItemRow[],
      execution: [] as PerformanceReportItemRow[],
    };

    items.forEach((item) => {
      initial[item.item_type].push(item);
    });

    return {
      goal: [...initial.goal].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
      direct_kr: [...initial.direct_kr].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
      support_kr: [...initial.support_kr].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
      execution: [...initial.execution].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    };
  }, [items]);

  const isOwner = report?.profile_id === access.profileId;
  const canEditSelf = Boolean(report && isOwner && canOwnerEditReport(report.status));
  const canReview = Boolean(
    report &&
      scopeDirectory &&
      !isOwner &&
      (scopeDirectory.roleScope === "director" ||
        (report.profile_id ? scopeDirectory.accessibleProfileIds.includes(report.profile_id) : false)),
  );
  const locked = isReportLocked(report?.status);

  const handleSaveSelf = async (nextStatus: string) => {
    if (!report || !canEditSelf) {
      return;
    }

    setIsSavingSelf(true);
    setError(null);
    setNotice(null);

    const { data, error: updateError } = await supabase
      .from("performance_reports")
      .update({
        self_comment: selfCommentDraft.trim() || null,
        status: nextStatus,
      })
      .eq("id", report.id)
      .select(
        "id,profile_id,department_id,period_type,period_key,period_start,period_end,overall_score,business_score,support_score,execution_score,goal_count,direct_kr_count,support_kr_count,task_count,completed_task_count,overdue_task_count,self_comment,manager_comment,status,created_by,reviewed_by,created_at,updated_at",
      )
      .maybeSingle();

    if (updateError || !data) {
      setError(updateError?.message || "Không cập nhật được nhận xét tự đánh giá.");
      setIsSavingSelf(false);
      return;
    }

    const nextReport = normalizePerformanceReportRow(data as Record<string, unknown>);
    setReport(nextReport);
    setSelfCommentDraft(nextReport.self_comment ?? "");
    setManagerStatusDraft(nextReport.status);
    setNotice(nextStatus === "submitted" ? "Đã gửi báo cáo để quản lý xem xét." : "Đã lưu bản nháp.");
    setIsSavingSelf(false);
  };

  const handleSaveReview = async () => {
    if (!report || !canReview || locked || !access.profileId) {
      return;
    }

    setIsSavingReview(true);
    setError(null);
    setNotice(null);

    const nextStatus = managerStatusDraft;
    const { data, error: updateError } = await supabase
      .from("performance_reports")
      .update({
        manager_comment: managerCommentDraft.trim() || null,
        status: nextStatus,
        reviewed_by: access.profileId,
      })
      .eq("id", report.id)
      .select(
        "id,profile_id,department_id,period_type,period_key,period_start,period_end,overall_score,business_score,support_score,execution_score,goal_count,direct_kr_count,support_kr_count,task_count,completed_task_count,overdue_task_count,self_comment,manager_comment,status,created_by,reviewed_by,created_at,updated_at",
      )
      .maybeSingle();

    if (updateError || !data) {
      setError(updateError?.message || "Không cập nhật được phần duyệt báo cáo.");
      setIsSavingReview(false);
      return;
    }

    const nextReport = normalizePerformanceReportRow(data as Record<string, unknown>);
    setReport(nextReport);
    setManagerCommentDraft(nextReport.manager_comment ?? "");
    setManagerStatusDraft(nextReport.status);
    setNotice(nextReport.status === "locked" ? "Báo cáo đã được khóa." : "Đã cập nhật nội dung duyệt.");
    setIsSavingReview(false);
  };

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="reports" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">
                  <Link href="/reports" className="hover:text-slate-700">
                    Báo cáo hiệu suất
                  </Link>
                  <span className="px-2">›</span>
                  <span className="font-semibold text-slate-700">Chi tiết báo cáo</span>
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em] text-slate-900">Chi tiết báo cáo hiệu suất</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Xem điểm, dữ liệu chi tiết và tiến trình duyệt của báo cáo trong kỳ này.
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Phạm vi hiện tại:{" "}
                  <span className="font-semibold text-slate-700">
                    {scopeDirectory ? formatReportScopeLabel(scopeDirectory.roleScope) : "Đang xác định"}
                  </span>
                </p>
              </div>

            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-7">
            {notice ? (
              <section className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {notice}
              </section>
            ) : null}

            {isLoading || error || !report ? (
              <section className="rounded-2xl border border-slate-200 bg-white">
                <BlockState
                  loading={isLoading}
                  error={error}
                  empty={!report}
                  emptyText="Không tìm thấy dữ liệu báo cáo."
                />
              </section>
            ) : (
              <div className="space-y-6">
                <ReportTopSummary
                  employeeName={report.profile_id ? profileNameById[report.profile_id] ?? report.profile_id : "Chưa gán"}
                  departmentName={
                    report.department_id
                      ? departmentNameById[report.department_id] ?? report.department_id
                      : "Không gắn phòng ban"
                  }
                  periodTypeLabel={formatReportPeriodTypeLabel(report.period_type)}
                  periodKey={report.period_key}
                  periodStart={report.period_start}
                  periodEnd={report.period_end}
                  status={report.status}
                  overallScore={report.overall_score}
                  businessScore={report.business_score}
                  supportScore={report.support_score}
                  executionScore={report.execution_score}
                />

                <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                  <CompactMetricCard label="Mục tiêu" value={report.goal_count} />
                  <CompactMetricCard label="KR trực tiếp" value={report.direct_kr_count} />
                  <CompactMetricCard label="KR hỗ trợ" value={report.support_kr_count} />
                  <CompactMetricCard label="Công việc" value={report.task_count} />
                  <CompactMetricCard label="Đã hoàn thành" value={report.completed_task_count} />
                  <CompactMetricCard label="Quá hạn" value={report.overdue_task_count} />
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white">
                  <SectionTitle
                    title="Nhận xét và duyệt báo cáo"
                    description="Nhận xét tự đánh giá dành cho nhân viên. Nhận xét của quản lý và trạng thái dùng cho bước duyệt báo cáo."
                    action={<ReportStatusBadge status={report.status} />}
                  />

                  <div className="grid gap-5 px-5 py-5 xl:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">Nhận xét tự đánh giá</h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {canEditSelf
                              ? "Nhân viên có thể cập nhật phần này khi báo cáo còn ở trạng thái nháp hoặc đã gửi."
                              : "Phần nhận xét tự đánh giá hiện chỉ có thể xem."}
                          </p>
                        </div>
                        <span className="text-xs text-slate-500">Cập nhật lần cuối {formatDateTime(report.updated_at)}</span>
                      </div>

                      {canEditSelf ? (
                        <>
                          <textarea
                            value={selfCommentDraft}
                            onChange={(event) => setSelfCommentDraft(event.target.value)}
                            rows={7}
                            className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          />

                          <div className="mt-4 flex flex-wrap gap-3">
                            {getOwnerStatusChoices(report.status).includes("draft") ? (
                              <Button
                                variant="outline"
                                onClick={() => void handleSaveSelf("draft")}
                                disabled={isSavingSelf}
                              >
                                {isSavingSelf ? "Đang lưu..." : "Lưu nháp"}
                              </Button>
                            ) : null}
                            {getOwnerStatusChoices(report.status).includes("submitted") ? (
                              <Button onClick={() => void handleSaveSelf("submitted")} disabled={isSavingSelf}>
                                {isSavingSelf ? "Đang gửi..." : report.status === "submitted" ? "Cập nhật nhận xét" : "Gửi báo cáo"}
                              </Button>
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
                          {report.self_comment?.trim() || "Chưa có nhận xét tự đánh giá."}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">Phần duyệt của quản lý</h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {canReview && !locked
                              ? "Quản lý có thể thêm nhận xét và cập nhật trạng thái duyệt của báo cáo."
                              : "Phần duyệt của quản lý hiện chỉ có thể xem hoặc chưa khả dụng."}
                          </p>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <p>Tạo lúc {formatDateTime(report.created_at)}</p>
                          <p>Người duyệt {report.reviewed_by ? profileNameById[report.reviewed_by] ?? report.reviewed_by : "Chưa có"}</p>
                        </div>
                      </div>

                      {canReview && !locked ? (
                        <>
                          <div className="mt-4">
                            <label className="mb-2 block text-sm font-semibold text-slate-800">Trạng thái</label>
                            <Select value={managerStatusDraft} onValueChange={setManagerStatusDraft}>
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="Chọn trạng thái" />
                              </SelectTrigger>
                              <SelectContent>
                                {getManagerStatusChoices(report.status).map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {formatReportStatusLabel(status)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <textarea
                            value={managerCommentDraft}
                            onChange={(event) => setManagerCommentDraft(event.target.value)}
                            rows={7}
                            className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            placeholder="Nhập nhận xét của quản lý..."
                          />

                          <div className="mt-4 flex flex-wrap gap-3">
                            <Button onClick={() => void handleSaveReview()} disabled={isSavingReview}>
                              {isSavingReview ? "Đang lưu..." : "Lưu nội dung duyệt"}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
                          {report.manager_comment?.trim() || "Chưa có nhận xét của quản lý."}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white">
                  <SectionTitle
                    title="Chi tiết dữ liệu báo cáo"
                    description={`Báo cáo của kỳ ${report.period_key} gồm mục tiêu, KR trực tiếp, KR hỗ trợ và phần thực thi.`}
                  />

                  <div className="space-y-5 px-5 py-5">
                    <ReportItemGroup itemType="goal" items={groupedItems.goal} />
                    <ReportItemGroup itemType="direct_kr" items={groupedItems.direct_kr} />
                    <ReportItemGroup itemType="support_kr" items={groupedItems.support_kr} />
                    <ReportItemGroup itemType="execution" items={groupedItems.execution} />
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h2 className="text-lg font-semibold text-slate-900">Thông tin hệ thống</h2>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm text-slate-600">
                    <p>Phòng ban: {report.department_id ? departmentNameById[report.department_id] ?? report.department_id : "Không gắn"}</p>
                    <p>Khoảng kỳ: {formatReportDateRange(report.period_start, report.period_end)}</p>
                    <p>Người tạo: {report.created_by ? profileNameById[report.created_by] ?? report.created_by : "Chưa có"}</p>
                    <p>Cập nhật lúc: {formatDateTime(report.updated_at)}</p>
                  </div>
                </section>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
