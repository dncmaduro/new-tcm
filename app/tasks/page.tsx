"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
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
import {
  buildGoalOwnersByGoalId,
  getGoalOwnerSearchText,
  type GoalOwnerLinkRow,
  type GoalOwnerProfile,
  type GoalOwnerProfileRow,
} from "@/lib/goal-owners";
import { formatKeyResultMetric } from "@/lib/constants/key-results";
import {
  compareTaskPriority,
  getTaskPriorityBadgeClassName,
  getTaskPriorityLabel,
  getTaskPriorityScore,
} from "@/lib/constants/tasks";
import {
  buildGoalProgressMap,
  buildKeyResultProgressMap,
  getComputedTaskProgress,
} from "@/lib/okr";
import { buildWorkspaceAccessDebug, useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";
import {
  buildTimelinePeriods,
  clampTimelineZoom,
  formatTimelineDurationVi,
  getPeriodWidthForZoom,
  getTimelineBarLayout,
  getTimelineDurationDays,
  getTodayIndicatorOffsetPx,
  startOfScale,
  TIMELINE_ZOOM_STEP,
  type TimelinePeriod,
  type TimelineScale,
} from "@/lib/task-gantt";
import {
  formatDateOnlyVi,
  formatTimelineRangeVi,
  getTimelineMissingReason,
  getTimelineRange,
  getTimelineOutsideParentWarning,
} from "@/lib/timeline";
import {
  getTaskStatus,
  getStatusColors,
  getStatusLabel,
  getItemProgressStatus,
} from "@/lib/timeline-ui-helpers";
const DEFAULT_LEFT_PANEL_WIDTH = 420;
const TASK_LEFT_PANEL_WIDTH = 360;

const formatKeyResultProgressMetric = (
  current: number | null,
  target: number | null,
  unit: string | null,
) => `${formatKeyResultMetric(current, unit)} / ${formatKeyResultMetric(target, unit)}`;

type TaskViewMode = "gantt" | "list";
type StructureMode = "goal" | "key_result" | "task";

type TaskRow = {
  id: string;
  name: string;
  key_result_id: string | null;
  assignee_id: string | null;
  profile_id: string | null;
  is_recurring: boolean | null;
  type: string | null;
  priority: string | null;
  current: number | null;
  target: number | null;
  progress: number | null;
  weight: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  key_result?: unknown;
  assignee?: unknown;
  profile?: unknown;
};

type GoalLiteRow = {
  id: string;
  name: string;
  type: string | null;
  target: number | null;
  start_date: string | null;
  end_date: string | null;
};

type KeyResultLiteRow = {
  id: string;
  goal_id: string | null;
  name: string;
  type: string | null;
  contribution_type: string | null;
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
  priority: string | null;
  isRecurring: boolean;
  assigneeId: string | null;
  assigneeName: string;
  assigneeShort: string;
  current: number | null;
  target: number | null;
  progress: number;
  weight: number;
  createdAt: string | null;
  startDate: string | null;
  endDate: string | null;
};

type GoalTimelineItem = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  progress: number;
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
  progress: number;
  taskCount: number;
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

const STICKY_PANEL_SHADOW = "shadow-[10px_0_18px_-18px_rgba(15,23,42,0.35)]";
const TIMELINE_WINDOW_OVERSCAN: Record<TimelineScale, number> = {
  day: 14,
  week: 8,
  month: 4,
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

const normalizeGoalLite = (value: unknown): GoalLiteRow | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    id: String(record.id),
    name: String(record.name),
    type: record.type ? String(record.type) : null,
    target: typeof record.target === "number" ? record.target : Number(record.target ?? 0),
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
  const rawGoal = Array.isArray(record.goal) ? (record.goal[0] ?? null) : record.goal;
  return {
    id: String(record.id),
    goal_id: record.goal_id ? String(record.goal_id) : null,
    name: String(record.name),
    type: record.type ? String(record.type) : null,
    contribution_type: record.contribution_type ? String(record.contribution_type) : null,
    current: typeof record.current === "number" ? record.current : Number(record.current ?? 0),
    target: typeof record.target === "number" ? record.target : Number(record.target ?? 0),
    unit: record.unit ? String(record.unit) : null,
    start_value:
      typeof record.start_value === "number" ? record.start_value : Number(record.start_value ?? 0),
    weight: typeof record.weight === "number" ? record.weight : Number(record.weight ?? 1),
    start_date: record.start_date ? String(record.start_date) : null,
    end_date: record.end_date ? String(record.end_date) : null,
    goal: normalizeGoalLite(rawGoal),
  };
};

const getTaskTimeline = (task: TaskItem) => getTimelineRange(task.startDate, task.endDate);

const getTaskTimelineAlignmentWarning = (task: TaskItem) =>
  getTimelineOutsideParentWarning(
    task.startDate,
    task.endDate,
    task.keyResult?.start_date ?? null,
    task.keyResult?.end_date ?? null,
    {
      subjectLabel: "Thời gian công việc",
      parentLabel: "KR",
    },
  );

const buildTaskTooltip = (task: TaskItem, showTaskPoints: boolean) =>
  [
    task.name,
    `Độ ưu tiên: ${getTaskPriorityLabel(task.priority)}`,
    `Mục tiêu: ${task.goalName}`,
    `KR: ${task.keyResultName}`,
    `Người phụ trách: ${task.assigneeName}`,
    `Tiến độ: ${task.progress}%`,
    ...(showTaskPoints
      ? [
          `Điểm task: ${formatTaskPointValue(getTaskEarnedPoints(task))} / ${formatTaskPointValue(
            getTaskPriorityScore(task.priority),
          )} điểm`,
        ]
      : []),
    `Thời gian thực thi: ${formatTimelineRangeVi(task.startDate, task.endDate, {
      fallback: "Công việc chưa có mốc thời gian",
    })}`,
    `Khung thời gian KR: ${formatTimelineRangeVi(
      task.keyResult?.start_date ?? null,
      task.keyResult?.end_date ?? null,
      {
        fallback: "KR chưa có mốc thời gian",
      },
    )}`,
  ].join("\n");

const buildTaskAccessibilityLabel = (task: TaskItem) =>
  `${task.name}. ${getTaskPriorityLabel(task.priority)}. Tiến độ ${task.progress}%. ${formatTimelineRangeVi(
    task.startDate,
    task.endDate,
    {
      fallback: "Chưa có mốc thời gian",
    },
  )}`;

const formatTaskPointValue = (value: number) =>
  new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(value);

const getTaskEarnedPoints = (task: Pick<TaskItem, "priority" | "progress">) =>
  (getTaskPriorityScore(task.priority) * clampProgress(task.progress)) / 100;

function ProgressBar({ value }: { value: number }) {
  const normalizedValue = clampProgress(value);
  const getBarColor = () => {
    if (normalizedValue >= 100) return "bg-emerald-500";
    if (normalizedValue >= 75) return "bg-emerald-400";
    if (normalizedValue >= 50) return "bg-blue-500";
    if (normalizedValue >= 25) return "bg-amber-500";
    return "bg-slate-400";
  };

  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full transition-all ${getBarColor()}`}
        style={{ width: `${normalizedValue}%` }}
      />
    </div>
  );
}

function TimelineBarContent({
  label,
  progress,
  width,
}: {
  label: string;
  progress: number;
  width: number;
}) {
  const normalizedProgress = clampProgress(progress);
  const showLabel = width >= 96;
  const showProgress = width >= 74;

  return (
    <>
      <span
        className="absolute inset-y-0 left-0 rounded-[inherit] bg-slate-500/55"
        style={{ width: `${normalizedProgress}%` }}
      />
      <span className="relative z-[1] flex w-full items-center justify-between gap-3 text-slate-900">
        {showLabel ? (
          <span className="truncate text-sm font-semibold">{label}</span>
        ) : (
          <span className="sr-only">{label}</span>
        )}
        {showProgress ? (
          <span className="shrink-0 text-xs font-semibold">{normalizedProgress}%</span>
        ) : null}
      </span>
    </>
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
      className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-semibold transition cursor-pointer hover:bg-slate-100 ${
        active
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      } ${disabled ? "cursor-not-allowed opacity-45" : ""}`}
    >
      {children}
    </button>
  );
}

function TimelinePeriodHeader({
  periods,
  periodWidth,
  timelineWidth,
  visibleStartIndex,
  visibleOffsetPx,
  visibleWidthPx,
  todayIndex,
  todayIndicatorOffset,
}: {
  periods: TimelinePeriod[];
  periodWidth: number;
  timelineWidth: number;
  visibleStartIndex: number;
  visibleOffsetPx: number;
  visibleWidthPx: number;
  todayIndex: number;
  todayIndicatorOffset: number | null;
}) {
  return (
    <div className="relative" style={{ width: timelineWidth }}>
      {visibleWidthPx > 0 ? (
        <div
          className="absolute inset-y-0"
          style={{ left: visibleOffsetPx, width: visibleWidthPx }}
        >
          <div
            className="grid h-full"
            style={{ gridTemplateColumns: `repeat(${periods.length}, ${periodWidth}px)` }}
          >
            {periods.map((period, index) => (
              <div
                key={period.key}
                className={`border-l border-slate-200 px-2 py-3 text-center ${
                  visibleStartIndex + index === todayIndex ? "bg-blue-50/70" : ""
                }`}
              >
                <p className="text-xs font-semibold text-slate-700">{period.label}</p>
                <p className="mt-1 whitespace-nowrap text-[11px] text-slate-500">
                  {period.subLabel}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {todayIndicatorOffset !== null ? (
        <div
          className="pointer-events-none absolute bottom-0 top-0 z-[1] w-px bg-blue-400/80"
          style={{ left: todayIndicatorOffset }}
        />
      ) : null}
    </div>
  );
}

function TimelinePeriodBackground({
  rowKey,
  periods,
  periodWidth,
  visibleStartIndex,
  visibleOffsetPx,
  visibleWidthPx,
  todayIndex,
}: {
  rowKey: string;
  periods: TimelinePeriod[];
  periodWidth: number;
  visibleStartIndex: number;
  visibleOffsetPx: number;
  visibleWidthPx: number;
  todayIndex: number;
}) {
  if (visibleWidthPx <= 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-y-0" style={{ left: visibleOffsetPx, width: visibleWidthPx }}>
        <div
          className="grid h-full"
          style={{ gridTemplateColumns: `repeat(${periods.length}, ${periodWidth}px)` }}
        >
          {periods.map((period, index) => (
            <div
              key={`${rowKey}-${period.key}`}
              className={`border-l border-slate-100 ${
                visibleStartIndex + index === todayIndex ? "bg-blue-50/40" : ""
              }`}
            />
          ))}
        </div>
      </div>
    </div>
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
  const suppressHoverUntilRef = useRef(0);
  const durationLabel = formatTimelineDurationVi(task.startDate, task.endDate);
  const durationDays = getTimelineDurationDays(task.startDate, task.endDate);
  const isMissingTimeline = !getTaskTimeline(task);
  const taskStatus = getTaskStatus(task.startDate, task.endDate, task.progress, isMissingTimeline);
  const statusColors = getStatusColors(taskStatus);
  const statusLabel = getStatusLabel(taskStatus);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openPopover = () => {
    clearCloseTimer();
    if (Date.now() < suppressHoverUntilRef.current) {
      return;
    }
    setOpen(true);
  };

  const closePopover = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      suppressHoverUntilRef.current = Date.now() + 160;
      setOpen(false);
    }, 90);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    clearCloseTimer();

    if (!nextOpen) {
      suppressHoverUntilRef.current = Date.now() + 160;
    }

    setOpen(nextOpen);
  };

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, []);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onPointerEnter={openPopover}
          onPointerLeave={closePopover}
          onPointerDown={(event) => {
            if (event.pointerType !== "mouse") {
              clearCloseTimer();
              setOpen((prev) => !prev);
            }
          }}
          className={`absolute top-1/2 flex h-10 -translate-y-1/2 items-center overflow-hidden rounded-lg border-2 px-3 text-left shadow-sm transition hover:brightness-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
            statusColors.barBg
          } ${statusColors.border} text-slate-900 font-medium ${
            isClamped ? "ring-2 ring-white/70" : ""
          }`}
          style={{ left, width }}
          aria-label={buildTaskAccessibilityLabel(task)}
        >
          <TimelineBarContent label={task.name} progress={task.progress} width={width} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={10}
        collisionPadding={16}
        className="w-[380px] max-w-[calc(100vw-24px)] rounded-2xl p-4"
        onPointerEnter={openPopover}
        onPointerLeave={closePopover}
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex px-2 py-1 rounded-md text-xs font-semibold ${statusColors.badgeBg} ${statusColors.badgeText}`}
                >
                  {statusLabel.icon} {statusLabel.status}
                </span>
                <span
                  className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${getTaskPriorityBadgeClassName(task.priority)}`}
                >
                  {getTaskPriorityLabel(task.priority)}
                </span>
              </div>
              <p className="mt-2 text-lg font-bold text-slate-900">{task.name}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
              <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500 font-semibold">
                Tiến độ
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-2xl font-bold text-slate-900">{task.progress}%</p>
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
              <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500 font-semibold">
                Thời lượng
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{durationLabel}</p>
              {durationDays ? <p className="text-xs text-slate-500">{durationDays} ngày</p> : null}
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
              <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500 font-semibold">
                Điểm task
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {formatTaskPointValue(getTaskEarnedPoints(task))} /{" "}
                {formatTaskPointValue(getTaskPriorityScore(task.priority))} điểm
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
              <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500 font-semibold">
                Độ ưu tiên
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {getTaskPriorityLabel(task.priority)}
              </p>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="text-slate-600 font-medium">Người phụ trách</span>
              <span className="text-right text-slate-900 font-semibold">{task.assigneeName}</span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-slate-600 font-medium">Mục tiêu</span>
              <span className="text-right text-slate-900">{task.goalName}</span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-slate-600 font-medium">Key Result</span>
              <span className="text-right text-slate-900">{task.keyResultName}</span>
            </div>
            <div className="flex items-start justify-between gap-3 border-t border-slate-100 pt-2">
              <span className="text-slate-600 font-medium">Bắt đầu</span>
              <span className="text-right text-slate-900 font-semibold">
                {formatDateOnlyVi(task.startDate, "—")}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-slate-600 font-medium">Kết thúc</span>
              <span className="text-right text-slate-900 font-semibold">
                {formatDateOnlyVi(task.endDate, "—")}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500">Nhấn để xem chi tiết đầy đủ</p>
            <Link
              href={`/tasks/${task.id}`}
              className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 transition"
            >
              Mở chi tiết
            </Link>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TasksPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceAccess = useWorkspaceAccess();

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [goals, setGoals] = useState<GoalLiteRow[]>([]);
  const [keyResults, setKeyResults] = useState<KeyResultLiteRow[]>([]);
  const [goalOwnersByGoalId, setGoalOwnersByGoalId] = useState<Record<string, GoalOwnerProfile[]>>(
    {},
  );
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [taskLoadError, setTaskLoadError] = useState<string | null>(null);
  const [goalFilters, setGoalFilters] = useState<Array<{ id: string; name: string }>>([]);
  const [keyResultFilters, setKeyResultFilters] = useState<
    Array<{ id: string; name: string; goalId: string }>
  >([]);
  const [assigneeFilters, setAssigneeFilters] = useState<Array<{ id: string; name: string }>>([]);

  const [searchKeyword, setSearchKeyword] = useState("");
  const [goalFilter, setGoalFilter] = useState<"all" | string>("all");
  const [keyResultFilter, setKeyResultFilter] = useState<"all" | string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<"all" | string>("all");
  const [viewMode, setViewMode] = useState<TaskViewMode>("gantt");
  const [structureMode, setStructureMode] = useState<StructureMode>("task");
  const [timeScale, setTimeScale] = useState<TimelineScale>("week");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showNoTimelineSection, setShowNoTimelineSection] = useState(false);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const timelineViewportFrameRef = useRef<number | null>(null);
  const pendingViewportRatioRef = useRef<number | null>(null);
  const lastAutoFocusSignatureRef = useRef<string | null>(null);
  const [timelineViewport, setTimelineViewport] = useState({ scrollLeft: 0, clientWidth: 0 });

  const showPermissionDebug = searchParams.get("debugPermission") === "1";
  const canCreateTask = workspaceAccess.canManage && !workspaceAccess.error;
  const canViewTaskPoints = workspaceAccess.canViewTaskPoints;
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

    const loadTimelineData = async () => {
      setIsLoadingTasks(true);
      setTaskLoadError(null);

      try {
        const [
          { data: taskRowsData, error: tasksError },
          { data: profilesData, error: profilesError },
          { data: goalsData, error: goalsError },
          { data: keyResultsData, error: keyResultsError },
        ] = await Promise.all([
          supabase
            .from("tasks")
            .select(
              `
              id,
              name,
              key_result_id,
              assignee_id,
              profile_id,
              is_recurring,
              type,
              priority,
              current,
              target,
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
              ),
              profile:profiles!tasks_profile_id_fkey(
                id,
                name,
                email
              )
            `,
            )
            .order("created_at", { ascending: false }),
          supabase.from("profiles").select("id,name,email").order("name", { ascending: true }),
          supabase
            .from("goals")
            .select("id,name,type,target,start_date,end_date")
            .order("name", { ascending: true }),
          supabase
            .from("key_results")
            .select(
              `
              id,
              goal_id,
              name,
              type,
              contribution_type,
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
            `,
            )
            .order("name", { ascending: true }),
        ]);

        if (!isActive) {
          return;
        }

        if (tasksError || profilesError || goalsError || keyResultsError) {
          setTaskLoadError(
            tasksError?.message ||
              profilesError?.message ||
              goalsError?.message ||
              keyResultsError?.message ||
              "Không tải được dữ liệu timeline.",
          );
          setTasks([]);
          setGoals([]);
          setKeyResults([]);
          setGoalOwnersByGoalId({});
          setGoalFilters([]);
          setKeyResultFilters([]);
          setAssigneeFilters([]);
          return;
        }

        const mappedProfiles = ((profilesData ?? []) as ProfileLiteRow[]).map((profile) => ({
          id: String(profile.id),
          name: profile.name?.trim() || profile.email?.trim() || "Không rõ",
          email: profile.email ? String(profile.email) : null,
        })) satisfies GoalOwnerProfileRow[];

        const mappedGoals = ((goalsData ?? []) as Array<Record<string, unknown>>)
          .map((rawGoal) => normalizeGoalLite(rawGoal))
          .filter((goal): goal is GoalLiteRow => Boolean(goal));

        const mappedKeyResults = ((keyResultsData ?? []) as Array<Record<string, unknown>>)
          .map((rawKeyResult) => normalizeKeyResultLite(rawKeyResult))
          .filter((keyResult): keyResult is KeyResultLiteRow => Boolean(keyResult));

        const goalIds = mappedGoals.map((goal) => goal.id);
        const { data: goalOwnerRowsData, error: goalOwnersError } =
          goalIds.length > 0
            ? await supabase.from("goal_owners").select("goal_id,profile_id").in("goal_id", goalIds)
            : { data: [], error: null };

        if (!isActive) {
          return;
        }

        if (goalOwnersError) {
          setTaskLoadError(goalOwnersError.message || "Không tải được owners của mục tiêu.");
          setTasks([]);
          setGoals([]);
          setKeyResults([]);
          setGoalOwnersByGoalId({});
          setGoalFilters([]);
          setKeyResultFilters([]);
          setAssigneeFilters([]);
          return;
        }

        const normalizedGoalOwnerRows = ((goalOwnerRowsData ?? []) as GoalOwnerLinkRow[]).map(
          (row) => ({
            goal_id: row.goal_id ? String(row.goal_id) : null,
            profile_id: row.profile_id ? String(row.profile_id) : null,
          }),
        );
        const nextGoalOwnersByGoalId = buildGoalOwnersByGoalId(
          normalizedGoalOwnerRows,
          mappedProfiles,
        );
        mappedGoals.forEach((goal) => {
          if (!nextGoalOwnersByGoalId[goal.id]) {
            nextGoalOwnersByGoalId[goal.id] = [];
          }
        });

        const mappedTasks = ((taskRowsData ?? []) as Array<Record<string, unknown>>).map(
          (rawRow) => {
            const row = rawRow as TaskRow;
            const taskProgress = getComputedTaskProgress(row);
            const keyResult = normalizeKeyResultLite(
              Array.isArray(rawRow.key_result) ? (rawRow.key_result[0] ?? null) : rawRow.key_result,
            );
            const assignee = normalizeProfileLite(
              Array.isArray(rawRow.assignee) ? (rawRow.assignee[0] ?? null) : rawRow.assignee,
            );
            const fallbackAssignee = normalizeProfileLite(
              Array.isArray(rawRow.profile) ? (rawRow.profile[0] ?? null) : rawRow.profile,
            );
            const effectiveAssignee = assignee ?? fallbackAssignee;
            const goalName = keyResult?.goal?.name ?? "Chưa có mục tiêu";
            const keyResultName =
              keyResult?.name ?? (row.key_result_id ? "KR không khả dụng" : "Chưa gắn key result");
            const keyResultMetric = keyResult
              ? formatKeyResultProgressMetric(keyResult.current, keyResult.target, keyResult.unit)
              : "Chưa có số liệu KR";
            const assigneeName =
              effectiveAssignee?.name?.trim() || effectiveAssignee?.email?.trim() || "Chưa gán";
            const effectiveAssigneeId = row.assignee_id
              ? String(row.assignee_id)
              : row.profile_id
                ? String(row.profile_id)
                : null;

            return {
              id: String(row.id),
              name: String(row.name),
              goalId:
                keyResult?.goal?.id ?? (keyResult?.goal_id ? String(keyResult.goal_id) : null),
              goalName,
              keyResultId: row.key_result_id ? String(row.key_result_id) : null,
              keyResultName,
              keyResultMetric,
              keyResult,
              type: row.type ? String(row.type) : null,
              priority: row.priority ? String(row.priority) : null,
              isRecurring: Boolean(row.is_recurring),
              assigneeId: effectiveAssigneeId,
              assigneeName,
              assigneeShort: toShortName(assigneeName),
              current: typeof row.current === "number" ? row.current : Number(row.current ?? 0),
              target: typeof row.target === "number" ? row.target : Number(row.target ?? 0),
              progress: taskProgress,
              weight: typeof row.weight === "number" ? row.weight : Number(row.weight ?? 1),
              createdAt: row.created_at ? String(row.created_at) : null,
              startDate: row.start_date ? String(row.start_date) : null,
              endDate: row.end_date ? String(row.end_date) : null,
            } satisfies TaskItem;
          },
        );

        setTasks(mappedTasks);
        setGoals(mappedGoals);
        setKeyResults(mappedKeyResults);
        setGoalOwnersByGoalId(nextGoalOwnersByGoalId);
        setGoalFilters(
          mappedGoals.map((goal) => ({
            id: goal.id,
            name: goal.name,
          })),
        );
        setKeyResultFilters(
          mappedKeyResults.map((keyResult) => ({
            id: keyResult.id,
            name: keyResult.name,
            goalId: keyResult.goal?.id ?? (keyResult.goal_id ? String(keyResult.goal_id) : ""),
          })),
        );
        setAssigneeFilters(
          mappedProfiles.map((profile) => ({
            id: profile.id,
            name: profile.name,
          })),
        );
      } catch {
        if (!isActive) {
          return;
        }

        setTaskLoadError("Có lỗi khi tải dữ liệu timeline.");
        setTasks([]);
        setGoals([]);
        setKeyResults([]);
        setGoalOwnersByGoalId({});
        setGoalFilters([]);
        setKeyResultFilters([]);
        setAssigneeFilters([]);
      } finally {
        if (isActive) {
          setIsLoadingTasks(false);
        }
      }
    };

    void loadTimelineData();

    return () => {
      isActive = false;
    };
  }, []);

  const normalizedKeyword = searchKeyword.trim().toLowerCase();

  const tasksByGoalId = useMemo(() => {
    const next = new Map<string, TaskItem[]>();
    tasks.forEach((task) => {
      if (!task.goalId) {
        return;
      }
      const existing = next.get(task.goalId) ?? [];
      existing.push(task);
      next.set(task.goalId, existing);
    });
    return next;
  }, [tasks]);

  const tasksByKeyResultId = useMemo(() => {
    const next = new Map<string, TaskItem[]>();
    tasks.forEach((task) => {
      if (!task.keyResultId) {
        return;
      }
      const existing = next.get(task.keyResultId) ?? [];
      existing.push(task);
      next.set(task.keyResultId, existing);
    });
    return next;
  }, [tasks]);

  const keyResultsByGoalId = useMemo(() => {
    const next = new Map<string, KeyResultLiteRow[]>();
    keyResults.forEach((keyResult) => {
      const goalId = keyResult.goal?.id ?? (keyResult.goal_id ? String(keyResult.goal_id) : null);
      if (!goalId) {
        return;
      }
      const existing = next.get(goalId) ?? [];
      existing.push(keyResult);
      next.set(goalId, existing);
    });
    return next;
  }, [keyResults]);

  const showGoalFilter = structureMode !== "goal";
  const showKeyResultFilter = structureMode === "task";
  const showAssigneeFilter = structureMode === "task";

  const activeGoalFilter = showGoalFilter ? goalFilter : "all";
  const activeKeyResultFilter = showKeyResultFilter ? keyResultFilter : "all";
  const activeAssigneeFilter = showAssigneeFilter ? assigneeFilter : "all";

  const filteredTasks = useMemo(() => {
    return [...tasks]
      .filter((task) => {
        if (activeGoalFilter !== "all" && task.goalId !== activeGoalFilter) {
          return false;
        }
        if (activeKeyResultFilter !== "all" && task.keyResultId !== activeKeyResultFilter) {
          return false;
        }
        if (activeAssigneeFilter !== "all" && task.assigneeId !== activeAssigneeFilter) {
          return false;
        }
        if (!normalizedKeyword) {
          return true;
        }

        const haystack =
          `${task.name} ${task.goalName} ${task.keyResultName} ${task.assigneeName}`.toLowerCase();
        return haystack.includes(normalizedKeyword);
      })
      .sort((left, right) => {
        const byPriority = compareTaskPriority(left.priority, right.priority);
        if (byPriority !== 0) {
          return byPriority;
        }

        const leftTime = new Date(left.createdAt ?? 0).getTime();
        const rightTime = new Date(right.createdAt ?? 0).getTime();
        return rightTime - leftTime;
      });
  }, [activeAssigneeFilter, activeGoalFilter, activeKeyResultFilter, normalizedKeyword, tasks]);

  const filteredTaskCountByGoalId = useMemo(() => {
    const next = new Map<string, number>();
    filteredTasks.forEach((task) => {
      if (!task.goalId) {
        return;
      }
      next.set(task.goalId, (next.get(task.goalId) ?? 0) + 1);
    });
    return next;
  }, [filteredTasks]);

  const filteredTaskCountByKeyResultId = useMemo(() => {
    const next = new Map<string, number>();
    filteredTasks.forEach((task) => {
      if (!task.keyResultId) {
        return;
      }
      next.set(task.keyResultId, (next.get(task.keyResultId) ?? 0) + 1);
    });
    return next;
  }, [filteredTasks]);

  const filteredKeyResultFilters = useMemo(() => {
    if (goalFilter === "all") {
      return keyResultFilters;
    }
    return keyResultFilters.filter((keyResult) => keyResult.goalId === goalFilter);
  }, [goalFilter, keyResultFilters]);

  const keyResultProgressMap = useMemo(() => buildKeyResultProgressMap(keyResults), [keyResults]);
  const goalProgressMap = useMemo(
    () => buildGoalProgressMap(goals, keyResults, keyResultProgressMap),
    [goals, keyResultProgressMap, keyResults],
  );

  const goalTimelineItems = useMemo<GoalTimelineItem[]>(
    () =>
      goals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        startDate: goal.start_date,
        endDate: goal.end_date,
        progress: goalProgressMap[goal.id] ?? 0,
        keyResultCount: keyResultsByGoalId.get(goal.id)?.length ?? 0,
        taskCount: filteredTaskCountByGoalId.get(goal.id) ?? 0,
      })),
    [filteredTaskCountByGoalId, goalProgressMap, goals, keyResultsByGoalId],
  );

  const keyResultTimelineItems = useMemo<KeyResultTimelineItem[]>(
    () =>
      keyResults.map((keyResult) => ({
        id: keyResult.id,
        goalId: keyResult.goal?.id ?? (keyResult.goal_id ? String(keyResult.goal_id) : "no-goal"),
        goalName: keyResult.goal?.name ?? "Chưa có mục tiêu",
        name: keyResult.name,
        metric: formatKeyResultProgressMetric(keyResult.current, keyResult.target, keyResult.unit),
        startDate: keyResult.start_date,
        endDate: keyResult.end_date,
        progress: keyResultProgressMap[keyResult.id] ?? 0,
        taskCount: filteredTaskCountByKeyResultId.get(keyResult.id) ?? 0,
      })),
    [filteredTaskCountByKeyResultId, keyResultProgressMap, keyResults],
  );

  const filteredGoalTimelineItems = useMemo(
    () =>
      goalTimelineItems.filter((goal) => {
        if (activeGoalFilter !== "all" && goal.id !== activeGoalFilter) {
          return false;
        }

        const relatedKeyResults = keyResultsByGoalId.get(goal.id) ?? [];
        if (
          activeKeyResultFilter !== "all" &&
          !relatedKeyResults.some((keyResult) => keyResult.id === activeKeyResultFilter)
        ) {
          return false;
        }

        const relatedTasks = tasksByGoalId.get(goal.id) ?? [];
        const goalOwners = goalOwnersByGoalId[goal.id] ?? [];

        if (activeAssigneeFilter !== "all") {
          const hasMatchingOwner = goalOwners.some((owner) => owner.id === activeAssigneeFilter);
          const hasMatchingTaskAssignee = relatedTasks.some(
            (task) => task.assigneeId === activeAssigneeFilter,
          );
          if (!hasMatchingOwner && !hasMatchingTaskAssignee) {
            return false;
          }
        }

        if (!normalizedKeyword) {
          return true;
        }

        const haystack = [
          goal.name,
          getGoalOwnerSearchText(goalOwners),
          relatedKeyResults.map((keyResult) => keyResult.name).join(" "),
          relatedTasks
            .map((task) => `${task.name} ${task.keyResultName} ${task.assigneeName}`)
            .join(" "),
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedKeyword);
      }),
    [
      activeAssigneeFilter,
      activeGoalFilter,
      goalOwnersByGoalId,
      goalTimelineItems,
      activeKeyResultFilter,
      keyResultsByGoalId,
      normalizedKeyword,
      tasksByGoalId,
    ],
  );

  const filteredKeyResultTimelineItems = useMemo(
    () =>
      keyResultTimelineItems.filter((keyResult) => {
        if (activeGoalFilter !== "all" && keyResult.goalId !== activeGoalFilter) {
          return false;
        }
        if (activeKeyResultFilter !== "all" && keyResult.id !== activeKeyResultFilter) {
          return false;
        }

        const relatedTasks = tasksByKeyResultId.get(keyResult.id) ?? [];
        if (
          activeAssigneeFilter !== "all" &&
          !relatedTasks.some((task) => task.assigneeId === activeAssigneeFilter)
        ) {
          return false;
        }
        if (!normalizedKeyword) {
          return true;
        }

        const haystack = [
          keyResult.name,
          keyResult.goalName,
          keyResult.metric,
          relatedTasks.map((task) => `${task.name} ${task.assigneeName}`).join(" "),
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedKeyword);
      }),
    [
      activeAssigneeFilter,
      activeGoalFilter,
      activeKeyResultFilter,
      keyResultTimelineItems,
      normalizedKeyword,
      tasksByKeyResultId,
    ],
  );

  const noTimelineTasks = useMemo(
    () => filteredTasks.filter((task) => !getTaskTimeline(task)),
    [filteredTasks],
  );

  const visibleTasks = useMemo(
    () => filteredTasks.filter((task) => Boolean(getTaskTimeline(task))),
    [filteredTasks],
  );

  const visibleGoalTimelineItems = useMemo(
    () =>
      filteredGoalTimelineItems.filter((goal) =>
        Boolean(getTimelineRange(goal.startDate, goal.endDate)),
      ),
    [filteredGoalTimelineItems],
  );
  const noTimelineGoalItems = useMemo(
    () =>
      filteredGoalTimelineItems.filter((goal) => !getTimelineRange(goal.startDate, goal.endDate)),
    [filteredGoalTimelineItems],
  );
  const visibleKeyResultTimelineItems = useMemo(
    () =>
      filteredKeyResultTimelineItems.filter((keyResult) =>
        Boolean(getTimelineRange(keyResult.startDate, keyResult.endDate)),
      ),
    [filteredKeyResultTimelineItems],
  );
  const noTimelineKeyResultItems = useMemo(
    () =>
      filteredKeyResultTimelineItems.filter(
        (keyResult) => !getTimelineRange(keyResult.startDate, keyResult.endDate),
      ),
    [filteredKeyResultTimelineItems],
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
  const leftPanelWidth =
    structureMode === "task" ? TASK_LEFT_PANEL_WIDTH : DEFAULT_LEFT_PANEL_WIDTH;
  const periods = useMemo(
    () => buildTimelinePeriods(timelineSourceItems, timeScale),
    [timeScale, timelineSourceItems],
  );
  const periodWidth = useMemo(
    () => getPeriodWidthForZoom(timeScale, zoomLevel),
    [timeScale, zoomLevel],
  );
  const timelineWidth = periods.length * periodWidth;
  const timelineViewportWidth = Math.max(
    periodWidth * 12,
    timelineViewport.clientWidth - leftPanelWidth,
  );
  const visibleTimelineWindow = useMemo(() => {
    if (periods.length === 0) {
      return {
        periods: [] as TimelinePeriod[],
        startIndex: 0,
        endIndex: 0,
        offsetPx: 0,
        widthPx: 0,
      };
    }

    const overscan = TIMELINE_WINDOW_OVERSCAN[timeScale];
    const visibleStartPx = Math.max(0, Math.min(timelineWidth, timelineViewport.scrollLeft));
    const visibleEndPx = Math.min(timelineWidth, visibleStartPx + timelineViewportWidth);
    const startIndex = Math.max(0, Math.floor(visibleStartPx / periodWidth) - overscan);
    const endIndex = Math.min(periods.length, Math.ceil(visibleEndPx / periodWidth) + overscan);

    return {
      periods: periods.slice(startIndex, endIndex),
      startIndex,
      endIndex,
      offsetPx: startIndex * periodWidth,
      widthPx: Math.max(0, (endIndex - startIndex) * periodWidth),
    };
  }, [
    periodWidth,
    periods,
    timeScale,
    timelineViewport.scrollLeft,
    timelineViewportWidth,
    timelineWidth,
  ]);
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

  const notStartedCount = useMemo(() => {
    if (structureMode === "goal") {
      return filteredGoalTimelineItems.filter((goal) => {
        const status = getItemProgressStatus(goal.progress, 100, goal.endDate);
        return status === "not-started";
      }).length;
    } else if (structureMode === "key_result") {
      return filteredKeyResultTimelineItems.filter((kr) => {
        const status = getItemProgressStatus(kr.progress, 100, kr.endDate);
        return status === "not-started";
      }).length;
    } else {
      return filteredTasks.filter((task) => {
        const status = getItemProgressStatus(task.progress, 100, task.endDate);
        return status === "not-started";
      }).length;
    }
  }, [structureMode, filteredGoalTimelineItems, filteredKeyResultTimelineItems, filteredTasks]);

  const inProgressCount = useMemo(() => {
    if (structureMode === "goal") {
      return filteredGoalTimelineItems.filter((goal) => {
        const status = getItemProgressStatus(goal.progress, 100, goal.endDate);
        return status === "in-progress";
      }).length;
    } else if (structureMode === "key_result") {
      return filteredKeyResultTimelineItems.filter((kr) => {
        const status = getItemProgressStatus(kr.progress, 100, kr.endDate);
        return status === "in-progress";
      }).length;
    } else {
      return filteredTasks.filter((task) => {
        const status = getItemProgressStatus(task.progress, 100, task.endDate);
        return status === "in-progress";
      }).length;
    }
  }, [structureMode, filteredGoalTimelineItems, filteredKeyResultTimelineItems, filteredTasks]);

  const overdueTaskCount = useMemo(() => {
    if (structureMode === "goal") {
      return filteredGoalTimelineItems.filter((goal) => {
        const status = getItemProgressStatus(goal.progress, 100, goal.endDate);
        return status === "overdue";
      }).length;
    } else if (structureMode === "key_result") {
      return filteredKeyResultTimelineItems.filter((kr) => {
        const status = getItemProgressStatus(kr.progress, 100, kr.endDate);
        return status === "overdue";
      }).length;
    } else {
      return filteredTasks.filter((task) => {
        const status = getItemProgressStatus(task.progress, 100, task.endDate);
        return status === "overdue";
      }).length;
    }
  }, [structureMode, filteredGoalTimelineItems, filteredKeyResultTimelineItems, filteredTasks]);

  const completedCount = useMemo(() => {
    if (structureMode === "goal") {
      return filteredGoalTimelineItems.filter((goal) => {
        const status = getItemProgressStatus(goal.progress, 100, goal.endDate);
        return status === "completed";
      }).length;
    } else if (structureMode === "key_result") {
      return filteredKeyResultTimelineItems.filter((kr) => {
        const status = getItemProgressStatus(kr.progress, 100, kr.endDate);
        return status === "completed";
      }).length;
    } else {
      return filteredTasks.filter((task) => {
        const status = getItemProgressStatus(task.progress, 100, task.endDate);
        return status === "completed";
      }).length;
    }
  }, [structureMode, filteredGoalTimelineItems, filteredKeyResultTimelineItems, filteredTasks]);
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
          missingTitle: "Công việc chưa có mốc thời gian",
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
  const currentFilteredItemCount =
    structureMode === "goal"
      ? filteredGoalTimelineItems.length
      : structureMode === "key_result"
        ? filteredKeyResultTimelineItems.length
        : filteredTasks.length;
  const autoFocusSignature = `${viewMode}:${structureMode}:${timeScale}:${activeGoalFilter}:${activeKeyResultFilter}:${activeAssigneeFilter}:${normalizedKeyword}`;

  const setTimelineViewportSnapshot = useCallback((scrollLeft?: number, clientWidth?: number) => {
    const container = timelineScrollRef.current;
    if (!container) {
      return;
    }

    const nextViewport = {
      scrollLeft: scrollLeft ?? container.scrollLeft,
      clientWidth: clientWidth ?? container.clientWidth,
    };

    setTimelineViewport((prev) =>
      prev.scrollLeft === nextViewport.scrollLeft && prev.clientWidth === nextViewport.clientWidth
        ? prev
        : nextViewport,
    );
  }, []);

  const syncTimelineViewport = useCallback(() => {
    timelineViewportFrameRef.current = null;
    setTimelineViewportSnapshot();
  }, [setTimelineViewportSnapshot]);

  const scheduleTimelineViewportSync = useCallback(() => {
    if (timelineViewportFrameRef.current !== null) {
      return;
    }

    timelineViewportFrameRef.current = requestAnimationFrame(() => {
      syncTimelineViewport();
    });
  }, [syncTimelineViewport]);

  const handleTimelineScroll = useCallback(() => {
    scheduleTimelineViewportSync();
  }, [scheduleTimelineViewportSync]);

  useEffect(() => {
    return () => {
      if (timelineViewportFrameRef.current !== null) {
        cancelAnimationFrame(timelineViewportFrameRef.current);
      }
    };
  }, []);

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

    const visibleTimelineWidth = Math.max(0, container.clientWidth - leftPanelWidth);
    const centeredOffset = Math.max(0, container.scrollLeft + visibleTimelineWidth / 2);
    return centeredOffset / Math.max(1, timelineWidth);
  }, [leftPanelWidth, timelineWidth]);

  const restoreViewportRatio = useCallback(
    (ratio: number) => {
      const container = timelineScrollRef.current;
      if (!container || timelineWidth <= 0) {
        return;
      }

      const visibleTimelineWidth = Math.max(0, container.clientWidth - leftPanelWidth);
      const targetScrollLeft =
        timelineWidth * Math.min(1, Math.max(0, ratio)) - visibleTimelineWidth / 2;
      const maxScrollLeft = Math.max(0, leftPanelWidth + timelineWidth - container.clientWidth);
      const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, targetScrollLeft));
      container.scrollLeft = nextScrollLeft;
      setTimelineViewportSnapshot(nextScrollLeft, container.clientWidth);
      scheduleTimelineViewportSync();
    },
    [leftPanelWidth, scheduleTimelineViewportSync, setTimelineViewportSnapshot, timelineWidth],
  );

  const preserveTimelineViewport = useCallback(() => {
    pendingViewportRatioRef.current = captureViewportRatio();
  }, [captureViewportRatio]);

  const applyTimelineZoom = useCallback(
    (nextZoom: number) => {
      const safeZoom = clampTimelineZoom(nextZoom);
      if (safeZoom === zoomLevel) {
        return;
      }

      preserveTimelineViewport();
      setZoomLevel(safeZoom);
    },
    [preserveTimelineViewport, zoomLevel],
  );

  const scrollTimelineToToday = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const container = timelineScrollRef.current;
      if (!container || todayIndicatorOffset === null) {
        return;
      }

      const visibleTimelineWidth = Math.max(0, container.clientWidth - leftPanelWidth);
      const maxScrollLeft = Math.max(0, leftPanelWidth + timelineWidth - container.clientWidth);
      const targetScrollLeft = todayIndicatorOffset - visibleTimelineWidth * 0.42;
      const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, targetScrollLeft));

      if (behavior === "auto") {
        container.scrollLeft = nextScrollLeft;
        setTimelineViewportSnapshot(nextScrollLeft, container.clientWidth);
      } else {
        container.scrollTo({
          left: nextScrollLeft,
          behavior,
        });
      }

      scheduleTimelineViewportSync();
    },
    [
      leftPanelWidth,
      scheduleTimelineViewportSync,
      setTimelineViewportSnapshot,
      timelineWidth,
      todayIndicatorOffset,
    ],
  );

  const handleTimelineWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      const container = timelineScrollRef.current;
      if (!container) {
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        applyTimelineZoom(
          zoomLevel + (event.deltaY < 0 ? TIMELINE_ZOOM_STEP : -TIMELINE_ZOOM_STEP),
        );
        return;
      }

      if (!event.shiftKey || Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
        return;
      }

      event.preventDefault();
      container.scrollLeft += event.deltaY;
      setTimelineViewportSnapshot(container.scrollLeft, container.clientWidth);
      scheduleTimelineViewportSync();
    },
    [applyTimelineZoom, scheduleTimelineViewportSync, setTimelineViewportSnapshot, zoomLevel],
  );

  const updateStructureMode = useCallback(
    (nextMode: StructureMode) => {
      if (nextMode === structureMode) {
        return;
      }
      pendingViewportRatioRef.current = null;
      setStructureMode(nextMode);
    },
    [structureMode],
  );

  const updateTimeScale = useCallback(
    (nextScale: TimelineScale) => {
      if (nextScale === timeScale) {
        return;
      }
      pendingViewportRatioRef.current = null;
      setTimeScale(nextScale);
    },
    [timeScale],
  );

  const handleJumpToToday = useCallback(() => {
    scrollTimelineToToday("smooth");
  }, [scrollTimelineToToday]);

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

  useLayoutEffect(() => {
    if (viewMode !== "gantt") {
      return;
    }

    scheduleTimelineViewportSync();
  }, [
    leftPanelWidth,
    scheduleTimelineViewportSync,
    structureMode,
    timeScale,
    timelineWidth,
    viewMode,
    zoomLevel,
  ]);

  useEffect(() => {
    if (viewMode !== "gantt") {
      return;
    }

    const container = timelineScrollRef.current;
    if (!container) {
      return;
    }

    syncTimelineViewport();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      scheduleTimelineViewportSync();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [
    scheduleTimelineViewportSync,
    structureMode,
    syncTimelineViewport,
    timeScale,
    viewMode,
    zoomLevel,
  ]);

  useLayoutEffect(() => {
    if (viewMode !== "gantt" || !timelineScrollRef.current) {
      return;
    }

    const shouldAutoFocus = lastAutoFocusSignatureRef.current !== autoFocusSignature;

    if (pendingViewportRatioRef.current !== null) {
      restoreViewportRatio(pendingViewportRatioRef.current);
      pendingViewportRatioRef.current = null;
      return;
    }

    if (shouldAutoFocus && todayIndicatorOffset !== null) {
      scrollTimelineToToday("auto");
      lastAutoFocusSignatureRef.current = autoFocusSignature;
    }
  }, [
    autoFocusSignature,
    restoreViewportRatio,
    scrollTimelineToToday,
    todayIndicatorOffset,
    viewMode,
  ]);

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="tasks" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-5 backdrop-blur lg:px-7">
            <div>
              <p className="text-sm font-semibold text-gray-500">
                <Link href="/dashboard" className="hover:text-gray-900">
                  Bảng điều khiển
                </Link>
                <span className="px-2">›</span>
                <span>Quản lý công việc</span>
              </p>
              <h1 className="mt-2 text-4xl font-bold tracking-[-0.03em] text-slate-900">
                Biểu đồ Công việc
              </h1>
            </div>
          </header>

          <main className="space-y-4 px-4 py-5 lg:px-7">
            {showPermissionDebug && permissionDebug ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-xs text-slate-100">
                <p className="mb-2 font-semibold text-sky-300">
                  Debug quyền tạo công việc (debugPermission=1)
                </p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                  {JSON.stringify(permissionDebug, null, 2)}
                </pre>
              </div>
            ) : null}

            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
              {/* View Mode & Structure Mode Selection */}
              <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Chế độ xem:
                  </span>
                  <div className="rounded-xl border border-slate-200 bg-white p-1">
                    <ScaleButton active={viewMode === "gantt"} onClick={() => setViewMode("gantt")}>
                      Gantt
                    </ScaleButton>
                    <ScaleButton active={viewMode === "list"} onClick={() => setViewMode("list")}>
                      Danh sách
                    </ScaleButton>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Cấp độ:
                  </span>
                  <div className="rounded-xl border border-slate-200 bg-white p-1">
                    <ScaleButton
                      active={structureMode === "goal"}
                      onClick={() => updateStructureMode("goal")}
                    >
                      Mục tiêu
                    </ScaleButton>
                    <ScaleButton
                      active={structureMode === "key_result"}
                      onClick={() => updateStructureMode("key_result")}
                    >
                      KR
                    </ScaleButton>
                    <ScaleButton
                      active={structureMode === "task"}
                      onClick={() => updateStructureMode("task")}
                    >
                      Công việc
                    </ScaleButton>
                  </div>
                </div>
              </div>

              {/* Search and Add Action */}
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="Tìm kiếm công việc, KR, mục tiêu, người phụ trách..."
                  className="flex-1 min-w-[240px] h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                {!isCheckingCreatePermission && canCreateTask ? (
                  <button
                    type="button"
                    onClick={() => router.push(addTaskHref)}
                    className="h-10 shrink-0 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 transition"
                  >
                    + Thêm công việc
                  </button>
                ) : null}
              </div>

              {/* Filter Bar */}
              <div className="grid gap-3 border-t border-slate-100 pt-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
                {showGoalFilter ? (
                  <Select
                    value={goalFilter}
                    onValueChange={(value) => {
                      setGoalFilter(value as "all" | string);
                      setKeyResultFilter("all");
                    }}
                  >
                    <SelectTrigger className="h-10 text-sm">
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
                ) : null}

                {showKeyResultFilter ? (
                  <Select
                    value={keyResultFilter}
                    onValueChange={(value) => setKeyResultFilter(value as "all" | string)}
                  >
                    <SelectTrigger className="h-10 text-sm">
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
                ) : null}

                {showAssigneeFilter ? (
                  <Select
                    value={assigneeFilter}
                    onValueChange={(value) => setAssigneeFilter(value as "all" | string)}
                  >
                    <SelectTrigger className="h-10 text-sm">
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
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    setSearchKeyword("");
                    setGoalFilter("all");
                    setKeyResultFilter("all");
                    setAssigneeFilter("all");
                  }}
                  className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                >
                  Xóa lọc
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
              <div className="mb-5 flex flex-col items-start justify-between gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {viewMode === "gantt" ? currentModeMeta.ganttTitle : currentModeMeta.listTitle}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">{currentModeMeta.description}</p>
                </div>

                {viewMode === "gantt" ? (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="rounded-lg border border-slate-200 bg-slate-100 p-1">
                      <ScaleButton
                        active={timeScale === "day"}
                        onClick={() => updateTimeScale("day")}
                      >
                        Ngày
                      </ScaleButton>
                      <ScaleButton
                        active={timeScale === "week"}
                        onClick={() => updateTimeScale("week")}
                      >
                        Tuần
                      </ScaleButton>
                      <ScaleButton
                        active={timeScale === "month"}
                        onClick={() => updateTimeScale("month")}
                      >
                        Tháng
                      </ScaleButton>
                    </div>
                    <ToolbarButton
                      onClick={handleJumpToToday}
                      active={todayIndicatorOffset !== null}
                      disabled={todayIndicatorOffset === null}
                    >
                      Hôm nay
                    </ToolbarButton>
                  </div>
                ) : null}
              </div>

              {/* Timeline Help Text */}
              {viewMode === "gantt" ? (
                <p className="text-xs text-slate-500 mb-4">
                  <strong>Mẹo:</strong> Giữ Ctrl/Cmd + lăn chuột để zoom. Giữ Shift + lăn chuột để
                  cuộn ngang. Hover vào task bar để xem chi tiết.
                </p>
              ) : null}

              {/* Statistics Cards */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                    Chưa thực hiện
                  </p>
                  <p className="mt-2 text-3xl font-bold text-slate-700">{notStartedCount}</p>
                </div>

                <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-600">
                    Đang thực hiện
                  </p>
                  <p className="mt-2 text-3xl font-bold text-emerald-700">{inProgressCount}</p>
                </div>

                <div className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-red-600">
                    Quá hạn
                  </p>
                  <p className="mt-2 text-3xl font-bold text-red-700">{overdueTaskCount}</p>
                </div>

                <div className="rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-blue-600">
                    Hoàn thành
                  </p>
                  <p className="mt-2 text-3xl font-bold text-blue-700">{completedCount}</p>
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

            {!isLoadingTasks && currentFilteredItemCount === 0 ? (
              <section className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
                <p className="text-base font-semibold text-slate-900">
                  Không có {currentModeMeta.pluralLabel} nào khớp bộ lọc hiện tại.
                </p>
                <Link
                  href="/goals"
                  className="mt-5 inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Đi tới mục tiêu
                </Link>
              </section>
            ) : null}

            {!isLoadingTasks && currentFilteredItemCount > 0 ? (
              viewMode === "gantt" ? (
                structureMode === "goal" ? (
                  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div
                      ref={timelineScrollRef}
                      onScroll={handleTimelineScroll}
                      onWheel={handleTimelineWheel}
                      className="overflow-x-auto overflow-y-hidden rounded-2xl overscroll-x-contain scroll-smooth [scrollbar-gutter:stable]"
                    >
                      <div className="min-w-full" style={{ width: leftPanelWidth + timelineWidth }}>
                        <div
                          className="grid border-b border-slate-200 bg-slate-50"
                          style={{ gridTemplateColumns: `${leftPanelWidth}px ${timelineWidth}px` }}
                        >
                          <div
                            className={`sticky left-0 z-30 border-r border-slate-200 bg-slate-50 px-5 py-4 ${STICKY_PANEL_SHADOW}`}
                          >
                            <p className="text-sm font-semibold text-slate-900">
                              Danh sách mục tiêu
                            </p>
                          </div>
                          <TimelinePeriodHeader
                            periods={visibleTimelineWindow.periods}
                            periodWidth={periodWidth}
                            timelineWidth={timelineWidth}
                            visibleStartIndex={visibleTimelineWindow.startIndex}
                            visibleOffsetPx={visibleTimelineWindow.offsetPx}
                            visibleWidthPx={visibleTimelineWindow.widthPx}
                            todayIndex={todayIndex}
                            todayIndicatorOffset={todayIndicatorOffset}
                          />
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
                              style={{
                                gridTemplateColumns: `${leftPanelWidth}px ${timelineWidth}px`,
                              }}
                            >
                              <div
                                className={`sticky left-0 z-20 border-r border-slate-200 bg-white px-5 py-4 ${STICKY_PANEL_SHADOW}`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                                      Mục tiêu
                                    </p>
                                    <p className="mt-1 text-base font-semibold text-slate-900">
                                      {goal.name}
                                    </p>
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
                                <TimelinePeriodBackground
                                  rowKey={goal.id}
                                  periods={visibleTimelineWindow.periods}
                                  periodWidth={periodWidth}
                                  visibleStartIndex={visibleTimelineWindow.startIndex}
                                  visibleOffsetPx={visibleTimelineWindow.offsetPx}
                                  visibleWidthPx={visibleTimelineWindow.widthPx}
                                  todayIndex={todayIndex}
                                />
                                {todayIndicatorOffset !== null ? (
                                  <div
                                    className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-blue-400/75"
                                    style={{ left: todayIndicatorOffset }}
                                  />
                                ) : null}
                                <Link
                                  href={goal.id !== "no-goal" ? `/goals/${goal.id}` : "/goals"}
                                  title={`${goal.name}\nTiến độ: ${goal.progress}%\n${formatTimelineRangeVi(
                                    goal.startDate,
                                    goal.endDate,
                                    {
                                      fallback: "Chưa đặt khung thời gian",
                                    },
                                  )}`}
                                  className="absolute top-1/2 flex h-10 -translate-y-1/2 items-center overflow-hidden rounded-xl border border-slate-300 bg-slate-200 px-3 text-left shadow-sm transition hover:bg-slate-300"
                                  style={{ left: barLayout.left, width: barLayout.width }}
                                >
                                  <TimelineBarContent
                                    label={goal.name}
                                    progress={goal.progress}
                                    width={barLayout.width}
                                  />
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
                      onScroll={handleTimelineScroll}
                      onWheel={handleTimelineWheel}
                      className="overflow-x-auto overflow-y-hidden rounded-2xl overscroll-x-contain scroll-smooth [scrollbar-gutter:stable]"
                    >
                      <div className="min-w-full" style={{ width: leftPanelWidth + timelineWidth }}>
                        <div
                          className="grid border-b border-slate-200 bg-slate-50"
                          style={{ gridTemplateColumns: `${leftPanelWidth}px ${timelineWidth}px` }}
                        >
                          <div
                            className={`sticky left-0 z-30 border-r border-slate-200 bg-slate-50 px-5 py-4 ${STICKY_PANEL_SHADOW}`}
                          >
                            <p className="text-sm font-semibold text-slate-900">
                              Danh sách key result
                            </p>
                          </div>
                          <TimelinePeriodHeader
                            periods={visibleTimelineWindow.periods}
                            periodWidth={periodWidth}
                            timelineWidth={timelineWidth}
                            visibleStartIndex={visibleTimelineWindow.startIndex}
                            visibleOffsetPx={visibleTimelineWindow.offsetPx}
                            visibleWidthPx={visibleTimelineWindow.widthPx}
                            todayIndex={todayIndex}
                            todayIndicatorOffset={todayIndicatorOffset}
                          />
                        </div>

                        {visibleKeyResultTimelineItems.map((keyResult) => {
                          const barLayout = getItemBarLayout(
                            keyResult.startDate,
                            keyResult.endDate,
                            12,
                          );
                          if (!barLayout) {
                            return null;
                          }

                          return (
                            <div
                              key={keyResult.id}
                              className="grid border-b border-slate-100"
                              style={{
                                gridTemplateColumns: `${leftPanelWidth}px ${timelineWidth}px`,
                              }}
                            >
                              <div
                                className={`sticky left-0 z-20 border-r border-slate-200 bg-white px-5 py-4 ${STICKY_PANEL_SHADOW}`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                      <p className="text-sm font-semibold text-slate-900">
                                        {keyResult.name}
                                      </p>
                                      <p className="text-xs text-slate-500">{keyResult.metric}</p>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {keyResult.goalName}
                                    </p>
                                    <p className="mt-1 text-[11px] text-slate-400">
                                      {keyResult.taskCount} công việc ·{" "}
                                      {formatTimelineRangeVi(
                                        keyResult.startDate,
                                        keyResult.endDate,
                                        {
                                          fallback: "KR chưa có mốc thời gian",
                                        },
                                      )}
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
                                <TimelinePeriodBackground
                                  rowKey={keyResult.id}
                                  periods={visibleTimelineWindow.periods}
                                  periodWidth={periodWidth}
                                  visibleStartIndex={visibleTimelineWindow.startIndex}
                                  visibleOffsetPx={visibleTimelineWindow.offsetPx}
                                  visibleWidthPx={visibleTimelineWindow.widthPx}
                                  todayIndex={todayIndex}
                                />
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
                                  title={`${keyResult.name}\nTiến độ: ${keyResult.progress}%\n${formatTimelineRangeVi(
                                    keyResult.startDate,
                                    keyResult.endDate,
                                    {
                                      fallback: "KR chưa có mốc thời gian",
                                    },
                                  )}`}
                                  className="absolute top-1/2 flex h-10 -translate-y-1/2 items-center overflow-hidden rounded-xl border border-slate-300 bg-slate-200 px-3 text-left shadow-sm transition hover:bg-slate-300"
                                  style={{ left: barLayout.left, width: barLayout.width }}
                                >
                                  <TimelineBarContent
                                    label={keyResult.name}
                                    progress={keyResult.progress}
                                    width={barLayout.width}
                                  />
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
                      onScroll={handleTimelineScroll}
                      onWheel={handleTimelineWheel}
                      className="overflow-x-auto overflow-y-hidden rounded-2xl overscroll-x-contain scroll-smooth [scrollbar-gutter:stable]"
                    >
                      <div className="min-w-full" style={{ width: leftPanelWidth + timelineWidth }}>
                        <div
                          className="grid border-b border-slate-200 bg-slate-50"
                          style={{ gridTemplateColumns: `${leftPanelWidth}px ${timelineWidth}px` }}
                        >
                          <div
                            className={`sticky left-0 z-30 border-r border-slate-200 bg-slate-50 px-5 py-4 ${STICKY_PANEL_SHADOW}`}
                          >
                            <p className="text-sm font-semibold text-slate-900">
                              Danh sách công việc
                            </p>
                          </div>
                          <TimelinePeriodHeader
                            periods={visibleTimelineWindow.periods}
                            periodWidth={periodWidth}
                            timelineWidth={timelineWidth}
                            visibleStartIndex={visibleTimelineWindow.startIndex}
                            visibleOffsetPx={visibleTimelineWindow.offsetPx}
                            visibleWidthPx={visibleTimelineWindow.widthPx}
                            todayIndex={todayIndex}
                            todayIndicatorOffset={todayIndicatorOffset}
                          />
                        </div>

                        {visibleTasks.map((task) => {
                          const barLayout = getItemBarLayout(task.startDate, task.endDate);
                          const tooltip = buildTaskTooltip(task, canViewTaskPoints);
                          const alignmentWarning = getTaskTimelineAlignmentWarning(task);
                          const taskTimelineStatus = getTaskStatus(
                            task.startDate,
                            task.endDate,
                            task.progress,
                            !getTaskTimeline(task),
                          );
                          const taskStatusColors = getStatusColors(taskTimelineStatus);

                          return (
                            <div
                              key={task.id}
                              className="grid border-b border-slate-100 last:border-b-0"
                              style={{
                                gridTemplateColumns: `${leftPanelWidth}px ${timelineWidth}px`,
                              }}
                            >
                              <div
                                className={`sticky left-0 z-10 border-r border-slate-200 bg-white px-5 py-4 ${STICKY_PANEL_SHADOW}`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <Link
                                      href={`/tasks/${task.id}`}
                                      className="group block truncate text-base font-bold text-slate-900 hover:text-blue-700 transition"
                                      title={tooltip}
                                    >
                                      {task.name}
                                    </Link>
                                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <p className="text-xs text-slate-500 font-medium">
                                        {task.goalName}
                                      </p>
                                      <span className="inline-block h-1 w-1 rounded-full bg-slate-300"></span>
                                      <p className="text-xs text-slate-500">{task.keyResultName}</p>
                                    </div>
                                    <p className="mt-2 text-xs text-slate-600">
                                      {task.assigneeName}
                                      {task.isRecurring ? " · 🔁 Lặp lại" : ""}
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                      <span
                                        className={`inline-flex px-2 py-1 rounded-md text-[10px] font-semibold ${taskStatusColors.badgeBg} ${taskStatusColors.badgeText}`}
                                      >
                                        Tiến độ {task.progress}%
                                      </span>
                                      <span
                                        className={`inline-flex rounded-md px-2 py-1 text-[10px] font-semibold ${getTaskPriorityBadgeClassName(task.priority)}`}
                                      >
                                        {getTaskPriorityLabel(task.priority)}
                                      </span>
                                    </div>
                                    <p className="mt-2 text-[11px] font-medium text-slate-600">
                                      {formatTaskPointValue(getTaskEarnedPoints(task))} /{" "}
                                      {formatTaskPointValue(getTaskPriorityScore(task.priority))}{" "}
                                      điểm
                                    </p>
                                    {alignmentWarning ? (
                                      <p className="mt-2 text-[11px] text-amber-600 font-medium">
                                        ⚠️ {alignmentWarning}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              </div>

                              <div className="relative min-h-[92px] bg-white">
                                <TimelinePeriodBackground
                                  rowKey={task.id}
                                  periods={visibleTimelineWindow.periods}
                                  periodWidth={periodWidth}
                                  visibleStartIndex={visibleTimelineWindow.startIndex}
                                  visibleOffsetPx={visibleTimelineWindow.offsetPx}
                                  visibleWidthPx={visibleTimelineWindow.widthPx}
                                  todayIndex={todayIndex}
                                />
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
                )
              ) : structureMode === "goal" ? (
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
                        {filteredGoalTimelineItems.map((goal) => (
                          <tr key={goal.id} className="border-b border-slate-100 align-top">
                            <td className="px-5 py-4">
                              <p className="text-sm font-semibold text-slate-900">{goal.name}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {goal.taskCount} công việc theo bộ lọc
                              </p>
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-600">
                              {formatTimelineRangeVi(goal.startDate, goal.endDate, {
                                fallback: "Mục tiêu chưa có mốc thời gian",
                              })}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-700">
                              {goal.keyResultCount}
                            </td>
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
                        {filteredKeyResultTimelineItems.map((keyResult) => (
                          <tr key={keyResult.id} className="border-b border-slate-100 align-top">
                            <td className="px-5 py-4">
                              <p className="text-sm font-semibold text-slate-900">
                                {keyResult.name}
                              </p>
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-700">
                              {keyResult.goalName}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-500">{keyResult.metric}</td>
                            <td className="px-4 py-4 text-sm text-slate-600">
                              {formatTimelineRangeVi(keyResult.startDate, keyResult.endDate, {
                                fallback: "KR chưa có mốc thời gian",
                              })}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-700">
                              {keyResult.taskCount}
                            </td>
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
                          <th className="px-4 py-3 font-semibold">KR</th>
                          <th className="px-4 py-3 font-semibold">Mục tiêu</th>
                          <th className="px-4 py-3 font-semibold">Người phụ trách</th>
                          <th className="px-4 py-3 font-semibold">Độ ưu tiên</th>
                          <th className="px-4 py-3 font-semibold">Tiến độ</th>
                          <th className="px-4 py-3 font-semibold">Thời gian thực thi</th>
                          <th className="px-4 py-3 font-semibold">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTasks.map((task) => {
                          const alignmentWarning = getTaskTimelineAlignmentWarning(task);
                          return (
                            <tr key={task.id} className="border-b border-slate-100 align-top">
                              <td className="px-5 py-4">
                                <Link
                                  href={`/tasks/${task.id}`}
                                  className="text-sm font-semibold text-slate-900 hover:text-blue-700"
                                >
                                  {task.name}
                                </Link>
                                <p className="mt-1 text-xs text-slate-500">
                                  {task.type?.toUpperCase() ?? "KPI"} · {task.progress}%
                                  {task.isRecurring ? " · Lặp lại" : ""}
                                </p>
                              </td>
                              <td className="px-4 py-4">
                                <p className="text-sm font-semibold text-slate-900">
                                  {task.keyResultName}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {task.keyResultMetric}
                                </p>
                              </td>
                              <td className="px-4 py-4">
                                <p className="text-sm text-slate-700">{task.goalName}</p>
                              </td>
                              <td className="px-4 py-4">
                                <p className="text-sm text-slate-700">{task.assigneeName}</p>
                              </td>
                              <td className="px-4 py-4">
                                <span
                                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getTaskPriorityBadgeClassName(task.priority)}`}
                                >
                                  {getTaskPriorityLabel(task.priority)}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                <div className="w-[140px]">
                                  <ProgressBar value={task.progress} />
                                  <p className="mt-2 text-xs text-slate-500">{task.progress}%</p>
                                  <p className="mt-1 text-xs font-medium text-slate-600">
                                    {formatTaskPointValue(getTaskEarnedPoints(task))} /{" "}
                                    {formatTaskPointValue(getTaskPriorityScore(task.priority))} điểm
                                  </p>
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
                                  {formatTimelineRangeVi(
                                    task.keyResult?.start_date ?? null,
                                    task.keyResult?.end_date ?? null,
                                    {
                                      fallback: "KR chưa có mốc thời gian",
                                    },
                                  )}
                                </p>
                                {alignmentWarning ? (
                                  <p className="mt-1 text-xs text-amber-600">{alignmentWarning}</p>
                                ) : null}
                              </td>
                              <td className="px-4 py-4">
                                <Link
                                  href={`/tasks/${task.id}`}
                                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  Chi tiết
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )
            ) : null}

            {!isLoadingTasks && viewMode === "gantt" && currentNoTimelineCount > 0 ? (
              <section className="rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50/50 p-5">
                <div className="mb-5 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-amber-900">
                      <span>⚠️</span>
                      {currentModeMeta.missingTitle}
                    </h2>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="inline-flex h-8 items-center gap-2 rounded-lg bg-amber-100/80 px-3 font-semibold text-amber-700">
                      <span className="text-sm">{currentNoTimelineCount}</span>
                      <span className="text-xs">{currentModeMeta.pluralLabel}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowNoTimelineSection((prev) => !prev)}
                      className="inline-flex h-8 items-center rounded-lg border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-700 hover:bg-amber-50 transition"
                    >
                      {showNoTimelineSection ? "Thu gọn" : "Mở rộng"}
                    </button>
                  </div>
                </div>

                {showNoTimelineSection ? (
                  <>
                    <div>
                      {structureMode === "goal" ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {noTimelineGoalItems.map((goal) => (
                            <div
                              key={goal.id}
                              className="rounded-xl border border-amber-200 bg-white p-4 hover:shadow-sm transition"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold text-slate-900">{goal.name}</p>
                                  <p className="mt-1 text-sm text-slate-600">
                                    {goal.keyResultCount} KR · {goal.taskCount} công việc
                                  </p>
                                </div>
                              </div>
                              <p className="mt-3 text-xs text-amber-700 font-medium">
                                {getTimelineMissingReason(
                                  goal.startDate,
                                  goal.endDate,
                                  "Chưa có ngày bắt đầu hoặc kết thúc",
                                  "Ngày bắt đầu/kết thúc không hợp lệ",
                                )}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : structureMode === "key_result" ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {noTimelineKeyResultItems.map((keyResult) => (
                            <div
                              key={keyResult.id}
                              className="rounded-xl border border-amber-200 bg-white p-4 hover:shadow-sm transition"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold text-slate-900">{keyResult.name}</p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {keyResult.goalName}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-600 font-medium">
                                    {keyResult.metric}
                                  </p>
                                </div>
                              </div>
                              <p className="mt-3 text-xs text-amber-700 font-medium">
                                {getTimelineMissingReason(
                                  keyResult.startDate,
                                  keyResult.endDate,
                                  "Chưa có ngày bắt đầu hoặc kết thúc",
                                  "Ngày bắt đầu/kết thúc không hợp lệ",
                                )}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[1200px] text-left text-sm">
                            <thead>
                              <tr className="border-b border-amber-200 text-[11px] uppercase tracking-[0.08em] text-amber-700">
                                <th className="px-4 py-3 font-bold">Công việc</th>
                                <th className="px-4 py-3 font-bold">Mục tiêu</th>
                                <th className="px-4 py-3 font-bold">KR</th>
                                <th className="px-4 py-3 font-bold">Người phụ trách</th>
                                <th className="px-4 py-3 font-bold">Độ ưu tiên</th>
                                <th className="px-4 py-3 font-bold">Tiến độ</th>
                                <th className="px-4 py-3 font-bold">Thao tác</th>
                              </tr>
                            </thead>
                            <tbody>
                              {noTimelineTasks.map((task) => (
                                <tr
                                  key={task.id}
                                  className="border-b border-amber-100 hover:bg-amber-50/50 transition align-top"
                                >
                                  <td className="px-4 py-3">
                                    <Link
                                      href={`/tasks/${task.id}`}
                                      className="font-semibold text-slate-900 hover:text-blue-700"
                                    >
                                      {task.name}
                                    </Link>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {task.type?.toUpperCase() ?? "KPI"}
                                      {task.isRecurring ? " · 🔁" : ""}
                                    </p>
                                  </td>
                                  <td className="px-4 py-3 text-slate-700">{task.goalName}</td>
                                  <td className="px-4 py-3">
                                    <p className="font-medium text-slate-900">
                                      {task.keyResultName}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {task.keyResultMetric}
                                    </p>
                                  </td>
                                  <td className="px-4 py-3 text-slate-700">{task.assigneeName}</td>
                                  <td className="px-4 py-3">
                                    <span
                                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getTaskPriorityBadgeClassName(task.priority)}`}
                                    >
                                      {getTaskPriorityLabel(task.priority)}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="w-[140px]">
                                      <ProgressBar value={task.progress} />
                                      <p className="mt-2 text-xs text-slate-500">
                                        {task.progress}%
                                      </p>
                                      <p className="mt-1 text-xs font-medium text-slate-600">
                                        {formatTaskPointValue(getTaskEarnedPoints(task))} /{" "}
                                        {formatTaskPointValue(getTaskPriorityScore(task.priority))}{" "}
                                        điểm
                                      </p>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <Link
                                      href={`/tasks/${task.id}`}
                                      className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                                    >
                                      Chi tiết
                                    </Link>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
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

export default function TasksPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f3f5fa]" />}>
      <TasksPageContent />
    </Suspense>
  );
}
