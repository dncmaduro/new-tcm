"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Fragment,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import {
  buildTimelinePeriods,
  clampTimelineZoom,
  formatTimelineDurationVi,
  getFitZoomLevel,
  getPeriodWidthForZoom,
  getTimelineBarLayout,
  getTimelineDurationDays,
  getTodayIndicatorOffsetPx,
  startOfScale,
  TIMELINE_MAX_ZOOM,
  TIMELINE_MIN_ZOOM,
  TIMELINE_ZOOM_STEP,
  type TimelineScale,
} from "@/lib/task-gantt";
import {
  formatDateOnlyVi,
  formatTimelineRangeVi,
  getTimelineMissingReason,
  getTimelineRange,
  getTimelineOutsideParentWarning,
  isDateRangeOrdered,
  startOfLocalDay,
} from "@/lib/timeline";

const DAY_MS = 24 * 60 * 60 * 1000;
const LEFT_PANEL_WIDTH = 420;

type TimelineStatus = "todo" | "in_progress" | "done" | "blocked" | "cancelled";
type TaskViewMode = "gantt" | "list";
type StructureMode = "goal" | "key_result" | "task";

type TaskRow = {
  id: string;
  name: string;
  key_result_id: string | null;
  assignee_id: string | null;
  type: string | null;
  status: string | null;
  progress: number | null;
  weight: number | null;
  start_date: string | null;
  end_date: string | null;
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
  start_date: string | null;
  end_date: string | null;
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
  keyResultId: string | null;
  keyResultName: string;
  keyResultMetric: string;
  keyResult: KeyResultLiteRow | null;
  type: string | null;
  assigneeId: string | null;
  assigneeName: string;
  assigneeShort: string;
  status: TimelineStatus;
  rawStatus: string | null;
  progress: number;
  createdAt: string | null;
  startDate: string | null;
  endDate: string | null;
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
  startDate: string | null;
  endDate: string | null;
  tasks: TaskItem[];
};

type GoalTimelineItem = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  keyResultCount: number;
  taskCount: number;
};

type KeyResultTimelineItem = {
  id: string;
  goalId: string;
  goalName: string;
  name: string;
  metric: string;
  startDate: string | null;
  endDate: string | null;
  taskCount: number;
};

type QuickEditState = {
  progress: string;
  startDate: string;
  endDate: string;
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

const STICKY_PANEL_SHADOW = "shadow-[10px_0_18px_-18px_rgba(15,23,42,0.35)]";

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
    start_date: record.start_date ? String(record.start_date) : null,
    end_date: record.end_date ? String(record.end_date) : null,
    goal: normalizeGoalLite(rawGoal),
  };
};

const getTaskTimeline = (task: TaskItem) => getTimelineRange(task.startDate, task.endDate);

const getTaskTimelineIssue = (task: TaskItem) => {
  const timelineReason = getTimelineMissingReason(
    task.startDate,
    task.endDate,
    "Công việc chưa có mốc thời gian",
    "Mốc thời gian công việc không hợp lệ",
  );

  if (timelineReason) {
    return timelineReason;
  }

  if (task.keyResultId && !task.keyResult) {
    return "Không tải được dữ liệu Key Result liên kết.";
  }

  if (!task.keyResultId) {
    return "Công việc chưa gắn Key Result.";
  }

  return "Không thể đặt công việc lên timeline.";
};

const getTaskTimelineAlignmentWarning = (task: TaskItem) =>
  getTimelineOutsideParentWarning(task.startDate, task.endDate, task.keyResult?.start_date ?? null, task.keyResult?.end_date ?? null, {
    subjectLabel: "Thời gian công việc",
    parentLabel: "KR",
  });

const buildGoalGroups = (sourceTasks: TaskItem[]) => {
  const goalMap = new Map<string, GoalGroup>();

  sourceTasks
    .slice()
    .sort((a, b) => {
      const aTime = getTaskTimeline(a)?.end.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = getTaskTimeline(b)?.end.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .forEach((task) => {
      const goalId = task.goalId ?? "no-goal";
      if (!goalMap.has(goalId)) {
        goalMap.set(goalId, {
          id: goalId,
          name: task.goalName,
          startDate: task.keyResult?.goal?.start_date ?? null,
          endDate: task.keyResult?.goal?.end_date ?? null,
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
          startDate: task.keyResult?.start_date ?? null,
          endDate: task.keyResult?.end_date ?? null,
          tasks: [],
        };
        goal.keyResults.push(keyResult);
      }
      keyResult.tasks.push(task);
    });

  return Array.from(goalMap.values());
};

const buildTaskTooltip = (task: TaskItem) =>
  [
    task.name,
    `Mục tiêu: ${task.goalName}`,
    `Kết quả then chốt: ${task.keyResultName}`,
    `Người phụ trách: ${task.assigneeName}`,
    `Tiến độ: ${task.progress}%`,
    `Thời gian thực thi: ${formatTimelineRangeVi(task.startDate, task.endDate, {
      fallback: "Công việc chưa có mốc thời gian",
    })}`,
    `Khung thời gian KR: ${formatTimelineRangeVi(task.keyResult?.start_date ?? null, task.keyResult?.end_date ?? null, {
      fallback: "KR chưa có mốc thời gian",
    })}`,
    `Trạng thái: ${statusMetaMap[task.status].label}`,
  ].join("\n");

const buildTaskAccessibilityLabel = (task: TaskItem) =>
  `${task.name}. ${statusMetaMap[task.status].label}. Tiến độ ${task.progress}%. ${formatTimelineRangeVi(
    task.startDate,
    task.endDate,
    {
      fallback: "Chưa có mốc thời gian",
    },
  )}`;

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
  disabled = false,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
        active ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
      } ${disabled ? "cursor-not-allowed opacity-45" : ""}`}
    >
      {children}
    </button>
  );
}

function ToolbarButton({
  children,
  onClick,
  active = false,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-semibold transition ${
        active
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      } ${disabled ? "cursor-not-allowed opacity-45" : ""}`}
    >
      {children}
    </button>
  );
}

function TaskTimelineBar({
  task,
  left,
  width,
  isClamped,
}: {
  task: TaskItem;
  left: number;
  width: number;
  isClamped: boolean;
}) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showLabel = width >= 130;
  const showProgress = width >= 84;
  const durationLabel = formatTimelineDurationVi(task.startDate, task.endDate);
  const durationDays = getTimelineDurationDays(task.startDate, task.endDate);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openPopover = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const closePopover = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
    }, 120);
  };

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseEnter={openPopover}
          onMouseLeave={closePopover}
          onFocus={openPopover}
          onBlur={closePopover}
          onClick={() => setOpen((prev) => !prev)}
          className={`absolute top-1/2 flex h-10 -translate-y-1/2 items-center overflow-hidden rounded-xl px-3 text-left shadow-sm transition hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 ${statusMetaMap[task.status].barClassName} ${
            isClamped ? "ring-2 ring-white/70" : ""
          }`}
          style={{ left, width }}
          aria-label={buildTaskAccessibilityLabel(task)}
        >
          <span
            className={`absolute inset-y-0 left-0 ${statusMetaMap[task.status].fillClassName}`}
            style={{ width: `${task.progress}%` }}
          />
          <span className="relative z-[1] flex w-full items-center justify-between gap-3">
            {showLabel ? (
              <span className="truncate text-sm font-semibold">{task.name}</span>
            ) : (
              <span className="sr-only">{task.name}</span>
            )}
            {showProgress ? <span className="text-xs font-semibold">{task.progress}%</span> : null}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        collisionPadding={16}
        className="w-[320px] max-w-[calc(100vw-24px)] rounded-2xl p-4"
        onMouseEnter={openPopover}
        onMouseLeave={closePopover}
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Công việc</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{task.name}</p>
            </div>
            <StatusBadge status={task.status} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Tiến độ</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{task.progress}%</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Thời lượng</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{durationLabel}</p>
              {durationDays ? <p className="mt-1 text-xs text-slate-500">{durationDays} ngày theo lịch</p> : null}
            </div>
          </div>

          <div className="space-y-2 text-sm text-slate-600">
            <div className="flex items-start justify-between gap-3">
              <span className="text-slate-500">Người phụ trách</span>
              <span className="text-right font-medium text-slate-900">{task.assigneeName}</span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-slate-500">Bắt đầu</span>
              <span className="text-right font-medium text-slate-900">
                {formatDateOnlyVi(task.startDate, "Chưa đặt")}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-slate-500">Kết thúc</span>
              <span className="text-right font-medium text-slate-900">
                {formatDateOnlyVi(task.endDate, "Chưa đặt")}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-slate-500">KR</span>
              <span className="text-right font-medium text-slate-900">{task.keyResultName}</span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-slate-500">Mục tiêu</span>
              <span className="text-right font-medium text-slate-900">{task.goalName}</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500">Hover để xem nhanh hoặc chạm vào bar trên thiết bị cảm ứng.</p>
            <Link
              href={`/tasks/${task.id}`}
              className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Mở chi tiết
            </Link>
          </div>
        </div>
      </PopoverContent>
    </Popover>
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
  const [structureMode, setStructureMode] = useState<StructureMode>("task");
  const [timeScale, setTimeScale] = useState<TimelineScale>("week");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showNoTimelineSection, setShowNoTimelineSection] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [quickEditState, setQuickEditState] = useState<QuickEditState>({
    progress: "0",
    startDate: "",
    endDate: "",
  });
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingViewportRatioRef = useRef<number | null>(null);
  const hasAutoScrolledToTodayRef = useRef(false);

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
            start_date,
            end_date,
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
              start_date,
              end_date,
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
          const keyResult = normalizeKeyResultLite(
            Array.isArray(rawRow.key_result) ? rawRow.key_result[0] ?? null : rawRow.key_result,
          );
          const assignee = normalizeProfileLite(Array.isArray(rawRow.assignee) ? rawRow.assignee[0] ?? null : rawRow.assignee);
          const goalName = keyResult?.goal?.name ?? "Chưa có mục tiêu";
          const keyResultName = keyResult?.name ?? (row.key_result_id ? "KR không khả dụng" : "Chưa gắn key result");
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
            keyResultId: row.key_result_id ? String(row.key_result_id) : null,
            keyResultName,
            keyResultMetric,
            keyResult,
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
            createdAt: row.created_at ? String(row.created_at) : null,
            startDate: row.start_date ? String(row.start_date) : null,
            endDate: row.end_date ? String(row.end_date) : null,
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

  const noTimelineTasks = useMemo(
    () => filteredTasks.filter((task) => !getTaskTimeline(task)),
    [filteredTasks],
  );

  const visibleTasks = useMemo(
    () => filteredTasks.filter((task) => Boolean(getTaskTimeline(task))),
    [filteredTasks],
  );

  const groupedGoalsAll = useMemo(() => buildGoalGroups(filteredTasks), [filteredTasks]);
  const goalTimelineItems = useMemo<GoalTimelineItem[]>(
    () =>
      groupedGoalsAll.map((goal) => ({
        id: goal.id,
        name: goal.name,
        startDate: goal.startDate,
        endDate: goal.endDate,
        keyResultCount: goal.keyResults.length,
        taskCount: goal.keyResults.reduce((total, keyResult) => total + keyResult.tasks.length, 0),
      })),
    [groupedGoalsAll],
  );
  const keyResultTimelineItems = useMemo<KeyResultTimelineItem[]>(
    () =>
      groupedGoalsAll.flatMap((goal) =>
        goal.keyResults.map((keyResult) => ({
          id: keyResult.id,
          goalId: goal.id,
          goalName: goal.name,
          name: keyResult.name,
          metric: keyResult.metric,
          startDate: keyResult.startDate,
          endDate: keyResult.endDate,
          taskCount: keyResult.tasks.length,
        })),
      ),
    [groupedGoalsAll],
  );
  const visibleGoalTimelineItems = useMemo(
    () => goalTimelineItems.filter((goal) => Boolean(getTimelineRange(goal.startDate, goal.endDate))),
    [goalTimelineItems],
  );
  const noTimelineGoalItems = useMemo(
    () => goalTimelineItems.filter((goal) => !getTimelineRange(goal.startDate, goal.endDate)),
    [goalTimelineItems],
  );
  const visibleKeyResultTimelineItems = useMemo(
    () => keyResultTimelineItems.filter((keyResult) => Boolean(getTimelineRange(keyResult.startDate, keyResult.endDate))),
    [keyResultTimelineItems],
  );
  const noTimelineKeyResultItems = useMemo(
    () => keyResultTimelineItems.filter((keyResult) => !getTimelineRange(keyResult.startDate, keyResult.endDate)),
    [keyResultTimelineItems],
  );
  const timelineSourceItems = useMemo(() => {
    if (structureMode === "goal") {
      return visibleGoalTimelineItems;
    }
    if (structureMode === "key_result") {
      return visibleKeyResultTimelineItems;
    }
    return visibleTasks;
  }, [structureMode, visibleGoalTimelineItems, visibleKeyResultTimelineItems, visibleTasks]);
  const periods = useMemo(() => buildTimelinePeriods(timelineSourceItems, timeScale), [timeScale, timelineSourceItems]);
  const periodWidth = useMemo(() => getPeriodWidthForZoom(timeScale, zoomLevel), [timeScale, zoomLevel]);
  const timelineWidth = periods.length * periodWidth;
  const firstPeriodStart = periods[0]?.start ?? startOfScale(new Date(), timeScale);
  const todayIndex = useMemo(() => {
    const today = new Date();
    return periods.findIndex((period) => today >= period.start && today <= period.end);
  }, [periods]);
  const todayIndicatorOffset = useMemo(() => {
    if (periods.length === 0) {
      return null;
    }
    const offset = getTodayIndicatorOffsetPx(firstPeriodStart, timeScale, periodWidth);
    if (offset < 0 || offset > timelineWidth) {
      return null;
    }
    return offset;
  }, [firstPeriodStart, periodWidth, periods.length, timeScale, timelineWidth]);

  const tasksInProgress = useMemo(
    () => filteredTasks.filter((task) => task.status === "in_progress").length,
    [filteredTasks],
  );
  const overdueTaskCount = useMemo(
    () =>
      filteredTasks.filter((task) => {
        const timeline = getTaskTimeline(task);
        if (!timeline) {
          return false;
        }
        const today = startOfLocalDay(new Date());
        return timeline.end < today && !["done", "cancelled"].includes(task.status);
      }).length,
    [filteredTasks],
  );
  const dueThisWeekCount = useMemo(
    () =>
      filteredTasks.filter((task) => {
        const timeline = getTaskTimeline(task);
        if (!timeline) {
          return false;
        }
        const today = startOfLocalDay(new Date());
        const diffDays = Math.round((timeline.end.getTime() - today.getTime()) / DAY_MS);
        return diffDays >= 0 && diffDays <= 7 && !["done", "cancelled"].includes(task.status);
      }).length,
    [filteredTasks],
  );
  const structureModeMeta = useMemo(
    () =>
      ({
        goal: {
          label: "Mục tiêu",
          pluralLabel: "mục tiêu",
          subtitle: "Chế độ xem theo cấp mục tiêu",
          ganttTitle: "Biểu đồ mục tiêu",
          listTitle: "Danh sách mục tiêu",
          description:
            "Xem khung thực thi ở cấp mục tiêu, dùng timeline của goal làm lớp kế hoạch tổng.",
          missingTitle: "Mục tiêu chưa có thời gian thực thi",
          missingDescription:
            "Các mục tiêu này chưa có đủ ngày bắt đầu và ngày kết thúc nên chưa thể hiển thị như timeline bar.",
        },
        key_result: {
          label: "Key Result",
          pluralLabel: "key result",
          subtitle: "Chế độ xem theo cấp key result",
          ganttTitle: "Biểu đồ key result",
          listTitle: "Danh sách key result",
          description:
            "Xem khung thực thi của từng KR và giữ mục tiêu làm ngữ cảnh kế hoạch phía trên.",
          missingTitle: "Key Result chưa có thời gian thực thi",
          missingDescription:
            "Các key result này chưa có đủ ngày bắt đầu và ngày kết thúc nên chưa thể hiển thị như timeline bar.",
        },
        task: {
          label: "Công việc",
          pluralLabel: "công việc",
          subtitle: "Chế độ xem theo cấp công việc",
          ganttTitle: "Biểu đồ tiến độ công việc",
          listTitle: "Danh sách công việc",
          description:
            "Theo dõi thực thi theo ngày bắt đầu và ngày kết thúc của từng công việc, đồng thời đối chiếu với khung thời gian của KR.",
          missingTitle: "Công việc chưa có thời gian thực thi",
          missingDescription:
            "Các công việc này chưa có đủ ngày bắt đầu và ngày kết thúc nên chưa thể hiển thị như timeline bar.",
        },
      }) satisfies Record<
        StructureMode,
        {
          label: string;
          pluralLabel: string;
          subtitle: string;
          ganttTitle: string;
          listTitle: string;
          description: string;
          missingTitle: string;
          missingDescription: string;
        }
      >,
    [],
  );
  const currentModeMeta = structureModeMeta[structureMode];
  const currentNoTimelineCount =
    structureMode === "goal"
      ? noTimelineGoalItems.length
      : structureMode === "key_result"
        ? noTimelineKeyResultItems.length
        : noTimelineTasks.length;
  const zoomPercentLabel = `${Math.round(zoomLevel * 100)}%`;
  const canZoomOut = zoomLevel > TIMELINE_MIN_ZOOM;
  const canZoomIn = zoomLevel < TIMELINE_MAX_ZOOM;

  const getItemBarLayout = useCallback(
    (startDate: string | null, endDate: string | null, minBarWidth?: number) =>
      getTimelineBarLayout({
        startDate,
        endDate,
        axisStart: firstPeriodStart,
        timelineWidth,
        scale: timeScale,
        periodWidth,
        minBarWidth,
      }),
    [firstPeriodStart, periodWidth, timeScale, timelineWidth],
  );

  const captureViewportRatio = useCallback(() => {
    const container = timelineScrollRef.current;
    if (!container || timelineWidth <= 0) {
      return null;
    }

    const centeredOffset = Math.max(0, container.scrollLeft + container.clientWidth / 2 - LEFT_PANEL_WIDTH);
    return centeredOffset / Math.max(1, timelineWidth);
  }, [timelineWidth]);

  const restoreViewportRatio = useCallback(
    (ratio: number) => {
      const container = timelineScrollRef.current;
      if (!container || timelineWidth <= 0) {
        return;
      }

      const nextCenter = LEFT_PANEL_WIDTH + timelineWidth * Math.min(1, Math.max(0, ratio));
      container.scrollLeft = Math.max(0, nextCenter - container.clientWidth / 2);
    },
    [timelineWidth],
  );

  const preserveTimelineViewport = useCallback(() => {
    pendingViewportRatioRef.current = captureViewportRatio();
  }, [captureViewportRatio]);

  const scrollTimelineToToday = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const container = timelineScrollRef.current;
      if (!container || todayIndicatorOffset === null) {
        return;
      }

      const targetScrollLeft = Math.max(0, LEFT_PANEL_WIDTH + todayIndicatorOffset - container.clientWidth * 0.42);
      container.scrollTo({
        left: targetScrollLeft,
        behavior,
      });
    },
    [todayIndicatorOffset],
  );

  const handleTimelineWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    const container = timelineScrollRef.current;
    if (!container || !event.shiftKey || Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
      return;
    }

    event.preventDefault();
    container.scrollLeft += event.deltaY;
  }, []);

  const updateStructureMode = useCallback(
    (nextMode: StructureMode) => {
      if (nextMode === structureMode) {
        return;
      }
      preserveTimelineViewport();
      setStructureMode(nextMode);
    },
    [preserveTimelineViewport, structureMode],
  );

  const updateTimeScale = useCallback(
    (nextScale: TimelineScale) => {
      if (nextScale === timeScale) {
        return;
      }
      preserveTimelineViewport();
      setTimeScale(nextScale);
    },
    [preserveTimelineViewport, timeScale],
  );

  const handleZoomChange = useCallback(
    (delta: number) => {
      const nextZoom = clampTimelineZoom(zoomLevel + delta);
      if (nextZoom === zoomLevel) {
        return;
      }
      preserveTimelineViewport();
      setZoomLevel(nextZoom);
    },
    [preserveTimelineViewport, zoomLevel],
  );

  const handleFitTimeline = useCallback(() => {
    const container = timelineScrollRef.current;
    if (!container || periods.length === 0) {
      return;
    }

    const availableWidth = Math.max(240, container.clientWidth - LEFT_PANEL_WIDTH - 24);
    pendingViewportRatioRef.current = 0;
    setZoomLevel(
      getFitZoomLevel({
        availableWidth,
        periodCount: periods.length,
        scale: timeScale,
      }),
    );
  }, [periods.length, timeScale]);

  const handleJumpToToday = useCallback(() => {
    hasAutoScrolledToTodayRef.current = true;
    scrollTimelineToToday("smooth");
  }, [scrollTimelineToToday]);

  const openQuickEdit = (task: TaskItem) => {
    setEditingTaskId(task.id);
    setQuickEditState({
      progress: String(task.progress),
      startDate: task.startDate ?? task.keyResult?.start_date ?? "",
      endDate: task.endDate ?? task.keyResult?.end_date ?? "",
    });
  };

  const handleSaveQuickEdit = async (task: TaskItem) => {
    if (savingTaskId) {
      return;
    }

    const safeProgress = clampProgress(Number(quickEditState.progress));
    if (
      (quickEditState.startDate && !quickEditState.endDate) ||
      (!quickEditState.startDate && quickEditState.endDate)
    ) {
      setTaskLoadError("Vui lòng nhập đủ ngày bắt đầu và ngày kết thúc hoặc để trống cả hai.");
      return;
    }
    if (!isDateRangeOrdered(quickEditState.startDate || null, quickEditState.endDate || null)) {
      setTaskLoadError("Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.");
      return;
    }
    setSavingTaskId(task.id);

    const taskUpdateResult = await supabase
      .from("tasks")
      .update({
        progress: safeProgress,
        start_date: quickEditState.startDate.trim() || null,
        end_date: quickEditState.endDate.trim() || null,
      })
      .eq("id", task.id);

    if (taskUpdateResult.error) {
      setTaskLoadError(taskUpdateResult.error.message || "Không thể cập nhật nhanh công việc.");
      setSavingTaskId(null);
      return;
    }

    setTasks((prev) =>
      prev.map((item) =>
        item.id === task.id
          ? {
              ...item,
              progress: safeProgress,
              startDate: quickEditState.startDate.trim() || null,
              endDate: quickEditState.endDate.trim() || null,
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

  useEffect(() => {
    if (viewMode === "gantt") {
      hasAutoScrolledToTodayRef.current = false;
    }
  }, [viewMode]);

  useLayoutEffect(() => {
    if (viewMode !== "gantt" || !timelineScrollRef.current) {
      return;
    }

    if (pendingViewportRatioRef.current !== null) {
      restoreViewportRatio(pendingViewportRatioRef.current);
      pendingViewportRatioRef.current = null;
      return;
    }

    if (!hasAutoScrolledToTodayRef.current && todayIndicatorOffset !== null) {
      scrollTimelineToToday("auto");
      hasAutoScrolledToTodayRef.current = true;
    }
  }, [restoreViewportRatio, scrollTimelineToToday, todayIndicatorOffset, viewMode]);

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="tasks" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
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
                  {currentModeMeta.subtitle} · {filteredTasks.length} / {tasks.length} công việc theo bộ lọc
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
                <div className="rounded-xl border border-slate-200 bg-white p-1">
                  <ScaleButton active={structureMode === "goal"} onClick={() => updateStructureMode("goal")}>
                    Mục tiêu
                  </ScaleButton>
                  <ScaleButton active={structureMode === "key_result"} onClick={() => updateStructureMode("key_result")}>
                    KR
                  </ScaleButton>
                  <ScaleButton active={structureMode === "task"} onClick={() => updateStructureMode("task")}>
                    Công việc
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
                    {viewMode === "gantt" ? currentModeMeta.ganttTitle : currentModeMeta.listTitle}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">{currentModeMeta.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {viewMode === "gantt" ? (
                    <>
                      <div className="rounded-xl border border-slate-200 bg-slate-100 p-1">
                        <ScaleButton active={timeScale === "day"} onClick={() => updateTimeScale("day")}>
                          Ngày
                        </ScaleButton>
                        <ScaleButton active={timeScale === "week"} onClick={() => updateTimeScale("week")}>
                          Tuần
                        </ScaleButton>
                        <ScaleButton active={timeScale === "month"} onClick={() => updateTimeScale("month")}>
                          Tháng
                        </ScaleButton>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <ToolbarButton onClick={() => handleZoomChange(-TIMELINE_ZOOM_STEP)} disabled={!canZoomOut}>
                          Thu nhỏ
                        </ToolbarButton>
                        <div className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700">
                          {zoomPercentLabel}
                        </div>
                        <ToolbarButton onClick={() => handleZoomChange(TIMELINE_ZOOM_STEP)} disabled={!canZoomIn}>
                          Phóng to
                        </ToolbarButton>
                        <ToolbarButton onClick={handleFitTimeline}>Vừa khung</ToolbarButton>
                        <ToolbarButton
                          onClick={handleJumpToToday}
                          active={todayIndicatorOffset !== null}
                          disabled={todayIndicatorOffset === null}
                        >
                          Hôm nay
                        </ToolbarButton>
                      </div>
                      <p className="text-sm text-slate-500">
                        Cuộn ngang hoặc giữ Shift + lăn chuột để xem thêm mốc thời gian. Dùng scale và zoom để đổi mật độ hiển thị.
                      </p>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                    Quá thời gian thực thi
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{overdueTaskCount}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">Kết thúc 7 ngày</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{dueThisWeekCount}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">Đang thực thi</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{tasksInProgress}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                    {currentModeMeta.label} thiếu mốc
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{currentNoTimelineCount}</p>
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
              structureMode === "goal" ? (
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div
                  ref={timelineScrollRef}
                  onWheel={handleTimelineWheel}
                  className="overflow-x-auto overflow-y-hidden rounded-2xl overscroll-x-contain scroll-smooth [scrollbar-gutter:stable]"
                >
                  <div className="min-w-full" style={{ width: LEFT_PANEL_WIDTH + timelineWidth }}>
                    <div
                      className="grid border-b border-slate-200 bg-slate-50"
                      style={{ gridTemplateColumns: `${LEFT_PANEL_WIDTH}px ${timelineWidth}px` }}
                    >
                      <div className={`sticky left-0 z-30 border-r border-slate-200 bg-slate-50 px-5 py-4 ${STICKY_PANEL_SHADOW}`}>
                        <p className="text-sm font-semibold text-slate-900">Danh sách mục tiêu</p>
                        <p className="mt-1 text-xs text-slate-500">Mỗi dòng là một mục tiêu với khung thời gian thực thi tổng.</p>
                      </div>
                      <div className="relative grid" style={{ gridTemplateColumns: `repeat(${periods.length}, ${periodWidth}px)` }}>
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
                        {todayIndicatorOffset !== null ? (
                          <div
                            className="pointer-events-none absolute bottom-0 top-0 z-[1] w-px bg-blue-400/80"
                            style={{ left: todayIndicatorOffset }}
                          />
                        ) : null}
                      </div>
                    </div>

                    {visibleGoalTimelineItems.map((goal) => {
                      const barLayout = getItemBarLayout(goal.startDate, goal.endDate, 12);
                      if (!barLayout) {
                        return null;
                      }

                      return (
                        <div
                          key={goal.id}
                          className="grid border-b border-slate-100"
                          style={{ gridTemplateColumns: `${LEFT_PANEL_WIDTH}px ${timelineWidth}px` }}
                        >
                          <div className={`sticky left-0 z-20 border-r border-slate-200 bg-white px-5 py-4 ${STICKY_PANEL_SHADOW}`}>
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">Mục tiêu</p>
                                <p className="mt-1 text-base font-semibold text-slate-900">{goal.name}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {formatTimelineRangeVi(goal.startDate, goal.endDate, {
                                    fallback: "Chưa đặt khung thời gian",
                                  })}
                                </p>
                                <p className="mt-1 text-[11px] text-slate-400">
                                  {goal.keyResultCount} KR · {goal.taskCount} công việc
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
                          <div className="relative min-h-[86px] bg-white">
                            <div
                              className="absolute inset-0 grid"
                              style={{ gridTemplateColumns: `repeat(${periods.length}, ${periodWidth}px)` }}
                            >
                              {periods.map((period, index) => (
                                <div
                                  key={`${goal.id}-${period.key}`}
                                  className={`border-l border-slate-100 ${index === todayIndex ? "bg-blue-50/40" : ""}`}
                                />
                              ))}
                            </div>
                            {todayIndicatorOffset !== null ? (
                              <div
                                className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-blue-400/75"
                                style={{ left: todayIndicatorOffset }}
                              />
                            ) : null}
                            <Link
                              href={goal.id !== "no-goal" ? `/goals/${goal.id}` : "/goals"}
                              title={`${goal.name}\n${formatTimelineRangeVi(goal.startDate, goal.endDate, {
                                fallback: "Chưa đặt khung thời gian",
                              })}`}
                              className="absolute top-1/2 flex h-10 -translate-y-1/2 items-center overflow-hidden rounded-xl bg-blue-600 px-3 text-left text-white shadow-sm transition hover:bg-blue-700"
                              style={{ left: barLayout.left, width: barLayout.width }}
                            >
                              <span className="truncate text-sm font-semibold">{goal.name}</span>
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
              ) : structureMode === "key_result" ? (
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div
                  ref={timelineScrollRef}
                  onWheel={handleTimelineWheel}
                  className="overflow-x-auto overflow-y-hidden rounded-2xl overscroll-x-contain scroll-smooth [scrollbar-gutter:stable]"
                >
                  <div className="min-w-full" style={{ width: LEFT_PANEL_WIDTH + timelineWidth }}>
                    <div
                      className="grid border-b border-slate-200 bg-slate-50"
                      style={{ gridTemplateColumns: `${LEFT_PANEL_WIDTH}px ${timelineWidth}px` }}
                    >
                      <div className={`sticky left-0 z-30 border-r border-slate-200 bg-slate-50 px-5 py-4 ${STICKY_PANEL_SHADOW}`}>
                        <p className="text-sm font-semibold text-slate-900">Danh sách key result</p>
                        <p className="mt-1 text-xs text-slate-500">Mỗi dòng là một KR, vẫn giữ mục tiêu làm ngữ cảnh đi kèm.</p>
                      </div>
                      <div className="relative grid" style={{ gridTemplateColumns: `repeat(${periods.length}, ${periodWidth}px)` }}>
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
                        {todayIndicatorOffset !== null ? (
                          <div
                            className="pointer-events-none absolute bottom-0 top-0 z-[1] w-px bg-blue-400/80"
                            style={{ left: todayIndicatorOffset }}
                          />
                        ) : null}
                      </div>
                    </div>

                    {visibleKeyResultTimelineItems.map((keyResult) => {
                      const barLayout = getItemBarLayout(keyResult.startDate, keyResult.endDate, 12);
                      if (!barLayout) {
                        return null;
                      }

                      return (
                        <div
                          key={keyResult.id}
                          className="grid border-b border-slate-100"
                          style={{ gridTemplateColumns: `${LEFT_PANEL_WIDTH}px ${timelineWidth}px` }}
                        >
                          <div className={`sticky left-0 z-20 border-r border-slate-200 bg-white px-5 py-4 ${STICKY_PANEL_SHADOW}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">Key Result</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">{keyResult.name}</p>
                                <p className="mt-1 text-xs text-slate-500">{keyResult.goalName}</p>
                                <p className="mt-1 text-xs text-slate-500">{keyResult.metric}</p>
                                <p className="mt-1 text-[11px] text-slate-400">
                                  {keyResult.taskCount} công việc ·{" "}
                                  {formatTimelineRangeVi(keyResult.startDate, keyResult.endDate, {
                                    fallback: "KR chưa có mốc thời gian",
                                  })}
                                </p>
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
                          <div className="relative min-h-[86px] bg-white">
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
                            {todayIndicatorOffset !== null ? (
                              <div
                                className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-blue-400/75"
                                style={{ left: todayIndicatorOffset }}
                              />
                            ) : null}
                            <Link
                              href={
                                keyResult.goalId !== "no-goal" && keyResult.id !== "no-kr"
                                  ? `/tasks/new?goalId=${keyResult.goalId}&keyResultId=${keyResult.id}`
                                  : "/tasks"
                              }
                              title={`${keyResult.name}\n${formatTimelineRangeVi(keyResult.startDate, keyResult.endDate, {
                                fallback: "KR chưa có mốc thời gian",
                              })}`}
                              className="absolute top-1/2 flex h-10 -translate-y-1/2 items-center overflow-hidden rounded-xl bg-slate-900 px-3 text-left text-white shadow-sm transition hover:bg-slate-800"
                              style={{ left: barLayout.left, width: barLayout.width }}
                            >
                              <span className="truncate text-sm font-semibold">{keyResult.name}</span>
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
              ) : (
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div
                  ref={timelineScrollRef}
                  onWheel={handleTimelineWheel}
                  className="overflow-x-auto overflow-y-hidden rounded-2xl overscroll-x-contain scroll-smooth [scrollbar-gutter:stable]"
                >
                  <div
                    className="min-w-full"
                    style={{ width: LEFT_PANEL_WIDTH + timelineWidth }}
                  >
                    <div
                      className="grid border-b border-slate-200 bg-slate-50"
                      style={{ gridTemplateColumns: `${LEFT_PANEL_WIDTH}px ${timelineWidth}px` }}
                    >
                      <div className={`sticky left-0 z-30 border-r border-slate-200 bg-slate-50 px-5 py-4 ${STICKY_PANEL_SHADOW}`}>
                        <p className="text-sm font-semibold text-slate-900">Danh sách công việc</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Mỗi dòng là một công việc với mốc thực thi riêng.
                        </p>
                      </div>
                      <div className="relative grid" style={{ gridTemplateColumns: `repeat(${periods.length}, ${periodWidth}px)` }}>
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
                        {todayIndicatorOffset !== null ? (
                          <div
                            className="pointer-events-none absolute bottom-0 top-0 z-[1] w-px bg-blue-400/80"
                            style={{ left: todayIndicatorOffset }}
                          />
                        ) : null}
                      </div>
                    </div>

                    {visibleTasks.map((task) => {
                      const barLayout = getItemBarLayout(task.startDate, task.endDate);
                      const tooltip = buildTaskTooltip(task);
                      const quickEditing = editingTaskId === task.id;
                      const alignmentWarning = getTaskTimelineAlignmentWarning(task);
                      const quickEditAlignmentWarning =
                        quickEditing
                          ? getTimelineOutsideParentWarning(
                              quickEditState.startDate || null,
                              quickEditState.endDate || null,
                              task.keyResult?.start_date ?? null,
                              task.keyResult?.end_date ?? null,
                              {
                                subjectLabel: "Thời gian công việc",
                                parentLabel: "KR",
                              },
                            )
                          : alignmentWarning;

                      return (
                        <div
                          key={task.id}
                          className="grid border-b border-slate-100 last:border-b-0"
                          style={{ gridTemplateColumns: `${LEFT_PANEL_WIDTH}px ${timelineWidth}px` }}
                        >
                          <div className={`sticky left-0 z-10 border-r border-slate-200 bg-white px-5 py-3 ${STICKY_PANEL_SHADOW}`}>
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
                                  <span className="text-xs text-slate-500">
                                    {formatTimelineRangeVi(task.startDate, task.endDate, {
                                      fallback: "Công việc chưa có mốc thời gian",
                                    })}
                                  </span>
                                </div>
                                {alignmentWarning ? (
                                  <p className="mt-1 text-[11px] text-amber-600">{alignmentWarning}</p>
                                ) : null}
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
                                <div className="grid gap-3 md:grid-cols-[140px_160px_160px]">
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
                                    <span>Ngày bắt đầu</span>
                                    <input
                                      type="date"
                                      value={quickEditState.startDate}
                                      onChange={(event) =>
                                        setQuickEditState((prev) => ({
                                          ...prev,
                                          startDate: event.target.value,
                                        }))
                                      }
                                      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    />
                                  </label>
                                  <label className="space-y-1 text-xs font-medium text-slate-600">
                                    <span>Ngày kết thúc</span>
                                    <input
                                      type="date"
                                      min={quickEditState.startDate || undefined}
                                      value={quickEditState.endDate}
                                      onChange={(event) =>
                                        setQuickEditState((prev) => ({
                                          ...prev,
                                          endDate: event.target.value,
                                        }))
                                      }
                                      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    />
                                  </label>
                                </div>
                                <p className="mt-2 text-[11px] text-slate-500">
                                  {task.keyResultId
                                    ? "Giá trị ban đầu được autofill từ KR nếu task chưa có ngày. Khi lưu, thay đổi chỉ áp dụng cho công việc này."
                                    : "Task này chưa gắn Key Result. Bạn vẫn có thể đặt mốc thời gian riêng cho công việc."}
                                </p>
                                {quickEditAlignmentWarning ? (
                                  <p className="mt-1 text-[11px] text-amber-600">{quickEditAlignmentWarning}</p>
                                ) : null}
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
                            {todayIndicatorOffset !== null ? (
                              <div
                                className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-blue-400/75"
                                style={{ left: todayIndicatorOffset }}
                              />
                            ) : null}

                            {barLayout ? (
                              <TaskTimelineBar
                                task={task}
                                left={barLayout.left}
                                width={barLayout.width}
                                isClamped={barLayout.isClamped}
                              />
                            ) : (
                              <div className="absolute inset-y-0 left-0 flex items-center px-4 text-xs text-slate-400">
                                Công việc chưa có mốc thời gian
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
              )) : structureMode === "goal" ? (
                <section className="rounded-2xl border border-slate-200 bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] text-left">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.08em] text-slate-400">
                          <th className="px-5 py-3 font-semibold">Mục tiêu</th>
                          <th className="px-4 py-3 font-semibold">Khung thời gian</th>
                          <th className="px-4 py-3 font-semibold">Key Result</th>
                          <th className="px-4 py-3 font-semibold">Công việc</th>
                          <th className="px-4 py-3 font-semibold">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {goalTimelineItems.map((goal) => (
                          <tr key={goal.id} className="border-b border-slate-100 align-top">
                            <td className="px-5 py-4">
                              <p className="text-sm font-semibold text-slate-900">{goal.name}</p>
                              <p className="mt-1 text-xs text-slate-500">{goal.taskCount} công việc theo bộ lọc</p>
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-600">
                              {formatTimelineRangeVi(goal.startDate, goal.endDate, {
                                fallback: "Mục tiêu chưa có mốc thời gian",
                              })}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-700">{goal.keyResultCount}</td>
                            <td className="px-4 py-4 text-sm text-slate-700">{goal.taskCount}</td>
                            <td className="px-4 py-4">
                              {goal.id !== "no-goal" ? (
                                <Link
                                  href={`/goals/${goal.id}`}
                                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  Mở mục tiêu
                                </Link>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : structureMode === "key_result" ? (
                <section className="rounded-2xl border border-slate-200 bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1080px] text-left">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.08em] text-slate-400">
                          <th className="px-5 py-3 font-semibold">Key Result</th>
                          <th className="px-4 py-3 font-semibold">Mục tiêu</th>
                          <th className="px-4 py-3 font-semibold">Chỉ số</th>
                          <th className="px-4 py-3 font-semibold">Khung thời gian</th>
                          <th className="px-4 py-3 font-semibold">Công việc</th>
                          <th className="px-4 py-3 font-semibold">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {keyResultTimelineItems.map((keyResult) => (
                          <tr key={keyResult.id} className="border-b border-slate-100 align-top">
                            <td className="px-5 py-4">
                              <p className="text-sm font-semibold text-slate-900">{keyResult.name}</p>
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-700">{keyResult.goalName}</td>
                            <td className="px-4 py-4 text-sm text-slate-500">{keyResult.metric}</td>
                            <td className="px-4 py-4 text-sm text-slate-600">
                              {formatTimelineRangeVi(keyResult.startDate, keyResult.endDate, {
                                fallback: "KR chưa có mốc thời gian",
                              })}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-700">{keyResult.taskCount}</td>
                            <td className="px-4 py-4">
                              {keyResult.goalId !== "no-goal" && keyResult.id !== "no-kr" ? (
                                <Link
                                  href={`/tasks/new?goalId=${keyResult.goalId}&keyResultId=${keyResult.id}`}
                                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  + Thêm công việc
                                </Link>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
                          <th className="px-4 py-3 font-semibold">Thời gian thực thi</th>
                          <th className="px-4 py-3 font-semibold">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTasks.map((task) => {
                          const quickEditing = editingTaskId === task.id;
                          const alignmentWarning = getTaskTimelineAlignmentWarning(task);
                          const quickEditAlignmentWarning =
                            quickEditing
                              ? getTimelineOutsideParentWarning(
                                  quickEditState.startDate || null,
                                  quickEditState.endDate || null,
                                  task.keyResult?.start_date ?? null,
                                  task.keyResult?.end_date ?? null,
                                  {
                                    subjectLabel: "Thời gian công việc",
                                    parentLabel: "KR",
                                  },
                                )
                              : alignmentWarning;
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
                                  <p>
                                    {formatTimelineRangeVi(task.startDate, task.endDate, {
                                      fallback: "Công việc chưa có mốc thời gian",
                                    })}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-400">
                                    Khung thời gian của KR:{" "}
                                    {formatTimelineRangeVi(task.keyResult?.start_date ?? null, task.keyResult?.end_date ?? null, {
                                      fallback: "KR chưa có mốc thời gian",
                                    })}
                                  </p>
                                  {alignmentWarning ? (
                                    <p className="mt-1 text-xs text-amber-600">{alignmentWarning}</p>
                                  ) : null}
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
                                    <div className="grid gap-3 md:grid-cols-[140px_180px_180px_auto]">
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
                                        <span>Ngày bắt đầu</span>
                                        <input
                                          type="date"
                                          value={quickEditState.startDate}
                                          onChange={(event) =>
                                            setQuickEditState((prev) => ({
                                              ...prev,
                                              startDate: event.target.value,
                                            }))
                                          }
                                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                        />
                                      </label>
                                      <label className="space-y-1 text-xs font-medium text-slate-600">
                                        <span>Ngày kết thúc</span>
                                        <input
                                          type="date"
                                          min={quickEditState.startDate || undefined}
                                          value={quickEditState.endDate}
                                          onChange={(event) =>
                                            setQuickEditState((prev) => ({
                                              ...prev,
                                              endDate: event.target.value,
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
                                    <p className="mt-2 text-[11px] text-slate-500">
                                      {task.keyResultId
                                        ? "Giá trị ban đầu được autofill từ KR nếu task chưa có ngày. Khi lưu, thay đổi chỉ áp dụng cho công việc này."
                                        : "Task này chưa gắn Key Result. Bạn vẫn có thể đặt mốc thời gian riêng cho công việc."}
                                    </p>
                                    {quickEditAlignmentWarning ? (
                                      <p className="mt-1 text-[11px] text-amber-600">{quickEditAlignmentWarning}</p>
                                    ) : null}
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

            {!isLoadingTasks && viewMode === "gantt" && currentNoTimelineCount > 0 ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{currentModeMeta.missingTitle}</h2>
                    <p className="mt-1 text-sm text-slate-500">{currentModeMeta.missingDescription}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {currentNoTimelineCount} {currentModeMeta.pluralLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowNoTimelineSection((prev) => !prev)}
                      className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {showNoTimelineSection ? "Thu gọn" : "Mở rộng"}
                    </button>
                  </div>
                </div>

                {showNoTimelineSection ? (
                  <>
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Thêm đầy đủ ngày bắt đầu và ngày kết thúc để mục tiêu, KR hoặc công việc xuất hiện trong timeline và Gantt.
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {structureMode === "goal"
                        ? noTimelineGoalItems.map((goal) => (
                          <div key={goal.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{goal.name}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {goal.keyResultCount} KR · {goal.taskCount} công việc
                                </p>
                              </div>
                            </div>
                            <p className="mt-3 text-xs text-slate-500">
                              {getTimelineMissingReason(
                                goal.startDate,
                                goal.endDate,
                                "Mục tiêu chưa có mốc thời gian",
                                "Mốc thời gian mục tiêu không hợp lệ",
                              )}
                            </p>
                          </div>
                        ))
                      : structureMode === "key_result"
                        ? noTimelineKeyResultItems.map((keyResult) => (
                            <div key={keyResult.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">{keyResult.name}</p>
                                  <p className="mt-1 text-xs text-slate-500">{keyResult.goalName}</p>
                                  <p className="mt-1 text-xs font-medium text-slate-600">{keyResult.metric}</p>
                                </div>
                              </div>
                              <p className="mt-3 text-xs text-slate-500">
                                {getTimelineMissingReason(
                                  keyResult.startDate,
                                  keyResult.endDate,
                                  "KR chưa có mốc thời gian",
                                  "Mốc thời gian KR không hợp lệ",
                                )}
                              </p>
                            </div>
                          ))
                        : noTimelineTasks.map((task) => (
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
                                <p className="mt-2 text-xs text-slate-500">{getTaskTimelineIssue(task)}</p>
                              </div>
                            </div>
                          ))}
                    </div>
                  </>
                ) : null}
              </section>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
