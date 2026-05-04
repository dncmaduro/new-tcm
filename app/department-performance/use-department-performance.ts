"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatGoalOwnersSummary,
  getGoalOwnerSearchText,
  loadGoalOwnersByGoalIds,
  type GoalOwnerProfile,
} from "@/lib/goal-owners";
import { computeWeightedProgress, buildGoalProgressMap, buildKeyResultProgressMap } from "@/lib/okr";
import { formatGoalTypeLabel, normalizeGoalTypeValue } from "@/lib/constants/goals";
import {
  formatKeyResultContributionTypeLabel,
  formatKeyResultMetric,
  formatKeyResultTypeLabel,
  formatMetricValue,
  getSupportAllocationFieldLabel,
  normalizeKeyResultContributionTypeValue,
  normalizeKeyResultTypeValue,
  usesPercentSupportAllocation,
} from "@/lib/constants/key-results";
import { supabase } from "@/lib/supabase";

type GoalRow = {
  id: string;
  name: string;
  type: string | null;
  department_id: string | null;
  status: string | null;
  quarter: number | null;
  year: number | null;
  target: number | null;
  unit: string | null;
  start_date: string | null;
  end_date: string | null;
};

type GoalDepartmentRow = {
  goal_id: string | null;
  department_id: string | null;
};

type KeyResultRow = {
  id: string;
  goal_id: string | null;
  name: string;
  type: string | null;
  contribution_type: string | null;
  start_value: number | null;
  current: number | null;
  target: number | null;
  unit: string | null;
  weight: number | null;
  responsible_department_id: string | null;
  start_date: string | null;
  end_date: string | null;
};

type KeyResultGoalRefRow = {
  id: string;
  goal_id: string | null;
};

type SupportLinkRow = {
  id: string;
  support_key_result_id: string | null;
  target_key_result_id: string | null;
  allocated_value: number | null;
  allocated_percent: number | null;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ActivityLogRow = {
  id: string;
  entity_id: string | null;
  entity_type: string | null;
  profile_id: string | null;
  action: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string | null;
};

type TaskRow = {
  id: string;
  name: string;
  key_result_id: string | null;
  assignee_id: string | null;
  profile_id: string | null;
  start_date: string | null;
  end_date: string | null;
  type: string | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type RoleRow = {
  id: string;
  name: string | null;
};

type UserRoleRow = {
  profile_id: string | null;
  role_id: string | null;
  department_id: string | null;
};

type DepartmentRow = {
  id: string;
  name: string;
};

type FilterParams = {
  departmentId: string | null;
  quarter: string;
  year: string;
  goalStatus: string;
  ownerId: string;
  goalType: string;
  keyResultType: string;
  keyResultContributionType: string;
  memberId: string;
  search: string;
};

type RawData = {
  departmentName: string;
  primaryGoalIds: string[];
  primaryKeyResultIds: string[];
  goals: GoalRow[];
  goalOwnersByGoalId: Record<string, GoalOwnerProfile[]>;
  goalLogsByGoalId: Record<string, ActivityLogRow[]>;
  keyResults: KeyResultRow[];
  supportLinks: SupportLinkRow[];
  tasks: TaskRow[];
  departmentNamesById: Record<string, string>;
  profilesById: Record<string, string>;
  memberRolesById: Record<string, string>;
  memberIds: string[];
};

export type DepartmentPerformanceHealth = "on_track" | "at_risk" | "off_track" | "achieved";

export type DepartmentGoalPerformanceItem = {
  id: string;
  name: string;
  type: string | null;
  typeLabel: string;
  owners: GoalOwnerProfile[];
  ownersSummary: string;
  status: string;
  progress: number;
  health: DepartmentPerformanceHealth;
  target: number | null;
  unit: string | null;
  currentValue: number | null;
  currentUnit: string | null;
  metricSummary: string;
  startDate: string | null;
  endDate: string | null;
  daysRemaining: number | null;
  expectedProgress: number | null;
  scheduleGap: number | null;
  recentProgressChange: number | null;
  velocityPerWeek: number | null;
  requiredPerWeek: number | null;
  lastActivityAt: string | null;
  inactivityDays: number | null;
  trendPoints: Array<{
    id: string;
    label: string;
    progress: number;
    createdAt: string | null;
  }>;
  actionText: string;
  directKrCount: number;
  supportKrCount: number;
  directKrRiskCount: number;
  supportKrRiskCount: number;
  riskNote: string;
};

export type DepartmentDirectKeyResultItem = {
  id: string;
  goalId: string | null;
  goalName: string;
  name: string;
  type: string | null;
  typeLabel: string;
  contributionTypeLabel: string;
  target: number | null;
  current: number | null;
  unit: string | null;
  progress: number;
  expectedProgress: number | null;
  scheduleGap: number | null;
  requiredPerWeek: number | null;
  paceLabel: string;
  paceNote: string;
  health: DepartmentPerformanceHealth;
  responsibleDepartmentName: string;
  startDate: string | null;
  endDate: string | null;
  daysRemaining: number | null;
  supportPreview: Array<{
    id: string;
    name: string;
    goalName: string;
  }>;
  supportCount: number;
  riskNote: string;
};

export type DepartmentSupportKeyResultItem = {
  id: string;
  goalId: string | null;
  goalName: string;
  name: string;
  type: string | null;
  typeLabel: string;
  contributionTypeLabel: string;
  target: number | null;
  current: number | null;
  unit: string | null;
  progress: number;
  expectedProgress: number | null;
  scheduleGap: number | null;
  requiredPerWeek: number | null;
  paceLabel: string;
  paceNote: string;
  health: DepartmentPerformanceHealth;
  responsibleDepartmentName: string;
  startDate: string | null;
  endDate: string | null;
  daysRemaining: number | null;
  allocationModeLabel: string;
  supportedDirectKeyResults: Array<{
    id: string;
    name: string;
    goalName: string;
    allocationLabel: string;
  }>;
  riskNote: string;
};

export type DepartmentRiskDeadlineItem = {
  id: string;
  entityType: "goal" | "key_result";
  name: string;
  parentName: string;
  endDate: string;
  progress: number;
  health: DepartmentPerformanceHealth;
  daysRemaining: number | null;
  reason: string;
};

export type DepartmentMemberContributionItem = {
  id: string;
  name: string;
  roleName: string;
  goalsInvolved: number;
  keyResultsInvolved: number;
  performanceScore: number | null;
  overdueTasks: number;
  blockedTasks: number;
  status: "strong" | "watching" | "bottleneck";
  signalText: string;
};

export type DepartmentExecutionContextItem = {
  keyResultId: string;
  keyResultName: string;
  goalName: string;
  overdueTasks: number;
  blockedTasks: number;
  openTasks: number;
  completionRate: number;
};

export type DepartmentTrendPoint = {
  key: string;
  label: string;
  overallPerformance: number | null;
  businessPerformance: number | null;
  supportPerformance: number | null;
  goalCount: number;
  directKrCount: number;
  supportKrCount: number;
};

export type DepartmentGoalChartItem = {
  id: string;
  name: string;
  progress: number;
  health: DepartmentPerformanceHealth;
  typeLabel: string;
  ownersSummary: string;
};

export type DepartmentKrStructureSegment = {
  key: "direct_on_track" | "support_on_track" | "needs_attention";
  label: string;
  count: number;
  note: string;
};

type DepartmentExecutionContext = {
  overdueTasks: number;
  blockedTasks: number;
  openTasks: number;
  items: DepartmentExecutionContextItem[];
};

const defaultRawData: RawData = {
  departmentName: "",
  primaryGoalIds: [],
  primaryKeyResultIds: [],
  goals: [],
  goalOwnersByGoalId: {},
  goalLogsByGoalId: {},
  keyResults: [],
  supportLinks: [],
  tasks: [],
  departmentNamesById: {},
  profilesById: {},
  memberRolesById: {},
  memberIds: [],
};

const goalStatusLabelMap: Record<string, string> = {
  draft: "Nháp",
  active: "Đang hoạt động",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
  "Chưa đặt": "Chưa đặt",
};

const healthRankMap: Record<DepartmentPerformanceHealth, number> = {
  off_track: 0,
  at_risk: 1,
  on_track: 2,
  achieved: 3,
};

const emptyAsyncResult = <TValue,>() => Promise.resolve({ data: [] as TValue[], error: null });

const shortDateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
});

const toNumeric = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) {
    return null;
  }
  const nextValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(nextValue) ? nextValue : null;
};

const roundToOne = (value: number) => Math.round(value * 10) / 10;

const clampPercentage = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const normalizeGoalRow = (value: GoalRow) =>
  ({
    ...value,
    id: String(value.id),
    department_id: value.department_id ? String(value.department_id) : null,
    target: toNumeric(value.target),
    unit: value.unit ? String(value.unit) : null,
    type: value.type ? String(value.type) : null,
    status: value.status ? String(value.status) : null,
    start_date: value.start_date ? String(value.start_date) : null,
    end_date: value.end_date ? String(value.end_date) : null,
  }) satisfies GoalRow;

const normalizeKeyResultRow = (value: KeyResultRow) =>
  ({
    ...value,
    id: String(value.id),
    goal_id: value.goal_id ? String(value.goal_id) : null,
    name: String(value.name),
    type: value.type ? String(value.type) : null,
    contribution_type: value.contribution_type ? String(value.contribution_type) : null,
    start_value: toNumeric(value.start_value),
    current: toNumeric(value.current),
    target: toNumeric(value.target),
    unit: value.unit ? String(value.unit) : null,
    weight: toNumeric(value.weight),
    responsible_department_id: value.responsible_department_id ? String(value.responsible_department_id) : null,
    start_date: value.start_date ? String(value.start_date) : null,
    end_date: value.end_date ? String(value.end_date) : null,
  }) satisfies KeyResultRow;

const normalizeSupportLinkRow = (value: SupportLinkRow) =>
  ({
    ...value,
    id: String(value.id),
    support_key_result_id: value.support_key_result_id ? String(value.support_key_result_id) : null,
    target_key_result_id: value.target_key_result_id ? String(value.target_key_result_id) : null,
    allocated_value: toNumeric(value.allocated_value),
    allocated_percent: toNumeric(value.allocated_percent),
    note: value.note ? String(value.note) : null,
    created_at: value.created_at ? String(value.created_at) : null,
    updated_at: value.updated_at ? String(value.updated_at) : null,
  }) satisfies SupportLinkRow;

const normalizeActivityLogRow = (value: ActivityLogRow) =>
  ({
    ...value,
    id: String(value.id),
    entity_id: value.entity_id ? String(value.entity_id) : null,
    entity_type: value.entity_type ? String(value.entity_type) : null,
    profile_id: value.profile_id ? String(value.profile_id) : null,
    action: value.action ? String(value.action) : null,
    old_value:
      value.old_value && typeof value.old_value === "object" && !Array.isArray(value.old_value)
        ? value.old_value
        : null,
    new_value:
      value.new_value && typeof value.new_value === "object" && !Array.isArray(value.new_value)
        ? value.new_value
        : null,
    created_at: value.created_at ? String(value.created_at) : null,
  }) satisfies ActivityLogRow;

const normalizeTaskRow = (value: TaskRow) =>
  ({
    ...value,
    id: String(value.id),
    key_result_id: value.key_result_id ? String(value.key_result_id) : null,
    assignee_id: value.assignee_id ? String(value.assignee_id) : null,
    profile_id: value.profile_id ? String(value.profile_id) : null,
    start_date: value.start_date ? String(value.start_date) : null,
    end_date: value.end_date ? String(value.end_date) : null,
    type: value.type ? String(value.type) : null,
  }) satisfies TaskRow;

const normalizeKeyResultGoalRefRow = (value: KeyResultGoalRefRow) =>
  ({
    id: String(value.id),
    goal_id: value.goal_id ? String(value.goal_id) : null,
  }) satisfies KeyResultGoalRefRow;

const sortUniqueNumbers = (values: Array<number | null | undefined>, direction: "asc" | "desc" = "asc") =>
  [...new Set(values.filter((value): value is number => Number.isFinite(value)))].sort((a, b) =>
    direction === "asc" ? a - b : b - a,
  );

const getTaskAssigneeId = (task: TaskRow) => task.assignee_id ?? task.profile_id ?? null;

const isTaskOverdue = (task: TaskRow, now = new Date()) => {
  if (!task.end_date) {
    return false;
  }
  const deadline = new Date(task.end_date);
  const today = new Date(now);
  deadline.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return deadline < today;
};

const getDateDiffInDays = (value: string | null, now = new Date()) => {
  if (!value) {
    return null;
  }
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) {
    return null;
  }
  const start = new Date(now);
  target.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86400000);
};

const getDaysSince = (value: string | null, now = new Date()) => {
  const diff = getDateDiffInDays(value, now);
  return diff === null ? null : Math.max(0, -diff);
};

const formatTimelineLabel = (value: string | null) => {
  if (!value) {
    return "Hôm nay";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Hôm nay";
  }
  return shortDateFormatter.format(date);
};

const extractProgressFromLogPayload = (value: Record<string, unknown> | null | undefined) => {
  if (!value) {
    return null;
  }

  const directProgress = toNumeric(value.progress as number | string | null | undefined);
  if (directProgress !== null) {
    return clampPercentage(directProgress);
  }

  const currentValue = toNumeric(value.current as number | string | null | undefined);
  const targetValue = toNumeric(value.target as number | string | null | undefined);
  if (currentValue !== null && targetValue !== null && targetValue > 0) {
    return clampPercentage((currentValue / targetValue) * 100);
  }

  return null;
};

const getExpectedProgress = ({
  startDate,
  endDate,
  now = new Date(),
}: {
  startDate: string | null;
  endDate: string | null;
  now?: Date;
}) => {
  if (!startDate || !endDate) {
    return null;
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  const current = new Date(now);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  current.setHours(0, 0, 0, 0);

  if (current <= start) {
    return 0;
  }
  if (current >= end) {
    return 100;
  }

  const duration = end.getTime() - start.getTime();
  if (duration <= 0) {
    return null;
  }

  return clampPercentage(((current.getTime() - start.getTime()) / duration) * 100);
};

const buildGoalTrendInsights = ({
  logs,
  currentProgress,
  now = new Date(),
}: {
  logs: ActivityLogRow[];
  currentProgress: number;
  now?: Date;
}) => {
  const sortedLogs = [...logs]
    .filter((log) => Boolean(log.created_at))
    .sort((a, b) => new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime());

  const progressSnapshots = sortedLogs
    .map((log) => {
      const progress =
        extractProgressFromLogPayload(log.new_value) ?? extractProgressFromLogPayload(log.old_value);
      if (progress === null || !log.created_at) {
        return null;
      }
      return {
        id: log.id,
        createdAt: log.created_at,
        progress,
      };
    })
    .filter(
      (
        value,
      ): value is {
        id: string;
        createdAt: string;
        progress: number;
      } => Boolean(value),
    );

  const latestSnapshotByDay = progressSnapshots.reduce<
    Record<string, { id: string; createdAt: string; progress: number }>
  >((acc, snapshot) => {
    const key = snapshot.createdAt.slice(0, 10);
    acc[key] = snapshot;
    return acc;
  }, {});

  const dedupedSnapshots = Object.values(latestSnapshotByDay).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const latestLoggedSnapshot = dedupedSnapshots[dedupedSnapshots.length - 1] ?? null;
  const latestLoggedProgress = latestLoggedSnapshot?.progress ?? null;
  const currentPoint = {
    id: "current",
    createdAt: now.toISOString(),
    progress: clampPercentage(currentProgress),
  };
  const shouldAppendCurrent =
    latestLoggedProgress === null ||
    latestLoggedProgress !== currentPoint.progress ||
    latestLoggedSnapshot?.createdAt.slice(0, 10) !== currentPoint.createdAt.slice(0, 10);

  const trendBase = shouldAppendCurrent ? [...dedupedSnapshots, currentPoint] : dedupedSnapshots;

  const trendPoints = trendBase.slice(-6).map((point) => ({
    id: point.id,
    label: point.id === "current" ? "Hôm nay" : formatTimelineLabel(point.createdAt),
    progress: point.progress,
    createdAt: point.createdAt,
  }));

  const lastActivityAt = sortedLogs[sortedLogs.length - 1]?.created_at ?? null;

  const recentWindowStart = new Date(now);
  recentWindowStart.setDate(recentWindowStart.getDate() - 14);

  const baselineSnapshot =
    [...dedupedSnapshots]
      .filter((snapshot) => new Date(snapshot.createdAt).getTime() <= recentWindowStart.getTime())
      .at(-1) ??
    dedupedSnapshots.find((snapshot) => new Date(snapshot.createdAt).getTime() >= recentWindowStart.getTime()) ??
    null;

  const latestReferencePoint =
    trendBase[trendBase.length - 1] ?? {
      id: "current",
      createdAt: now.toISOString(),
      progress: clampPercentage(currentProgress),
    };

  const recentProgressChange =
    baselineSnapshot && latestReferencePoint
      ? roundToOne(latestReferencePoint.progress - baselineSnapshot.progress)
      : null;

  const velocityPerWeek =
    baselineSnapshot && latestReferencePoint
      ? (() => {
          const spanDays = Math.max(
            1,
            Math.round(
              (new Date(latestReferencePoint.createdAt).getTime() - new Date(baselineSnapshot.createdAt).getTime()) /
                86400000,
            ),
          );
          return roundToOne(((latestReferencePoint.progress - baselineSnapshot.progress) / spanDays) * 7);
        })()
      : null;

  return {
    trendPoints,
    lastActivityAt,
    recentProgressChange,
    velocityPerWeek,
  };
};

const computeHealth = ({
  progress,
  endDate,
  status,
}: {
  progress: number;
  endDate: string | null;
  status?: string | null;
}): DepartmentPerformanceHealth => {
  if (status === "completed" || progress >= 100) {
    return "achieved";
  }
  if (!endDate) {
    return progress >= 75 ? "on_track" : progress >= 45 ? "at_risk" : "off_track";
  }
  const diffDays = getDateDiffInDays(endDate);
  if (diffDays !== null && diffDays < 0) {
    return "off_track";
  }
  if (diffDays !== null && diffDays <= 14 && progress < 75) {
    return "at_risk";
  }
  return progress >= 75 ? "on_track" : progress >= 45 ? "at_risk" : "off_track";
};

const dedupeById = <TValue extends { id: string }>(rows: TValue[]) =>
  Object.values(
    rows.reduce<Record<string, TValue>>((acc, row) => {
      acc[row.id] = row;
      return acc;
    }, {}),
  );

const sortByHealthAndProgress = <TValue extends { health: DepartmentPerformanceHealth; progress: number; endDate: string | null }>(
  rows: TValue[],
) =>
  [...rows].sort((a, b) => {
    const healthDiff = healthRankMap[a.health] - healthRankMap[b.health];
    if (healthDiff !== 0) {
      return healthDiff;
    }
    if (a.progress !== b.progress) {
      return a.progress - b.progress;
    }
    const aDate = a.endDate ? new Date(a.endDate).getTime() : Number.POSITIVE_INFINITY;
    const bDate = b.endDate ? new Date(b.endDate).getTime() : Number.POSITIVE_INFINITY;
    return aDate - bDate;
  });

const computePortfolioPerformance = (
  keyResults: KeyResultRow[],
  keyResultProgressMap: Record<string, number>,
) => {
  if (!keyResults.length) {
    return null;
  }

  return computeWeightedProgress(
    keyResults.map((keyResult) => ({
      progress: keyResultProgressMap[keyResult.id] ?? 0,
    })),
  );
};

const averageRounded = (values: Array<number | null | undefined>) => {
  const safeValues = values.filter((value): value is number => Number.isFinite(value));
  if (!safeValues.length) {
    return null;
  }
  return Math.round(safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length);
};

const isNeedsAttention = (health: DepartmentPerformanceHealth) => health === "at_risk" || health === "off_track";

const getGoalMetricSummary = ({
  goal,
  directKeyResults,
}: {
  goal: GoalRow;
  directKeyResults: KeyResultRow[];
}) => {
  const consistentUnit =
    goal.unit &&
    directKeyResults.length > 0 &&
    directKeyResults.every((keyResult) => (keyResult.unit ?? null) === goal.unit);

  if (normalizeGoalTypeValue(goal.type) === "kpi" && consistentUnit) {
    const currentValue = directKeyResults.reduce((sum, keyResult) => sum + (keyResult.current ?? 0), 0);
    if (Number.isFinite(goal.target)) {
      return {
        currentValue,
        currentUnit: goal.unit,
        metricSummary: `${formatKeyResultMetric(currentValue, goal.unit)} / ${formatKeyResultMetric(goal.target, goal.unit)}`,
      };
    }
    return {
      currentValue,
      currentUnit: goal.unit,
      metricSummary: formatKeyResultMetric(currentValue, goal.unit),
    };
  }

  if (goal.target !== null) {
    return {
      currentValue: null,
      currentUnit: goal.unit,
      metricSummary: `Chỉ tiêu ${formatKeyResultMetric(goal.target, goal.unit)}`,
    };
  }

  return {
    currentValue: null,
    currentUnit: null,
    metricSummary: "Tiến độ được tổng hợp từ các KR thuộc mục tiêu",
  };
};

const getGoalRiskNote = ({
  progress,
  endDate,
  directKrRiskCount,
  supportKrRiskCount,
}: {
  progress: number;
  endDate: string | null;
  directKrRiskCount: number;
  supportKrRiskCount: number;
}) => {
  const diffDays = getDateDiffInDays(endDate);
  if (diffDays !== null && diffDays < 0) {
    return `Đã quá hạn và mới đạt ${progress}%.`;
  }
  if (diffDays !== null && diffDays <= 7 && progress < 100) {
    return `Còn ${diffDays} ngày đến hạn và hiện ở mức ${progress}%.`;
  }
  if (directKrRiskCount > 0) {
    return `${directKrRiskCount} KR trực tiếp đang kéo tiến độ xuống.`;
  }
  if (supportKrRiskCount > 0) {
    return `${supportKrRiskCount} KR hỗ trợ cần theo dõi thêm.`;
  }
  return progress >= 75 ? "Tiến độ đang ổn định trong phạm vi hiện tại." : "Tiến độ còn thấp so với mục tiêu kỳ này.";
};

const getGoalActionText = ({
  progress,
  scheduleGap,
  velocityPerWeek,
  requiredPerWeek,
  directKrRiskCount,
  supportKrRiskCount,
  inactivityDays,
}: {
  progress: number;
  scheduleGap: number | null;
  velocityPerWeek: number | null;
  requiredPerWeek: number | null;
  directKrRiskCount: number;
  supportKrRiskCount: number;
  inactivityDays: number | null;
}) => {
  if (progress >= 100) {
    return "Mục tiêu đã đạt. Chuyển sang theo dõi tính bền vững và giữ nhịp cập nhật.";
  }

  if (directKrRiskCount > 0) {
    return `Ưu tiên xử lý ${directKrRiskCount} KR trực tiếp đang kéo tiến độ mục tiêu xuống.`;
  }

  if (scheduleGap !== null && scheduleGap <= -15) {
    return `Tiến độ đang chậm ${Math.abs(scheduleGap)} điểm so với kế hoạch. Cần tăng nhịp hoàn thành ngay.`;
  }

  if (
    velocityPerWeek !== null &&
    requiredPerWeek !== null &&
    requiredPerWeek > 0 &&
    velocityPerWeek < requiredPerWeek
  ) {
    return `Nhịp hiện tại chưa đủ để kịp hạn. Cần tăng thêm khoảng ${roundToOne(requiredPerWeek - velocityPerWeek)} điểm mỗi tuần.`;
  }

  if (inactivityDays !== null && inactivityDays >= 7) {
    return `Mục tiêu đã ${inactivityDays} ngày chưa có cập nhật mới. Cần rà lại tiến độ thực tế.`;
  }

  if (supportKrRiskCount > 0) {
    return `Có ${supportKrRiskCount} KR hỗ trợ cần gỡ vướng để giữ nhịp cho mục tiêu này.`;
  }

  return "Tiến độ hiện còn trong tầm kiểm soát. Tiếp tục giữ nhịp cập nhật đều và theo dõi KR chính.";
};

const getPaceAssessment = ({
  progress,
  expectedProgress,
  requiredPerWeek,
  daysRemaining,
}: {
  progress: number;
  expectedProgress: number | null;
  requiredPerWeek: number | null;
  daysRemaining: number | null;
}) => {
  if (progress >= 100) {
    return {
      paceLabel: "Đã đạt chỉ tiêu",
      paceNote: "Không cần tăng thêm nhịp hoàn thành.",
    };
  }

  if (expectedProgress === null) {
    return {
      paceLabel: "Chưa đủ dữ liệu",
      paceNote: "Cần có ngày bắt đầu và hạn cuối để đánh giá nhịp đạt đích.",
    };
  }

  const gap = Math.round(progress - expectedProgress);
  const paceLabel =
    gap <= -15 ? `Chậm ${Math.abs(gap)} điểm` : gap >= 15 ? `Nhanh ${gap} điểm` : "Theo sát kế hoạch";

  if (daysRemaining !== null && daysRemaining < 0) {
    return {
      paceLabel,
      paceNote: "Đã quá hạn, cần rà lại chỉ tiêu và phần việc chậm.",
    };
  }

  if (requiredPerWeek === null) {
    return {
      paceLabel,
      paceNote: "Chưa đủ dữ liệu để ước tính nhịp cần thiết.",
    };
  }

  return {
    paceLabel,
    paceNote: `Cần khoảng ${roundToOne(requiredPerWeek)} điểm mỗi tuần để kịp hạn.`,
  };
};

const getKeyResultRiskNote = ({
  progress,
  endDate,
  supportCount,
  supportedDirectCount,
}: {
  progress: number;
  endDate: string | null;
  supportCount?: number;
  supportedDirectCount?: number;
}) => {
  const diffDays = getDateDiffInDays(endDate);
  if (diffDays !== null && diffDays < 0) {
    return `Đã quá hạn và mới đạt ${progress}%.`;
  }
  if (diffDays !== null && diffDays <= 7 && progress < 100) {
    return `Còn ${diffDays} ngày đến hạn và hiện ở mức ${progress}%.`;
  }
  if ((supportCount ?? 0) > 0) {
    return `Đang được hỗ trợ bởi ${supportCount} KR hỗ trợ.`;
  }
  if ((supportedDirectCount ?? 0) > 0) {
    return `Đang phân bổ cho ${supportedDirectCount} KR trực tiếp.`;
  }
  return progress >= 75 ? "Tiến độ đang trong vùng an toàn." : "Tiến độ thấp và cần theo dõi thêm.";
};

const getMemberSignalText = ({
  performanceScore,
  overdueTasks,
  blockedTasks,
}: {
  performanceScore: number | null;
  overdueTasks: number;
  blockedTasks: number;
}) => {
  if (overdueTasks > 0) {
    return `${overdueTasks} công việc quá hạn đang ảnh hưởng KR theo dõi.`;
  }
  if (blockedTasks > 0) {
    return `${blockedTasks} công việc bị chặn cần tháo gỡ.`;
  }
  if (performanceScore !== null && performanceScore < 50) {
    return "Điểm đóng góp hiện ở mức thấp so với phạm vi lọc.";
  }
  if (performanceScore !== null && performanceScore >= 80) {
    return "Đóng góp ổn định trên các mục tiêu và KR đang tham gia.";
  }
  return "Cần theo dõi thêm nhịp cải thiện trên các KR đang tham gia.";
};

const getPeriodKey = (goal: GoalRow) => {
  const year = goal.year ?? 0;
  const quarter = goal.quarter ?? 0;
  return `${year}-q${quarter}`;
};

const getPeriodLabel = (goal: GoalRow) => {
  if (goal.quarter && goal.year) {
    return `Q${goal.quarter}/${goal.year}`;
  }
  if (goal.year) {
    return `Năm ${goal.year}`;
  }
  return "Không xác định kỳ";
};

const sortGoalsByPeriod = (goals: GoalRow[]) =>
  [...goals].sort((a, b) => {
    const yearDiff = (a.year ?? 0) - (b.year ?? 0);
    if (yearDiff !== 0) {
      return yearDiff;
    }
    return (a.quarter ?? 0) - (b.quarter ?? 0);
  });

const getSupportAllocationModeLabel = (unit: string | null | undefined) =>
  getSupportAllocationFieldLabel(unit);

const getSupportAllocationLabel = ({
  allocatedValue,
  allocatedPercent,
  unit,
}: {
  allocatedValue: number | null;
  allocatedPercent: number | null;
  unit: string | null;
}) => {
  if (usesPercentSupportAllocation(unit)) {
    return allocatedPercent === null ? "Chưa đặt" : `${formatMetricValue(allocatedPercent)}%`;
  }

  return allocatedValue === null ? "Chưa đặt" : formatKeyResultMetric(allocatedValue, unit);
};

const getMemberContributionStatus = ({
  performanceScore,
  overdueTasks,
  blockedTasks,
}: {
  performanceScore: number | null;
  overdueTasks: number;
  blockedTasks: number;
}): DepartmentMemberContributionItem["status"] => {
  if (overdueTasks > 0 || blockedTasks > 0 || (performanceScore !== null && performanceScore < 50)) {
    return "bottleneck";
  }
  if ((performanceScore ?? 0) >= 80) {
    return "strong";
  }
  return "watching";
};

export function useDepartmentPerformance(filters: FilterParams) {
  const [rawData, setRawData] = useState<RawData>(defaultRawData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filters.departmentId) {
      setRawData(defaultRawData);
      setIsLoading(false);
      setError(null);
      return;
    }

    let isActive = true;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [
          { data: departmentRow, error: departmentError },
          { data: memberRoleRows, error: memberRoleError },
          { data: ownedGoalRows, error: ownedGoalError },
          { data: linkedGoalRows, error: linkedGoalError },
          { data: departmentKeyResultRows, error: departmentKeyResultError },
        ] = await Promise.all([
          supabase.from("departments").select("id,name").eq("id", filters.departmentId).maybeSingle(),
          supabase
            .from("user_role_in_department")
            .select("profile_id,role_id,department_id")
            .eq("department_id", filters.departmentId),
          supabase
            .from("goals")
            .select("id,name,type,department_id,status,quarter,year,target,unit,start_date,end_date")
            .eq("department_id", filters.departmentId),
          supabase.from("goal_departments").select("goal_id,department_id").eq("department_id", filters.departmentId),
          supabase
            .from("key_results")
            .select(
              "id,goal_id,name,type,contribution_type,start_value,current,target,unit,weight,responsible_department_id,start_date,end_date",
            )
            .eq("responsible_department_id", filters.departmentId),
        ]);

        if (departmentError) {
          throw new Error(departmentError.message || "Không tải được thông tin phòng ban.");
        }
        if (memberRoleError) {
          throw new Error(memberRoleError.message || "Không tải được vai trò thành viên của phòng ban.");
        }
        if (ownedGoalError) {
          throw new Error(ownedGoalError.message || "Không tải được danh sách mục tiêu của phòng ban.");
        }
        if (linkedGoalError) {
          throw new Error(linkedGoalError.message || "Không tải được danh sách mục tiêu liên quan.");
        }
        if (departmentKeyResultError) {
          throw new Error(departmentKeyResultError.message || "Không tải được danh sách KR của phòng ban.");
        }
        if (!isActive) {
          return;
        }

        const normalizedDepartmentKeyResults = ((departmentKeyResultRows ?? []) as KeyResultRow[]).map(normalizeKeyResultRow);
        const departmentKeyResultIds = normalizedDepartmentKeyResults.map((item) => item.id);
        const memberIds = [
          ...new Set(
            ((memberRoleRows ?? []) as UserRoleRow[])
              .map((row) => (row.profile_id ? String(row.profile_id) : null))
              .filter((value): value is string => Boolean(value)),
          ),
        ];
        const roleIds = [
          ...new Set(
            ((memberRoleRows ?? []) as UserRoleRow[])
              .map((row) => (row.role_id ? String(row.role_id) : null))
              .filter((value): value is string => Boolean(value)),
          ),
        ];

        const [
          { data: memberProfiles, error: memberProfilesError },
          { data: roleRows, error: roleRowsError },
          outboundSupportResult,
          inboundSupportResult,
        ] = await Promise.all([
          memberIds.length > 0
            ? supabase.from("profiles").select("id,name,email").in("id", memberIds)
            : emptyAsyncResult<ProfileRow>(),
          roleIds.length > 0
            ? supabase.from("roles").select("id,name").in("id", roleIds)
            : emptyAsyncResult<RoleRow>(),
          departmentKeyResultIds.length > 0
            ? supabase
                .from("key_result_support_links")
                .select(
                  "id,support_key_result_id,target_key_result_id,allocated_value,allocated_percent,note,created_at,updated_at",
                )
                .in("support_key_result_id", departmentKeyResultIds)
            : emptyAsyncResult<SupportLinkRow>(),
          departmentKeyResultIds.length > 0
            ? supabase
                .from("key_result_support_links")
                .select(
                  "id,support_key_result_id,target_key_result_id,allocated_value,allocated_percent,note,created_at,updated_at",
                )
                .in("target_key_result_id", departmentKeyResultIds)
            : emptyAsyncResult<SupportLinkRow>(),
        ]);

        if (memberProfilesError) {
          throw new Error(memberProfilesError.message || "Không tải được hồ sơ thành viên.");
        }
        if (roleRowsError) {
          throw new Error(roleRowsError.message || "Không tải được danh sách vai trò.");
        }
        if (outboundSupportResult.error) {
          throw new Error(outboundSupportResult.error.message || "Không tải được liên kết hỗ trợ đi ra.");
        }
        if (inboundSupportResult.error) {
          throw new Error(inboundSupportResult.error.message || "Không tải được liên kết hỗ trợ đi vào.");
        }
        if (!isActive) {
          return;
        }

        const baseSupportLinks = dedupeById(
          [...(outboundSupportResult.data ?? []), ...(inboundSupportResult.data ?? [])].map((row) =>
            normalizeSupportLinkRow(row as SupportLinkRow),
          ),
        );

        const baseRelatedKeyResultIds = [
          ...new Set(
            baseSupportLinks
              .flatMap((link) => [link.support_key_result_id, link.target_key_result_id])
              .filter((value): value is string => Boolean(value))
              .filter((value) => !departmentKeyResultIds.includes(value)),
          ),
        ];

        const { data: relatedKeyResultGoalRows, error: relatedKeyResultGoalError } =
          baseRelatedKeyResultIds.length > 0
            ? await supabase.from("key_results").select("id,goal_id").in("id", baseRelatedKeyResultIds)
            : { data: [] as KeyResultGoalRefRow[], error: null };

        if (relatedKeyResultGoalError) {
          throw new Error(relatedKeyResultGoalError.message || "Không tải được mục tiêu liên quan qua liên kết hỗ trợ.");
        }
        if (!isActive) {
          return;
        }

        const primaryGoalIds = [
          ...new Set(
            [
              ...((ownedGoalRows ?? []) as GoalRow[]).map((row) => String(row.id)),
              ...((linkedGoalRows ?? []) as GoalDepartmentRow[])
                .map((row) => (row.goal_id ? String(row.goal_id) : null))
                .filter((value): value is string => Boolean(value)),
              ...normalizedDepartmentKeyResults
                .map((row) => row.goal_id)
                .filter((value): value is string => Boolean(value)),
              ...((relatedKeyResultGoalRows ?? []) as KeyResultGoalRefRow[])
                .map(normalizeKeyResultGoalRefRow)
                .map((row) => row.goal_id)
                .filter((value): value is string => Boolean(value)),
            ].filter(Boolean),
          ),
        ];

        const { data: goalRows, error: goalRowsError } =
          primaryGoalIds.length > 0
            ? await supabase
                .from("goals")
                .select("id,name,type,department_id,status,quarter,year,target,unit,start_date,end_date")
                .in("id", primaryGoalIds)
            : { data: [] as GoalRow[], error: null };

        if (goalRowsError) {
          throw new Error(goalRowsError.message || "Không tải được danh sách mục tiêu trong phạm vi phòng ban.");
        }
        if (!isActive) {
          return;
        }

        const normalizedGoals = ((goalRows ?? []) as GoalRow[]).map(normalizeGoalRow);
        const normalizedGoalIds = normalizedGoals.map((goal) => goal.id);
        const goalOwnersByGoalId = await loadGoalOwnersByGoalIds(normalizedGoalIds);

        if (!isActive) {
          return;
        }

        const [{ data: primaryKeyResultRows, error: primaryKeyResultError }, goalLogResult] = await Promise.all([
          normalizedGoalIds.length > 0
            ? supabase
                .from("key_results")
                .select(
                  "id,goal_id,name,type,contribution_type,start_value,current,target,unit,weight,responsible_department_id,start_date,end_date",
                )
                .in("goal_id", normalizedGoalIds)
            : Promise.resolve({ data: [] as KeyResultRow[], error: null }),
          normalizedGoalIds.length > 0
            ? supabase
                .from("activity_logs")
                .select("id,entity_id,entity_type,profile_id,action,old_value,new_value,created_at")
                .eq("entity_type", "goal")
                .in("entity_id", normalizedGoalIds)
                .order("created_at", { ascending: true })
            : Promise.resolve({ data: [] as ActivityLogRow[], error: null }),
        ]);

        if (primaryKeyResultError) {
          throw new Error(primaryKeyResultError.message || "Không tải được danh sách KR trong phạm vi mục tiêu.");
        }
        if (goalLogResult.error) {
          throw new Error(goalLogResult.error.message || "Không tải được lịch sử cập nhật mục tiêu.");
        }
        if (!isActive) {
          return;
        }

        const normalizedPrimaryKeyResults = ((primaryKeyResultRows ?? []) as KeyResultRow[]).map(normalizeKeyResultRow);
        const goalLogsByGoalId = ((goalLogResult.data ?? []) as ActivityLogRow[])
          .map(normalizeActivityLogRow)
          .reduce<Record<string, ActivityLogRow[]>>((acc, log) => {
            if (!log.entity_id) {
              return acc;
            }
            if (!acc[log.entity_id]) {
              acc[log.entity_id] = [];
            }
            acc[log.entity_id].push(log);
            return acc;
          }, {});
        const primaryKeyResultIds = normalizedPrimaryKeyResults.map((item) => item.id);

        const [taskResult, allOutboundSupportResult, allInboundSupportResult] = await Promise.all([
          primaryKeyResultIds.length > 0
            ? supabase
                .from("tasks")
                .select("id,name,key_result_id,assignee_id,profile_id,start_date,end_date,type")
                .in("key_result_id", primaryKeyResultIds)
            : emptyAsyncResult<TaskRow>(),
          primaryKeyResultIds.length > 0
            ? supabase
                .from("key_result_support_links")
                .select(
                  "id,support_key_result_id,target_key_result_id,allocated_value,allocated_percent,note,created_at,updated_at",
                )
                .in("support_key_result_id", primaryKeyResultIds)
            : emptyAsyncResult<SupportLinkRow>(),
          primaryKeyResultIds.length > 0
            ? supabase
                .from("key_result_support_links")
                .select(
                  "id,support_key_result_id,target_key_result_id,allocated_value,allocated_percent,note,created_at,updated_at",
                )
                .in("target_key_result_id", primaryKeyResultIds)
            : emptyAsyncResult<SupportLinkRow>(),
        ]);

        if (taskResult.error) {
          throw new Error(taskResult.error.message || "Không tải được dữ liệu thực thi của KR.");
        }
        if (allOutboundSupportResult.error) {
          throw new Error(allOutboundSupportResult.error.message || "Không tải được liên kết hỗ trợ của KR.");
        }
        if (allInboundSupportResult.error) {
          throw new Error(allInboundSupportResult.error.message || "Không tải được liên kết hỗ trợ đi vào của KR.");
        }
        if (!isActive) {
          return;
        }

        const primarySupportLinks = dedupeById(
          [...(allOutboundSupportResult.data ?? []), ...(allInboundSupportResult.data ?? [])].map((row) =>
            normalizeSupportLinkRow(row as SupportLinkRow),
          ),
        );
        const supportRelatedKeyResultIds = [
          ...new Set(
            primarySupportLinks
              .flatMap((link) => [link.support_key_result_id, link.target_key_result_id])
              .filter((value): value is string => Boolean(value))
              .filter((value) => !primaryKeyResultIds.includes(value)),
          ),
        ];

        const { data: externalSupportKeyResultRows, error: externalSupportKeyResultError } =
          supportRelatedKeyResultIds.length > 0
            ? await supabase
                .from("key_results")
                .select(
                  "id,goal_id,name,type,contribution_type,start_value,current,target,unit,weight,responsible_department_id,start_date,end_date",
                )
                .in("id", supportRelatedKeyResultIds)
            : { data: [] as KeyResultRow[], error: null };

        if (externalSupportKeyResultError) {
          throw new Error(externalSupportKeyResultError.message || "Không tải được KR liên kết hỗ trợ.");
        }
        if (!isActive) {
          return;
        }

        const normalizedExternalSupportKeyResults = ((externalSupportKeyResultRows ?? []) as KeyResultRow[]).map(
          normalizeKeyResultRow,
        );
        const extraGoalIds = [
          ...new Set(
            normalizedExternalSupportKeyResults
              .map((item) => item.goal_id)
              .filter((value): value is string => Boolean(value))
              .filter((value) => !normalizedGoalIds.includes(value)),
          ),
        ];

        const [extraGoalResult, extraProfilesResult, departmentsResult] = await Promise.all([
          extraGoalIds.length > 0
            ? supabase
                .from("goals")
                .select("id,name,type,department_id,status,quarter,year,target,unit,start_date,end_date")
                .in("id", extraGoalIds)
            : emptyAsyncResult<GoalRow>(),
          (() => {
            const taskAssigneeIds = [
              ...new Set(
                ((taskResult.data ?? []) as TaskRow[])
                  .map(normalizeTaskRow)
                  .map((task) => getTaskAssigneeId(task))
                  .filter((value): value is string => Boolean(value))
                  .filter((value) => !memberIds.includes(value)),
              ),
            ];

            return taskAssigneeIds.length > 0
              ? supabase.from("profiles").select("id,name,email").in("id", taskAssigneeIds)
              : emptyAsyncResult<ProfileRow>();
          })(),
          (() => {
            const relatedDepartmentIds = [
              ...new Set(
                [
                  filters.departmentId,
                  ...normalizedGoals
                    .map((goal) => goal.department_id)
                    .filter((value): value is string => Boolean(value)),
                  ...normalizedPrimaryKeyResults
                    .map((keyResult) => keyResult.responsible_department_id)
                    .filter((value): value is string => Boolean(value)),
                  ...normalizedExternalSupportKeyResults
                    .map((keyResult) => keyResult.responsible_department_id)
                    .filter((value): value is string => Boolean(value)),
                ].filter(Boolean),
              ),
            ];

            return relatedDepartmentIds.length > 0
              ? supabase.from("departments").select("id,name").in("id", relatedDepartmentIds)
              : emptyAsyncResult<DepartmentRow>();
          })(),
        ]);

        if (extraGoalResult.error) {
          throw new Error(extraGoalResult.error.message || "Không tải được mục tiêu liên kết hỗ trợ.");
        }
        if (extraProfilesResult.error) {
          throw new Error(extraProfilesResult.error.message || "Không tải được hồ sơ người tham gia thực thi.");
        }
        if (departmentsResult.error) {
          throw new Error(departmentsResult.error.message || "Không tải được danh sách phòng ban liên quan.");
        }
        if (!isActive) {
          return;
        }

        const profilesById = [...((memberProfiles ?? []) as ProfileRow[]), ...((extraProfilesResult.data ?? []) as ProfileRow[])].reduce<
          Record<string, string>
        >((acc, profile) => {
          acc[String(profile.id)] = profile.name?.trim() || profile.email?.trim() || "Không rõ";
          return acc;
        }, {});

        const roleNamesById = ((roleRows ?? []) as RoleRow[]).reduce<Record<string, string>>((acc, role) => {
          acc[String(role.id)] = role.name?.trim() || "Không rõ vai trò";
          return acc;
        }, {});

        const memberRolesById = ((memberRoleRows ?? []) as UserRoleRow[]).reduce<Record<string, string>>((acc, row) => {
          const profileId = row.profile_id ? String(row.profile_id) : null;
          const roleId = row.role_id ? String(row.role_id) : null;
          if (!profileId || !roleId || acc[profileId]) {
            return acc;
          }
          acc[profileId] = roleNamesById[roleId] ?? "Không rõ vai trò";
          return acc;
        }, {});

        const departmentNamesById = ((departmentsResult.data ?? []) as DepartmentRow[]).reduce<Record<string, string>>(
          (acc, department) => {
            acc[String(department.id)] = String(department.name);
            return acc;
          },
          {},
        );

        setRawData({
          departmentName: departmentRow?.name ?? "Phòng ban",
          primaryGoalIds: normalizedGoalIds,
          primaryKeyResultIds,
          goals: dedupeById([
            ...normalizedGoals,
            ...((extraGoalResult.data ?? []) as GoalRow[]).map(normalizeGoalRow),
          ]),
          goalOwnersByGoalId,
          goalLogsByGoalId,
          keyResults: dedupeById([...normalizedPrimaryKeyResults, ...normalizedExternalSupportKeyResults]),
          supportLinks: primarySupportLinks,
          tasks: ((taskResult.data ?? []) as TaskRow[]).map(normalizeTaskRow),
          departmentNamesById,
          profilesById,
          memberRolesById,
          memberIds,
        });
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setRawData(defaultRawData);
        setError(loadError instanceof Error ? loadError.message : "Không tải được dữ liệu hiệu suất phòng ban.");
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isActive = false;
    };
  }, [filters.departmentId]);

  const filtered = useMemo(() => {
    const keyword = filters.search.trim().toLowerCase();
    const primaryGoalIdSet = new Set(rawData.primaryGoalIds);
    const primaryKeyResultIdSet = new Set(rawData.primaryKeyResultIds);
    const allGoalsById = rawData.goals.reduce<Record<string, GoalRow>>((acc, goal) => {
      acc[goal.id] = goal;
      return acc;
    }, {});
    const allKeyResultsById = rawData.keyResults.reduce<Record<string, KeyResultRow>>((acc, keyResult) => {
      acc[keyResult.id] = keyResult;
      return acc;
    }, {});

    const primaryGoals = rawData.goals.filter((goal) => primaryGoalIdSet.has(goal.id));
    const primaryKeyResults = rawData.keyResults.filter((keyResult) => primaryKeyResultIdSet.has(keyResult.id));

    const primaryKeyResultsByGoalId = primaryKeyResults.reduce<Record<string, KeyResultRow[]>>((acc, keyResult) => {
      if (!keyResult.goal_id) {
        return acc;
      }
      if (!acc[keyResult.goal_id]) {
        acc[keyResult.goal_id] = [];
      }
      acc[keyResult.goal_id].push(keyResult);
      return acc;
    }, {});

    const tasksByKeyResultId = rawData.tasks.reduce<Record<string, TaskRow[]>>((acc, task) => {
      if (!task.key_result_id) {
        return acc;
      }
      if (!acc[task.key_result_id]) {
        acc[task.key_result_id] = [];
      }
      acc[task.key_result_id].push(task);
      return acc;
    }, {});

    const supportLinksByTargetKeyResultId = rawData.supportLinks.reduce<Record<string, SupportLinkRow[]>>((acc, link) => {
      if (!link.target_key_result_id) {
        return acc;
      }
      if (!acc[link.target_key_result_id]) {
        acc[link.target_key_result_id] = [];
      }
      acc[link.target_key_result_id].push(link);
      return acc;
    }, {});

    const supportLinksBySupportKeyResultId = rawData.supportLinks.reduce<Record<string, SupportLinkRow[]>>((acc, link) => {
      if (!link.support_key_result_id) {
        return acc;
      }
      if (!acc[link.support_key_result_id]) {
        acc[link.support_key_result_id] = [];
      }
      acc[link.support_key_result_id].push(link);
      return acc;
    }, {});

    const goalSearchMatchById = primaryGoals.reduce<Record<string, boolean>>((acc, goal) => {
      const searchText = `${goal.name} ${formatGoalTypeLabel(goal.type)} ${
        goalStatusLabelMap[goal.status ?? ""] ?? goal.status ?? ""
      } ${getGoalOwnerSearchText(rawData.goalOwnersByGoalId[goal.id] ?? [])}`.toLowerCase();
      acc[goal.id] = keyword ? searchText.includes(keyword) : true;
      return acc;
    }, {});

    const keyResultSearchMatchById = primaryKeyResults.reduce<Record<string, boolean>>((acc, keyResult) => {
      const taskAssigneeNames = (tasksByKeyResultId[keyResult.id] ?? [])
        .map((task) => {
          const assigneeId = getTaskAssigneeId(task);
          return assigneeId ? rawData.profilesById[assigneeId] ?? "Không rõ" : "Chưa gán";
        })
        .join(" ");
      const relatedSupportNames = [
        ...(supportLinksByTargetKeyResultId[keyResult.id] ?? [])
          .map((link) => link.support_key_result_id)
          .filter((value): value is string => Boolean(value))
          .map((id) => allKeyResultsById[id]?.name ?? ""),
        ...(supportLinksBySupportKeyResultId[keyResult.id] ?? [])
          .map((link) => link.target_key_result_id)
          .filter((value): value is string => Boolean(value))
          .map((id) => allKeyResultsById[id]?.name ?? ""),
      ].join(" ");
      const searchText = `${keyResult.name} ${allGoalsById[keyResult.goal_id ?? ""]?.name ?? ""} ${
        rawData.departmentNamesById[keyResult.responsible_department_id ?? ""] ?? ""
      } ${formatKeyResultTypeLabel(keyResult.type)} ${formatKeyResultContributionTypeLabel(
        keyResult.contribution_type,
      )} ${taskAssigneeNames} ${relatedSupportNames}`.toLowerCase();
      acc[keyResult.id] = keyword ? searchText.includes(keyword) : true;
      return acc;
    }, {});

    const memberOwnedGoalIds =
      filters.memberId === "all"
        ? new Set<string>()
        : new Set(
            primaryGoals
              .filter((goal) =>
                (rawData.goalOwnersByGoalId[goal.id] ?? []).some((owner) => owner.id === filters.memberId),
              )
              .map((goal) => goal.id),
          );

    const memberAssignedKeyResultIds =
      filters.memberId === "all"
        ? new Set<string>()
        : new Set(
            rawData.tasks
              .filter((task) => getTaskAssigneeId(task) === filters.memberId && task.key_result_id)
              .map((task) => String(task.key_result_id)),
          );

    const baseGoalCandidates = primaryGoals.filter((goal) => {
      if (filters.quarter !== "all" && String(goal.quarter ?? "") !== filters.quarter) {
        return false;
      }
      if (filters.year !== "all" && String(goal.year ?? "") !== filters.year) {
        return false;
      }
      if (filters.goalStatus !== "all" && String(goal.status ?? "") !== filters.goalStatus) {
        return false;
      }
      if (filters.goalType !== "all" && normalizeGoalTypeValue(goal.type) !== filters.goalType) {
        return false;
      }
      if (
        filters.ownerId !== "all" &&
        !(rawData.goalOwnersByGoalId[goal.id] ?? []).some((owner) => owner.id === filters.ownerId)
      ) {
        return false;
      }
      if (filters.memberId !== "all") {
        const hasTaskInvolvement = (primaryKeyResultsByGoalId[goal.id] ?? []).some((keyResult) =>
          memberAssignedKeyResultIds.has(keyResult.id),
        );
        if (!memberOwnedGoalIds.has(goal.id) && !hasTaskInvolvement) {
          return false;
        }
      }
      return true;
    });

    const baseGoalCandidateIds = new Set(baseGoalCandidates.map((goal) => goal.id));

    const baseKeyResultCandidates = primaryKeyResults.filter((keyResult) => {
      if (!keyResult.goal_id || !baseGoalCandidateIds.has(keyResult.goal_id)) {
        return false;
      }
      if (filters.keyResultType !== "all" && normalizeKeyResultTypeValue(keyResult.type) !== filters.keyResultType) {
        return false;
      }
      if (
        filters.keyResultContributionType !== "all" &&
        normalizeKeyResultContributionTypeValue(keyResult.contribution_type) !== filters.keyResultContributionType
      ) {
        return false;
      }
      if (filters.memberId !== "all" && !memberAssignedKeyResultIds.has(keyResult.id)) {
        return false;
      }
      if (keyword && !(keyResultSearchMatchById[keyResult.id] || goalSearchMatchById[keyResult.goal_id])) {
        return false;
      }
      return true;
    });

    const visibleKeyResultsByGoalId = baseKeyResultCandidates.reduce<Record<string, KeyResultRow[]>>((acc, keyResult) => {
      if (!keyResult.goal_id) {
        return acc;
      }
      if (!acc[keyResult.goal_id]) {
        acc[keyResult.goal_id] = [];
      }
      acc[keyResult.goal_id].push(keyResult);
      return acc;
    }, {});

    const hasStrictKrFilters =
      filters.keyResultType !== "all" ||
      filters.keyResultContributionType !== "all" ||
      filters.memberId !== "all";

    const visibleGoals = baseGoalCandidates.filter((goal) => {
      const hasVisibleKeyResults = (visibleKeyResultsByGoalId[goal.id] ?? []).length > 0;
      if (hasStrictKrFilters) {
        return hasVisibleKeyResults;
      }
      if (keyword) {
        return goalSearchMatchById[goal.id] || hasVisibleKeyResults;
      }
      return true;
    });

    const visibleGoalIds = new Set(visibleGoals.map((goal) => goal.id));
    const visibleKeyResults = baseKeyResultCandidates.filter(
      (keyResult) => keyResult.goal_id && visibleGoalIds.has(keyResult.goal_id),
    );

    const goalContextKeyResults = primaryKeyResults.filter(
      (keyResult) => keyResult.goal_id && visibleGoalIds.has(keyResult.goal_id),
    );
    const goalContextKeyResultProgressMap = buildKeyResultProgressMap(goalContextKeyResults);
    const goalProgressMap = buildGoalProgressMap(
      visibleGoals.map((goal) => ({
        id: goal.id,
        type: goal.type,
        target: goal.target,
      })),
      goalContextKeyResults.map((keyResult) => ({
        id: keyResult.id,
        goal_id: keyResult.goal_id,
        type: keyResult.type,
        contribution_type: keyResult.contribution_type,
        start_value: keyResult.start_value,
        current: keyResult.current,
        target: keyResult.target,
        weight: keyResult.weight,
      })),
      goalContextKeyResultProgressMap,
    );

    const departmentScopeKeyResults = goalContextKeyResults.filter(
      (keyResult) => keyResult.responsible_department_id === filters.departmentId,
    );
    const departmentVisibleKeyResults = visibleKeyResults.filter(
      (keyResult) => keyResult.responsible_department_id === filters.departmentId,
    );
    const directKeyResults = departmentVisibleKeyResults.filter(
      (keyResult) => normalizeKeyResultContributionTypeValue(keyResult.contribution_type) === "direct",
    );
    const supportKeyResults = departmentVisibleKeyResults.filter(
      (keyResult) => normalizeKeyResultContributionTypeValue(keyResult.contribution_type) === "support",
    );

    const goalItems = sortByHealthAndProgress(
      visibleGoals.map((goal) => {
        const allGoalKeyResults = goalContextKeyResults.filter((keyResult) => keyResult.goal_id === goal.id);
        const allDirectGoalKeyResults = allGoalKeyResults.filter(
          (keyResult) => normalizeKeyResultContributionTypeValue(keyResult.contribution_type) === "direct",
        );
        const departmentGoalKeyResults = departmentScopeKeyResults.filter((keyResult) => keyResult.goal_id === goal.id);
        const departmentDirectKeyResults = departmentGoalKeyResults.filter(
          (keyResult) => normalizeKeyResultContributionTypeValue(keyResult.contribution_type) === "direct",
        );
        const departmentSupportKeyResults = departmentGoalKeyResults.filter(
          (keyResult) => normalizeKeyResultContributionTypeValue(keyResult.contribution_type) === "support",
        );
        const progress = goalProgressMap[goal.id] ?? 0;
        const health = computeHealth({ progress, endDate: goal.end_date, status: goal.status });
        const directKrRiskCount = departmentDirectKeyResults.filter((keyResult) =>
          isNeedsAttention(
            computeHealth({
              progress: goalContextKeyResultProgressMap[keyResult.id] ?? 0,
              endDate: keyResult.end_date,
            }),
          ),
        ).length;
        const supportKrRiskCount = departmentSupportKeyResults.filter((keyResult) =>
          isNeedsAttention(
            computeHealth({
              progress: goalContextKeyResultProgressMap[keyResult.id] ?? 0,
              endDate: keyResult.end_date,
            }),
          ),
        ).length;
        const metricSummary = getGoalMetricSummary({
          goal,
          directKeyResults: allDirectGoalKeyResults,
        });
        const trendInsights = buildGoalTrendInsights({
          logs: rawData.goalLogsByGoalId[goal.id] ?? [],
          currentProgress: progress,
        });
        const expectedProgress = getExpectedProgress({
          startDate: goal.start_date,
          endDate: goal.end_date,
        });
        const scheduleGap =
          expectedProgress === null ? null : Math.round(progress - expectedProgress);
        const requiredPerWeek =
          progress >= 100 || (getDateDiffInDays(goal.end_date) ?? 0) <= 0
            ? null
            : roundToOne((100 - progress) / Math.max(1, (getDateDiffInDays(goal.end_date) as number) / 7));
        const inactivityDays = getDaysSince(trendInsights.lastActivityAt);

        return {
          id: goal.id,
          name: goal.name,
          type: goal.type,
          typeLabel: formatGoalTypeLabel(goal.type),
          owners: rawData.goalOwnersByGoalId[goal.id] ?? [],
          ownersSummary: formatGoalOwnersSummary(rawData.goalOwnersByGoalId[goal.id] ?? [], {
            limit: 3,
          }),
          status: goal.status ? String(goal.status) : "Chưa đặt",
          progress,
          health,
          target: goal.target,
          unit: goal.unit,
          currentValue: metricSummary.currentValue,
          currentUnit: metricSummary.currentUnit,
          metricSummary: metricSummary.metricSummary,
          startDate: goal.start_date,
          endDate: goal.end_date,
          daysRemaining: getDateDiffInDays(goal.end_date),
          expectedProgress,
          scheduleGap,
          recentProgressChange: trendInsights.recentProgressChange,
          velocityPerWeek: trendInsights.velocityPerWeek,
          requiredPerWeek,
          lastActivityAt: trendInsights.lastActivityAt,
          inactivityDays,
          trendPoints: trendInsights.trendPoints,
          actionText: getGoalActionText({
            progress,
            scheduleGap,
            velocityPerWeek: trendInsights.velocityPerWeek,
            requiredPerWeek,
            directKrRiskCount,
            supportKrRiskCount,
            inactivityDays,
          }),
          directKrCount: departmentDirectKeyResults.length,
          supportKrCount: departmentSupportKeyResults.length,
          directKrRiskCount,
          supportKrRiskCount,
          riskNote: getGoalRiskNote({
            progress,
            endDate: goal.end_date,
            directKrRiskCount,
            supportKrRiskCount,
          }),
        } satisfies DepartmentGoalPerformanceItem;
      }),
    );

    const directKeyResultItems = sortByHealthAndProgress(
      directKeyResults.map((keyResult) => {
        const progress = goalContextKeyResultProgressMap[keyResult.id] ?? 0;
        const inboundSupportLinks = supportLinksByTargetKeyResultId[keyResult.id] ?? [];
        const health = computeHealth({ progress, endDate: keyResult.end_date });
        const daysRemaining = getDateDiffInDays(keyResult.end_date);
        const expectedProgress = getExpectedProgress({
          startDate: keyResult.start_date,
          endDate: keyResult.end_date,
        });
        const scheduleGap = expectedProgress === null ? null : Math.round(progress - expectedProgress);
        const requiredPerWeek =
          progress >= 100 || daysRemaining === null || daysRemaining <= 0
            ? null
            : roundToOne((100 - progress) / Math.max(1, daysRemaining / 7));
        const paceAssessment = getPaceAssessment({
          progress,
          expectedProgress,
          requiredPerWeek,
          daysRemaining,
        });

        return {
          id: keyResult.id,
          goalId: keyResult.goal_id,
          goalName: allGoalsById[keyResult.goal_id ?? ""]?.name ?? "Chưa có mục tiêu",
          name: keyResult.name,
          type: keyResult.type,
          typeLabel: formatKeyResultTypeLabel(keyResult.type),
          contributionTypeLabel: formatKeyResultContributionTypeLabel(keyResult.contribution_type),
          target: keyResult.target,
          current: keyResult.current,
          unit: keyResult.unit,
          progress,
          expectedProgress,
          scheduleGap,
          requiredPerWeek,
          paceLabel: paceAssessment.paceLabel,
          paceNote: paceAssessment.paceNote,
          health,
          responsibleDepartmentName:
            rawData.departmentNamesById[keyResult.responsible_department_id ?? ""] ?? "Chưa gán phòng ban",
          startDate: keyResult.start_date,
          endDate: keyResult.end_date,
          daysRemaining,
          supportPreview: inboundSupportLinks
            .map((link) => {
              const supportKeyResult = link.support_key_result_id
                ? allKeyResultsById[link.support_key_result_id] ?? null
                : null;
              const supportGoalName =
                supportKeyResult?.goal_id ? allGoalsById[supportKeyResult.goal_id]?.name ?? "Chưa có mục tiêu" : "Chưa có mục tiêu";
              if (!supportKeyResult) {
                return null;
              }
              return {
                id: supportKeyResult.id,
                name: supportKeyResult.name,
                goalName: supportGoalName,
              };
            })
            .filter((value): value is { id: string; name: string; goalName: string } => Boolean(value)),
          supportCount: inboundSupportLinks.length,
          riskNote: getKeyResultRiskNote({
            progress,
            endDate: keyResult.end_date,
            supportCount: inboundSupportLinks.length,
          }),
        } satisfies DepartmentDirectKeyResultItem;
      }),
    );

    const supportKeyResultItems = sortByHealthAndProgress(
      supportKeyResults.map((keyResult) => {
        const progress = goalContextKeyResultProgressMap[keyResult.id] ?? 0;
        const outboundSupportLinks = supportLinksBySupportKeyResultId[keyResult.id] ?? [];
        const health = computeHealth({ progress, endDate: keyResult.end_date });
        const daysRemaining = getDateDiffInDays(keyResult.end_date);
        const expectedProgress = getExpectedProgress({
          startDate: keyResult.start_date,
          endDate: keyResult.end_date,
        });
        const scheduleGap = expectedProgress === null ? null : Math.round(progress - expectedProgress);
        const requiredPerWeek =
          progress >= 100 || daysRemaining === null || daysRemaining <= 0
            ? null
            : roundToOne((100 - progress) / Math.max(1, daysRemaining / 7));
        const paceAssessment = getPaceAssessment({
          progress,
          expectedProgress,
          requiredPerWeek,
          daysRemaining,
        });

        return {
          id: keyResult.id,
          goalId: keyResult.goal_id,
          goalName: allGoalsById[keyResult.goal_id ?? ""]?.name ?? "Chưa có mục tiêu",
          name: keyResult.name,
          type: keyResult.type,
          typeLabel: formatKeyResultTypeLabel(keyResult.type),
          contributionTypeLabel: formatKeyResultContributionTypeLabel(keyResult.contribution_type),
          target: keyResult.target,
          current: keyResult.current,
          unit: keyResult.unit,
          progress,
          expectedProgress,
          scheduleGap,
          requiredPerWeek,
          paceLabel: paceAssessment.paceLabel,
          paceNote: paceAssessment.paceNote,
          health,
          responsibleDepartmentName:
            rawData.departmentNamesById[keyResult.responsible_department_id ?? ""] ?? "Chưa gán phòng ban",
          startDate: keyResult.start_date,
          endDate: keyResult.end_date,
          daysRemaining,
          allocationModeLabel: getSupportAllocationModeLabel(keyResult.unit),
          supportedDirectKeyResults: outboundSupportLinks
            .map((link) => {
              const targetKeyResult = link.target_key_result_id ? allKeyResultsById[link.target_key_result_id] ?? null : null;
              if (!targetKeyResult) {
                return null;
              }
              return {
                id: targetKeyResult.id,
                name: targetKeyResult.name,
                goalName: targetKeyResult.goal_id
                  ? allGoalsById[targetKeyResult.goal_id]?.name ?? "Chưa có mục tiêu"
                  : "Chưa có mục tiêu",
                allocationLabel: getSupportAllocationLabel({
                  allocatedValue: link.allocated_value,
                  allocatedPercent: link.allocated_percent,
                  unit: keyResult.unit,
                }),
              };
            })
            .filter(
              (
                value,
              ): value is {
                id: string;
                name: string;
                goalName: string;
                allocationLabel: string;
              } => Boolean(value),
            ),
          riskNote: getKeyResultRiskNote({
            progress,
            endDate: keyResult.end_date,
            supportedDirectCount: outboundSupportLinks.length,
          }),
        } satisfies DepartmentSupportKeyResultItem;
      }),
    );

    const trackedGoalItems = goalItems.filter((goal) => !["completed", "cancelled"].includes(goal.status));
    const goalPerformance = averageRounded(trackedGoalItems.map((goal) => goal.progress));
    const keyResultPerformance = averageRounded(
      [...directKeyResults, ...supportKeyResults].map((keyResult) => goalContextKeyResultProgressMap[keyResult.id] ?? 0),
    );
    const businessPerformance = computePortfolioPerformance(directKeyResults, goalContextKeyResultProgressMap);
    const supportPerformance = averageRounded(
      supportKeyResults.map((keyResult) => goalContextKeyResultProgressMap[keyResult.id] ?? 0),
    );
    const overallPerformance = averageRounded([goalPerformance, businessPerformance, supportPerformance]);

    const visibleDepartmentTasks = rawData.tasks.filter((task) =>
      task.key_result_id ? departmentVisibleKeyResults.some((keyResult) => keyResult.id === task.key_result_id) : false,
    );

    const memberContribution = rawData.memberIds
      .map((memberId) => {
        const ownedGoals = goalItems.filter((goal) => goal.owners.some((owner) => owner.id === memberId));
        const assignedTasks = visibleDepartmentTasks.filter((task) => getTaskAssigneeId(task) === memberId);
        const assignedKeyResultIds = [
          ...new Set(
            assignedTasks
              .map((task) => task.key_result_id)
              .filter((value): value is string => Boolean(value)),
          ),
        ];
        const assignedKeyResults = departmentVisibleKeyResults.filter((keyResult) => assignedKeyResultIds.includes(keyResult.id));
        const goalIdsFromAssignedKeyResults = [
          ...new Set(
            assignedKeyResults
              .map((keyResult) => keyResult.goal_id)
              .filter((value): value is string => Boolean(value)),
          ),
        ];
        const performanceInputs = [
          ...ownedGoals.map((goal) => goal.progress),
          ...assignedKeyResults.map((keyResult) => goalContextKeyResultProgressMap[keyResult.id] ?? 0),
        ];
        const performanceScore = averageRounded(performanceInputs);
        const overdueTasks = assignedTasks.filter((task) => isTaskOverdue(task)).length;
        const blockedTasks = 0;

        return {
          id: memberId,
          name: rawData.profilesById[memberId] ?? "Không rõ",
          roleName: rawData.memberRolesById[memberId] ?? "Không rõ vai trò",
          goalsInvolved: new Set([...ownedGoals.map((goal) => goal.id), ...goalIdsFromAssignedKeyResults]).size,
          keyResultsInvolved: assignedKeyResultIds.length,
          performanceScore,
          overdueTasks,
          blockedTasks,
          status: getMemberContributionStatus({ performanceScore, overdueTasks, blockedTasks }),
          signalText: getMemberSignalText({ performanceScore, overdueTasks, blockedTasks }),
        } satisfies DepartmentMemberContributionItem;
      })
      .filter((member) => {
        if (filters.memberId !== "all") {
          return member.id === filters.memberId;
        }
        return member.goalsInvolved > 0 || member.keyResultsInvolved > 0;
      })
      .sort((a, b) => {
        const statusRank = { bottleneck: 0, watching: 1, strong: 2 };
        const statusDiff = statusRank[a.status] - statusRank[b.status];
        if (statusDiff !== 0) {
          return statusDiff;
        }
        return (b.performanceScore ?? 0) - (a.performanceScore ?? 0);
      });

    const executionContextItems = departmentVisibleKeyResults
      .map((keyResult) => {
        const tasks = tasksByKeyResultId[keyResult.id] ?? [];
        const overdueTasks = tasks.filter((task) => isTaskOverdue(task)).length;
        const blockedTasks = 0;
        const openTasks = tasks.length;
        const completionRate = 0;
        return {
          keyResultId: keyResult.id,
          keyResultName: keyResult.name,
          goalName: keyResult.goal_id ? allGoalsById[keyResult.goal_id]?.name ?? "Chưa có mục tiêu" : "Chưa có mục tiêu",
          overdueTasks,
          blockedTasks,
          openTasks,
          completionRate,
        } satisfies DepartmentExecutionContextItem;
      })
      .filter((item) => item.overdueTasks > 0 || item.blockedTasks > 0 || item.openTasks > 0)
      .sort((a, b) => {
        if (a.overdueTasks !== b.overdueTasks) {
          return b.overdueTasks - a.overdueTasks;
        }
        if (a.blockedTasks !== b.blockedTasks) {
          return b.blockedTasks - a.blockedTasks;
        }
        return b.openTasks - a.openTasks;
      })
      .slice(0, 6);

    const riskDeadlines = [
      ...goalItems
        .filter((goal) => goal.endDate)
        .map((goal) => ({
          id: goal.id,
          entityType: "goal" as const,
          name: goal.name,
          parentName: "Mục tiêu",
          endDate: goal.endDate as string,
          progress: goal.progress,
          health: goal.health,
          daysRemaining: goal.daysRemaining,
          reason: goal.riskNote,
        })),
      ...[...directKeyResultItems, ...supportKeyResultItems]
        .filter((keyResult) => keyResult.endDate)
        .map((keyResult) => ({
          id: keyResult.id,
          entityType: "key_result" as const,
          name: keyResult.name,
          parentName: keyResult.goalName,
          endDate: keyResult.endDate as string,
          progress: keyResult.progress,
          health: keyResult.health,
          daysRemaining: keyResult.daysRemaining,
          reason: keyResult.riskNote,
        })),
    ]
      .filter((item) => item.daysRemaining !== null && item.daysRemaining >= 0 && item.daysRemaining <= 7 && item.progress < 100)
      .sort((a, b) => {
        const aTime = new Date(a.endDate).getTime();
        const bTime = new Date(b.endDate).getTime();
        if (aTime !== bTime) {
          return aTime - bTime;
        }
        return a.progress - b.progress;
      })
      .slice(0, 6);

    const sortedVisibleGoals = sortGoalsByPeriod(visibleGoals);
    const trendBucketKeys = [...new Set(sortedVisibleGoals.map((goal) => getPeriodKey(goal)))];
    const trendPoints =
      trendBucketKeys.length >= 2
        ? trendBucketKeys.map((bucketKey) => {
            const goalsInBucket = visibleGoals.filter((goal) => getPeriodKey(goal) === bucketKey);
            const goalIdsInBucket = new Set(goalsInBucket.map((goal) => goal.id));
            const departmentKeyResultsInBucket = departmentScopeKeyResults.filter(
              (keyResult) => keyResult.goal_id && goalIdsInBucket.has(keyResult.goal_id),
            );
            const directKeyResultsInBucket = departmentKeyResultsInBucket.filter(
              (keyResult) => normalizeKeyResultContributionTypeValue(keyResult.contribution_type) === "direct",
            );
            const supportKeyResultsInBucket = departmentKeyResultsInBucket.filter(
              (keyResult) => normalizeKeyResultContributionTypeValue(keyResult.contribution_type) === "support",
            );
            const trackedGoalsInBucket = goalsInBucket.filter(
              (goal) => !["completed", "cancelled"].includes(goal.status ?? "Chưa đặt"),
            );
            const goalPerformanceInBucket = averageRounded(
              trackedGoalsInBucket.map((goal) => goalProgressMap[goal.id] ?? 0),
            );
            const businessPerformanceInBucket = computePortfolioPerformance(
              directKeyResultsInBucket,
              goalContextKeyResultProgressMap,
            );
            const supportPerformanceInBucket = averageRounded(
              supportKeyResultsInBucket.map((keyResult) => goalContextKeyResultProgressMap[keyResult.id] ?? 0),
            );

            return {
              key: bucketKey,
              label: goalsInBucket[0] ? getPeriodLabel(goalsInBucket[0]) : "Không xác định kỳ",
              overallPerformance: averageRounded([
                goalPerformanceInBucket,
                businessPerformanceInBucket,
                supportPerformanceInBucket,
              ]),
              businessPerformance: businessPerformanceInBucket,
              supportPerformance: supportPerformanceInBucket,
              goalCount: goalsInBucket.length,
              directKrCount: directKeyResultsInBucket.length,
              supportKrCount: supportKeyResultsInBucket.length,
            } satisfies DepartmentTrendPoint;
          })
        : [];

    const goalProgressChartItems: DepartmentGoalChartItem[] = (trackedGoalItems.length > 0 ? trackedGoalItems : goalItems)
      .slice(0, 6)
      .map((goal) => ({
        id: goal.id,
        name: goal.name,
        progress: goal.progress,
        health: goal.health,
        typeLabel: goal.typeLabel,
        ownersSummary: goal.ownersSummary,
      }));

    const krStructureSegments = [
      {
        key: "direct_on_track",
        label: "KR trực tiếp đạt tiến độ",
        count: directKeyResultItems.filter((item) => !isNeedsAttention(item.health)).length,
        note: `${directKeyResultItems.length} KR trực tiếp trong phạm vi`,
      },
      {
        key: "support_on_track",
        label: "KR hỗ trợ đạt tiến độ",
        count: supportKeyResultItems.filter((item) => !isNeedsAttention(item.health)).length,
        note: `${supportKeyResultItems.length} KR hỗ trợ trong phạm vi`,
      },
      {
        key: "needs_attention",
        label: "KR chậm hoặc rủi ro",
        count:
          directKeyResultItems.filter((item) => isNeedsAttention(item.health)).length +
          supportKeyResultItems.filter((item) => isNeedsAttention(item.health)).length,
        note: "Bao gồm KR trực tiếp và KR hỗ trợ đang dưới ngưỡng an toàn",
      },
    ] satisfies DepartmentKrStructureSegment[];

    const ownerOptions = Object.values(
      primaryGoals.reduce<Record<string, { id: string; name: string }>>((acc, goal) => {
        (rawData.goalOwnersByGoalId[goal.id] ?? []).forEach((owner) => {
          acc[owner.id] = {
            id: owner.id,
            name: owner.name,
          };
        });
        return acc;
      }, {}),
    ).sort((a, b) => a.name.localeCompare(b.name, "vi"));

    const memberOptions = rawData.memberIds
      .map((memberId) => ({
        id: memberId,
        name: rawData.profilesById[memberId] ?? "Không rõ",
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));

    return {
      summary: {
        departmentName: rawData.departmentName,
        goalPerformance,
        keyResultPerformance,
        overallPerformance,
        businessPerformance,
        supportPerformance,
        goalsAtRisk: trackedGoalItems.filter(
          (goal) => isNeedsAttention(goal.health) || goal.directKrRiskCount > 0 || goal.supportKrRiskCount > 0,
        ).length,
        goalsOnTrack: trackedGoalItems.filter((goal) => ["on_track", "achieved"].includes(goal.health)).length,
        totalGoals: goalItems.length,
        trackedGoals: trackedGoalItems.length,
        directKrCount: directKeyResultItems.length,
        supportKrCount: supportKeyResultItems.length,
      },
      analytics: {
        trend: trendPoints,
        goalProgress: goalProgressChartItems,
        krStructure: {
          total: directKeyResultItems.length + supportKeyResultItems.length,
          segments: krStructureSegments,
        },
      },
      goals: goalItems,
      directKeyResults: directKeyResultItems,
      supportKeyResults: supportKeyResultItems,
      risks: {
        goals: goalItems
          .filter((goal) => isNeedsAttention(goal.health) || goal.directKrRiskCount > 0 || goal.supportKrRiskCount > 0)
          .slice(0, 4),
        directKeyResults: directKeyResultItems.filter((keyResult) => isNeedsAttention(keyResult.health)).slice(0, 4),
        supportKeyResults: supportKeyResultItems.filter((keyResult) => isNeedsAttention(keyResult.health)).slice(0, 4),
        upcomingDeadlines: riskDeadlines,
      },
      memberContribution,
      executionContext: {
        overdueTasks: visibleDepartmentTasks.filter((task) => isTaskOverdue(task)).length,
        blockedTasks: 0,
        openTasks: visibleDepartmentTasks.length,
        items: executionContextItems,
      } satisfies DepartmentExecutionContext,
      filterOptions: {
        statusOptions: [
          ...new Set(primaryGoals.map((goal) => (goal.status ? String(goal.status) : "Chưa đặt"))),
        ],
        quarterOptions: sortUniqueNumbers(primaryGoals.map((goal) => goal.quarter), "asc"),
        yearOptions: sortUniqueNumbers(primaryGoals.map((goal) => goal.year), "desc"),
        ownerOptions,
        memberOptions,
      },
    };
  }, [filters, rawData]);

  return {
    isLoading,
    error,
    ...filtered,
  };
}
