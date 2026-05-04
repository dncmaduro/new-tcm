"use client";

import { useEffect, useState } from "react";
import { collectAttendanceIds, mergeAttendanceRowsByDate, type AttendanceTimeRow } from "@/lib/attendance";
import { fetchHolidaysInRange } from "@/lib/holidays";
import { getTimeRequestTypeLabel, type TimeRequestType } from "@/lib/constants/time-requests";
import {
  buildCompletedTrend,
  buildGoalProgressItems,
  formatActivityMessage,
  formatDateKey,
  formatRelativeTimeVi,
  formatTimeVi,
  getDashboardTaskProgress,
  getDateDiffFromToday,
  getWorkedMinutes,
  normalizeDashboardTaskStatus,
  sortPriorityTasks,
  toTaskBadgeMeta,
  type DashboardActivityItem,
  type DashboardDeadlineItem,
  type DashboardGoalItem,
  type DashboardPayload,
  type DashboardPriorityTaskItem,
  type DashboardRoleScope,
  type DashboardSummaryCard,
  type DashboardTaskStatus,
  type DashboardTimeTrackerData,
  type DashboardWeeklyPerformance,
} from "@/lib/dashboard";
import { buildKeyResultProgressMap } from "@/lib/okr";
import { supabase } from "@/lib/supabase";

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
  attendance_id?: number | null;
};

type RoleRow = {
  id: string;
  name: string | null;
};

type DepartmentRow = {
  id: string;
  name: string;
  parent_department_id: string | null;
};

type UserRoleRow = {
  profile_id: string | null;
  department_id: string | null;
  role_id: string | null;
};

type GoalRow = {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  quarter: number | null;
  year: number | null;
  department_id: string | null;
  target: number | null;
  unit: string | null;
  start_date: string | null;
  end_date: string | null;
};

type GoalDepartmentRow = {
  goal_id: string | null;
  department_id: string | null;
  role: string | null;
};

type GoalOwnerRow = {
  goal_id: string | null;
  profile_id: string | null;
};

type KeyResultRow = {
  id: string;
  goal_id: string | null;
  name: string;
  contribution_type: string | null;
  current: number | null;
  target: number | null;
  unit: string | null;
  start_value: number | null;
  weight: number | null;
  responsible_department_id: string | null;
};

type TaskQueryRow = {
  id: string;
  name: string;
  assignee_id: string | null;
  profile_id: string | null;
  type: string | null;
  priority: string | null;
  current: number | null;
  target: number | null;
  weight: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  key_result_id: string | null;
  key_result?: unknown;
};

type TimesProfileLinkRow = {
  attendance_id: number | null;
};

type ActivityLogRow = {
  id: string;
  profile_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  action: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string | null;
};

type TimeRequestReviewerRow = {
  is_approved: boolean | null;
  reviewed_at: string | null;
  created_at: string | null;
};

type TimeRequestRow = {
  id: string;
  date: string | null;
  type: TimeRequestType | null;
  minutes: number | null;
  reason: string | null;
  remote_check_in: string | null;
  remote_check_out: string | null;
  created_at: string | null;
  time_request_reviewers?: TimeRequestReviewerRow[] | null;
};

type NormalizedTask = {
  id: string;
  name: string;
  assigneeId: string | null;
  assigneeName: string;
  status: DashboardTaskStatus;
  progress: number;
  priority: string | null;
  executionStartAt: string | null;
  executionEndAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  type: string | null;
  keyResultId: string | null;
  keyResultName: string | null;
  goalId: string | null;
  goalName: string | null;
};

const GENERIC_ERROR = "Không tải được dữ liệu. Vui lòng thử lại.";

const defaultPayload: DashboardPayload = {
  profile: null,
  summaryCards: [],
  priorityTasks: [],
  goalProgress: [],
  taskTrend: [],
  timeTracker: {
    statusLabel: "Chưa check-in",
    checkInAt: null,
    checkOutAt: null,
    workedMinutes: 0,
    isRunning: false,
    empty: true,
    isHoliday: false,
    holidayName: null,
    badges: [],
  },
  upcomingDeadlines: [],
  recentActivities: [],
  weeklyPerformance: {
    title: "Công việc tuần này",
    completedTasks: 0,
    totalTasks: 0,
    progress: 0,
    note: null,
    ctaLabel: "Xem công việc",
    ctaHref: "/tasks",
  },
};

const TASK_SELECT = `
  id,
  name,
  assignee_id,
  profile_id,
  type,
  priority,
  current,
  target,
  weight,
  start_date,
  end_date,
  created_at,
  updated_at,
  key_result_id,
  key_result:key_results!tasks_key_result_id_fkey(
    id,
    goal_id,
    name,
    start_date,
    end_date,
    goal:goals!key_results_goal_id_fkey(
      id,
      name,
      start_date,
      end_date
    )
  )
`;

const normalizeRoleName = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const getCurrentQuarter = (now: Date) => Math.floor(now.getMonth() / 3) + 1;

const uniqueById = <TItem extends { id: string }>(items: TItem[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
};

const buildProfileLabel = (profile: ProfileRow) =>
  profile.name?.trim() || profile.email?.trim() || "Không rõ";

const normalizeKeyResult = (value: unknown) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const rawGoal = Array.isArray(record.goal) ? record.goal[0] ?? null : record.goal;
  const goal =
    rawGoal && typeof rawGoal === "object"
      ? {
          id: String((rawGoal as Record<string, unknown>).id),
          name: String((rawGoal as Record<string, unknown>).name),
        }
      : null;

  return {
    id: String(record.id),
    goal_id: record.goal_id ? String(record.goal_id) : null,
    name: String(record.name),
    goal,
  };
};

const normalizeTaskRows = (
  rows: TaskQueryRow[],
  profilesById: Record<string, string>,
  now: Date,
) =>
  rows.map((row) => {
    const keyResult = normalizeKeyResult(Array.isArray(row.key_result) ? row.key_result[0] ?? null : row.key_result);
    const assigneeId = row.assignee_id ? String(row.assignee_id) : row.profile_id ? String(row.profile_id) : null;
    const progress = getDashboardTaskProgress({
      current: row.current,
      target: row.target,
      type: row.type,
    });
    const status = normalizeDashboardTaskStatus({
      progress,
      dueDateAt: row.end_date,
      now,
    });

    return {
      id: String(row.id),
      name: String(row.name),
      assigneeId,
      assigneeName: assigneeId ? profilesById[assigneeId] ?? "Chưa gán" : "Chưa gán",
      status,
      progress,
      priority: row.priority ? String(row.priority) : null,
      executionStartAt: row.start_date ? String(row.start_date) : null,
      executionEndAt: row.end_date ? String(row.end_date) : null,
      createdAt: row.created_at ? String(row.created_at) : null,
      updatedAt: row.updated_at ? String(row.updated_at) : null,
      type: row.type ? String(row.type) : null,
      keyResultId: row.key_result_id ? String(row.key_result_id) : null,
      keyResultName: keyResult?.name ?? null,
      goalId: keyResult?.goal?.id ?? (keyResult?.goal_id ? String(keyResult.goal_id) : null),
      goalName: keyResult?.goal?.name ?? null,
    } satisfies NormalizedTask;
  });

const mergeTaskRows = (groups: TaskQueryRow[][]) =>
  uniqueById(
    groups
      .flat()
      .map((row) => ({
        ...row,
        id: String(row.id),
      })),
  );

const isGoalActive = (status: string | null | undefined) => !["draft", "cancelled"].includes(String(status ?? "").toLowerCase());

const getRoleScope = (
  memberships: UserRoleRow[],
  rolesById: Record<string, string>,
): DashboardRoleScope => {
  const roleNames = memberships.map((membership) =>
    membership.role_id ? normalizeRoleName(rolesById[membership.role_id] ?? null) : "",
  );

  if (roleNames.some((roleName) => roleName.includes("director") || roleName.includes("giam doc"))) {
    return "director";
  }

  if (roleNames.some((roleName) => roleName.includes("leader"))) {
    return "leader";
  }

  return "member";
};

const toRequestStatus = (reviewers: TimeRequestReviewerRow[] | null | undefined) => {
  if (!reviewers || reviewers.length === 0) {
    return "pending";
  }
  if (reviewers.some((item) => item.is_approved === false)) {
    return "rejected";
  }
  if (reviewers.every((item) => item.is_approved === true)) {
    return "approved";
  }
  return "pending";
};

const getTimeRequestBadgeLabel = (type: TimeRequestType | null) => {
  if (type === "remote") {
    return "Làm việc từ xa";
  }
  if (type === "overtime") {
    return "Tăng ca";
  }
  if (type === "approved_leave") {
    return "Nghỉ có phép";
  }
  if (type === "unauthorized_leave") {
    return "Thiếu công không phép";
  }
  return getTimeRequestTypeLabel(type);
};

const getTimeRequestBadgeClassName = (
  type: TimeRequestType | null,
  status: "pending" | "approved" | "rejected",
) => {
  if (status === "rejected") {
    return "bg-rose-50 text-rose-700";
  }

  if (type === "overtime") {
    return "bg-amber-50 text-amber-700";
  }

  if (type === "remote") {
    return "bg-blue-50 text-blue-700";
  }

  if (type === "approved_leave") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (type === "unauthorized_leave") {
    return "bg-slate-100 text-slate-700";
  }

  return status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700";
};

const buildTimeTracker = ({
  timeRows,
  requests,
  holidayName,
  now,
}: {
  timeRows: AttendanceTimeRow[];
  requests: TimeRequestRow[];
  holidayName: string | null;
  now: Date;
}): DashboardTimeTrackerData => {
  const mergedRow = mergeAttendanceRowsByDate(timeRows)[0] ?? null;
  const checkInAt = mergedRow?.check_in ?? null;
  const checkOutAt = mergedRow?.check_out ?? null;
  const isRunning = Boolean(checkInAt && !checkOutAt);
  const workedMinutes = getWorkedMinutes(checkInAt, checkOutAt, now);

  const badges = requests.map((request) => {
    const reviewStatus = toRequestStatus(request.time_request_reviewers);
    return {
      label:
        reviewStatus === "approved"
          ? `${getTimeRequestBadgeLabel(request.type)} đã duyệt`
          : reviewStatus === "rejected"
            ? `${getTimeRequestBadgeLabel(request.type)} bị từ chối`
            : getTimeRequestBadgeLabel(request.type),
      className: getTimeRequestBadgeClassName(request.type, reviewStatus),
    };
  });

  const primaryRequest = requests[0] ?? null;
  const primaryRequestStatus = primaryRequest ? toRequestStatus(primaryRequest.time_request_reviewers) : null;
  const primaryRequestLabel = primaryRequest ? getTimeRequestBadgeLabel(primaryRequest.type) : null;

  return {
    statusLabel: (() => {
      if (holidayName) {
        return "Ngày nghỉ";
      }
      if (!checkInAt && primaryRequestLabel) {
        if (primaryRequestStatus === "approved") {
          return primaryRequestLabel;
        }
        if (primaryRequestStatus === "rejected") {
          return `${primaryRequestLabel} bị từ chối`;
        }
        return `${primaryRequestLabel} chờ duyệt`;
      }
      if (!checkInAt) {
        return "Chưa check-in";
      }
      if (checkInAt && checkOutAt) {
        return "Đã check-out";
      }
      return "Đang làm việc";
    })(),
    checkInAt,
    checkOutAt,
    workedMinutes,
    isRunning,
    empty: !mergedRow && requests.length === 0,
    isHoliday: Boolean(holidayName),
    holidayName,
    badges,
  };
};

const buildTaskRelationLabel = (task: NormalizedTask) => {
  if (task.keyResultName && task.goalName) {
    return `KR: ${task.keyResultName} · ${task.goalName}`;
  }
  if (task.keyResultName) {
    return `KR: ${task.keyResultName}`;
  }
  if (task.goalName) {
    return `Mục tiêu: ${task.goalName}`;
  }
  return null;
};

const buildSummaryCards = ({
  timeTracker,
  todayTasks,
  overdueTasks,
  dueSoonTasks,
  averageGoalProgress,
}: {
  timeTracker: DashboardTimeTrackerData;
  todayTasks: NormalizedTask[];
  overdueTasks: NormalizedTask[];
  dueSoonTasks: NormalizedTask[];
  averageGoalProgress: number | null;
}): DashboardSummaryCard[] => {
  const todayCompleted = todayTasks.filter((task) => task.status === "completed").length;
  const todayRemaining = Math.max(0, todayTasks.length - todayCompleted);

  return [
    {
      title: "Trạng thái hôm nay",
      value: timeTracker.statusLabel,
      note:
        timeTracker.checkInAt && timeTracker.checkOutAt
          ? `${formatTimeVi(timeTracker.checkInAt)} - ${formatTimeVi(timeTracker.checkOutAt)}`
          : timeTracker.checkInAt
            ? formatTimeVi(timeTracker.checkInAt)
            : timeTracker.isHoliday
              ? "Ngày nghỉ"
              : "Chưa có dữ liệu",
      tone: timeTracker.isRunning ? "emerald" : timeTracker.checkInAt ? "blue" : "slate",
      ctaLabel: !timeTracker.checkInAt && !timeTracker.isHoliday ? "Chấm công" : null,
      ctaHref: !timeTracker.checkInAt && !timeTracker.isHoliday ? "/timesheet" : null,
    },
    {
      title: "Công việc hôm nay",
      value: String(todayTasks.length),
      note:
        todayTasks.length === 0
          ? "Không có dữ liệu"
          : `${todayCompleted} hoàn thành`,
      tone: todayRemaining > 0 ? "blue" : "slate",
    },
    {
      title: "Việc sắp quá hạn",
      value: String(overdueTasks.length + dueSoonTasks.length),
      note:
        overdueTasks.length > 0
          ? `${overdueTasks.length} quá hạn`
          : dueSoonTasks.length > 0
            ? `${dueSoonTasks.length} sắp đến hạn`
            : "Không có dữ liệu",
      tone: overdueTasks.length > 0 ? "amber" : "slate",
      ctaLabel: overdueTasks.length + dueSoonTasks.length > 0 ? "Xem công việc" : null,
      ctaHref: overdueTasks.length + dueSoonTasks.length > 0 ? "/tasks" : null,
    },
    {
      title: "Tiến độ mục tiêu",
      value: averageGoalProgress === null ? "--" : `${averageGoalProgress}%`,
      note: averageGoalProgress === null ? "Chưa có dữ liệu" : "Trung bình",
      tone: averageGoalProgress !== null && averageGoalProgress >= 70 ? "emerald" : "blue",
      ctaLabel: averageGoalProgress !== null ? "Xem mục tiêu" : null,
      ctaHref: averageGoalProgress !== null ? "/goals" : null,
    },
  ];
};

const buildFallbackActivities = (
  tasks: NormalizedTask[],
  now: Date,
): DashboardActivityItem[] =>
  tasks
    .filter((task) => task.updatedAt)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .slice(0, 10)
    .map((task) => ({
      id: `task-${task.id}`,
      message:
        task.status === "completed"
          ? `Hoàn thành công việc ${task.name}`
          : `Cập nhật công việc ${task.name}`,
      when: formatRelativeTimeVi(task.updatedAt, now),
    }));

const toValidDate = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map((item) => Number(item));
    const localDate = new Date(year, (month ?? 1) - 1, day ?? 1);
    return Number.isNaN(localDate.getTime()) ? null : localDate;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isTaskInWeek = (task: NormalizedTask, weekStart: Date, weekEnd: Date) => {
  const startAt = toValidDate(task.executionStartAt);
  const endAt = toValidDate(task.executionEndAt);
  const createdAt = toValidDate(task.createdAt);
  const updatedAt = toValidDate(task.updatedAt);

  if (startAt && endAt) {
    return startAt <= weekEnd && endAt >= weekStart;
  }

  if (endAt) {
    return endAt >= weekStart && endAt <= weekEnd;
  }

  if (startAt) {
    return startAt >= weekStart && startAt <= weekEnd;
  }

  if (updatedAt) {
    return updatedAt >= weekStart && updatedAt <= weekEnd;
  }

  return createdAt ? createdAt >= weekStart && createdAt <= weekEnd : false;
};

export function useDashboardData() {
  const [data, setData] = useState<DashboardPayload>(defaultPayload);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadTasksByProfileIds = async (profileIds: string[]) => {
      if (profileIds.length === 0) {
        return [] as TaskQueryRow[];
      }

      const [assigneeResult, ownerResult] = await Promise.all([
        supabase.from("tasks").select(TASK_SELECT).in("assignee_id", profileIds).order("updated_at", { ascending: false }),
        supabase.from("tasks").select(TASK_SELECT).in("profile_id", profileIds).order("updated_at", { ascending: false }),
      ]);

      if (assigneeResult.error) {
        throw assigneeResult.error;
      }
      if (ownerResult.error) {
        throw ownerResult.error;
      }

      return mergeTaskRows([
        (assigneeResult.data ?? []) as TaskQueryRow[],
        (ownerResult.data ?? []) as TaskQueryRow[],
      ]);
    };

    const loadGoalsByIds = async (goalIds: string[]) => {
      if (goalIds.length === 0) {
        return [] as GoalRow[];
      }

      const { data: goalRows, error: goalError } = await supabase
        .from("goals")
        .select("id,name,type,status,quarter,year,department_id,target,unit,start_date,end_date")
        .in("id", goalIds);

      if (goalError) {
        throw goalError;
      }

      return (goalRows ?? []) as GoalRow[];
    };

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
          throw new Error(authError?.message || "Không xác thực được người dùng.");
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id,name,email,attendance_id")
          .eq("user_id", authData.user.id)
          .maybeSingle();

        if (profileError || !profileData?.id) {
          throw new Error(profileError?.message || "Không tìm thấy hồ sơ người dùng.");
        }

        const profileId = String(profileData.id);
        const profileName = profileData.name?.trim() || profileData.email?.trim() || "Thành viên";

        const [
          attendanceLinkResult,
          roleResult,
          membershipResult,
          departmentResult,
          profileListResult,
          ownerGoalResult,
        ] = await Promise.all([
          supabase.from("times_profiles").select("attendance_id").eq("profile_id", profileId),
          supabase.from("roles").select("id,name"),
          supabase.from("user_role_in_department").select("profile_id,department_id,role_id").eq("profile_id", profileId),
          supabase.from("departments").select("id,name,parent_department_id"),
          supabase.from("profiles").select("id,name,email"),
          supabase.from("goal_owners").select("goal_id,profile_id").eq("profile_id", profileId),
        ]);

        if (attendanceLinkResult.error) {
          throw attendanceLinkResult.error;
        }
        if (roleResult.error) {
          throw roleResult.error;
        }
        if (membershipResult.error) {
          throw membershipResult.error;
        }
        if (departmentResult.error) {
          throw departmentResult.error;
        }
        if (profileListResult.error) {
          throw profileListResult.error;
        }
        if (ownerGoalResult.error) {
          throw ownerGoalResult.error;
        }

        const rolesById = ((roleResult.data ?? []) as RoleRow[]).reduce<Record<string, string>>((acc, role) => {
          acc[String(role.id)] = role.name?.trim() || "";
          return acc;
        }, {});
        const memberships = (membershipResult.data ?? []) as UserRoleRow[];
        const roleScope = getRoleScope(memberships, rolesById);

        const departments = (departmentResult.data ?? []) as DepartmentRow[];
        const departmentsById = departments.reduce<Record<string, string>>((acc, department) => {
          acc[String(department.id)] = String(department.name);
          return acc;
        }, {});
        const departmentIds = [
          ...new Set(
            memberships
              .map((item) => item.department_id)
              .filter((item): item is string => Boolean(item))
              .map((item) => String(item)),
          ),
        ];
        const primaryDepartmentName = departmentIds[0] ? departmentsById[departmentIds[0]] ?? null : null;

        const profileRows = (profileListResult.data ?? []) as ProfileRow[];
        const profilesById = profileRows.reduce<Record<string, string>>((acc, profile) => {
          acc[String(profile.id)] = buildProfileLabel(profile);
          return acc;
        }, {});

        const teammateResult =
          roleScope === "member" || departmentIds.length === 0
            ? { data: [] as UserRoleRow[], error: null }
            : await supabase
                .from("user_role_in_department")
                .select("profile_id,department_id,role_id")
                .in("department_id", departmentIds);

        if (teammateResult.error) {
          throw teammateResult.error;
        }

        const teammateRows = (teammateResult.data ?? []) as UserRoleRow[];

        const attendanceIds = collectAttendanceIds([
          profileData.attendance_id,
          ...((attendanceLinkResult.data ?? []) as TimesProfileLinkRow[]),
        ]);

        const allProfileIds = profileRows.map((profile) => String(profile.id));
        const scopeProfileIds =
          roleScope === "director"
            ? allProfileIds
            : roleScope === "leader"
              ? [
                  ...new Set(
                    teammateRows
                      .map((item) => item.profile_id)
                      .filter((item): item is string => Boolean(item))
                      .map((item) => String(item)),
                  ),
                ]
              : [profileId];

        const today = new Date();
        const todayIso = formatDateKey(today);
        const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        const currentQuarter = getCurrentQuarter(today);
        const currentYear = today.getFullYear();
        const [todayHoliday] = await fetchHolidaysInRange(supabase, today, today);

        const [
          myTaskRows,
          scopeTaskRows,
          timeRowsResult,
          timeRequestResult,
          activityResult,
        ] = await Promise.all([
          loadTasksByProfileIds([profileId]),
          roleScope === "member" ? Promise.resolve([] as TaskQueryRow[]) : loadTasksByProfileIds(scopeProfileIds),
          attendanceIds.length > 0
            ? supabase
                .from("times")
                .select("id,attendance_id,date,check_in,check_out,created_at,updated_at")
                .in("attendance_id", attendanceIds)
                .eq("date", todayIso)
                .order("updated_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from("time_requests")
            .select("id,date,type,minutes,reason,remote_check_in,remote_check_out,created_at,time_request_reviewers(is_approved,reviewed_at,created_at)")
            .eq("profile_id", profileId)
            .eq("date", todayIso)
            .order("created_at", { ascending: false }),
          scopeProfileIds.length > 0
            ? supabase
                .from("activity_logs")
                .select("id,profile_id,entity_type,entity_id,action,old_value,new_value,created_at")
                .in("profile_id", scopeProfileIds)
                .in("entity_type", ["goal", "key_result", "task", "time_request"])
                .order("created_at", { ascending: false })
                .limit(10)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if ("error" in timeRowsResult && timeRowsResult.error) {
          throw timeRowsResult.error;
        }
        if (timeRequestResult.error) {
          throw timeRequestResult.error;
        }
        if ("error" in activityResult && activityResult.error) {
          throw activityResult.error;
        }

        const normalizedMyTasks = normalizeTaskRows(myTaskRows, profilesById, today);
        const normalizedScopeTasks =
          roleScope === "member"
            ? normalizedMyTasks
            : normalizeTaskRows(scopeTaskRows, profilesById, today);

        const ownerGoalIds = [
          ...new Set(
            ((ownerGoalResult.data ?? []) as GoalOwnerRow[])
              .map((item) => item.goal_id)
              .filter((item): item is string => Boolean(item))
              .map((item) => String(item)),
          ),
        ];
        const taskGoalIds = [
          ...new Set(
            normalizedMyTasks
              .map((task) => task.goalId)
              .filter((item): item is string => Boolean(item)),
          ),
        ];

        const memberRelevantGoalIds = [...new Set([...ownerGoalIds, ...taskGoalIds])];

        const departmentGoalResult =
          roleScope === "member"
            ? Promise.resolve({ data: [] as GoalRow[], error: null })
            : roleScope === "director"
              ? supabase
                  .from("goals")
                  .select("id,name,type,status,quarter,year,department_id,target,unit,start_date,end_date")
                  .eq("year", currentYear)
                  .eq("quarter", currentQuarter)
              : departmentIds.length > 0
                ? supabase
                    .from("goals")
                    .select("id,name,type,status,quarter,year,department_id,target,unit,start_date,end_date")
                    .in("department_id", departmentIds)
                    .eq("year", currentYear)
                    .eq("quarter", currentQuarter)
                : Promise.resolve({ data: [] as GoalRow[], error: null });

        const memberGoalRowsPromise =
          roleScope === "member" && memberRelevantGoalIds.length > 0
            ? loadGoalsByIds(memberRelevantGoalIds)
            : Promise.resolve([] as GoalRow[]);

        const [memberGoalRows, departmentGoalRows] = await Promise.all([
          memberGoalRowsPromise,
          departmentGoalResult,
        ]);

        if ("error" in departmentGoalRows && departmentGoalRows.error) {
          throw departmentGoalRows.error;
        }

        const goals =
          roleScope === "member"
            ? memberGoalRows.length > 0
              ? memberGoalRows
              : ((departmentGoalRows.data ?? []) as GoalRow[])
            : ((departmentGoalRows.data ?? []) as GoalRow[]);

        const filteredGoals = uniqueById(
          goals
            .filter((goal) => isGoalActive(goal.status))
            .filter((goal) => {
              if (roleScope !== "member") {
                return true;
              }

              if (memberRelevantGoalIds.length === 0) {
                return goal.quarter === currentQuarter && goal.year === currentYear;
              }

              return memberRelevantGoalIds.includes(String(goal.id));
            })
            .map((goal) => ({
              ...goal,
              id: String(goal.id),
            })),
        );

        const relevantGoalIds = filteredGoals.map((goal) => goal.id);

        const [goalDepartmentsResult, keyResultsResult] = await Promise.all([
          relevantGoalIds.length > 0
            ? supabase.from("goal_departments").select("goal_id,department_id,role").in("goal_id", relevantGoalIds)
            : Promise.resolve({ data: [], error: null }),
          relevantGoalIds.length > 0
            ? supabase
                .from("key_results")
                .select("id,goal_id,name,contribution_type,current,target,unit,start_value,weight,responsible_department_id")
                .in("goal_id", relevantGoalIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if ("error" in goalDepartmentsResult && goalDepartmentsResult.error) {
          throw goalDepartmentsResult.error;
        }
        if ("error" in keyResultsResult && keyResultsResult.error) {
          throw keyResultsResult.error;
        }

        const allGoalProgress = buildGoalProgressItems({
          goals: filteredGoals.map((goal) => ({
            id: String(goal.id),
            name: String(goal.name),
            type: goal.type ?? null,
            status: goal.status ?? null,
            department_id: goal.department_id ? String(goal.department_id) : null,
            target: typeof goal.target === "number" ? goal.target : Number(goal.target ?? 0),
            unit: goal.unit ? String(goal.unit) : null,
            end_date: goal.end_date ? String(goal.end_date) : null,
          })),
          goalDepartments: ((goalDepartmentsResult.data ?? []) as GoalDepartmentRow[]).map((item) => ({
            goal_id: item.goal_id ? String(item.goal_id) : null,
            department_id: item.department_id ? String(item.department_id) : null,
            role: item.role ? String(item.role) : null,
          })),
          keyResults: ((keyResultsResult.data ?? []) as KeyResultRow[]).map((item) => ({
            id: String(item.id),
            goal_id: item.goal_id ? String(item.goal_id) : null,
            contribution_type: item.contribution_type ? String(item.contribution_type) : null,
            start_value: typeof item.start_value === "number" ? item.start_value : Number(item.start_value ?? 0),
            current: typeof item.current === "number" ? item.current : Number(item.current ?? 0),
            target: typeof item.target === "number" ? item.target : Number(item.target ?? 0),
            weight: typeof item.weight === "number" ? item.weight : Number(item.weight ?? 1),
          })),
          departmentNamesById: departmentsById,
          now: today,
        }).sort((left, right) => right.progress - left.progress) as DashboardGoalItem[];

        const averageGoalProgress =
          allGoalProgress.length > 0
            ? Math.round(allGoalProgress.reduce((sum, goal) => sum + goal.progress, 0) / allGoalProgress.length)
            : null;

        const timeTracker = buildTimeTracker({
          timeRows: ((timeRowsResult.data ?? []) as AttendanceTimeRow[]) ?? [],
          requests: (timeRequestResult.data ?? []) as TimeRequestRow[],
          holidayName: todayHoliday?.name?.trim() || null,
          now: today,
        });

        const activeMyTasks = normalizedMyTasks.filter((task) => task.status !== "completed");
        const todayTasks = normalizedMyTasks.filter((task) => getDateDiffFromToday(task.executionEndAt, today) === 0);
        const overdueTasks = activeMyTasks.filter((task) => task.status === "overdue");
        const dueSoonTasks = activeMyTasks.filter((task) => {
          const diff = getDateDiffFromToday(task.executionEndAt, today);
          return diff !== null && diff > 0 && diff <= 3;
        });

        const summaryCards = buildSummaryCards({
          timeTracker,
          todayTasks,
          overdueTasks,
          dueSoonTasks,
          averageGoalProgress,
        });

        const prioritizedActiveTasks = sortPriorityTasks(
          activeMyTasks.map((task) => ({
            ...task,
            dueDateAt: task.executionEndAt,
          })),
          today,
        );

        const priorityTasks = sortPriorityTasks(
          activeMyTasks.map((task) => ({
            ...task,
            dueDateAt: task.executionEndAt,
          })),
          today,
        )
          .slice(0, 5)
          .map((task) => {
            const badgeMeta = toTaskBadgeMeta({
              status: task.status,
              priority: task.priority,
              dueDateAt: task.executionEndAt,
              now: today,
            });

            return {
              id: task.id,
              name: task.name,
              status: task.status,
              statusLabel: badgeMeta.statusLabel,
              statusClassName: badgeMeta.statusClassName,
              priorityLabel: badgeMeta.priorityLabel,
              priorityClassName: badgeMeta.priorityClassName,
              dueDateAt: task.executionEndAt,
              dueLabel: badgeMeta.dueLabel,
              dueClassName: badgeMeta.dueClassName,
              relationLabel: buildTaskRelationLabel(task),
            } satisfies DashboardPriorityTaskItem;
          });

        const personalKeyResultIds = [
          ...new Set(
            prioritizedActiveTasks
              .map((task) => task.keyResultId)
              .filter((item): item is string => Boolean(item)),
          ),
        ];
        const personalKeyResultRows = ((keyResultsResult.data ?? []) as KeyResultRow[]).filter((item) =>
          personalKeyResultIds.includes(String(item.id)),
        );
        const personalKrProgressMap = buildKeyResultProgressMap(
          personalKeyResultRows.map((item) => ({
            id: String(item.id),
            goal_id: item.goal_id ? String(item.goal_id) : null,
            contribution_type: item.contribution_type ? String(item.contribution_type) : null,
            start_value: typeof item.start_value === "number" ? item.start_value : Number(item.start_value ?? 0),
            current: typeof item.current === "number" ? item.current : Number(item.current ?? 0),
            target: typeof item.target === "number" ? item.target : Number(item.target ?? 0),
            weight: typeof item.weight === "number" ? item.weight : Number(item.weight ?? 1),
          })),
        );
        const goalsById = filteredGoals.reduce<Record<string, GoalRow>>((acc, goal) => {
          acc[goal.id] = goal;
          return acc;
        }, {});

        const goalProgress =
          roleScope === "member"
            ? personalKeyResultIds
                .flatMap((keyResultId) => {
                  const keyResult = personalKeyResultRows.find((item) => String(item.id) === keyResultId);
                  if (!keyResult) {
                    return [];
                  }

                  const goalId = keyResult.goal_id ? String(keyResult.goal_id) : null;
                  return [
                    {
                      id: String(keyResult.id),
                      label: String(keyResult.name),
                      scopeLabel: goalId ? goalsById[goalId]?.name ?? "Chưa có mục tiêu" : "Chưa có mục tiêu",
                      typeLabel: "KR",
                      progress: personalKrProgressMap[String(keyResult.id)] ?? 0,
                      endDateAt: goalId ? goalsById[goalId]?.end_date ?? null : null,
                      timeLabel: "Chưa đặt hạn",
                      href: goalId ? `/goals/${goalId}/key-results/${keyResult.id}` : null,
                    } satisfies DashboardGoalItem,
                  ];
                })
                .slice(0, 5)
            : allGoalProgress.slice(0, 5);

        const upcomingDeadlines = activeMyTasks
          .filter((task) => task.executionEndAt)
          .sort((left, right) => String(left.executionEndAt).localeCompare(String(right.executionEndAt)))
          .slice(0, 5)
          .map((task) => {
            const badgeMeta = toTaskBadgeMeta({
              status: task.status,
              priority: task.priority,
              dueDateAt: task.executionEndAt,
              now: today,
            });

            return {
              id: task.id,
              name: task.name,
              statusLabel: badgeMeta.statusLabel,
              statusClassName: badgeMeta.statusClassName,
              priorityLabel: badgeMeta.priorityLabel,
              priorityClassName: badgeMeta.priorityClassName,
              dueDateAt: task.executionEndAt as string,
              dueLabel: badgeMeta.dueLabel,
              dueClassName: badgeMeta.dueClassName,
            } satisfies DashboardDeadlineItem;
          });

        const taskTrend = buildCompletedTrend(
          normalizedMyTasks.map((task) => ({
            updatedAt: task.updatedAt,
            status: task.status,
          })),
          today,
        );

        const activityRows = ((activityResult.data ?? []) as ActivityLogRow[]).map((row) => ({
          id: String(row.id),
          message: formatActivityMessage({
            action: row.action,
            entityType: row.entity_type,
            oldValue: row.old_value ?? null,
            newValue: row.new_value ?? null,
          }),
          when: formatRelativeTimeVi(row.created_at, today),
        }));
        const recentActivities =
          activityRows.length > 0 ? activityRows.slice(0, 10) : buildFallbackActivities(normalizedScopeTasks, today);

        const weeklyTasks = normalizedMyTasks.filter((task) => isTaskInWeek(task, weekStart, weekEnd));

        const completedWeeklyTasks = weeklyTasks.filter((task) => task.status === "completed");
        const weeklyProgress =
          weeklyTasks.length > 0 ? Math.round((completedWeeklyTasks.length / weeklyTasks.length) * 100) : 0;

        const weeklyPerformance: DashboardWeeklyPerformance = {
          title: "Công việc tuần này",
          completedTasks: completedWeeklyTasks.length,
          totalTasks: weeklyTasks.length,
          progress: weeklyProgress,
          note: null,
          ctaLabel: "Xem công việc",
          ctaHref: "/tasks",
        };

        if (!isActive) {
          return;
        }

        setData({
          profile: {
            profileId,
            profileName,
            departmentName: primaryDepartmentName,
            roleScope,
          },
          summaryCards,
          priorityTasks,
          goalProgress,
          taskTrend,
          timeTracker,
          upcomingDeadlines,
          recentActivities,
          weeklyPerformance,
        });
      } catch (loadError) {
        console.error(loadError);
        if (!isActive) {
          return;
        }
        setError(GENERIC_ERROR);
        setData(defaultPayload);
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
  }, []);

  return {
    data,
    isLoading,
    error,
  };
}
