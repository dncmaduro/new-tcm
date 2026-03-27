"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatActivityMessage,
  getDateDiffFromToday,
  getDateUrgencyMeta,
  formatHoursShort,
  formatRelativeTimeVi,
  getInitial,
  getWorkedMinutes,
  normalizeDashboardStatus,
  toDashboardTaskProgress,
} from "@/lib/dashboard";
import {
  buildGoalDepartmentPerformanceMap,
  buildGoalProgressMap,
  buildKeyResultProgressMap,
} from "@/lib/okr";
import { supabase } from "@/lib/supabase";

type GoalRow = {
  id: string;
  name: string;
  department_id: string | null;
  owner_id: string | null;
  status: string | null;
  quarter: number | null;
  year: number | null;
  end_date: string | null;
  start_date: string | null;
};

type GoalDepartmentRow = {
  goal_id: string | null;
  department_id: string | null;
  role: string | null;
  goal_weight: number | null;
  kr_weight: number | null;
};

type KeyResultRow = {
  id: string;
  goal_id: string | null;
  name: string;
  start_value: number | null;
  current: number | null;
  target: number | null;
  weight: number | null;
  responsible_department_id: string | null;
  start_date: string | null;
  end_date: string | null;
};

type TaskRow = {
  id: string;
  name: string;
  key_result_id: string | null;
  assignee_id: string | null;
  status: string | null;
  progress: number | null;
  weight: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
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

type TimeRow = {
  profile_id: string | null;
  date: string;
  check_in: string | null;
  check_out: string | null;
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

export type DepartmentGoalExecutionItem = {
  id: string;
  name: string;
  ownerName: string;
  status: string;
  progress: number;
  health: "on_track" | "at_risk" | "off_track" | "completed";
  krCount: number;
  taskCount: number;
  overdueTaskCount: number;
  endDate: string | null;
  participationRole: string;
  goalWeight: number;
  krWeight: number;
  goalInfluence: number;
  krInfluence: number;
  departmentPerformance: number;
  keyResults: Array<{
    id: string;
    name: string;
    responsibleDepartmentName: string;
    startValue: number;
    current: number;
    target: number;
    progress: number;
    weight: number;
    taskCount: number;
    assigneeDistribution: string;
    ownedBySelectedDepartment: boolean;
    startDate: string | null;
    endDate: string | null;
  }>;
};

export type DepartmentMemberPerformanceItem = {
  id: string;
  name: string;
  roleName: string;
  assignedTasks: number;
  completionRate: number;
  inProgressTasks: number;
  overdueTasks: number;
  averageTaskProgress: number;
  goalsInvolved: number;
  keyResultsInvolved: number;
  workedHoursToday: string;
  workedHoursWeek: string;
  blockedTasks: number;
  activeTasks: number;
};

export type DepartmentUpcomingTaskItem = {
  id: string;
  taskName: string;
  assigneeName: string;
  keyResultName: string;
  goalName: string;
  endDateAt: string;
  urgencyLabel: string;
  urgencyClassName: string;
};

export type DepartmentActivityItem = {
  id: string;
  actorName: string;
  actorInitial: string;
  message: string;
  when: string;
};

export type DepartmentRiskItem = {
  title: string;
  description: string;
};

type FilterParams = {
  departmentId: string | null;
  quarter: string;
  year: string;
  goalStatus: string;
  assigneeId: string;
  onlyOverdue: boolean;
  search: string;
};

type RawData = {
  departmentName: string;
  goals: GoalRow[];
  goalDepartments: GoalDepartmentRow[];
  keyResults: KeyResultRow[];
  tasks: TaskRow[];
  departmentNamesById: Record<string, string>;
  profilesById: Record<string, string>;
  memberRolesById: Record<string, string>;
  weekWorkedMinutesByProfileId: Record<string, number>;
  todayWorkedMinutesByProfileId: Record<string, number>;
  recentActivities: ActivityLogRow[];
};

const defaultRawData: RawData = {
  departmentName: "",
  goals: [],
  goalDepartments: [],
  keyResults: [],
  tasks: [],
  departmentNamesById: {},
  profilesById: {},
  memberRolesById: {},
  weekWorkedMinutesByProfileId: {},
  todayWorkedMinutesByProfileId: {},
  recentActivities: [],
};

const computeGoalHealth = ({
  progress,
  endDate,
}: {
  progress: number;
  endDate: string | null;
}): DepartmentGoalExecutionItem["health"] => {
  if (progress >= 100) {
    return "completed";
  }
  if (!endDate) {
    return progress >= 60 ? "on_track" : progress > 0 ? "at_risk" : "off_track";
  }
  const deadline = new Date(endDate);
  const today = new Date();
  deadline.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((deadline.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0 && progress < 100) {
    return "off_track";
  }
  if (diffDays <= 7 && progress < 70) {
    return "at_risk";
  }
  return progress >= 60 ? "on_track" : progress > 0 ? "at_risk" : "off_track";
};

const toAssigneeDistribution = (tasks: TaskRow[], profilesById: Record<string, string>) => {
  const counts = tasks.reduce<Record<string, number>>((acc, task) => {
    const assigneeId = task.assignee_id ? String(task.assignee_id) : "unknown";
    acc[assigneeId] = (acc[assigneeId] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts)
    .map(([profileId, count]) => `${profilesById[profileId] ?? "Chưa gán"} (${count})`)
    .slice(0, 3);
  return summary.length ? summary.join(", ") : "Chưa phân bổ";
};

const isTaskOverdue = (task: TaskRow, now = new Date()) => {
  if (!task.end_date) {
    return false;
  }
  const deadline = new Date(task.end_date);
  const today = new Date(now);
  deadline.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return deadline < today && !["done", "cancelled"].includes(normalizeDashboardStatus(task.status));
};

export function useDepartmentPerformance(filters: FilterParams) {
  const [rawData, setRawData] = useState<RawData>(defaultRawData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filters.departmentId) {
      setRawData(defaultRawData);
      setIsLoading(false);
      return;
    }

    let isActive = true;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const today = new Date();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
        weekStart.setHours(0, 0, 0, 0);

        const [{ data: departmentRows }, { data: memberRoleRows }, { data: directGoalsRows }, { data: linkedGoalRows }] =
          await Promise.all([
            supabase.from("departments").select("id,name").eq("id", filters.departmentId).limit(1),
            supabase
              .from("user_role_in_department")
              .select("profile_id,role_id,department_id")
              .eq("department_id", filters.departmentId),
            supabase
              .from("goals")
              .select("id,name,department_id,owner_id,status,quarter,year,end_date,start_date")
              .eq("department_id", filters.departmentId),
            supabase
              .from("goal_departments")
              .select("goal_id,department_id,role,goal_weight,kr_weight")
              .eq("department_id", filters.departmentId),
          ]);

        if (!isActive) {
          return;
        }

        const memberProfileIds = [
          ...new Set(
            ((memberRoleRows ?? []) as UserRoleRow[])
              .map((item) => item.profile_id)
              .filter((value): value is string => Boolean(value))
              .map((value) => String(value)),
          ),
        ];
        const roleIds = [
          ...new Set(
            ((memberRoleRows ?? []) as UserRoleRow[])
              .map((item) => item.role_id)
              .filter((value): value is string => Boolean(value))
              .map((value) => String(value)),
          ),
        ];
        const linkedGoalIds = [
          ...new Set(
            ((linkedGoalRows ?? []) as GoalDepartmentRow[])
              .map((item) => item.goal_id)
              .filter((value): value is string => Boolean(value))
              .map((value) => String(value)),
          ),
        ];
        const directGoals = (directGoalsRows ?? []) as GoalRow[];
        const existingGoalIds = new Set(directGoals.map((goal) => String(goal.id)));
        const missingGoalIds = linkedGoalIds.filter((goalId) => !existingGoalIds.has(goalId));

        const [{ data: missingGoalsRows }, { data: profileRows }, { data: roleRows }] = await Promise.all([
          missingGoalIds.length > 0
            ? supabase
                .from("goals")
                .select("id,name,department_id,owner_id,status,quarter,year,end_date,start_date")
                .in("id", missingGoalIds)
            : Promise.resolve({ data: [] }),
          memberProfileIds.length > 0
            ? supabase.from("profiles").select("id,name,email").in("id", memberProfileIds)
            : Promise.resolve({ data: [] }),
          roleIds.length > 0
            ? supabase.from("roles").select("id,name").in("id", roleIds)
            : Promise.resolve({ data: [] }),
        ]);

        if (!isActive) {
          return;
        }

        const allGoals = [...directGoals, ...((missingGoalsRows ?? []) as GoalRow[])].reduce<Record<string, GoalRow>>(
          (acc, goal) => {
            acc[String(goal.id)] = {
              ...goal,
              id: String(goal.id),
            };
            return acc;
          },
          {},
        );
        const goalIds = Object.keys(allGoals);

        const [{ data: keyResultsRows }, { data: profilesData }, { data: rolesData }] = await Promise.all([
          goalIds.length > 0
            ? supabase
                .from("key_results")
                .select("id,goal_id,name,start_value,current,target,weight,responsible_department_id,start_date,end_date")
                .in("goal_id", goalIds)
            : Promise.resolve({ data: [] }),
          Promise.resolve({ data: profileRows ?? [] }),
          Promise.resolve({ data: roleRows ?? [] }),
        ]);

        if (!isActive) {
          return;
        }

        const keyResults = ((keyResultsRows ?? []) as KeyResultRow[]).map((item) => ({
          ...item,
          id: String(item.id),
          goal_id: item.goal_id ? String(item.goal_id) : null,
          start_value: typeof item.start_value === "number" ? item.start_value : Number(item.start_value ?? 0),
          current: typeof item.current === "number" ? item.current : Number(item.current ?? 0),
          target: typeof item.target === "number" ? item.target : Number(item.target ?? 0),
          weight: typeof item.weight === "number" ? item.weight : Number(item.weight ?? 1),
          responsible_department_id: item.responsible_department_id ? String(item.responsible_department_id) : null,
          start_date: item.start_date ? String(item.start_date) : null,
          end_date: item.end_date ? String(item.end_date) : null,
        }));
        const relatedDepartmentIds = [
          ...new Set(
            [
              filters.departmentId,
              ...((linkedGoalRows ?? []) as GoalDepartmentRow[])
                .map((item) => item.department_id)
                .filter((value): value is string => Boolean(value))
                .map((value) => String(value)),
              ...keyResults
                .map((item) => item.responsible_department_id)
                .filter((value): value is string => Boolean(value))
                .map((value) => String(value)),
            ].filter(Boolean),
          ),
        ];
        const keyResultIds = keyResults.map((item) => item.id);

        const [{ data: taskRows }, { data: timesRows }, { data: relatedDepartmentRows }] = await Promise.all([
          keyResultIds.length > 0
            ? supabase
                .from("tasks")
                .select("id,name,key_result_id,assignee_id,status,progress,weight,start_date,end_date,created_at,updated_at,type")
                .in("key_result_id", keyResultIds)
            : Promise.resolve({ data: [] }),
          memberProfileIds.length > 0
            ? supabase
                .from("times")
                .select("profile_id,date,check_in,check_out")
                .in("profile_id", memberProfileIds)
                .gte("date", weekStart.toISOString().slice(0, 10))
                .lte("date", today.toISOString().slice(0, 10))
            : Promise.resolve({ data: [] }),
          relatedDepartmentIds.length > 0
            ? supabase.from("departments").select("id,name").in("id", relatedDepartmentIds)
            : Promise.resolve({ data: [] }),
        ]);

        if (!isActive) {
          return;
        }

        const typedTasks = ((taskRows ?? []) as TaskRow[]).map((task) => ({
          ...task,
          id: String(task.id),
          key_result_id: task.key_result_id ? String(task.key_result_id) : null,
          assignee_id: task.assignee_id ? String(task.assignee_id) : null,
          status: task.status ? String(task.status) : null,
          start_date: task.start_date ? String(task.start_date) : null,
          end_date: task.end_date ? String(task.end_date) : null,
          created_at: task.created_at ? String(task.created_at) : null,
          updated_at: task.updated_at ? String(task.updated_at) : null,
          type: task.type ? String(task.type) : null,
        }));
        const taskIds = typedTasks.map((task) => task.id);

        const activityQueries = [
          goalIds.length > 0
            ? supabase
                .from("activity_logs")
                .select("id,profile_id,entity_type,entity_id,action,old_value,new_value,created_at")
                .eq("entity_type", "goal")
                .in("entity_id", goalIds)
                .order("created_at", { ascending: false })
                .limit(8)
            : Promise.resolve({ data: [] }),
          keyResultIds.length > 0
            ? supabase
                .from("activity_logs")
                .select("id,profile_id,entity_type,entity_id,action,old_value,new_value,created_at")
                .eq("entity_type", "key_result")
                .in("entity_id", keyResultIds)
                .order("created_at", { ascending: false })
                .limit(8)
            : Promise.resolve({ data: [] }),
          taskIds.length > 0
            ? supabase
                .from("activity_logs")
                .select("id,profile_id,entity_type,entity_id,action,old_value,new_value,created_at")
                .eq("entity_type", "task")
                .in("entity_id", taskIds)
                .order("created_at", { ascending: false })
                .limit(8)
            : Promise.resolve({ data: [] }),
        ];

        const [goalActivities, keyResultActivities, taskActivities] = await Promise.all(activityQueries);

        if (!isActive) {
          return;
        }

        const profilesById = ((profilesData ?? []) as ProfileRow[]).reduce<Record<string, string>>((acc, profile) => {
          acc[String(profile.id)] = profile.name?.trim() || profile.email?.trim() || "Không rõ";
          return acc;
        }, {});
        const roleNamesById = ((rolesData ?? []) as RoleRow[]).reduce<Record<string, string>>((acc, role) => {
          acc[String(role.id)] = role.name?.trim() || "Không rõ vai trò";
          return acc;
        }, {});
        const memberRolesById = ((memberRoleRows ?? []) as UserRoleRow[]).reduce<Record<string, string>>((acc, row) => {
          const profileId = row.profile_id ? String(row.profile_id) : null;
          const roleId = row.role_id ? String(row.role_id) : null;
          if (profileId && roleId && !acc[profileId]) {
            acc[profileId] = roleNamesById[roleId] ?? "Không rõ vai trò";
          }
          return acc;
        }, {});

        const todayIso = today.toISOString().slice(0, 10);
        const typedTimes = (timesRows ?? []) as TimeRow[];
        const weekWorkedMinutesByProfileId = typedTimes.reduce<Record<string, number>>((acc, row) => {
          const profileId = row.profile_id ? String(row.profile_id) : null;
          if (!profileId) {
            return acc;
          }
          acc[profileId] = (acc[profileId] ?? 0) + getWorkedMinutes(row.check_in, row.check_out, today);
          return acc;
        }, {});
        const todayWorkedMinutesByProfileId = typedTimes.reduce<Record<string, number>>((acc, row) => {
          const profileId = row.profile_id ? String(row.profile_id) : null;
          if (!profileId || row.date !== todayIso) {
            return acc;
          }
          acc[profileId] = getWorkedMinutes(row.check_in, row.check_out, today);
          return acc;
        }, {});

        const recentActivities = [
          ...((goalActivities.data ?? []) as ActivityLogRow[]),
          ...((keyResultActivities.data ?? []) as ActivityLogRow[]),
          ...((taskActivities.data ?? []) as ActivityLogRow[]),
        ]
          .sort((a, b) => new Date(b.created_at ?? "").getTime() - new Date(a.created_at ?? "").getTime())
          .slice(0, 12);

        setRawData({
          departmentName:
            ((departmentRows ?? []) as Array<{ id: string; name: string }>)[0]?.name ?? "Phòng ban",
          goals: Object.values(allGoals),
          goalDepartments: ((linkedGoalRows ?? []) as GoalDepartmentRow[]).map((item) => ({
            goal_id: item.goal_id ? String(item.goal_id) : null,
            department_id: item.department_id ? String(item.department_id) : null,
            role: item.role ? String(item.role) : null,
            goal_weight:
              typeof item.goal_weight === "number" ? item.goal_weight : Number(item.goal_weight ?? 0.5),
            kr_weight: typeof item.kr_weight === "number" ? item.kr_weight : Number(item.kr_weight ?? 0.5),
          })),
          keyResults,
          tasks: typedTasks,
          departmentNamesById: ((relatedDepartmentRows ?? []) as Array<{ id: string; name: string }>).reduce<
            Record<string, string>
          >((acc, item) => {
            acc[String(item.id)] = String(item.name);
            return acc;
          }, {}),
          profilesById,
          memberRolesById,
          weekWorkedMinutesByProfileId,
          todayWorkedMinutesByProfileId,
          recentActivities,
        });
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Không tải được dữ liệu phòng ban.");
        setRawData(defaultRawData);
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
    const today = new Date();
    const keyword = filters.search.trim().toLowerCase();
    const goalsById = rawData.goals.reduce<Record<string, GoalRow>>((acc, goal) => {
      acc[String(goal.id)] = goal;
      return acc;
    }, {});
    const keyResultsByGoalId = rawData.keyResults.reduce<Record<string, KeyResultRow[]>>((acc, keyResult) => {
      const goalId = keyResult.goal_id ? String(keyResult.goal_id) : null;
      if (!goalId) {
        return acc;
      }
      if (!acc[goalId]) {
        acc[goalId] = [];
      }
      acc[goalId].push(keyResult);
      return acc;
    }, {});
    const tasksByKeyResultId = rawData.tasks.reduce<Record<string, TaskRow[]>>((acc, task) => {
      const keyResultId = task.key_result_id ? String(task.key_result_id) : null;
      if (!keyResultId) {
        return acc;
      }
      if (!acc[keyResultId]) {
        acc[keyResultId] = [];
      }
      acc[keyResultId].push(task);
      return acc;
    }, {});

    const visibleGoals = rawData.goals.filter((goal) => {
      if (filters.quarter !== "all" && String(goal.quarter ?? "") !== filters.quarter) {
        return false;
      }
      if (filters.year !== "all" && String(goal.year ?? "") !== filters.year) {
        return false;
      }
      if (filters.goalStatus !== "all" && String(goal.status ?? "") !== filters.goalStatus) {
        return false;
      }
      const goalKeyword = `${goal.name} ${rawData.profilesById[goal.owner_id ?? ""] ?? ""}`.toLowerCase();
      if (keyword && !goalKeyword.includes(keyword)) {
        const hasMatchingKr = (keyResultsByGoalId[goal.id] ?? []).some((keyResult) => {
          const krKeyword = `${keyResult.name} ${tasksByKeyResultId[keyResult.id]?.map((task) => task.name).join(" ") ?? ""}`.toLowerCase();
          return krKeyword.includes(keyword);
        });
        if (!hasMatchingKr) {
          return false;
        }
      }
      return true;
    });

    const visibleGoalIds = new Set(visibleGoals.map((goal) => goal.id));
    const visibleGoalDepartments = rawData.goalDepartments.filter((item) => {
      const goalId = item.goal_id ? String(item.goal_id) : null;
      const departmentId = item.department_id ? String(item.department_id) : null;
      return Boolean(goalId && departmentId && visibleGoalIds.has(goalId) && departmentId === filters.departmentId);
    });
    const visibleKeyResults = rawData.keyResults.filter((keyResult) => {
      const goalId = keyResult.goal_id ? String(keyResult.goal_id) : null;
      return goalId ? visibleGoalIds.has(goalId) : false;
    });
    const visibleKeyResultIds = new Set(visibleKeyResults.map((keyResult) => keyResult.id));

    const visibleTasks = rawData.tasks.filter((task) => {
      if (!task.key_result_id || !visibleKeyResultIds.has(String(task.key_result_id))) {
        return false;
      }
      if (filters.assigneeId !== "all" && String(task.assignee_id ?? "") !== filters.assigneeId) {
        return false;
      }
      if (filters.onlyOverdue && !isTaskOverdue(task)) {
        return false;
      }
      if (keyword) {
        const relatedGoalId = visibleKeyResults.find((item) => item.id === task.key_result_id)?.goal_id ?? "";
        const taskKeyword = `${task.name} ${rawData.profilesById[task.assignee_id ?? ""] ?? ""} ${
          visibleKeyResults.find((item) => item.id === task.key_result_id)?.name ?? ""
        } ${goalsById[String(relatedGoalId)]?.name ?? ""}`.toLowerCase();
        return taskKeyword.includes(keyword);
      }
      return true;
    });

    const keyResultProgressMap = buildKeyResultProgressMap(
      visibleKeyResults.map((item) => ({
        id: item.id,
        goal_id: item.goal_id,
        start_value: item.start_value,
        current: item.current,
        target: item.target,
        weight: item.weight,
        responsible_department_id: item.responsible_department_id,
      })),
      visibleTasks.map((task) => ({
        key_result_id: task.key_result_id,
        type: task.type,
        status: task.status,
        progress: task.progress,
        weight: task.weight,
      })),
    );
    const goalProgressMap = buildGoalProgressMap(
      visibleGoals.map((goal) => goal.id),
      visibleKeyResults.map((item) => ({ id: item.id, goal_id: item.goal_id })),
      keyResultProgressMap,
    );
    const departmentPerformanceMap = buildGoalDepartmentPerformanceMap(
      visibleGoalDepartments.map((item) => ({
        goal_id: item.goal_id,
        department_id: item.department_id,
        role: item.role,
        goal_weight: item.goal_weight,
        kr_weight: item.kr_weight,
      })),
      visibleKeyResults.map((item) => ({
        id: item.id,
        goal_id: item.goal_id,
        weight: item.weight,
        responsible_department_id: item.responsible_department_id,
        start_value: item.start_value,
        current: item.current,
        target: item.target,
      })),
      keyResultProgressMap,
      goalProgressMap,
    );

    const departmentOwnedKeyResultIds = new Set(
      visibleKeyResults
        .filter((keyResult) => keyResult.responsible_department_id === filters.departmentId)
        .map((keyResult) => keyResult.id),
    );
    const departmentVisibleTasks = visibleTasks.filter((task) =>
      task.key_result_id ? departmentOwnedKeyResultIds.has(String(task.key_result_id)) : false,
    );

    const visibleTaskIds = new Set(departmentVisibleTasks.map((task) => task.id));
    const visibleActivities = rawData.recentActivities.filter((item) => {
      if (item.entity_type === "goal") {
        return item.entity_id ? visibleGoalIds.has(String(item.entity_id)) : false;
      }
      if (item.entity_type === "key_result") {
        return item.entity_id ? departmentOwnedKeyResultIds.has(String(item.entity_id)) : false;
      }
      if (item.entity_type === "task") {
        return item.entity_id ? visibleTaskIds.has(String(item.entity_id)) : false;
      }
      return false;
    });

    const goalExecution = visibleGoals.map((goal) => {
      const goalKeyResults = visibleKeyResults.filter((keyResult) => keyResult.goal_id === goal.id);
      const goalTasks = visibleTasks.filter((task) => goalKeyResults.some((keyResult) => keyResult.id === task.key_result_id));
      const participation = visibleGoalDepartments.find((item) => item.goal_id === goal.id);
      const departmentPerformanceMeta = departmentPerformanceMap[`${goal.id}:${filters.departmentId}`];
      const keyResultItems = goalKeyResults.map((keyResult) => {
        const krTasks = visibleTasks.filter((task) => task.key_result_id === keyResult.id);
        return {
          id: keyResult.id,
          name: keyResult.name,
          responsibleDepartmentName:
            rawData.departmentNamesById[keyResult.responsible_department_id ?? ""] ?? "Chưa gán phòng ban",
          startValue: Number(keyResult.start_value ?? 0),
          current: Number(keyResult.current ?? 0),
          target: Number(keyResult.target ?? 0),
          progress: keyResultProgressMap[keyResult.id] ?? 0,
          weight: Number(keyResult.weight ?? 1),
          taskCount: krTasks.length,
          assigneeDistribution: toAssigneeDistribution(krTasks, rawData.profilesById),
          ownedBySelectedDepartment: keyResult.responsible_department_id === filters.departmentId,
          startDate: keyResult.start_date ?? null,
          endDate: keyResult.end_date ?? null,
        };
      });
      const departmentPerformance = departmentPerformanceMeta?.performance ?? 0;
      return {
        id: goal.id,
        name: goal.name,
        ownerName: goal.owner_id ? rawData.profilesById[goal.owner_id] ?? "Chưa gán" : "Chưa gán",
        status: goal.status ? String(goal.status) : "Chưa đặt",
        progress: departmentPerformance,
        health: computeGoalHealth({ progress: departmentPerformance, endDate: goal.end_date }),
        krCount: keyResultItems.length,
        taskCount: goalTasks.length,
        overdueTaskCount: goalTasks.filter((task) => isTaskOverdue(task)).length,
        endDate: goal.end_date ?? null,
        participationRole: participation?.role ? String(participation.role) : "participant",
        goalWeight: departmentPerformanceMeta?.goalWeight ?? 0.5,
        krWeight: departmentPerformanceMeta?.krWeight ?? 0.5,
        goalInfluence: Math.round(
          (departmentPerformanceMeta?.goalProgress ?? goalProgressMap[goal.id] ?? 0) *
            (departmentPerformanceMeta?.goalWeight ?? 0.5),
        ),
        krInfluence: Math.round(
          (departmentPerformanceMeta?.departmentKrProgress ?? 0) * (departmentPerformanceMeta?.krWeight ?? 0.5),
        ),
        departmentPerformance,
        keyResults: keyResultItems,
      } satisfies DepartmentGoalExecutionItem;
    });

    const activeGoalExecution = goalExecution.filter((goal) => goal.status !== "draft");
    const departmentProgress = activeGoalExecution.length
      ? Math.round(activeGoalExecution.reduce((sum, goal) => sum + goal.progress, 0) / activeGoalExecution.length)
      : 0;
    const ownedKeyResults = goalExecution.flatMap((goal) => goal.keyResults).filter((item) => item.ownedBySelectedDepartment);
    const krAverageProgress = ownedKeyResults.length
      ? Math.round(ownedKeyResults.reduce((sum, keyResult) => sum + keyResult.progress, 0) / ownedKeyResults.length)
      : 0;
    const completedTasks = departmentVisibleTasks.filter((task) => normalizeDashboardStatus(task.status) === "done").length;
    const overdueTasks = departmentVisibleTasks.filter((task) => isTaskOverdue(task));
    const taskCompletionRate = departmentVisibleTasks.length
      ? Math.round((completedTasks / departmentVisibleTasks.length) * 100)
      : 0;

    const memberPerformance: DepartmentMemberPerformanceItem[] = Object.keys(rawData.profilesById)
      .filter((profileId) => rawData.memberRolesById[profileId])
      .map((profileId) => {
        const memberTasks = departmentVisibleTasks.filter((task) => task.assignee_id === profileId);
        const activeTasks = memberTasks.filter(
          (task) => !["done", "cancelled"].includes(normalizeDashboardStatus(task.status)),
        ).length;
        const overdueCount = memberTasks.filter((task) => isTaskOverdue(task)).length;
        const blockedCount = memberTasks.filter((task) => normalizeDashboardStatus(task.status) === "blocked").length;
        const doneCount = memberTasks.filter((task) => normalizeDashboardStatus(task.status) === "done").length;
        const averageTaskProgress = memberTasks.length
          ? Math.round(
              memberTasks.reduce(
                (sum, task) =>
                  sum +
                  toDashboardTaskProgress({
                    type: task.type,
                    status: task.status,
                    progress: task.progress,
                  }),
                0,
              ) / memberTasks.length,
            )
          : 0;
        const keyResultsInvolved = new Set(memberTasks.map((task) => task.key_result_id).filter(Boolean)).size;
        const goalsInvolved = new Set(
          memberTasks
            .map((task) => visibleKeyResults.find((item) => item.id === task.key_result_id)?.goal_id)
            .filter(Boolean),
        ).size;
        return {
          id: profileId,
          name: rawData.profilesById[profileId] ?? "Không rõ",
          roleName: rawData.memberRolesById[profileId] ?? "Không rõ vai trò",
          assignedTasks: memberTasks.length,
          completionRate: memberTasks.length ? Math.round((doneCount / memberTasks.length) * 100) : 0,
          inProgressTasks: memberTasks.filter((task) => normalizeDashboardStatus(task.status) === "doing").length,
          overdueTasks: overdueCount,
          averageTaskProgress,
          goalsInvolved,
          keyResultsInvolved,
          workedHoursToday: formatHoursShort(rawData.todayWorkedMinutesByProfileId[profileId] ?? 0),
          workedHoursWeek: formatHoursShort(rawData.weekWorkedMinutesByProfileId[profileId] ?? 0),
          blockedTasks: blockedCount,
          activeTasks,
        };
      })
      .filter((member) => member.assignedTasks > 0 || filters.assigneeId === "all")
      .sort((a, b) => b.averageTaskProgress - a.averageTaskProgress);

    const membersAtRisk = memberPerformance.filter((member) => member.overdueTasks > 0 || member.blockedTasks > 0).length;

    const risks: DepartmentRiskItem[] = [
      ...goalExecution
        .filter((goal) => goal.health === "off_track" || goal.health === "at_risk")
        .slice(0, 3)
        .map((goal) => ({
          title: goal.name,
          description: `Hiệu suất phòng ban ${goal.departmentPerformance}% · ảnh hưởng goal ${goal.goalInfluence}% · ảnh hưởng KR ${goal.krInfluence}%`,
        })),
      ...goalExecution
        .flatMap((goal) => goal.keyResults)
        .filter((keyResult) => keyResult.ownedBySelectedDepartment && keyResult.progress < 40)
        .slice(0, 3)
        .map((keyResult) => ({
          title: keyResult.name,
          description: `${keyResult.responsibleDepartmentName} mới đạt ${keyResult.progress}% · ${keyResult.taskCount} task liên kết`,
        })),
      ...memberPerformance
        .filter((member) => member.overdueTasks >= 2 || member.activeTasks >= 5)
        .slice(0, 3)
        .map((member) => ({
          title: member.name,
          description: `${member.overdueTasks} quá hạn · ${member.activeTasks} việc đang mở`,
        })),
    ].slice(0, 8);

    const upcomingDeadlines: DepartmentUpcomingTaskItem[] = departmentVisibleTasks
      .filter((task) => task.end_date)
      .map((task) => {
        const urgencyMeta = getDateUrgencyMeta(task.end_date, today);
        return {
          id: task.id,
          taskName: task.name,
          assigneeName: task.assignee_id ? rawData.profilesById[task.assignee_id] ?? "Chưa gán" : "Chưa gán",
          keyResultName: visibleKeyResults.find((item) => item.id === task.key_result_id)?.name ?? "Chưa có KR",
          goalName:
            goalsById[
              String(visibleKeyResults.find((item) => item.id === task.key_result_id)?.goal_id ?? "")
            ]?.name ?? "Chưa có goal",
          endDateAt: task.end_date as string,
          urgencyLabel: urgencyMeta.label,
          urgencyClassName: urgencyMeta.className,
        };
      })
      .filter((item) => {
        const diff = getDateDiffFromToday(item.endDateAt, today);
        return diff !== null && diff <= 7;
      })
      .sort((a, b) => new Date(a.endDateAt).getTime() - new Date(b.endDateAt).getTime())
      .slice(0, 10);

    const recentActivities = visibleActivities.map((activity) => {
      const actorName = activity.profile_id ? rawData.profilesById[String(activity.profile_id)] ?? "Không rõ" : "Hệ thống";
      return {
        id: String(activity.id),
        actorName,
        actorInitial: getInitial(actorName),
        message: formatActivityMessage({
          actorName,
          action: activity.action,
          entityType: activity.entity_type,
          oldValue: activity.old_value ?? null,
          newValue: activity.new_value ?? null,
        }),
        when: formatRelativeTimeVi(activity.created_at),
      } satisfies DepartmentActivityItem;
    });

    const statusOptions = [
      ...new Set(rawData.goals.map((goal) => (goal.status ? String(goal.status) : "Chưa đặt"))),
    ];
    const quarterOptions = [...new Set(rawData.goals.map((goal) => goal.quarter).filter((value): value is number => typeof value === "number"))];
    const yearOptions = [...new Set(rawData.goals.map((goal) => goal.year).filter((value): value is number => typeof value === "number"))];
    const memberOptions = memberPerformance.map((member) => ({ id: member.id, name: member.name }));

    const executionHealth: "on_track" | "at_risk" | "off_track" =
      departmentProgress >= 80
        ? "on_track"
        : departmentProgress >= 50
          ? "at_risk"
          : "off_track";

    return {
      summary: {
        departmentName: rawData.departmentName,
        totalActiveGoals: activeGoalExecution.length,
        totalActiveKeyResults: ownedKeyResults.length,
        totalActiveTasks: departmentVisibleTasks.length,
        departmentProgress,
        executionHealth,
        krAverageProgress,
        taskCompletionRate,
        overdueTasks: overdueTasks.length,
        membersWithAssignedWork: memberPerformance.filter((member) => member.assignedTasks > 0).length,
        membersAtRisk,
      },
      goalExecution,
      memberPerformance,
      risks,
      upcomingDeadlines,
      recentActivities,
      filterOptions: {
        statusOptions,
        quarterOptions,
        yearOptions,
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
