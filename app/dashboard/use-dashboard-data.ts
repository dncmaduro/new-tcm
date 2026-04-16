"use client";

import { useEffect, useState } from "react";
import {
  buildTaskTrend,
  buildGoalProgressItems,
  dashboardStatusMeta,
  formatActivityMessage,
  formatHoursShort,
  getDateDiffFromToday,
  getDateUrgencyMeta,
  formatRelativeTimeVi,
  getInitial,
  getWorkedMinutes,
  normalizeDashboardStatus,
  sortMyTasks,
  toDashboardTaskProgress,
  type DashboardActivityItem,
  type DashboardGoalItem,
  type DashboardPayload,
  type DashboardSummaryCard,
  type DashboardTaskStatus,
  type DashboardTeamPerformanceItem,
  type DashboardTimeTrackerData,
  type DashboardUpcomingTaskItem,
} from "@/lib/dashboard";
import { supabase } from "@/lib/supabase";

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
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
  goal_weight: number | null;
  kr_weight: number | null;
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
  profile_id?: string | null;
  type: string | null;
  status: string | null;
  progress: number | null;
  weight: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  key_result_id: string | null;
  key_result?: unknown;
};

type TimeRow = {
  id: string;
  profile_id: string | null;
  date: string;
  check_in: string | null;
  check_out: string | null;
  created_at: string | null;
  updated_at: string | null;
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

type NormalizedTask = {
  id: string;
  name: string;
  assigneeId: string | null;
  assigneeName: string;
  status: DashboardTaskStatus;
  progress: number;
  executionStartAt: string | null;
  executionEndAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  type: string | null;
  keyResultId: string | null;
  keyResultName: string;
  goalId: string | null;
  goalName: string;
};

const defaultPayload: DashboardPayload = {
  profile: null,
  summaryCards: [],
  taskTrend: [],
  timeTracker: {
    checkInAt: null,
    checkOutAt: null,
    workedMinutes: 0,
    isRunning: false,
    empty: true,
  },
  myTasks: [],
  upcomingDeadlines: [],
  goalProgress: [],
  teamPerformance: [],
  recentActivities: [],
};

const getCurrentQuarter = (now: Date) => Math.floor(now.getMonth() / 3) + 1;

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
          start_date: (rawGoal as Record<string, unknown>).start_date
            ? String((rawGoal as Record<string, unknown>).start_date)
            : null,
          end_date: (rawGoal as Record<string, unknown>).end_date
            ? String((rawGoal as Record<string, unknown>).end_date)
            : null,
        }
      : null;

  return {
    id: String(record.id),
    goal_id: record.goal_id ? String(record.goal_id) : null,
    name: String(record.name),
    start_date: record.start_date ? String(record.start_date) : null,
    end_date: record.end_date ? String(record.end_date) : null,
    goal,
  };
};

const normalizeTaskRows = (
  rows: TaskQueryRow[],
  profilesById: Record<string, string>,
) => {
  return rows.map((row) => {
    const keyResult = normalizeKeyResult(Array.isArray(row.key_result) ? row.key_result[0] ?? null : row.key_result);
    const assigneeName = row.assignee_id
      ? profilesById[String(row.assignee_id)] ?? "Chưa gán"
      : "Chưa gán";

    return {
      id: String(row.id),
      name: String(row.name),
      assigneeId: row.assignee_id ? String(row.assignee_id) : null,
      assigneeName,
      status: normalizeDashboardStatus(row.status),
      progress: toDashboardTaskProgress({
        type: row.type,
        status: row.status,
        progress: row.progress,
      }),
      executionStartAt: row.start_date ? String(row.start_date) : null,
      executionEndAt: row.end_date ? String(row.end_date) : null,
      createdAt: row.created_at ? String(row.created_at) : null,
      updatedAt: row.updated_at ? String(row.updated_at) : null,
      type: row.type ? String(row.type) : null,
      keyResultId: row.key_result_id ? String(row.key_result_id) : null,
      keyResultName: keyResult?.name ?? "Chưa gắn key result",
      goalId: keyResult?.goal?.id ?? (keyResult?.goal_id ? String(keyResult.goal_id) : null),
      goalName: keyResult?.goal?.name ?? "Chưa có mục tiêu",
    } satisfies NormalizedTask;
  });
};

const buildSummaryCards = ({
  myActiveTasks,
  dueTodayCount,
  weeklyCompletionRate,
  activeGoalsThisQuarter,
  timeTracker,
}: {
  myActiveTasks: number;
  dueTodayCount: number;
  weeklyCompletionRate: number;
  activeGoalsThisQuarter: number;
  timeTracker: DashboardTimeTrackerData;
}): DashboardSummaryCard[] => [
  {
    title: "Công việc của tôi",
    value: String(myActiveTasks),
    badge: "Hôm nay",
    badgeClass: "bg-blue-50 text-blue-600",
    note: dueTodayCount > 0 ? `${dueTodayCount} việc đến hạn hôm nay` : "Không có việc đến hạn hôm nay",
    iconClass: "bg-blue-50 text-blue-600",
  },
  {
    title: "Tỷ lệ hoàn thành",
    value: `${weeklyCompletionRate}%`,
    badge: "Tuần này",
    badgeClass: "bg-emerald-50 text-emerald-600",
    note: "Tính trên công việc được tạo hoặc cập nhật trong tuần hiện tại",
    iconClass: "bg-emerald-50 text-emerald-600",
  },
  {
    title: "Mục tiêu đang chạy",
    value: String(activeGoalsThisQuarter),
    badge: "Quý này",
    badgeClass: "bg-violet-50 text-violet-600",
    note: "Mục tiêu thuộc owners hoặc team hiện tại",
    iconClass: "bg-violet-50 text-violet-600",
  },
  {
    title: "Giờ làm việc",
    value: formatHoursShort(timeTracker.workedMinutes),
    badge: "Hôm nay",
    badgeClass: "bg-orange-50 text-orange-600",
    note: timeTracker.checkInAt
      ? `Đã check-in lúc ${new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(timeTracker.checkInAt))}`
      : "Chưa có dữ liệu chấm công hôm nay",
    iconClass: "bg-orange-50 text-orange-600",
  },
];

export function useDashboardData() {
  const [data, setData] = useState<DashboardPayload>(defaultPayload);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

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
          .select("id,name,email")
          .eq("user_id", authData.user.id)
          .maybeSingle();

        if (profileError || !profileData?.id) {
          throw new Error(profileError?.message || "Không tìm thấy hồ sơ người dùng.");
        }

        const profileId = String(profileData.id);
        const profileName = profileData.name?.trim() || profileData.email?.trim() || "Thành viên";

        const [{ data: userRoleRows }, { data: departmentsRows }] = await Promise.all([
          supabase
            .from("user_role_in_department")
            .select("profile_id,department_id,role_id")
            .eq("profile_id", profileId),
          supabase.from("departments").select("id,name,parent_department_id"),
        ]);

        if (!isActive) {
          return;
        }

        const departmentRows = (departmentsRows ?? []) as DepartmentRow[];
        const departmentsById = departmentRows.reduce<Record<string, string>>((acc, department) => {
          acc[String(department.id)] = String(department.name);
          return acc;
        }, {});

        const departmentIds = [
          ...new Set(
            ((userRoleRows ?? []) as UserRoleRow[])
              .map((item) => item.department_id)
              .filter((value): value is string => Boolean(value))
              .map((value) => String(value)),
          ),
        ];
        const primaryDepartmentName = departmentIds[0] ? departmentsById[departmentIds[0]] ?? null : null;

        const [{ data: teammateRoleRows }, { data: profileRows }] = await Promise.all([
          departmentIds.length > 0
            ? supabase
                .from("user_role_in_department")
                .select("profile_id,department_id,role_id")
                .in("department_id", departmentIds)
            : Promise.resolve({ data: [] }),
          supabase.from("profiles").select("id,name,email"),
        ]);

        if (!isActive) {
          return;
        }

        const profilesById = ((profileRows ?? []) as ProfileRow[]).reduce<Record<string, string>>((acc, profile) => {
          acc[String(profile.id)] = profile.name?.trim() || profile.email?.trim() || "Không rõ";
          return acc;
        }, {});

        const teamProfileIds = [
          ...new Set(
            ((teammateRoleRows ?? []) as UserRoleRow[])
              .map((item) => item.profile_id)
              .filter((value): value is string => Boolean(value))
              .map((value) => String(value)),
          ),
        ];

        const today = new Date();
        const todayIso = today.toISOString().slice(0, 10);
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
        weekStart.setHours(0, 0, 0, 0);
        const weekStartIso = weekStart.toISOString();
        const currentQuarter = getCurrentQuarter(today);
        const currentYear = today.getFullYear();

        const [
          { data: myTasksRows, error: myTasksError },
          { data: teamTasksRows },
          { data: ownerGoalRows, error: ownerGoalRowsError },
          { data: departmentGoalsRows },
          { data: linkedGoalRows },
          { data: todayTimeRows },
          { data: activityRows },
        ] = await Promise.all([
          supabase
            .from("tasks")
            .select(`
              id,
              name,
              assignee_id,
              profile_id,
              type,
              status,
              progress,
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
            `)
            .eq("assignee_id", profileId)
            .order("end_date", { ascending: true, nullsFirst: false }),
          teamProfileIds.length > 0
            ? supabase
                .from("tasks")
                .select("id,assignee_id,type,status,progress,weight,created_at,updated_at")
                .in("assignee_id", teamProfileIds)
            : Promise.resolve({ data: [] }),
          supabase
            .from("goal_owners")
            .select("goal_id,profile_id")
            .eq("profile_id", profileId),
          departmentIds.length > 0
            ? supabase
                .from("goals")
                .select("id,name,type,status,quarter,year,department_id,target,unit,start_date,end_date")
                .in("department_id", departmentIds)
            : Promise.resolve({ data: [] }),
          departmentIds.length > 0
            ? supabase
                .from("goal_departments")
                .select("goal_id,department_id,role,goal_weight,kr_weight")
                .in("department_id", departmentIds)
            : Promise.resolve({ data: [] }),
          supabase
            .from("times")
            .select("id,profile_id,date,check_in,check_out,created_at,updated_at")
            .eq("profile_id", profileId)
            .eq("date", todayIso)
            .order("created_at", { ascending: false })
            .limit(1),
          teamProfileIds.length > 0
            ? supabase
                .from("activity_logs")
                .select("id,profile_id,entity_type,entity_id,action,old_value,new_value,created_at")
                .in("profile_id", teamProfileIds)
                .in("entity_type", ["goal", "key_result", "task"])
                .order("created_at", { ascending: false })
                .limit(8)
            : Promise.resolve({ data: [] }),
        ]);

        if (!isActive) {
          return;
        }

        if (myTasksError) {
          throw new Error(myTasksError.message || "Không tải được công việc của bạn.");
        }
        if (ownerGoalRowsError) {
          throw new Error(ownerGoalRowsError.message || "Không tải được danh sách owners của mục tiêu.");
        }

        const goalIdsFromLinks = [
          ...new Set(
            ((linkedGoalRows ?? []) as GoalDepartmentRow[])
              .map((item) => item.goal_id)
              .filter((value): value is string => Boolean(value))
              .map((value) => String(value)),
            ),
        ];
        const ownedGoalIds = [
          ...new Set(
            ((ownerGoalRows ?? []) as GoalOwnerRow[])
              .map((item) => item.goal_id)
              .filter((value): value is string => Boolean(value))
              .map((value) => String(value)),
          ),
        ];
        const departmentGoalIds = new Set(
          ((departmentGoalsRows ?? []) as GoalRow[]).map((goal) => String(goal.id)),
        );
        const goalsToFetchById = [
          ...new Set(
            [...ownedGoalIds, ...goalIdsFromLinks].filter((goalId) => !departmentGoalIds.has(goalId)),
          ),
        ];

        const { data: linkedGoalsRows } =
          goalsToFetchById.length > 0
            ? await supabase
                .from("goals")
                .select("id,name,type,status,quarter,year,department_id,target,unit,start_date,end_date")
                .in("id", goalsToFetchById)
            : { data: [] };

        if (!isActive) {
          return;
        }

        const allGoals = [
          ...((departmentGoalsRows ?? []) as GoalRow[]),
          ...((linkedGoalsRows ?? []) as GoalRow[]),
        ].reduce<Record<string, GoalRow>>((acc, goal) => {
          acc[String(goal.id)] = {
            ...goal,
            id: String(goal.id),
          };
          return acc;
        }, {});
        const relevantGoals = Object.values(allGoals);
        const relevantGoalIds = relevantGoals.map((goal) => goal.id);

        const { data: keyResultsRows } =
          relevantGoalIds.length > 0
            ? await supabase
                .from("key_results")
                .select("id,goal_id,name,contribution_type,current,target,unit,start_value,weight,responsible_department_id")
                .in("goal_id", relevantGoalIds)
            : { data: [] };

        if (!isActive) {
          return;
        }

        const normalizedMyTasks = normalizeTaskRows((myTasksRows ?? []) as unknown as TaskQueryRow[], profilesById);
        const myActiveTasks = normalizedMyTasks.filter((task) => !["done", "cancelled"].includes(task.status)).length;
        const dueTodayCount = normalizedMyTasks.filter((task) => getDateDiffFromToday(task.executionEndAt, today) === 0).length;

        const tasksForWeek = normalizedMyTasks.filter(
          (task) =>
            (task.createdAt && task.createdAt >= weekStartIso) ||
            (task.updatedAt && task.updatedAt >= weekStartIso),
        );
        const weeklyCompletionRate = tasksForWeek.length
          ? Math.round((tasksForWeek.filter((task) => task.status === "done").length / tasksForWeek.length) * 100)
          : 0;

        const myTasksWidget = sortMyTasks(
          normalizedMyTasks.map((task) => {
            const urgency = getDateUrgencyMeta(task.executionEndAt, today);
            return {
              ...task,
              statusLabel: dashboardStatusMeta[task.status].label,
              statusClassName: dashboardStatusMeta[task.status].badgeClassName,
              urgencyRank: urgency.rank,
            };
          }),
        ).slice(0, 5);

        const upcomingDeadlines = normalizedMyTasks
          .filter((task) => task.executionEndAt)
          .map((task) => {
            const urgency = getDateUrgencyMeta(task.executionEndAt, today);
            return {
              id: task.id,
              title: task.name,
              goalName: task.goalName,
              keyResultName: task.keyResultName,
              endDateAt: task.executionEndAt as string,
              tag: urgency.label,
              tagClassName: urgency.className,
            } satisfies DashboardUpcomingTaskItem;
          })
          .filter((item) => {
            const diff = getDateDiffFromToday(item.endDateAt, today);
            return diff !== null && diff <= 7;
          })
          .sort((a, b) => new Date(a.endDateAt).getTime() - new Date(b.endDateAt).getTime())
          .slice(0, 5);

        const activeGoalsThisQuarter = relevantGoals.filter(
          (goal) => goal.quarter === currentQuarter && goal.year === currentYear && goal.status !== "draft",
        ).length;

        const timeRow = ((todayTimeRows ?? []) as TimeRow[])[0] ?? null;
        const timeTracker: DashboardTimeTrackerData = {
          checkInAt: timeRow?.check_in ?? null,
          checkOutAt: timeRow?.check_out ?? null,
          workedMinutes: getWorkedMinutes(timeRow?.check_in ?? null, timeRow?.check_out ?? null, today),
          isRunning: Boolean(timeRow?.check_in && !timeRow?.check_out),
          empty: !timeRow,
        };

        const summaryCards = buildSummaryCards({
          myActiveTasks,
          dueTodayCount,
          weeklyCompletionRate,
          activeGoalsThisQuarter,
          timeTracker,
        });

        const taskTrend = buildTaskTrend(normalizedMyTasks);
        const goalProgress = buildGoalProgressItems({
          goals: relevantGoals.map((goal) => ({
            id: String(goal.id),
            name: String(goal.name),
            type: goal.type ?? null,
            status: goal.status ?? null,
            department_id: goal.department_id ? String(goal.department_id) : null,
            target:
              goal.target === null || goal.target === undefined
                ? null
                : typeof goal.target === "number"
                  ? goal.target
                  : Number(goal.target),
            unit: goal.unit ? String(goal.unit) : null,
          })),
          goalDepartments: ((linkedGoalRows ?? []) as GoalDepartmentRow[]).map((item) => ({
            goal_id: item.goal_id ? String(item.goal_id) : null,
            department_id: item.department_id ? String(item.department_id) : null,
            role: item.role ? String(item.role) : null,
          })),
          keyResults: ((keyResultsRows ?? []) as KeyResultRow[]).map((item) => ({
            id: String(item.id),
            goal_id: item.goal_id ? String(item.goal_id) : null,
            contribution_type: item.contribution_type ? String(item.contribution_type) : null,
            start_value:
              typeof item.start_value === "number" ? item.start_value : Number(item.start_value ?? 0),
            current: typeof item.current === "number" ? item.current : Number(item.current ?? 0),
            target: typeof item.target === "number" ? item.target : Number(item.target ?? 0),
            weight: typeof item.weight === "number" ? item.weight : Number(item.weight ?? 1),
          })),
          departmentNamesById: departmentsById,
        })
          .sort((a, b) => b.progress - a.progress)
          .slice(0, 4);

        const teamPerformanceByProfile = ((teamTasksRows ?? []) as Array<{
          assignee_id: string | null;
          type: string | null;
          status: string | null;
          progress: number | null;
        }>).reduce<
          Record<string, { name: string; tasks: number; progressSum: number; doneCount: number }>
        >((acc, task) => {
          const assigneeId = task.assignee_id ? String(task.assignee_id) : null;
          if (!assigneeId) {
            return acc;
          }
          if (!acc[assigneeId]) {
            acc[assigneeId] = {
              name: profilesById[assigneeId] ?? "Không rõ",
              tasks: 0,
              progressSum: 0,
              doneCount: 0,
            };
          }
          acc[assigneeId].tasks += 1;
          acc[assigneeId].progressSum += toDashboardTaskProgress({
            type: task.type,
            status: task.status,
            progress: task.progress,
          });
          if (normalizeDashboardStatus(task.status) === "done") {
            acc[assigneeId].doneCount += 1;
          }
          return acc;
        }, {});

        const teamPerformance: DashboardTeamPerformanceItem[] = Object.entries(teamPerformanceByProfile)
          .map(([id, item]) => ({
            id,
            name: item.name,
            tasks: item.tasks,
            progress: item.tasks ? Math.round(item.progressSum / item.tasks) : 0,
            completedRate: item.tasks ? Math.round((item.doneCount / item.tasks) * 100) : 0,
          }))
          .sort((a, b) => b.progress - a.progress)
          .slice(0, 5);

        const recentActivities: DashboardActivityItem[] = ((activityRows ?? []) as ActivityLogRow[]).map((log) => {
          const actorName = log.profile_id ? profilesById[String(log.profile_id)] ?? "Không rõ" : "Hệ thống";
          return {
            id: String(log.id),
            actorName,
            actorInitial: getInitial(actorName),
            message: formatActivityMessage({
              actorName,
              action: log.action,
              entityType: log.entity_type,
              oldValue: log.old_value ?? null,
              newValue: log.new_value ?? null,
            }),
            when: formatRelativeTimeVi(log.created_at, today),
          };
        });

        if (!isActive) {
          return;
        }

        setData({
          profile: {
            profileId,
            profileName,
            departmentName: primaryDepartmentName,
          },
          summaryCards,
          taskTrend,
          timeTracker,
          myTasks: myTasksWidget,
          upcomingDeadlines,
          goalProgress: goalProgress as DashboardGoalItem[],
          teamPerformance,
          recentActivities,
        });
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Không thể tải dashboard.");
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
