"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatKeyResultMetric, formatKeyResultUnit } from "@/lib/constants/key-results";
import { getComputedTaskProgress } from "@/lib/okr";
import { buildWorkspaceAccessDebug, useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";

const DAY_MS = 24 * 60 * 60 * 1000;
const LEFT_PANEL_WIDTH = 420;

type TimelineScale = "day" | "week" | "month";
type TimelineStatus = "todo" | "in_progress" | "done" | "blocked" | "cancelled";
type TaskViewMode = "gantt" | "list";

type TaskRow = {
  id: string;
  name: string;
  key_result_id: string | null;
  assignee_id: string | null;
  type: string | null;
  status: string | null;
  progress: number | null;
  weight: number | null;
  deadline: string | null;
  created_at: string | null;
  key_result?: unknown;
  assignee?: unknown;
};

type GoalLiteRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
};

type KeyResultLiteRow = {
  id: string;
  goal_id: string | null;
  name: string;
  current: number | null;
  target: number | null;
  unit: string | null;
  start_value: number | null;
  weight: number | null;
  goal: GoalLiteRow | null;
};

type ProfileLiteRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type TaskItem = {
  id: string;
  name: string;
  goalId: string | null;
  goalName: string;
  goalStartDate: string | null;
  goalEndDate: string | null;
  keyResultId: string | null;
  keyResultName: string;
  keyResultMetric: string;
  type: string | null;
  assigneeId: string | null;
  assigneeName: string;
  assigneeShort: string;
  status: TimelineStatus;
  rawStatus: string | null;
  progress: number;
  deadlineAt: string | null;
  startAt: string | null;
  createdAt: string | null;
};

type GoalGroup = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  keyResults: KeyResultGroup[];
};

type KeyResultGroup = {
  id: string;
  name: string;
  goalId: string;
  metric: string;
  tasks: TaskItem[];
};

type TimelinePeriod = {
  key: string;
  start: Date;
  end: Date;
  label: string;
  subLabel: string;
};

type QuickEditState = {
  progress: string;
  deadline: string;
};

type TaskCreatePermissionDebug = {
  checkedAt: string;
  step: string;
  authUserId: string | null;
  profileId: string | null;
  profileName: string | null;
  leaderRoleIds: string[];
  leaderRolesRaw: Array<{ id: string; name: string | null }>;
  userRoleRows: Array<{ department_id: string | null; role_id: string | null }>;
  departments: Array<{ id: string; name: string; parent_department_id: string | null }>;
  rootDepartments: Array<{ id: string; name: string }>;
  canCreateTask: boolean;
  error: string | null;
};

const TIMELINE_STATUS_OPTIONS: Array<{ value: "all" | TimelineStatus; label: string }> = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "todo", label: "Cần làm" },
  { value: "in_progress", label: "Đang làm" },
  { value: "done", label: "Hoàn thành" },
  { value: "blocked", label: "Bị chặn" },
  { value: "cancelled", label: "Đã hủy" },
];

const statusMetaMap: Record<
  TimelineStatus,
  { label: string; badgeClassName: string; barClassName: string; fillClassName: string }
> = {
  todo: {
    label: "Cần làm",
    badgeClassName: "bg-slate-100 text-slate-700",
    barClassName: "bg-slate-300 text-slate-900",
    fillClassName: "bg-slate-500/55",
  },
  in_progress: {
    label: "Đang làm",
    badgeClassName: "bg-blue-50 text-blue-700",
    barClassName: "bg-blue-500 text-white",
    fillClassName: "bg-blue-300/70",
  },
  done: {
    label: "Hoàn thành",
    badgeClassName: "bg-emerald-50 text-emerald-700",
    barClassName: "bg-emerald-500 text-white",
    fillClassName: "bg-emerald-300/80",
  },
  blocked: {
    label: "Bị chặn",
    badgeClassName: "bg-rose-50 text-rose-700",
    barClassName: "bg-rose-500 text-white",
    fillClassName: "bg-rose-300/70",
  },
  cancelled: {
    label: "Đã hủy",
    badgeClassName: "bg-slate-200 text-slate-700",
    barClassName: "bg-slate-400 text-white",
    fillClassName: "bg-slate-300/75",
  },
};

const PERIOD_COUNT: Record<TimelineScale, number> = {
  day: 21,
  week: 12,
  month: 6,
};

const PERIOD_WIDTH: Record<TimelineScale, number> = {
  day: 56,
  week: 92,
  month: 128,
};

const toShortName = (name: string) => {
  const parts = name
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!parts.length) {
    return "--";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
};

const clampProgress = (value: number | null | undefined) => {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return Math.min(100, Math.max(0, Math.round(safe)));
};

const normalizeTimelineStatus = (value: string | null | undefined): TimelineStatus => {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "blocked") {
    return "blocked";
  }
  if (raw === "doing" || raw === "in_progress" || raw === "inprogress" || raw === "review") {
    return "in_progress";
  }
  if (raw === "done" || raw === "completed") {
    return "done";
  }
  if (raw === "cancelled" || raw === "canceled") {
    return "cancelled";
  }
  return "todo";
};

const normalizeGoalLite = (value: unknown): GoalLiteRow | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    id: String(record.id),
    name: String(record.name),
    start_date: record.start_date ? String(record.start_date) : null,
    end_date: record.end_date ? String(record.end_date) : null,
  };
};

const normalizeProfileLite = (value: unknown): ProfileLiteRow | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    id: String(record.id),
    name: record.name ? String(record.name) : null,
    email: record.email ? String(record.email) : null,
  };
};

const normalizeKeyResultLite = (value: unknown): KeyResultLiteRow | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const rawGoal = Array.isArray(record.goal) ? record.goal[0] ?? null : record.goal;
  return {
    id: String(record.id),
    goal_id: record.goal_id ? String(record.goal_id) : null,
    name: String(record.name),
    current: typeof record.current === "number" ? record.current : Number(record.current ?? 0),
    target: typeof record.target === "number" ? record.target : Number(record.target ?? 0),
    unit: record.unit ? String(record.unit) : null,
    start_value: typeof record.start_value === "number" ? record.start_value : Number(record.start_value ?? 0),
    weight: typeof record.weight === "number" ? record.weight : Number(record.weight ?? 1),
    goal: normalizeGoalLite(rawGoal),
  };
};

const formatDate = (value: string | null) => {
  if (!value) {
    return "Chưa đặt";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Không hợp lệ";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
  }).format(date);
};

const toDateInputValue = (value: string | null) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
};

const startOfDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

const startOfWeek = (value: Date) => {
  const next = startOfDay(value);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
};

const startOfMonth = (value: Date) => {
  const next = startOfDay(value);
  next.setDate(1);
  return next;
};

const startOfScale = (value: Date, scale: TimelineScale) => {
  if (scale === "week") {
    return startOfWeek(value);
  }
  if (scale === "month") {
    return startOfMonth(value);
  }
  return startOfDay(value);
};

const addScale = (value: Date, scale: TimelineScale, amount: number) => {
  const next = new Date(value);
  if (scale === "week") {
    next.setDate(next.getDate() + amount * 7);
    return next;
  }
  if (scale === "month") {
    next.setMonth(next.getMonth() + amount);
    return next;
  }
  next.setDate(next.getDate() + amount);
  return next;
};

const endOfScale = (value: Date, scale: TimelineScale) => {
  const next = addScale(startOfScale(value, scale), scale, 1);
  next.setMilliseconds(next.getMilliseconds() - 1);
  return next;
};

const formatPeriodLabel = (date: Date, scale: TimelineScale) => {
  if (scale === "day") {
    return {
      label: new Intl.DateTimeFormat("vi-VN", { weekday: "short" }).format(date),
      subLabel: new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(date),
    };
  }

  if (scale === "week") {
    const end = endOfScale(date, scale);
    return {
      label: `Tuần ${new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(date)}`,
      subLabel: new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(end),
    };
  }

  return {
    label: new Intl.DateTimeFormat("vi-VN", { month: "long" }).format(date),
    subLabel: new Intl.DateTimeFormat("vi-VN", { year: "numeric" }).format(date),
  };
};

const buildTimelinePeriods = (anchor: Date, scale: TimelineScale) => {
  const start = startOfScale(anchor, scale);
  return Array.from({ length: PERIOD_COUNT[scale] }, (_, index) => {
    const periodStart = addScale(start, scale, index);
    const periodEnd = endOfScale(periodStart, scale);
    const formatted = formatPeriodLabel(periodStart, scale);
    return {
      key: `${scale}-${periodStart.toISOString()}`,
      start: periodStart,
      end: periodEnd,
      label: formatted.label,
      subLabel: formatted.subLabel,
    } satisfies TimelinePeriod;
  });
};

const getTaskStartDate = (task: TaskItem) => {
  if (task.createdAt) {
    return startOfDay(new Date(task.createdAt));
  }
  if (task.goalStartDate) {
    return startOfDay(new Date(task.goalStartDate));
  }
  if (task.deadlineAt) {
    return startOfDay(new Date(task.deadlineAt));
  }
  return startOfDay(new Date());
};

const getTaskEndDate = (task: TaskItem) => {
  if (!task.deadlineAt) {
    return null;
  }

  const deadline = startOfDay(new Date(task.deadlineAt));
  const start = getTaskStartDate(task);
  return deadline.getTime() >= start.getTime() ? deadline : start;
};

const getScaleDiff = (base: Date, value: Date, scale: TimelineScale) => {
  if (scale === "day") {
    return Math.floor((startOfDay(value).getTime() - startOfDay(base).getTime()) / DAY_MS);
  }
  if (scale === "week") {
    return Math.floor((startOfWeek(value).getTime() - startOfWeek(base).getTime()) / (DAY_MS * 7));
  }
  return (value.getFullYear() - base.getFullYear()) * 12 + (value.getMonth() - base.getMonth());
};

const buildTaskTooltip = (task: TaskItem) =>
  [
    task.name,
    `Mục tiêu: ${task.goalName}`,
    `Kết quả then chốt: ${task.keyResultName}`,
    `Người phụ trách: ${task.assigneeName}`,
    `Tiến độ: ${task.progress}%`,
    `Hạn chót: ${formatDate(task.deadlineAt)}`,
    `Trạng thái: ${statusMetaMap[task.status].label}`,
  ].join("\n");

function StatusBadge({ status }: { status: TimelineStatus }) {
  return (
    <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${statusMetaMap[status].badgeClassName}`}>
      {statusMetaMap[status].label}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-blue-600" style={{ width: `${value}%` }} />
    </div>
  );
}

function ScaleButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
        active ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

export default function TasksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceAccess = useWorkspaceAccess();

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [taskLoadError, setTaskLoadError] = useState<string | null>(null);
  const [goalFilters, setGoalFilters] = useState<Array<{ id: string; name: string }>>([]);
  const [keyResultFilters, setKeyResultFilters] = useState<Array<{ id: string; name: string; goalId: string }>>([]);
  const [assigneeFilters, setAssigneeFilters] = useState<Array<{ id: string; name: string }>>([]);

  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TimelineStatus>("all");
  const [goalFilter, setGoalFilter] = useState<"all" | string>("all");
  const [keyResultFilter, setKeyResultFilter] = useState<"all" | string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<"all" | string>("all");
  const [viewMode, setViewMode] = useState<TaskViewMode>("gantt");
  const [timeScale, setTimeScale] = useState<TimelineScale>("week");
  const [rangeAnchor, setRangeAnchor] = useState(() => new Date());
  const [showNoDeadlineSection, setShowNoDeadlineSection] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [quickEditState, setQuickEditState] = useState<QuickEditState>({ progress: "0", deadline: "" });
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);

  const showPermissionDebug = searchParams.get("debugPermission") === "1";
  const canCreateTask = workspaceAccess.canManage && !workspaceAccess.error;
  const isCheckingCreatePermission = workspaceAccess.isLoading;
  const rootDepartments = workspaceAccess.managedDepartments;
  const permissionDebug: TaskCreatePermissionDebug = useMemo(
    () => ({
      ...buildWorkspaceAccessDebug({
        authUserId: workspaceAccess.authUserId,
        profileId: workspaceAccess.profileId,
        profileName: workspaceAccess.profileName,
        leaderRoleIds: workspaceAccess.leaderRoleIds,
        roles: workspaceAccess.roles,
        memberships: workspaceAccess.memberships,
        departments: workspaceAccess.departments,
        managedDepartments: workspaceAccess.managedDepartments,
        canManage: workspaceAccess.canManage,
        error: workspaceAccess.error,
        lastLoadedAt: workspaceAccess.lastLoadedAt,
      }),
      canCreateTask: workspaceAccess.canManage,
    }),
    [workspaceAccess],
  );

  useEffect(() => {
    let isActive = true;

    const loadTasks = async () => {
      setIsLoadingTasks(true);
      setTaskLoadError(null);

      try {
        const { data, error } = await supabase
          .from("tasks")
          .select(`
            id,
            name,
            key_result_id,
            assignee_id,
            type,
            status,
            progress,
            weight,
            deadline,
            created_at,
            key_result:key_results!tasks_key_result_id_fkey(
              id,
              goal_id,
              name,
              current,
              target,
              unit,
              start_value,
              weight,
              goal:goals!key_results_goal_id_fkey(
                id,
                name,
                start_date,
                end_date
              )
            ),
            assignee:profiles!tasks_assignee_id_fkey(
              id,
              name,
              email
            )
          `)
          .order("created_at", { ascending: false });

        if (!isActive) {
          return;
        }

        if (error) {
          setTaskLoadError(error.message || "Không tải được danh sách công việc.");
          setTasks([]);
          setGoalFilters([]);
          setKeyResultFilters([]);
          setAssigneeFilters([]);
          return;
        }

        const mappedTasks = ((data ?? []) as Array<Record<string, unknown>>).map((rawRow) => {
          const row = rawRow as TaskRow;
          const keyResult = normalizeKeyResultLite(Array.isArray(rawRow.key_result) ? rawRow.key_result[0] ?? null : rawRow.key_result);
          const assignee = normalizeProfileLite(Array.isArray(rawRow.assignee) ? rawRow.assignee[0] ?? null : rawRow.assignee);
          const goalName = keyResult?.goal?.name ?? "Chưa có mục tiêu";
          const keyResultName = keyResult?.name ?? "Chưa gắn key result";
          const keyResultMetric = keyResult
            ? `${formatKeyResultMetric(keyResult.start_value, keyResult.unit)} → ${formatKeyResultMetric(
                keyResult.current,
                keyResult.unit,
              )} → ${formatKeyResultMetric(keyResult.target, keyResult.unit)} ${formatKeyResultUnit(keyResult.unit)}`
            : "Chưa có số liệu KR";
          const assigneeName = assignee?.name?.trim() || assignee?.email?.trim() || "Chưa gán";

          return {
            id: String(row.id),
            name: String(row.name),
            goalId: keyResult?.goal?.id ?? (keyResult?.goal_id ? String(keyResult.goal_id) : null),
            goalName,
            goalStartDate: keyResult?.goal?.start_date ?? null,
            goalEndDate: keyResult?.goal?.end_date ?? null,
            keyResultId: row.key_result_id ? String(row.key_result_id) : null,
            keyResultName,
            keyResultMetric,
            type: row.type ? String(row.type) : null,
            assigneeId: row.assignee_id ? String(row.assignee_id) : null,
            assigneeName,
            assigneeShort: toShortName(assigneeName),
            status: normalizeTimelineStatus(row.status),
            rawStatus: row.status ? String(row.status) : null,
            progress: getComputedTaskProgress({
              type: row.type,
              status: row.status,
              progress: row.progress,
            }),
            deadlineAt: row.deadline ? String(row.deadline) : null,
            startAt: row.created_at ? String(row.created_at) : null,
            createdAt: row.created_at ? String(row.created_at) : null,
          } satisfies TaskItem;
        });

        setTasks(mappedTasks);
        setGoalFilters(
          Array.from(
            new Map(
              mappedTasks
                .filter((task) => task.goalId)
                .map((task) => [task.goalId as string, { id: task.goalId as string, name: task.goalName }]),
            ).values(),
          ),
        );
        setKeyResultFilters(
          Array.from(
            new Map(
              mappedTasks
                .filter((task) => task.keyResultId && task.goalId)
                .map((task) => [
                  task.keyResultId as string,
                  {
                    id: task.keyResultId as string,
                    name: task.keyResultName,
                    goalId: task.goalId as string,
                  },
                ]),
            ).values(),
          ),
        );
        setAssigneeFilters(
          Array.from(
            new Map(
              mappedTasks
                .filter((task) => task.assigneeId)
                .map((task) => [task.assigneeId as string, { id: task.assigneeId as string, name: task.assigneeName }]),
            ).values(),
          ),
        );
      } catch {
        if (!isActive) {
          return;
        }

        setTaskLoadError("Có lỗi khi tải dữ liệu công việc.");
        setTasks([]);
        setGoalFilters([]);
        setKeyResultFilters([]);
        setAssigneeFilters([]);
      } finally {
        if (isActive) {
          setIsLoadingTasks(false);
        }
      }
    };

    void loadTasks();

    return () => {
      isActive = false;
    };
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (statusFilter !== "all" && task.status !== statusFilter) {
        return false;
      }
      if (goalFilter !== "all" && task.goalId !== goalFilter) {
        return false;
      }
      if (keyResultFilter !== "all" && task.keyResultId !== keyResultFilter) {
        return false;
      }
      if (assigneeFilter !== "all" && task.assigneeId !== assigneeFilter) {
        return false;
      }

      const keyword = searchKeyword.trim().toLowerCase();
      if (!keyword) {
        return true;
      }

      const haystack = `${task.name} ${task.goalName} ${task.keyResultName} ${task.assigneeName}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [assigneeFilter, goalFilter, keyResultFilter, searchKeyword, statusFilter, tasks]);

  const filteredKeyResultFilters = useMemo(() => {
    if (goalFilter === "all") {
      return keyResultFilters;
    }
    return keyResultFilters.filter((keyResult) => keyResult.goalId === goalFilter);
  }, [goalFilter, keyResultFilters]);

  const noDeadlineTasks = useMemo(
    () => filteredTasks.filter((task) => !task.deadlineAt),
    [filteredTasks],
  );

  const visibleTasks = useMemo(
    () => filteredTasks.filter((task) => Boolean(task.deadlineAt)),
    [filteredTasks],
  );

  const groupedGoals = useMemo(() => {
    const goalMap = new Map<string, GoalGroup>();

    visibleTasks
      .slice()
      .sort((a, b) => {
        const aTime = getTaskEndDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bTime = getTaskEndDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      })
      .forEach((task) => {
        const goalId = task.goalId ?? "no-goal";
        if (!goalMap.has(goalId)) {
          goalMap.set(goalId, {
            id: goalId,
            name: task.goalName,
            startDate: task.goalStartDate,
            endDate: task.goalEndDate,
            keyResults: [],
          });
        }

        const goal = goalMap.get(goalId)!;
        let keyResult = goal.keyResults.find((item) => item.id === (task.keyResultId ?? "no-kr"));
        if (!keyResult) {
          keyResult = {
            id: task.keyResultId ?? "no-kr",
            name: task.keyResultName,
            goalId,
            metric: task.keyResultMetric,
            tasks: [],
          };
          goal.keyResults.push(keyResult);
        }
        keyResult.tasks.push(task);
      });

    return Array.from(goalMap.values());
  }, [visibleTasks]);

  const periods = useMemo(() => buildTimelinePeriods(rangeAnchor, timeScale), [rangeAnchor, timeScale]);
  const periodWidth = PERIOD_WIDTH[timeScale];
  const timelineWidth = periods.length * periodWidth;
  const firstPeriodStart = periods[0]?.start ?? startOfScale(new Date(), timeScale);
  const todayIndex = useMemo(() => {
    const today = new Date();
    return periods.findIndex((period) => today >= period.start && today <= period.end);
  }, [periods]);

  const tasksInProgress = useMemo(
    () => filteredTasks.filter((task) => task.status === "in_progress").length,
    [filteredTasks],
  );
  const overdueTaskCount = useMemo(
    () =>
      filteredTasks.filter((task) => {
        if (!task.deadlineAt) {
          return false;
        }
        const deadline = startOfDay(new Date(task.deadlineAt));
        const today = startOfDay(new Date());
        return deadline < today && !["done", "cancelled"].includes(task.status);
      }).length,
    [filteredTasks],
  );
  const dueThisWeekCount = useMemo(
    () =>
      filteredTasks.filter((task) => {
        if (!task.deadlineAt) {
          return false;
        }
        const deadline = startOfDay(new Date(task.deadlineAt));
        const today = startOfDay(new Date());
        const diffDays = Math.round((deadline.getTime() - today.getTime()) / DAY_MS);
        return diffDays >= 0 && diffDays <= 7 && !["done", "cancelled"].includes(task.status);
      }).length,
    [filteredTasks],
  );

  const openQuickEdit = (task: TaskItem) => {
    setEditingTaskId(task.id);
    setQuickEditState({
      progress: String(task.progress),
      deadline: toDateInputValue(task.deadlineAt),
    });
  };

  const handleSaveQuickEdit = async (task: TaskItem) => {
    if (savingTaskId) {
      return;
    }

    const safeProgress = clampProgress(Number(quickEditState.progress));
    const nextDeadline = quickEditState.deadline || null;
    setSavingTaskId(task.id);

    const { error } = await supabase
      .from("tasks")
      .update({
        progress: safeProgress,
        deadline: nextDeadline,
      })
      .eq("id", task.id);

    if (error) {
      setTaskLoadError(error.message || "Không thể cập nhật nhanh công việc.");
      setSavingTaskId(null);
      return;
    }

    setTasks((prev) =>
      prev.map((item) =>
        item.id === task.id
          ? {
              ...item,
              progress: safeProgress,
              deadlineAt: nextDeadline,
            }
          : item,
      ),
    );
    setEditingTaskId(null);
    setSavingTaskId(null);
  };

  const addTaskHref = useMemo(() => {
    const params = new URLSearchParams();
    const defaultDepartmentId = rootDepartments[0]?.id;
    if (defaultDepartmentId) {
      params.set("departmentId", defaultDepartmentId);
    }
    if (goalFilter !== "all") {
      params.set("goalId", goalFilter);
    }
    if (keyResultFilter !== "all") {
      params.set("keyResultId", keyResultFilter);
    }
    const query = params.toString();
    return query ? `/tasks/new?${query}` : "/tasks/new";
  }, [goalFilter, keyResultFilter, rootDepartments]);

  const moveRange = (direction: -1 | 1) => {
    setRangeAnchor((current) => addScale(current, timeScale, PERIOD_COUNT[timeScale] * direction));
  };

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="tasks" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[280px]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">
                  <Link href="/dashboard" className="hover:text-slate-700">
                    Bảng điều khiển
                  </Link>
                  <span className="px-2">›</span>
                  <span>Công việc</span>
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em] text-slate-900">
                  Timeline thực thi
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Mục tiêu → Kết quả then chốt → Công việc · {filteredTasks.length} / {tasks.length} công việc
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-1">
                  <ScaleButton active={viewMode === "gantt"} onClick={() => setViewMode("gantt")}>
                    Gantt
                  </ScaleButton>
                  <ScaleButton active={viewMode === "list"} onClick={() => setViewMode("list")}>
                    Danh sách
                  </ScaleButton>
                </div>
                <input
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="Tìm theo công việc, KR, mục tiêu, người phụ trách..."
                  className="h-11 w-[320px] rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                {!isCheckingCreatePermission && canCreateTask ? (
                  <button
                    type="button"
                    onClick={() => router.push(addTaskHref)}
                    className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    + Thêm công việc
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          <main className="space-y-4 px-4 py-5 lg:px-7">
            {showPermissionDebug && permissionDebug ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-xs text-slate-100">
                <p className="mb-2 font-semibold text-sky-300">Debug quyền tạo công việc (debugPermission=1)</p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                  {JSON.stringify(permissionDebug, null, 2)}
                </pre>
              </div>
            ) : null}

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as "all" | TimelineStatus)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Tất cả trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMELINE_STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={goalFilter}
                  onValueChange={(value) => {
                    setGoalFilter(value as "all" | string);
                    setKeyResultFilter("all");
                  }}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Tất cả mục tiêu" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả mục tiêu</SelectItem>
                    {goalFilters.map((goal) => (
                      <SelectItem key={goal.id} value={goal.id}>
                        {goal.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={keyResultFilter} onValueChange={(value) => setKeyResultFilter(value as "all" | string)}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Tất cả key result" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả key result</SelectItem>
                    {filteredKeyResultFilters.map((keyResult) => (
                      <SelectItem key={keyResult.id} value={keyResult.id}>
                        {keyResult.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={assigneeFilter} onValueChange={(value) => setAssigneeFilter(value as "all" | string)}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Tất cả người phụ trách" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả người phụ trách</SelectItem>
                    {assigneeFilters.map((assignee) => (
                      <SelectItem key={assignee.id} value={assignee.id}>
                        {assignee.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <button
                  type="button"
                  onClick={() => {
                    setSearchKeyword("");
                    setStatusFilter("all");
                    setGoalFilter("all");
                    setKeyResultFilter("all");
                    setAssigneeFilter("all");
                  }}
                  className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Xóa lọc
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    {viewMode === "gantt" ? "Biểu đồ tiến độ công việc" : "Danh sách công việc"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {viewMode === "gantt"
                      ? "Theo dõi thực thi theo mục tiêu, kết quả then chốt và hạn chót của từng công việc."
                      : "Xem nhanh công việc theo cấu trúc Mục tiêu → Kết quả then chốt → Công việc."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {viewMode === "gantt" ? (
                    <>
                      <div className="rounded-xl border border-slate-200 bg-slate-100 p-1">
                        <ScaleButton active={timeScale === "day"} onClick={() => setTimeScale("day")}>
                          Ngày
                        </ScaleButton>
                        <ScaleButton active={timeScale === "week"} onClick={() => setTimeScale("week")}>
                          Tuần
                        </ScaleButton>
                        <ScaleButton active={timeScale === "month"} onClick={() => setTimeScale("month")}>
                          Tháng
                        </ScaleButton>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => moveRange(-1)}
                          className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Trước
                        </button>
                        <button
                          type="button"
                          onClick={() => setRangeAnchor(new Date())}
                          className="inline-flex h-10 items-center rounded-xl bg-blue-50 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          Hôm nay
                        </button>
                        <button
                          type="button"
                          onClick={() => moveRange(1)}
                          className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Sau
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                    Công việc quá hạn
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{overdueTaskCount}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">Đến hạn 7 ngày</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{dueThisWeekCount}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">Đang thực thi</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{tasksInProgress}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">Chưa có hạn chót</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{noDeadlineTasks.length}</p>
                </div>
              </div>
            </section>

            {isLoadingTasks ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">
                Đang tải dữ liệu trục thời gian...
              </div>
            ) : null}

            {!isLoadingTasks && taskLoadError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {taskLoadError}
              </div>
            ) : null}

            {!isLoadingTasks && filteredTasks.length === 0 ? (
              <section className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
                <p className="text-base font-semibold text-slate-900">
                  Chưa có công việc nào để hiển thị trên trục thời gian.
                </p>
                <Link
                  href="/goals"
                  className="mt-5 inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Đi tới mục tiêu để tạo công việc
                </Link>
              </section>
            ) : null}

            {!isLoadingTasks && filteredTasks.length > 0 ? (
              viewMode === "gantt" ? (
              <section className="rounded-2xl border border-slate-200 bg-white">
                <div className="overflow-auto rounded-2xl">
                  <div
                    className="min-w-full"
                    style={{ width: LEFT_PANEL_WIDTH + timelineWidth }}
                  >
                    <div
                      className="grid border-b border-slate-200 bg-slate-50"
                      style={{ gridTemplateColumns: `${LEFT_PANEL_WIDTH}px ${timelineWidth}px` }}
                    >
                      <div className="px-5 py-4">
                        <p className="text-sm font-semibold text-slate-900">Cấu trúc thực thi</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Mục tiêu → Kết quả then chốt → Công việc
                        </p>
                      </div>
                      <div
                        className="grid"
                        style={{ gridTemplateColumns: `repeat(${periods.length}, ${periodWidth}px)` }}
                      >
                        {periods.map((period, index) => (
                          <div
                            key={period.key}
                            className={`border-l border-slate-200 px-2 py-3 text-center ${
                              index === todayIndex ? "bg-blue-50/70" : ""
                            }`}
                          >
                            <p className="text-xs font-semibold text-slate-700">{period.label}</p>
                            <p className="mt-1 text-[11px] text-slate-500">{period.subLabel}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {groupedGoals.map((goal) => (
                      <Fragment key={goal.id}>
                        <div
                          className="grid border-b border-slate-100"
                          style={{ gridTemplateColumns: `${LEFT_PANEL_WIDTH}px ${timelineWidth}px` }}
                        >
                          <div className="bg-slate-50 px-5 py-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                                  Mục tiêu
                                </p>
                                <p className="mt-1 text-base font-semibold text-slate-900">{goal.name}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {goal.startDate || goal.endDate
                                    ? `${formatDate(goal.startDate)} → ${formatDate(goal.endDate)}`
                                    : "Chưa đặt khung thời gian"}
                                </p>
                              </div>
                              {goal.id !== "no-goal" ? (
                                <Link
                                  href={`/goals/${goal.id}`}
                                  className="text-xs font-semibold text-blue-700 hover:text-blue-800"
                                >
                                  Mở mục tiêu
                                </Link>
                              ) : null}
                            </div>
                          </div>
                          <div className="relative h-full min-h-[64px] bg-slate-50">
                            <div
                              className="absolute inset-0 grid"
                              style={{ gridTemplateColumns: `repeat(${periods.length}, ${periodWidth}px)` }}
                            >
                              {periods.map((period, index) => (
                                <div
                                  key={`${goal.id}-${period.key}`}
                                  className={`border-l border-slate-100 ${index === todayIndex ? "bg-blue-50/50" : ""}`}
                                />
                              ))}
                            </div>
                          </div>
                        </div>

                        {goal.keyResults.map((keyResult) => (
                          <Fragment key={keyResult.id}>
                            <div
                              className="grid border-b border-slate-100"
                              style={{ gridTemplateColumns: `${LEFT_PANEL_WIDTH}px ${timelineWidth}px` }}
                            >
                              <div className="bg-white px-5 py-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                                      Kết quả then chốt
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-slate-900">{keyResult.name}</p>
                                    <p className="mt-1 text-xs text-slate-500">{keyResult.metric}</p>
                                  </div>
                                  {keyResult.goalId !== "no-goal" && keyResult.id !== "no-kr" ? (
                                    <Link
                                      href={`/tasks/new?goalId=${keyResult.goalId}&keyResultId=${keyResult.id}`}
                                      className="text-xs font-semibold text-blue-700 hover:text-blue-800"
                                    >
                                      + Thêm công việc
                                    </Link>
                                  ) : null}
                                </div>
                              </div>
                              <div className="relative h-full min-h-[62px] bg-white">
                                <div
                                  className="absolute inset-0 grid"
                                  style={{ gridTemplateColumns: `repeat(${periods.length}, ${periodWidth}px)` }}
                                >
                                  {periods.map((period, index) => (
                                    <div
                                      key={`${keyResult.id}-${period.key}`}
                                      className={`border-l border-slate-100 ${index === todayIndex ? "bg-blue-50/40" : ""}`}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>

                            {keyResult.tasks.map((task) => {
                              const startDate = getTaskStartDate(task);
                              const endDate = getTaskEndDate(task);
                              const rawStartIndex = getScaleDiff(firstPeriodStart, startDate, timeScale);
                              const rawEndIndex = endDate ? getScaleDiff(firstPeriodStart, endDate, timeScale) : rawStartIndex;
                              const visibleStartIndex = Math.max(0, rawStartIndex);
                              const visibleEndIndex = Math.min(periods.length - 1, Math.max(rawEndIndex, rawStartIndex));
                              const isVisible = rawEndIndex >= 0 && rawStartIndex <= periods.length - 1;
                              const span = Math.max(1, visibleEndIndex - visibleStartIndex + 1);
                              const barLeft = visibleStartIndex * periodWidth + 6;
                              const barWidth = Math.max(periodWidth - 12, span * periodWidth - 12);
                              const tooltip = buildTaskTooltip(task);
                              const quickEditing = editingTaskId === task.id;

                              return (
                                <div
                                  key={task.id}
                                  className="grid border-b border-slate-100 last:border-b-0"
                                  style={{ gridTemplateColumns: `${LEFT_PANEL_WIDTH}px ${timelineWidth}px` }}
                                >
                                  <div className="bg-white px-5 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <Link
                                          href={`/tasks/${task.id}`}
                                          className="block truncate text-sm font-semibold text-slate-900 hover:text-blue-700"
                                          title={tooltip}
                                        >
                                          {task.name}
                                        </Link>
                                        <p className="mt-1 text-xs text-slate-500">
                                          {task.type === "okr" ? "Công việc OKR" : "Công việc KPI"}
                                          {" · "}
                                          {task.assigneeName}
                                        </p>
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                          <StatusBadge status={task.status} />
                                          <span className="text-xs font-medium text-slate-500">{task.progress}%</span>
                                          <span className="text-xs text-slate-500">{formatDate(task.deadlineAt)}</span>
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => openQuickEdit(task)}
                                        className="text-xs font-semibold text-blue-700 hover:text-blue-800"
                                      >
                                        Sửa nhanh
                                      </button>
                                    </div>

                                    {quickEditing ? (
                                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                        <div className="grid gap-3 md:grid-cols-2">
                                          <label className="space-y-1 text-xs font-medium text-slate-600">
                                            <span>Tiến độ</span>
                                            <input
                                              type="number"
                                              min={0}
                                              max={100}
                                              value={quickEditState.progress}
                                              onChange={(event) =>
                                                setQuickEditState((prev) => ({
                                                  ...prev,
                                                  progress: event.target.value,
                                                }))
                                              }
                                              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                            />
                                          </label>
                                          <label className="space-y-1 text-xs font-medium text-slate-600">
                                            <span>Deadline</span>
                                            <input
                                              type="date"
                                              value={quickEditState.deadline}
                                              onChange={(event) =>
                                                setQuickEditState((prev) => ({
                                                  ...prev,
                                                  deadline: event.target.value,
                                                }))
                                              }
                                              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                            />
                                          </label>
                                        </div>
                                        <div className="mt-3 flex items-center justify-end gap-2">
                                          <button
                                            type="button"
                                            onClick={() => setEditingTaskId(null)}
                                            className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                          >
                                            Hủy
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => void handleSaveQuickEdit(task)}
                                            disabled={savingTaskId === task.id}
                                            className="inline-flex h-8 items-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                                          >
                                            {savingTaskId === task.id ? "Đang lưu..." : "Lưu nhanh"}
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>

                                  <div className="relative min-h-[92px] bg-white">
                                    <div
                                      className="absolute inset-0 grid"
                                      style={{ gridTemplateColumns: `repeat(${periods.length}, ${periodWidth}px)` }}
                                    >
                                      {periods.map((period, index) => (
                                        <div
                                          key={`${task.id}-${period.key}`}
                                          className={`border-l border-slate-100 ${index === todayIndex ? "bg-blue-50/40" : ""}`}
                                        />
                                      ))}
                                    </div>

                                    {isVisible && endDate ? (
                                      <button
                                        type="button"
                                        title={tooltip}
                                        onClick={() => router.push(`/tasks/${task.id}`)}
                                        className={`absolute top-1/2 flex h-10 -translate-y-1/2 items-center overflow-hidden rounded-xl px-3 text-left shadow-sm transition hover:brightness-[0.98] ${statusMetaMap[task.status].barClassName}`}
                                        style={{ left: barLeft, width: barWidth }}
                                      >
                                        <span
                                          className={`absolute inset-y-0 left-0 ${statusMetaMap[task.status].fillClassName}`}
                                          style={{ width: `${task.progress}%` }}
                                        />
                                        <span className="relative z-[1] flex w-full items-center justify-between gap-3">
                                          <span className="truncate text-sm font-semibold">{task.name}</span>
                                          <span className="text-xs font-semibold">{task.progress}%</span>
                                        </span>
                                      </button>
                                    ) : (
                                      <div className="absolute inset-y-0 left-0 flex items-center px-4 text-xs text-slate-400">
                                        Ngoài khung thời gian
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </Fragment>
                        ))}
                      </Fragment>
                    ))}
                  </div>
                </div>
              </section>
              ) : (
                <section className="rounded-2xl border border-slate-200 bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1120px] text-left">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.08em] text-slate-400">
                          <th className="px-5 py-3 font-semibold">Công việc</th>
                          <th className="px-4 py-3 font-semibold">Kết quả then chốt</th>
                          <th className="px-4 py-3 font-semibold">Mục tiêu</th>
                          <th className="px-4 py-3 font-semibold">Người phụ trách</th>
                          <th className="px-4 py-3 font-semibold">Trạng thái</th>
                          <th className="px-4 py-3 font-semibold">Tiến độ</th>
                          <th className="px-4 py-3 font-semibold">Deadline</th>
                          <th className="px-4 py-3 font-semibold">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTasks.map((task) => {
                          const quickEditing = editingTaskId === task.id;
                          return (
                            <Fragment key={task.id}>
                              <tr className="border-b border-slate-100 align-top">
                                <td className="px-5 py-4">
                                  <Link
                                    href={`/tasks/${task.id}`}
                                    className="text-sm font-semibold text-slate-900 hover:text-blue-700"
                                  >
                                    {task.name}
                                  </Link>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {task.type?.toUpperCase() ?? "KPI"} · {task.progress}%
                                  </p>
                                </td>
                                <td className="px-4 py-4">
                                  <p className="text-sm font-semibold text-slate-900">{task.keyResultName}</p>
                                  <p className="mt-1 text-xs text-slate-500">{task.keyResultMetric}</p>
                                </td>
                                <td className="px-4 py-4">
                                  <p className="text-sm text-slate-700">{task.goalName}</p>
                                </td>
                                <td className="px-4 py-4">
                                  <p className="text-sm text-slate-700">{task.assigneeName}</p>
                                </td>
                                <td className="px-4 py-4">
                                  <StatusBadge status={task.status} />
                                </td>
                                <td className="px-4 py-4">
                                  <div className="w-[140px]">
                                    <ProgressBar value={task.progress} />
                                    <p className="mt-2 text-xs text-slate-500">{task.progress}%</p>
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-sm text-slate-600">
                                  {formatDate(task.deadlineAt)}
                                </td>
                                <td className="px-4 py-4">
                                  <div className="flex items-center gap-2">
                                    <Link
                                      href={`/tasks/${task.id}`}
                                      className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                      Chi tiết
                                    </Link>
                                    <button
                                      type="button"
                                      onClick={() => openQuickEdit(task)}
                                      className="inline-flex h-8 items-center rounded-lg bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                                    >
                                      Sửa nhanh
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {quickEditing ? (
                                <tr className="border-b border-slate-100 bg-slate-50">
                                  <td colSpan={8} className="px-5 py-4">
                                    <div className="grid gap-3 md:grid-cols-[180px_180px_auto]">
                                      <label className="space-y-1 text-xs font-medium text-slate-600">
                                        <span>Tiến độ</span>
                                        <input
                                          type="number"
                                          min={0}
                                          max={100}
                                          value={quickEditState.progress}
                                          onChange={(event) =>
                                            setQuickEditState((prev) => ({
                                              ...prev,
                                              progress: event.target.value,
                                            }))
                                          }
                                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                        />
                                      </label>
                                      <label className="space-y-1 text-xs font-medium text-slate-600">
                                        <span>Deadline</span>
                                        <input
                                          type="date"
                                          value={quickEditState.deadline}
                                          onChange={(event) =>
                                            setQuickEditState((prev) => ({
                                              ...prev,
                                              deadline: event.target.value,
                                            }))
                                          }
                                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                        />
                                      </label>
                                      <div className="flex items-end justify-end gap-2">
                                        <button
                                          type="button"
                                          onClick={() => setEditingTaskId(null)}
                                          className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                        >
                                          Hủy
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void handleSaveQuickEdit(task)}
                                          disabled={savingTaskId === task.id}
                                          className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                                        >
                                          {savingTaskId === task.id ? "Đang lưu..." : "Lưu nhanh"}
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )
            ) : null}

            {!isLoadingTasks && viewMode === "gantt" && noDeadlineTasks.length > 0 ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Công việc chưa có hạn chót</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Các công việc này chưa thể đặt lên trục thời gian nên được tách riêng để xử lý.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {noDeadlineTasks.length} công việc
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowNoDeadlineSection((prev) => !prev)}
                      className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {showNoDeadlineSection ? "Thu gọn" : "Mở rộng"}
                    </button>
                  </div>
                </div>

                {showNoDeadlineSection ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {noDeadlineTasks.map((task) => (
                      <div key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Link
                              href={`/tasks/${task.id}`}
                              className="text-sm font-semibold text-slate-900 hover:text-blue-700"
                            >
                              {task.name}
                            </Link>
                            <p className="mt-1 text-xs text-slate-500">{task.goalName}</p>
                            <p className="mt-1 text-xs font-medium text-slate-600">{task.keyResultName}</p>
                          </div>
                          <StatusBadge status={task.status} />
                        </div>
                        <div className="mt-3">
                          <ProgressBar value={task.progress} />
                          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                            <span>{task.progress}%</span>
                            <span>{task.assigneeName}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
