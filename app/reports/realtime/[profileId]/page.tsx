"use client";

import Link from "next/link";
import { endOfWeek, format, startOfWeek } from "date-fns";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BlockState, SectionTitle } from "@/app/reports/_components/reporting-ui";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  type PerformanceReportItemRow,
  type PerformanceReportMetricKind,
  type PerformanceReportRoleMembershipRow,
  type ReportingScopeDirectory,
  buildGoalReportProfileIds,
  formatReportDateRange,
  formatReportItemTypeLabel,
  formatReportNumericValue,
  formatReportProgressValue,
  formatReportTaskCompletionText,
  formatReportTaskPointText,
  getPerformanceReportMetricKind,
  loadReportingScopeDirectory,
} from "@/lib/performance-reports";
import { buildGoalProgressMap, buildKeyResultProgressMap, computeMetricProgress } from "@/lib/okr";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";

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
  weight: number | null;
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

const overlapsPeriod = ({
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
  performance_report_id: "realtime-tracked-task",
  item_type: "execution",
  reference_id: task.id,
  name: task.name,
  target_value: toTrackedNumber(task.target),
  current_value: toTrackedNumber(task.current) ?? 0,
  unit: task.unit,
  progress_percent: computeMetricProgress(task.current, 0, task.target),
  weight: toTrackedNumber(task.weight),
  score: computeMetricProgress(task.current, 0, task.target),
  meta_json: {
    href: `/tasks/${task.id}`,
    timeline: formatReportDateRange(task.start_date, task.end_date),
    metric_type: task.type ?? task.unit ?? null,
    priority: task.priority,
    task_type: task.type,
    assignee_id: task.assignee_id,
    profile_id: task.profile_id,
    key_result_name: task.key_result?.name ?? null,
    goal_name: task.key_result?.goal?.name ?? null,
  },
  created_at: task.created_at,
  updated_at: task.created_at,
});

const getItemMetaText = (item: PerformanceReportItemRow, key: string) =>
  item.meta_json && typeof item.meta_json[key] === "string" ? item.meta_json[key] : null;

const normalizeMetricToken = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");

const isRevenueMetricToken = (token: string) =>
  token.includes("doanh thu") || token.includes("revenue");

const isQuantityMetricToken = (token: string) =>
  token.includes("so luong") || token.includes("quantity") || token.includes("count") || token === "sl";

const resolveItemDisplayConfig = (item: PerformanceReportItemRow) => {
  const metricTypeFromMeta = getItemMetaText(item, "metric_type");
  const taskTypeFromMeta = getItemMetaText(item, "task_type");
  const normalizedTokens = [metricTypeFromMeta, taskTypeFromMeta, item.unit]
    .map((value) => normalizeMetricToken(value))
    .filter(Boolean);

  const isRevenue = normalizedTokens.some(isRevenueMetricToken);
  const isQuantity = normalizedTokens.some(isQuantityMetricToken);
  const unit = isRevenue ? "đ" : isQuantity ? "" : item.unit;

  return {
    unit: unit ?? "",
    showPercent: isRevenue,
  };
};

const formatPriorityText = (value: string | null) => {
  const token = (value ?? "").trim().toLowerCase();
  if (!token) {
    return "--";
  }
  if (token === "critical" || token === "urgent") {
    return "Khẩn cấp";
  }
  if (token === "high") {
    return "Cao";
  }
  if (token === "medium" || token === "normal") {
    return "Trung bình";
  }
  if (token === "low") {
    return "Thấp";
  }
  return value ?? "--";
};

const formatCurrentTargetText = (item: PerformanceReportItemRow) => {
  const { unit } = resolveItemDisplayConfig(item);
  return `${formatReportNumericValue(item.current_value, unit)} / ${formatReportNumericValue(item.target_value, unit)}`;
};

export default function RealtimeReportDetailPage() {
  const params = useParams<{ profileId: string }>();
  const access = useWorkspaceAccess();
  const profileId = params.profileId ? String(params.profileId) : "";

  const [scopeDirectory, setScopeDirectory] = useState<ReportingScopeDirectory | null>(null);
  const [profileName, setProfileName] = useState<string>("Nhân sự");
  const [departmentLabel, setDepartmentLabel] = useState<string>("Chưa thuộc phòng ban");
  const [metricKind, setMetricKind] = useState<PerformanceReportMetricKind>("kr");
  const [trackedItems, setTrackedItems] = useState<PerformanceReportItemRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentWeekRange = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    return {
      start: format(weekStart, "yyyy-MM-dd"),
      end: format(weekEnd, "yyyy-MM-dd"),
      label: formatReportDateRange(format(weekStart, "yyyy-MM-dd"), format(weekEnd, "yyyy-MM-dd")),
    };
  }, []);

  useEffect(() => {
    if (access.isLoading || !access.isLoaded || !profileId) {
      return;
    }

    const canViewRealtime = access.hasDirectorRole || access.hasRootLeaderAccess;
    if (!canViewRealtime) {
      setError("Bạn không có quyền truy cập màn hình quản lý hiệu suất realtime.");
      setIsLoading(false);
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

        const canViewProfile =
          directory.roleScope === "director" ||
          directory.accessibleProfileIds.includes(profileId);

        if (!canViewProfile) {
          throw new Error("Bạn không có quyền xem chi tiết nhân sự này.");
        }

        const reportRoleResult = await supabase
          .from("user_role_in_department")
          .select("profile_id,department_id,role_id")
          .eq("profile_id", profileId);

        if (reportRoleResult.error) {
          throw new Error(reportRoleResult.error.message || "Không tải được vai trò của nhân sự.");
        }

        const computedMetricKind = getPerformanceReportMetricKind(
          profileId,
          buildGoalReportProfileIds({
            roles: access.roles,
            departments: access.departments,
            memberships: ((reportRoleResult.data ?? []) as PerformanceReportRoleMembershipRow[]).map(
              (item) => ({
                profile_id: item.profile_id ? String(item.profile_id) : null,
                department_id: item.department_id ? String(item.department_id) : null,
                role_id: item.role_id ? String(item.role_id) : null,
              }),
            ),
          }),
        );

        let nextTrackedItems: PerformanceReportItemRow[] = [];

        if (computedMetricKind === "goal") {
          const goalOwnerResult = await supabase
            .from("goal_owners")
            .select("goal_id")
            .eq("profile_id", profileId);

          if (goalOwnerResult.error) {
            throw new Error(goalOwnerResult.error.message || "Không tải được danh sách Goal.");
          }

          const goalIds = [
            ...new Set(
              (goalOwnerResult.data ?? [])
                .map((row) => ("goal_id" in row && row.goal_id ? String(row.goal_id) : null))
                .filter((value): value is string => Boolean(value)),
            ),
          ];

          const goalsResult =
            goalIds.length > 0
              ? await supabase
                  .from("goals")
                  .select("id,name,type,target,unit,start_date,end_date,created_at")
                  .in("id", goalIds)
              : { data: [] as TrackedGoalRow[], error: null };

          if (goalsResult.error) {
            throw new Error(goalsResult.error.message || "Không tải được Goal.");
          }

          const trackedGoals = ((goalsResult.data ?? []) as Array<Record<string, unknown>>)
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
              overlapsPeriod({
                startDate: goal.start_date,
                endDate: goal.end_date,
                createdAt: goal.created_at,
                periodStart: currentWeekRange.start,
                periodEnd: currentWeekRange.end,
              }),
            );

          const keyResultsResult =
            trackedGoals.length > 0
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
                    trackedGoals.map((goal) => goal.id),
                  )
              : { data: [] as TrackedKeyResultRow[], error: null };

          if (keyResultsResult.error) {
            throw new Error(keyResultsResult.error.message || "Không tải được KR.");
          }

          const trackedKeyResults = ((keyResultsResult.data ?? []) as Array<Record<string, unknown>>)
            .map((kr) => {
              const rawGoal = Array.isArray(kr.goal) ? kr.goal[0] : kr.goal;
              return {
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
              } satisfies TrackedKeyResultRow;
            })
            .filter((kr) =>
              overlapsPeriod({
                startDate: kr.start_date,
                endDate: kr.end_date,
                periodStart: currentWeekRange.start,
                periodEnd: currentWeekRange.end,
              }),
            );

          const keyResultProgressMap = buildKeyResultProgressMap(trackedKeyResults);
          const goalProgressMap = buildGoalProgressMap(
            trackedGoals,
            trackedKeyResults,
            keyResultProgressMap,
          );

          const directCurrentByGoalId = trackedKeyResults.reduce<Record<string, number>>(
            (acc, kr) => {
              if (!kr.goal_id || kr.contribution_type === "support") {
                return acc;
              }
              acc[kr.goal_id] = (acc[kr.goal_id] ?? 0) + Number(kr.current ?? 0);
              return acc;
            },
            {},
          );

          const tasksResult =
            trackedKeyResults.length > 0
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
                      weight,
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
                    trackedKeyResults.map((kr) => kr.id),
                  )
                  .order("created_at", { ascending: false })
              : { data: [] as TrackedTaskRow[], error: null };

          if (tasksResult.error) {
            throw new Error(tasksResult.error.message || "Không tải được Task.");
          }

          const trackedTasks = ((tasksResult.data ?? []) as Array<Record<string, unknown>>)
            .map((task) => {
              const rawKeyResult = Array.isArray(task.key_result) ? task.key_result[0] : task.key_result;
              const rawGoal =
                rawKeyResult && typeof rawKeyResult === "object" && "goal" in rawKeyResult
                  ? Array.isArray((rawKeyResult as Record<string, unknown>).goal)
                    ? ((rawKeyResult as Record<string, unknown>).goal as Array<Record<string, unknown>>)[0]
                    : ((rawKeyResult as Record<string, unknown>).goal as Record<string, unknown> | null)
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
                weight: toTrackedNumber(task.weight as number | string | null | undefined),
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
              overlapsPeriod({
                startDate: task.start_date,
                endDate: task.end_date,
                createdAt: task.created_at,
                periodStart: currentWeekRange.start,
                periodEnd: currentWeekRange.end,
              }),
            );

          nextTrackedItems = [
            ...trackedGoals.map((goal) => ({
              id: goal.id,
              performance_report_id: "realtime",
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
            ...trackedKeyResults.map((kr) => ({
              id: kr.id,
              performance_report_id: "realtime",
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
            ...trackedTasks.map((task) => buildTaskItemRow(task)),
          ];
        } else {
          const [directKrResult, supportKrResult, tasksResult] = await Promise.all([
            supabase.rpc("get_profile_krs_for_period", {
              p_profile_id: profileId,
              p_period_start: currentWeekRange.start,
              p_period_end: currentWeekRange.end,
              p_contribution_type: "direct",
            }),
            supabase.rpc("get_profile_krs_for_period", {
              p_profile_id: profileId,
              p_period_start: currentWeekRange.start,
              p_period_end: currentWeekRange.end,
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
                  weight,
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
            throw new Error(directKrResult.error.message || "Không tải được KR trực tiếp.");
          }
          if (supportKrResult.error) {
            throw new Error(supportKrResult.error.message || "Không tải được KR phối hợp.");
          }
          if (tasksResult.error) {
            throw new Error(tasksResult.error.message || "Không tải được Task.");
          }

          const rpcKrs = [
            ...((directKrResult.data ?? []) as ReportKrRpcRow[]),
            ...((supportKrResult.data ?? []) as ReportKrRpcRow[]),
          ];
          const krIds = [...new Set(rpcKrs.map((kr) => String(kr.id)))];

          const keyResultsResult =
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

          if (keyResultsResult.error) {
            throw new Error(keyResultsResult.error.message || "Không tải được chi tiết KR.");
          }

          const keyResultDetailById = ((keyResultsResult.data ?? []) as Array<Record<string, unknown>>).reduce<
            Record<string, TrackedKeyResultRow>
          >((acc, kr) => {
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

          const trackedTasks = ((tasksResult.data ?? []) as Array<Record<string, unknown>>)
            .map((task) => {
              const rawKeyResult = Array.isArray(task.key_result) ? task.key_result[0] : task.key_result;
              const rawGoal =
                rawKeyResult && typeof rawKeyResult === "object" && "goal" in rawKeyResult
                  ? Array.isArray((rawKeyResult as Record<string, unknown>).goal)
                    ? ((rawKeyResult as Record<string, unknown>).goal as Array<Record<string, unknown>>)[0]
                    : ((rawKeyResult as Record<string, unknown>).goal as Record<string, unknown> | null)
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
                weight: toTrackedNumber(task.weight as number | string | null | undefined),
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
              overlapsPeriod({
                startDate: task.start_date,
                endDate: task.end_date,
                createdAt: task.created_at,
                periodStart: currentWeekRange.start,
                periodEnd: currentWeekRange.end,
              }),
            );

          nextTrackedItems = [
            ...enrichedKrs.map((kr) => ({
              id: kr.id,
              performance_report_id: "realtime",
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
            ...trackedTasks.map((task) => buildTaskItemRow(task)),
          ];
        }

        if (!isActive) {
          return;
        }

        const nextProfileName =
          directory.profileNameById[profileId] ??
          directory.profileOptions.find((item) => item.id === profileId)?.name ??
          profileId;
        const departmentIds = directory.membershipsByProfileId[profileId] ?? [];
        const departmentNames = [
          ...new Set(
            departmentIds
              .map((departmentId) => directory.departmentNameById[departmentId] ?? null)
              .filter((value): value is string => Boolean(value)),
          ),
        ];

        setScopeDirectory(directory);
        setProfileName(nextProfileName);
        setDepartmentLabel(departmentNames.join(", ") || "Chưa thuộc phòng ban");
        setMetricKind(computedMetricKind);
        setTrackedItems(nextTrackedItems);
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Không tải được chi tiết realtime.");
        setScopeDirectory(null);
        setTrackedItems([]);
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
    access.hasRootLeaderAccess,
    access.isLoaded,
    access.isLoading,
    access.managedDepartments,
    access.memberships,
    access.profileId,
    access.profileName,
    access.roles,
    currentWeekRange.end,
    currentWeekRange.start,
    profileId,
  ]);

  const groupedItems = useMemo(() => {
    const initial = {
      goal: [] as PerformanceReportItemRow[],
      direct_kr: [] as PerformanceReportItemRow[],
      support_kr: [] as PerformanceReportItemRow[],
      execution: [] as PerformanceReportItemRow[],
    };

    trackedItems.forEach((item) => {
      initial[item.item_type].push(item);
    });

    return {
      goal: [...initial.goal].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
      direct_kr: [...initial.direct_kr].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
      support_kr: [...initial.support_kr].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
      execution: [...initial.execution].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    };
  }, [trackedItems]);

  const weeklyAssignedTasks = useMemo(() => {
    return groupedItems.execution.filter((task) => {
      const assigneeId = getItemMetaText(task, "assignee_id");
      const ownerProfileId = getItemMetaText(task, "profile_id");
      if (assigneeId) {
        return assigneeId === profileId;
      }
      if (ownerProfileId) {
        return ownerProfileId === profileId;
      }
      return true;
    });
  }, [groupedItems.execution, profileId]);

  const weeklyObjectiveItems = useMemo(() => {
    if (metricKind === "goal") {
      return [...groupedItems.goal, ...groupedItems.direct_kr, ...groupedItems.support_kr];
    }
    return [...groupedItems.direct_kr, ...groupedItems.support_kr];
  }, [groupedItems.direct_kr, groupedItems.goal, groupedItems.support_kr, metricKind]);

  const goalProgressText =
    metricKind === "goal"
      ? formatReportProgressValue(
          groupedItems.goal.length > 0
            ? groupedItems.goal.reduce((sum, item) => sum + Number(item.progress_percent ?? 0), 0) /
                groupedItems.goal.length
            : null,
        )
      : "Không áp dụng";
  const krProgressText =
    metricKind === "kr"
      ? formatReportProgressValue(
          weeklyObjectiveItems.length > 0
            ? weeklyObjectiveItems.reduce((sum, item) => sum + Number(item.progress_percent ?? 0), 0) /
                weeklyObjectiveItems.length
            : null,
        )
      : "Không áp dụng";
  const completedTaskCount = weeklyAssignedTasks.filter((item) => Number(item.score ?? 0) >= 100).length;
  const totalTaskPoints = weeklyAssignedTasks.reduce((sum, item) => sum + Number(item.weight ?? 0), 0);
  const completedTaskPoints = weeklyAssignedTasks
    .filter((item) => Number(item.score ?? 0) >= 100)
    .reduce((sum, item) => sum + Number(item.weight ?? 0), 0);

  void scopeDirectory;

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="realtimeReports" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader
            title={profileName ? `Realtime - ${profileName}` : "Chi tiết quản lý hiệu suất realtime"}
            items={[
              { label: "Quản lý hiệu suất", href: "/reports/realtime" },
              { label: profileName || "Chi tiết realtime" },
            ]}
          />

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-7">
            {isLoading || error ? (
              <section className="rounded-2xl border border-slate-200 bg-white">
                <BlockState
                  loading={isLoading}
                  error={error}
                  empty={false}
                  emptyText="Không có dữ liệu."
                />
              </section>
            ) : (
              <div className="space-y-6">
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Nhân sự</p>
                      <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em] text-slate-950">
                        {profileName}
                      </h1>
                      <p className="mt-2 text-sm text-slate-700">{departmentLabel}</p>
                      <p className="mt-1 text-sm text-slate-700">{currentWeekRange.label}</p>
                    </div>
                    <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                      Realtime tuần hiện tại
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-4">
                    <article className="rounded-2xl border border-slate-200 bg-white p-5">
                      <p className="text-sm font-semibold text-slate-900">Tiến độ Goal trung bình</p>
                      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                        {goalProgressText}
                      </p>
                    </article>
                    <article className="rounded-2xl border border-slate-200 bg-white p-5">
                      <p className="text-sm font-semibold text-slate-900">Tiến độ KR trung bình</p>
                      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                        {krProgressText}
                      </p>
                    </article>
                    <article className="rounded-2xl border border-slate-200 bg-white p-5">
                      <p className="text-sm font-semibold text-slate-900">Task hoàn thành</p>
                      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                        {formatReportTaskCompletionText(completedTaskCount, weeklyAssignedTasks.length)}
                      </p>
                    </article>
                    <article className="rounded-2xl border border-slate-200 bg-white p-5">
                      <p className="text-sm font-semibold text-slate-900">Điểm task</p>
                      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                        {formatReportTaskPointText(completedTaskPoints, totalTaskPoints)}
                      </p>
                    </article>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white">
                  <SectionTitle
                    title="Task được giao trong tuần"
                    description="Danh sách task được giao trong khoảng thời gian tuần hiện tại."
                  />

                  <div className="px-5 py-5">
                    {weeklyAssignedTasks.length > 0 ? (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full min-w-[760px] text-left">
                          <thead>
                            <tr className="bg-slate-50 text-xs tracking-[0.08em] text-slate-500 uppercase">
                              <th className="px-4 py-3 font-semibold">Task</th>
                              <th className="px-4 py-3 font-semibold">KR</th>
                              <th className="px-4 py-3 font-semibold">Goal</th>
                              <th className="px-4 py-3 font-semibold">Tiến độ</th>
                              <th className="px-4 py-3 font-semibold">Ưu tiên</th>
                              <th className="px-4 py-3 font-semibold">Timeline</th>
                            </tr>
                          </thead>
                          <tbody>
                            {weeklyAssignedTasks.map((task) => {
                              const href = getItemMetaText(task, "href");
                              const keyResultName = getItemMetaText(task, "key_result_name");
                              const goalName = getItemMetaText(task, "goal_name");
                              const priority = formatPriorityText(getItemMetaText(task, "priority"));
                              const timeline = getItemMetaText(task, "timeline") ?? "--";
                              const { showPercent } = resolveItemDisplayConfig(task);

                              return (
                                <tr key={task.id} className="border-t border-slate-100 align-top">
                                  <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                                    {href ? (
                                      <Link href={href} className="transition hover:text-blue-700">
                                        {task.name}
                                      </Link>
                                    ) : (
                                      task.name
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-700">
                                    {keyResultName ?? "--"}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-700">
                                    {goalName ?? "--"}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-700">
                                    {showPercent ? (
                                      <>
                                        <p className="font-semibold text-slate-900">
                                          {formatReportProgressValue(task.progress_percent, "Chưa có")}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-600">
                                          {formatCurrentTargetText(task)}
                                        </p>
                                      </>
                                    ) : (
                                      <p className="font-semibold text-slate-900">
                                        {formatCurrentTargetText(task)}
                                      </p>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-700">{priority}</td>
                                  <td className="px-4 py-3 text-sm text-slate-700">{timeline}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-700">
                        Không có task được giao trong tuần hiện tại.
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white">
                  <SectionTitle
                    title={metricKind === "goal" ? "KR và Goal trong tuần" : "KR trong tuần"}
                    description={
                      metricKind === "goal"
                        ? "Vai trò quản lý/ban giám đốc theo dõi cả Goal và KR."
                        : "Vai trò thành viên theo dõi KR."
                    }
                  />

                  <div className="px-5 py-5">
                    {weeklyObjectiveItems.length > 0 ? (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full min-w-[680px] text-left">
                          <thead>
                            <tr className="bg-slate-50 text-xs tracking-[0.08em] text-slate-500 uppercase">
                              <th className="px-4 py-3 font-semibold">Loại</th>
                              <th className="px-4 py-3 font-semibold">Tên</th>
                              <th className="px-4 py-3 font-semibold">Goal liên quan</th>
                              <th className="px-4 py-3 font-semibold">Tiến độ</th>
                              <th className="px-4 py-3 font-semibold">Timeline</th>
                            </tr>
                          </thead>
                          <tbody>
                            {weeklyObjectiveItems.map((item) => {
                              const href = getItemMetaText(item, "href");
                              const goalName = getItemMetaText(item, "goal_name");
                              const timeline = getItemMetaText(item, "timeline") ?? "--";
                              const { showPercent } = resolveItemDisplayConfig(item);

                              return (
                                <tr key={`${item.item_type}-${item.id}`} className="border-t border-slate-100 align-top">
                                  <td className="px-4 py-3 text-sm text-slate-700">
                                    {formatReportItemTypeLabel(item.item_type)}
                                  </td>
                                  <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                                    {href ? (
                                      <Link href={href} className="transition hover:text-blue-700">
                                        {item.name}
                                      </Link>
                                    ) : (
                                      item.name
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-700">
                                    {item.item_type === "goal" ? item.name : (goalName ?? "--")}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-700">
                                    {showPercent ? (
                                      <>
                                        <p className="font-semibold text-slate-900">
                                          {formatReportProgressValue(item.progress_percent, "Chưa có")}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-600">
                                          {formatCurrentTargetText(item)}
                                        </p>
                                      </>
                                    ) : (
                                      <p className="font-semibold text-slate-900">
                                        {formatCurrentTargetText(item)}
                                      </p>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-700">{timeline}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-700">
                        Không có KR hoặc Goal nào trong tuần hiện tại.
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
