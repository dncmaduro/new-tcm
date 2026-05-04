"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type PerformanceReportItemRow,
  type PerformanceReportMetricKind,
  type PerformanceReportRow,
  type PerformanceReportRoleMembershipRow,
  type ReportingScopeDirectory,
  buildGoalReportProfileIds,
  canOwnerEditReport,
  formatReportDateRange,
  formatReportProgressValue,
  formatReportStatusLabel,
  formatReportTaskCompletionText,
  formatReportTaskPointText,
  getPerformanceReportMetricKind,
  getManagerStatusChoices,
  getOwnerStatusChoices,
  isReportLocked,
  loadReportingScopeDirectory,
  normalizePerformanceReportItemRow,
  normalizePerformanceReportRow,
} from "@/lib/performance-reports";
import { buildGoalProgressMap, buildKeyResultProgressMap, computeMetricProgress } from "@/lib/okr";
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

type TrackedGoalRow = {
  id: string;
  name: string;
  type: string | null;
  target: number | null;
  unit: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
};

type TrackedKeyResultRow = {
  id: string;
  goal_id: string | null;
  name: string;
  contribution_type: string | null;
  start_value: number | null;
  current: number | null;
  target: number | null;
  unit: string | null;
  start_date: string | null;
  end_date: string | null;
  goal?: {
    id: string;
    name: string;
  } | null;
};

type TrackedTaskRow = {
  id: string;
  name: string;
  key_result_id: string | null;
  assignee_id: string | null;
  profile_id: string | null;
  type: string | null;
  priority: string | null;
  current: number | null;
  target: number | null;
  unit: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  key_result?: {
    id: string;
    goal_id: string | null;
    name: string;
    goal?: {
      id: string;
      name: string;
    } | null;
  } | null;
};

type ReportKrRpcRow = {
  id: string;
  name: string;
  target: number | null;
  current: number | null;
  unit: string | null;
  weight: number | null;
  contribution_type: "direct" | "support";
};

const toTrackedDate = (value: string | null | undefined) => (value ? String(value) : null);

const toTrackedNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const overlapsReportPeriod = ({
  startDate,
  endDate,
  createdAt,
  periodStart,
  periodEnd,
}: {
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string | null;
  periodStart: string;
  periodEnd: string;
}) => {
  const start = startDate ?? null;
  const end = endDate ?? null;
  const created = createdAt ? String(createdAt).slice(0, 10) : null;

  if (start && end) {
    return start <= periodEnd && end >= periodStart;
  }
  if (start) {
    return start >= periodStart && start <= periodEnd;
  }
  if (end) {
    return end >= periodStart && end <= periodEnd;
  }
  if (created) {
    return created >= periodStart && created <= periodEnd;
  }
  return true;
};

const buildTaskItemRow = (task: TrackedTaskRow): PerformanceReportItemRow => ({
  id: task.id,
  performance_report_id: "tracked-task",
  item_type: "execution",
  reference_id: task.id,
  name: task.name,
  target_value: toTrackedNumber(task.target),
  current_value: toTrackedNumber(task.current) ?? 0,
  unit: task.unit,
  progress_percent: computeMetricProgress(task.current, 0, task.target),
  weight: null,
  score: computeMetricProgress(task.current, 0, task.target),
  meta_json: {
    href: `/tasks/${task.id}`,
    timeline: formatReportDateRange(task.start_date, task.end_date),
    metric_type: task.type ?? task.unit ?? null,
    priority: task.priority,
    task_type: task.type,
    key_result_name: task.key_result?.name ?? null,
    goal_name: task.key_result?.goal?.name ?? null,
  },
  created_at: task.created_at,
  updated_at: task.created_at,
});

export default function PerformanceReportDetailPage() {
  const params = useParams<{ reportId: string }>();
  const searchParams = useSearchParams();
  const access = useWorkspaceAccess();
  const reportId = params.reportId ? String(params.reportId) : "";

  const [scopeDirectory, setScopeDirectory] = useState<ReportingScopeDirectory | null>(null);
  const [report, setReport] = useState<PerformanceReportRow | null>(null);
  const [reportMetricKind, setReportMetricKind] = useState<PerformanceReportMetricKind>("kr");
  const [items, setItems] = useState<PerformanceReportItemRow[]>([]);
  const [trackedItems, setTrackedItems] = useState<PerformanceReportItemRow[]>([]);
  const [profileNameById, setProfileNameById] = useState<Record<string, string>>({});
  const [departmentNameById, setDepartmentNameById] = useState<Record<string, string>>({});
  const [selfCommentDraft, setSelfCommentDraft] = useState("");
  const [managerCommentDraft, setManagerCommentDraft] = useState("");
  const [managerStatusDraft, setManagerStatusDraft] = useState<string>("draft");
  const [notice, setNotice] = useState<string | null>(
    searchParams.get("created") === "1" ? "Đã tạo báo cáo mới." : null,
  );
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
            "id,profile_id,department_id,period_type,period_key,period_start,period_end,overall_score,business_score,support_score,execution_score,goal_count,direct_kr_count,support_kr_count,task_count,completed_task_count,total_task_points,completed_task_points,overdue_task_count,self_comment,manager_comment,status,created_by,reviewed_by,created_at,updated_at",
          )
          .eq("id", reportId)
          .maybeSingle();

        if (reportError || !reportData) {
          throw new Error(reportError?.message || "Không tìm thấy báo cáo.");
        }

        const normalizedReport = normalizePerformanceReportRow(
          reportData as Record<string, unknown>,
        );
        const canViewReport =
          directory.roleScope === "director" ||
          (normalizedReport.profile_id
            ? directory.accessibleProfileIds.includes(normalizedReport.profile_id)
            : false);

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

        const reportRoleResult = normalizedReport.profile_id
          ? await supabase
              .from("user_role_in_department")
              .select("profile_id,department_id,role_id")
              .eq("profile_id", normalizedReport.profile_id)
          : { data: [] as PerformanceReportRoleMembershipRow[], error: null };

        if (reportRoleResult.error) {
          throw new Error(
            reportRoleResult.error.message || "Không tải được vai trò của nhân sự trong báo cáo.",
          );
        }

        const metricKind = getPerformanceReportMetricKind(
          normalizedReport.profile_id,
          buildGoalReportProfileIds({
            roles: access.roles,
            departments: access.departments,
            memberships: (reportRoleResult.data ?? []).map((item) => ({
              profile_id: item.profile_id ? String(item.profile_id) : null,
              department_id: item.department_id ? String(item.department_id) : null,
              role_id: item.role_id ? String(item.role_id) : null,
            })),
          }),
        );

        let nextTrackedItems: PerformanceReportItemRow[] = [];

        if (
          normalizedReport.profile_id &&
          normalizedReport.period_start &&
          normalizedReport.period_end
        ) {
          const periodStart = normalizedReport.period_start;
          const periodEnd = normalizedReport.period_end;
          const profileId = normalizedReport.profile_id;

          if (metricKind === "goal") {
            const { data: goalOwnerRows, error: goalOwnerError } = await supabase
              .from("goal_owners")
              .select("goal_id")
              .eq("profile_id", profileId);

            if (goalOwnerError) {
              throw new Error(
                goalOwnerError.message || "Không tải được danh sách Goal đang theo dõi.",
              );
            }

            const goalIds = [
              ...new Set(
                (goalOwnerRows ?? [])
                  .map((row) => ("goal_id" in row && row.goal_id ? String(row.goal_id) : null))
                  .filter((value): value is string => Boolean(value)),
              ),
            ];

            const { data: goalsData, error: goalsError } =
              goalIds.length > 0
                ? await supabase
                    .from("goals")
                    .select("id,name,type,target,unit,start_date,end_date,created_at")
                    .in("id", goalIds)
                : { data: [] as TrackedGoalRow[], error: null };

            if (goalsError) {
              throw new Error(goalsError.message || "Không tải được Goal của báo cáo.");
            }

            const normalizedGoals = ((goalsData ?? []) as Array<Record<string, unknown>>)
              .map(
                (goal) =>
                  ({
                    id: String(goal.id),
                    name: String(goal.name ?? "Mục tiêu"),
                    type: goal.type ? String(goal.type) : null,
                    target: toTrackedNumber(goal.target as number | string | null | undefined),
                    unit: goal.unit ? String(goal.unit) : null,
                    start_date: toTrackedDate(goal.start_date as string | null | undefined),
                    end_date: toTrackedDate(goal.end_date as string | null | undefined),
                    created_at: toTrackedDate(goal.created_at as string | null | undefined),
                  }) satisfies TrackedGoalRow,
              )
              .filter((goal) =>
                overlapsReportPeriod({
                  startDate: goal.start_date,
                  endDate: goal.end_date,
                  createdAt: goal.created_at,
                  periodStart,
                  periodEnd,
                }),
              );

            const { data: keyResultsData, error: keyResultsError } =
              normalizedGoals.length > 0
                ? await supabase
                    .from("key_results")
                    .select(
                      `
                        id,
                        goal_id,
                        name,
                        contribution_type,
                        start_value,
                        current,
                        target,
                        unit,
                        start_date,
                        end_date,
                        goal:goals!key_results_goal_id_fkey(id,name)
                      `,
                    )
                    .in(
                      "goal_id",
                      normalizedGoals.map((goal) => goal.id),
                    )
                : { data: [] as TrackedKeyResultRow[], error: null };

            if (keyResultsError) {
              throw new Error(
                keyResultsError.message || "Không tải được KR của Goal trong báo cáo.",
              );
            }

            const normalizedKeyResults = ((keyResultsData ?? []) as Array<Record<string, unknown>>)
              .map((kr) => {
                const rawGoal = Array.isArray(kr.goal) ? kr.goal[0] : kr.goal;
                return {
                  id: String(kr.id),
                  goal_id: kr.goal_id ? String(kr.goal_id) : null,
                  name: String(kr.name ?? "KR"),
                  contribution_type: kr.contribution_type ? String(kr.contribution_type) : null,
                  start_value: toTrackedNumber(
                    kr.start_value as number | string | null | undefined,
                  ),
                  current: toTrackedNumber(kr.current as number | string | null | undefined),
                  target: toTrackedNumber(kr.target as number | string | null | undefined),
                  unit: kr.unit ? String(kr.unit) : null,
                  start_date: toTrackedDate(kr.start_date as string | null | undefined),
                  end_date: toTrackedDate(kr.end_date as string | null | undefined),
                  goal:
                    rawGoal && typeof rawGoal === "object"
                      ? {
                          id: String((rawGoal as Record<string, unknown>).id),
                          name: String((rawGoal as Record<string, unknown>).name ?? "Goal"),
                        }
                      : null,
                } satisfies TrackedKeyResultRow;
              })
              .filter((kr) =>
                overlapsReportPeriod({
                  startDate: kr.start_date,
                  endDate: kr.end_date,
                  periodStart,
                  periodEnd,
                }),
              );

            const keyResultProgressMap = buildKeyResultProgressMap(normalizedKeyResults);
            const goalProgressMap = buildGoalProgressMap(
              normalizedGoals,
              normalizedKeyResults,
              keyResultProgressMap,
            );

            const directCurrentByGoalId = normalizedKeyResults.reduce<Record<string, number>>(
              (acc, kr) => {
                if (!kr.goal_id || kr.contribution_type === "support") {
                  return acc;
                }
                acc[kr.goal_id] = (acc[kr.goal_id] ?? 0) + Number(kr.current ?? 0);
                return acc;
              },
              {},
            );

            const { data: tasksData, error: tasksError } =
              normalizedKeyResults.length > 0
                ? await supabase
                    .from("tasks")
                    .select(
                      `
                        id,
                        name,
                        key_result_id,
                        assignee_id,
                        profile_id,
                        type,
                        priority,
                        current,
                        target,
                        unit,
                        start_date,
                        end_date,
                        created_at,
                        key_result:key_results!tasks_key_result_id_fkey(
                          id,
                          goal_id,
                          name,
                          goal:goals!key_results_goal_id_fkey(id,name)
                        )
                      `,
                    )
                    .in(
                      "key_result_id",
                      normalizedKeyResults.map((kr) => kr.id),
                    )
                    .order("created_at", { ascending: false })
                : { data: [] as TrackedTaskRow[], error: null };

            if (tasksError) {
              throw new Error(tasksError.message || "Không tải được Task của Goal trong báo cáo.");
            }

            const normalizedTasks = ((tasksData ?? []) as Array<Record<string, unknown>>)
              .map((task) => {
                const rawKeyResult = Array.isArray(task.key_result)
                  ? task.key_result[0]
                  : task.key_result;
                const rawGoal =
                  rawKeyResult && typeof rawKeyResult === "object" && "goal" in rawKeyResult
                    ? Array.isArray((rawKeyResult as Record<string, unknown>).goal)
                      ? (
                          (rawKeyResult as Record<string, unknown>).goal as Array<
                            Record<string, unknown>
                          >
                        )[0]
                      : ((rawKeyResult as Record<string, unknown>).goal as Record<
                          string,
                          unknown
                        > | null)
                    : null;

                return {
                  id: String(task.id),
                  name: String(task.name ?? "Task"),
                  key_result_id: task.key_result_id ? String(task.key_result_id) : null,
                  assignee_id: task.assignee_id ? String(task.assignee_id) : null,
                  profile_id: task.profile_id ? String(task.profile_id) : null,
                  type: task.type ? String(task.type) : null,
                  priority: task.priority ? String(task.priority) : null,
                  current: toTrackedNumber(task.current as number | string | null | undefined),
                  target: toTrackedNumber(task.target as number | string | null | undefined),
                  unit: task.unit ? String(task.unit) : null,
                  start_date: toTrackedDate(task.start_date as string | null | undefined),
                  end_date: toTrackedDate(task.end_date as string | null | undefined),
                  created_at: toTrackedDate(task.created_at as string | null | undefined),
                  key_result:
                    rawKeyResult && typeof rawKeyResult === "object"
                      ? {
                          id: String((rawKeyResult as Record<string, unknown>).id),
                          goal_id: (rawKeyResult as Record<string, unknown>).goal_id
                            ? String((rawKeyResult as Record<string, unknown>).goal_id)
                            : null,
                          name: String((rawKeyResult as Record<string, unknown>).name ?? "KR"),
                          goal:
                            rawGoal && typeof rawGoal === "object"
                              ? {
                                  id: String((rawGoal as Record<string, unknown>).id),
                                  name: String((rawGoal as Record<string, unknown>).name ?? "Goal"),
                                }
                              : null,
                        }
                      : null,
                } satisfies TrackedTaskRow;
              })
              .filter((task) =>
                overlapsReportPeriod({
                  startDate: task.start_date,
                  endDate: task.end_date,
                  createdAt: task.created_at,
                  periodStart,
                  periodEnd,
                }),
              );

            nextTrackedItems = [
              ...normalizedGoals.map((goal) => ({
                id: goal.id,
                performance_report_id: reportId,
                item_type: "goal" as const,
                reference_id: goal.id,
                name: goal.name,
                target_value: goal.type === "okr" ? 100 : goal.target,
                current_value:
                  goal.type === "okr"
                    ? (goalProgressMap[goal.id] ?? 0)
                    : (directCurrentByGoalId[goal.id] ?? 0),
                unit: goal.type === "okr" ? "%" : goal.unit,
                progress_percent: goalProgressMap[goal.id] ?? 0,
                weight: null,
                score: goalProgressMap[goal.id] ?? 0,
                meta_json: {
                  href: `/goals/${goal.id}`,
                  metric_type: goal.type ?? goal.unit ?? null,
                  timeline: formatReportDateRange(goal.start_date, goal.end_date),
                },
                created_at: goal.created_at,
                updated_at: goal.created_at,
              })),
              ...normalizedKeyResults.map((kr) => ({
                id: kr.id,
                performance_report_id: reportId,
                item_type:
                  kr.contribution_type === "support"
                    ? ("support_kr" as const)
                    : ("direct_kr" as const),
                reference_id: kr.id,
                name: kr.name,
                target_value: kr.target,
                current_value: kr.current,
                unit: kr.unit,
                progress_percent: keyResultProgressMap[kr.id] ?? 0,
                weight: null,
                score: keyResultProgressMap[kr.id] ?? 0,
                meta_json: {
                  href: kr.goal_id ? `/goals/${kr.goal_id}/key-results/${kr.id}` : null,
                  metric_type: kr.unit ?? null,
                  timeline: formatReportDateRange(kr.start_date, kr.end_date),
                  goal_name: kr.goal?.name ?? null,
                },
                created_at: null,
                updated_at: null,
              })),
              ...normalizedTasks.map((task) => buildTaskItemRow(task)),
            ];
          } else {
            const [directKrResult, supportKrResult, tasksResult] = await Promise.all([
              supabase.rpc("get_profile_krs_for_period", {
                p_profile_id: profileId,
                p_period_start: periodStart,
                p_period_end: periodEnd,
                p_contribution_type: "direct",
              }),
              supabase.rpc("get_profile_krs_for_period", {
                p_profile_id: profileId,
                p_period_start: periodStart,
                p_period_end: periodEnd,
                p_contribution_type: "support",
              }),
              supabase
                .from("tasks")
                .select(
                  `
                    id,
                    name,
                    key_result_id,
                    assignee_id,
                    profile_id,
                    type,
                    priority,
                    current,
                    target,
                    unit,
                    start_date,
                    end_date,
                    created_at,
                    key_result:key_results!tasks_key_result_id_fkey(
                      id,
                      goal_id,
                      name,
                      goal:goals!key_results_goal_id_fkey(id,name)
                    )
                  `,
                )
                .or(`assignee_id.eq.${profileId},profile_id.eq.${profileId}`)
                .order("created_at", { ascending: false }),
            ]);

            if (directKrResult.error) {
              throw new Error(
                directKrResult.error.message || "Không tải được KR trực tiếp của báo cáo.",
              );
            }
            if (supportKrResult.error) {
              throw new Error(
                supportKrResult.error.message || "Không tải được KR phối hợp của báo cáo.",
              );
            }
            if (tasksResult.error) {
              throw new Error(tasksResult.error.message || "Không tải được Task của báo cáo.");
            }

            const rpcKrs = [
              ...((directKrResult.data ?? []) as ReportKrRpcRow[]),
              ...((supportKrResult.data ?? []) as ReportKrRpcRow[]),
            ];
            const krIds = [...new Set(rpcKrs.map((kr) => String(kr.id)))];

            const { data: keyResultsData, error: keyResultsError } =
              krIds.length > 0
                ? await supabase
                    .from("key_results")
                    .select(
                      `
                        id,
                        goal_id,
                        name,
                        contribution_type,
                        start_value,
                        current,
                        target,
                        unit,
                        start_date,
                        end_date,
                        goal:goals!key_results_goal_id_fkey(id,name)
                      `,
                    )
                    .in("id", krIds)
                : { data: [] as TrackedKeyResultRow[], error: null };

            if (keyResultsError) {
              throw new Error(keyResultsError.message || "Không tải được chi tiết KR của báo cáo.");
            }

            const keyResultDetailById = (
              (keyResultsData ?? []) as Array<Record<string, unknown>>
            ).reduce<Record<string, TrackedKeyResultRow>>((acc, kr) => {
              const rawGoal = Array.isArray(kr.goal) ? kr.goal[0] : kr.goal;
              acc[String(kr.id)] = {
                id: String(kr.id),
                goal_id: kr.goal_id ? String(kr.goal_id) : null,
                name: String(kr.name ?? "KR"),
                contribution_type: kr.contribution_type ? String(kr.contribution_type) : null,
                start_value: toTrackedNumber(kr.start_value as number | string | null | undefined),
                current: toTrackedNumber(kr.current as number | string | null | undefined),
                target: toTrackedNumber(kr.target as number | string | null | undefined),
                unit: kr.unit ? String(kr.unit) : null,
                start_date: toTrackedDate(kr.start_date as string | null | undefined),
                end_date: toTrackedDate(kr.end_date as string | null | undefined),
                goal:
                  rawGoal && typeof rawGoal === "object"
                    ? {
                        id: String((rawGoal as Record<string, unknown>).id),
                        name: String((rawGoal as Record<string, unknown>).name ?? "Goal"),
                      }
                    : null,
              };
              return acc;
            }, {});

            const enrichedKrs = rpcKrs.map((kr) => {
              const detail = keyResultDetailById[String(kr.id)];
              return {
                id: String(kr.id),
                goal_id: detail?.goal_id ?? null,
                name: String(kr.name ?? detail?.name ?? "KR"),
                contribution_type: kr.contribution_type,
                start_value: detail?.start_value ?? null,
                current: toTrackedNumber(kr.current),
                target: toTrackedNumber(kr.target),
                unit: kr.unit ?? detail?.unit ?? null,
                start_date: detail?.start_date ?? null,
                end_date: detail?.end_date ?? null,
                goal: detail?.goal ?? null,
              } satisfies TrackedKeyResultRow;
            });

            const keyResultProgressMap = buildKeyResultProgressMap(enrichedKrs);

            const normalizedTasks = ((tasksResult.data ?? []) as Array<Record<string, unknown>>)
              .map((task) => {
                const rawKeyResult = Array.isArray(task.key_result)
                  ? task.key_result[0]
                  : task.key_result;
                const rawGoal =
                  rawKeyResult && typeof rawKeyResult === "object" && "goal" in rawKeyResult
                    ? Array.isArray((rawKeyResult as Record<string, unknown>).goal)
                      ? (
                          (rawKeyResult as Record<string, unknown>).goal as Array<
                            Record<string, unknown>
                          >
                        )[0]
                      : ((rawKeyResult as Record<string, unknown>).goal as Record<
                          string,
                          unknown
                        > | null)
                    : null;

                return {
                  id: String(task.id),
                  name: String(task.name ?? "Task"),
                  key_result_id: task.key_result_id ? String(task.key_result_id) : null,
                  assignee_id: task.assignee_id ? String(task.assignee_id) : null,
                  profile_id: task.profile_id ? String(task.profile_id) : null,
                  type: task.type ? String(task.type) : null,
                  priority: task.priority ? String(task.priority) : null,
                  current: toTrackedNumber(task.current as number | string | null | undefined),
                  target: toTrackedNumber(task.target as number | string | null | undefined),
                  unit: task.unit ? String(task.unit) : null,
                  start_date: toTrackedDate(task.start_date as string | null | undefined),
                  end_date: toTrackedDate(task.end_date as string | null | undefined),
                  created_at: toTrackedDate(task.created_at as string | null | undefined),
                  key_result:
                    rawKeyResult && typeof rawKeyResult === "object"
                      ? {
                          id: String((rawKeyResult as Record<string, unknown>).id),
                          goal_id: (rawKeyResult as Record<string, unknown>).goal_id
                            ? String((rawKeyResult as Record<string, unknown>).goal_id)
                            : null,
                          name: String((rawKeyResult as Record<string, unknown>).name ?? "KR"),
                          goal:
                            rawGoal && typeof rawGoal === "object"
                              ? {
                                  id: String((rawGoal as Record<string, unknown>).id),
                                  name: String((rawGoal as Record<string, unknown>).name ?? "Goal"),
                                }
                              : null,
                        }
                      : null,
                } satisfies TrackedTaskRow;
              })
              .filter((task) =>
                overlapsReportPeriod({
                  startDate: task.start_date,
                  endDate: task.end_date,
                  createdAt: task.created_at,
                  periodStart,
                  periodEnd,
                }),
              );

            nextTrackedItems = [
              ...enrichedKrs.map((kr) => ({
                id: kr.id,
                performance_report_id: reportId,
                item_type:
                  kr.contribution_type === "support"
                    ? ("support_kr" as const)
                    : ("direct_kr" as const),
                reference_id: kr.id,
                name: kr.name,
                target_value: kr.target,
                current_value: kr.current,
                unit: kr.unit,
                progress_percent: keyResultProgressMap[kr.id] ?? 0,
                weight: null,
                score: keyResultProgressMap[kr.id] ?? 0,
                meta_json: {
                  href: kr.goal_id ? `/goals/${kr.goal_id}/key-results/${kr.id}` : null,
                  metric_type: kr.unit ?? null,
                  timeline: formatReportDateRange(kr.start_date, kr.end_date),
                  goal_name: kr.goal?.name ?? null,
                },
                created_at: null,
                updated_at: null,
              })),
              ...normalizedTasks.map((task) => buildTaskItemRow(task)),
            ];
          }
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
            nextProfileNameById[String(profile.id)] =
              profile.name?.trim() || profile.email?.trim() || "Không rõ";
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
        setReportMetricKind(metricKind);
        setItems(
          (itemData ?? []).map((item) =>
            normalizePerformanceReportItemRow(item as Record<string, unknown>),
          ),
        );
        setTrackedItems(nextTrackedItems);
        setSelfCommentDraft(normalizedReport.self_comment ?? "");
        setManagerCommentDraft(normalizedReport.manager_comment ?? "");
        setManagerStatusDraft(normalizedReport.status);
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Không tải được báo cáo.");
        setReport(null);
        setReportMetricKind("kr");
        setItems([]);
        setTrackedItems([]);
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
    access.roles,
    reportId,
  ]);

  const groupedItems = useMemo(() => {
    const sourceItems = trackedItems.length > 0 ? trackedItems : items;
    const initial = {
      goal: [] as PerformanceReportItemRow[],
      direct_kr: [] as PerformanceReportItemRow[],
      support_kr: [] as PerformanceReportItemRow[],
      execution: [] as PerformanceReportItemRow[],
    };

    sourceItems.forEach((item) => {
      initial[item.item_type].push(item);
    });

    return {
      goal: [...initial.goal].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
      direct_kr: [...initial.direct_kr].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
      support_kr: [...initial.support_kr].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
      execution: [...initial.execution].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    };
  }, [items, trackedItems]);

  const visibleItemGroups = useMemo(() => {
    const groups: Array<{
      itemType: "goal" | "direct_kr" | "support_kr" | "execution";
      items: PerformanceReportItemRow[];
    }> = [];

    if (groupedItems.goal.length > 0) {
      groups.push({ itemType: "goal", items: groupedItems.goal });
    }
    if (groupedItems.direct_kr.length > 0) {
      groups.push({ itemType: "direct_kr", items: groupedItems.direct_kr });
    }
    if (groupedItems.support_kr.length > 0) {
      groups.push({ itemType: "support_kr", items: groupedItems.support_kr });
    }
    if (groupedItems.execution.length > 0) {
      groups.push({ itemType: "execution", items: groupedItems.execution });
    }

    return groups;
  }, [groupedItems]);

  const isOwner = report?.profile_id === access.profileId;
  const canEditSelf = Boolean(report && isOwner && canOwnerEditReport(report.status));
  const canReview = Boolean(
    report &&
    scopeDirectory &&
    !isOwner &&
    (scopeDirectory.roleScope === "director" ||
      (report.profile_id
        ? scopeDirectory.accessibleProfileIds.includes(report.profile_id)
        : false)),
  );
  const locked = isReportLocked(report?.status);
  const goalProgressText =
    reportMetricKind === "goal"
      ? formatReportProgressValue(report?.business_score)
      : "Không áp dụng";
  const krProgressText =
    reportMetricKind === "kr" ? formatReportProgressValue(report?.business_score) : "Không áp dụng";

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
        "id,profile_id,department_id,period_type,period_key,period_start,period_end,overall_score,business_score,support_score,execution_score,goal_count,direct_kr_count,support_kr_count,task_count,completed_task_count,total_task_points,completed_task_points,overdue_task_count,self_comment,manager_comment,status,created_by,reviewed_by,created_at,updated_at",
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
    setNotice(nextStatus === "pending" ? "Đã gửi báo cáo để quản lý xem xét." : "Đã lưu bản nháp.");
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
        "id,profile_id,department_id,period_type,period_key,period_start,period_end,overall_score,business_score,support_score,execution_score,goal_count,direct_kr_count,support_kr_count,task_count,completed_task_count,total_task_points,completed_task_points,overdue_task_count,self_comment,manager_comment,status,created_by,reviewed_by,created_at,updated_at",
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
    setNotice(
      nextReport.status === "locked" ? "Báo cáo đã được khóa." : "Đã cập nhật nội dung duyệt.",
    );
    setIsSavingReview(false);
  };

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="reports" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader
            title="Chi tiết báo cáo hiệu suất"
            items={[
              { label: "Báo cáo hiệu suất", href: "/reports" },
              { label: "Chi tiết báo cáo" },
            ]}
          />

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
                  employeeName={
                    report.profile_id
                      ? (profileNameById[report.profile_id] ?? report.profile_id)
                      : "Chưa gán"
                  }
                  departmentName={
                    report.department_id
                      ? (departmentNameById[report.department_id] ?? report.department_id)
                      : "Không gắn phòng ban"
                  }
                  periodStart={report.period_start}
                  periodEnd={report.period_end}
                  status={report.status}
                  goalProgressText={goalProgressText}
                  krProgressText={krProgressText}
                  taskCompletionText={formatReportTaskCompletionText(
                    report.completed_task_count,
                    report.task_count,
                  )}
                  taskPointText={formatReportTaskPointText(
                    report.completed_task_points,
                    report.total_task_points,
                  )}
                />

                <section className="hidden grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                  <CompactMetricCard label="Mục tiêu" value={report.goal_count} />
                  <CompactMetricCard label="KR trực tiếp" value={report.direct_kr_count} />
                  <CompactMetricCard label="KR phối hợp" value={report.support_kr_count} />
                  <CompactMetricCard label="Công việc" value={report.task_count} />
                  <CompactMetricCard label="Đã hoàn thành" value={report.completed_task_count} />
                  <CompactMetricCard label="Quá hạn" value={report.overdue_task_count} />
                </section>

                <section className="hidden rounded-2xl border border-slate-200 bg-white">
                  <SectionTitle
                    title="Nhận xét và duyệt báo cáo"
                    description="Nhận xét tự đánh giá dành cho nhân viên. Nhận xét của quản lý và trạng thái dùng cho bước duyệt báo cáo."
                    action={<ReportStatusBadge status={report.status} />}
                  />

                  <div className="grid gap-5 px-5 py-5 xl:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">
                            Nhận xét tự đánh giá
                          </h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {canEditSelf
                              ? "Nhân viên có thể cập nhật phần này khi báo cáo còn ở trạng thái nháp hoặc đã gửi."
                              : "Phần nhận xét tự đánh giá hiện chỉ có thể xem."}
                          </p>
                        </div>
                        <span className="text-xs text-slate-500">
                          Cập nhật lần cuối {formatDateTime(report.updated_at)}
                        </span>
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
                            {getOwnerStatusChoices(report.status).includes("pending") ? (
                              <Button
                                onClick={() => void handleSaveSelf("pending")}
                                disabled={isSavingSelf}
                              >
                                {isSavingSelf
                                  ? "Đang gửi..."
                                  : report.status === "pending"
                                    ? "Cập nhật nhận xét"
                                    : "Gửi báo cáo"}
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
                          <h3 className="text-lg font-semibold text-slate-900">
                            Phần duyệt của quản lý
                          </h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {canReview && !locked
                              ? "Quản lý có thể thêm nhận xét và cập nhật trạng thái duyệt của báo cáo."
                              : "Phần duyệt của quản lý hiện chỉ có thể xem hoặc chưa khả dụng."}
                          </p>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <p>Tạo lúc {formatDateTime(report.created_at)}</p>
                          <p>
                            Người duyệt{" "}
                            {report.reviewed_by
                              ? (profileNameById[report.reviewed_by] ?? report.reviewed_by)
                              : "Chưa có"}
                          </p>
                        </div>
                      </div>

                      {canReview && !locked ? (
                        <>
                          <div className="mt-4">
                            <label className="mb-2 block text-sm font-semibold text-slate-800">
                              Trạng thái
                            </label>
                            <Select
                              value={managerStatusDraft}
                              onValueChange={setManagerStatusDraft}
                            >
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
                            <Button
                              onClick={() => void handleSaveReview()}
                              disabled={isSavingReview}
                            >
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
                  <div className="space-y-5 px-5 py-5">
                    {visibleItemGroups.length > 0 ? (
                      visibleItemGroups.map((group) => (
                        <ReportItemGroup
                          key={group.itemType}
                          itemType={group.itemType}
                          items={group.items}
                        />
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-700">
                        Không có Goal, KR hoặc Task nào được theo dõi trong khoảng thời gian của báo
                        cáo này.
                      </div>
                    )}
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
