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
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildGoalOwnersByGoalId,
  formatGoalOwnersSummary,
  getGoalOwnerSearchText,
  type GoalOwnerLinkRow,
  type GoalOwnerProfile,
  type GoalOwnerProfileRow,
} from "@/lib/goal-owners";
import { formatKeyResultMetric } from "@/lib/constants/key-results";
import {
  TASK_PRIORITIES,
  compareTaskPriority,
  getTaskPriorityBadgeClassName,
  getTaskPriorityLabel,
  normalizeTaskPriority,
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
  getPeriodWidthForZoom,
  getTimelineBarLayout,
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
} from "@/lib/timeline";
import {
  getTaskStatus,
  getProgressStatusColors,
  getProgressStatusLabel,
  getStatusColors,
  getItemProgressStatus,
} from "@/lib/timeline-ui-helpers";
import { OKR_FEATURE_ENABLED } from "@/lib/features";
const DEFAULT_LEFT_PANEL_WIDTH = 420;
const TASK_LEFT_PANEL_WIDTH = 360;
const BOARD_BOTTOM_SAFE_SPACE = 24;
const GANTT_ROW_HEIGHT = 64;
const GANTT_TOP_CHROME_HEIGHT = 96;
const GANTT_TIMELINE_HEADER_HEIGHT = 56;
const GANTT_MIN_VISIBLE_ROWS = 4;
const GANTT_MAX_VISIBLE_ROWS = 8;
const TASK_LIST_PAGE_SIZE = 10;

const formatKeyResultProgressMetric = (
  current: number | null,
  target: number | null,
  unit: string | null,
) => `${formatKeyResultMetric(current, unit)} / ${formatKeyResultMetric(target, unit)}`;

const formatGoalQuarterLabel = (quarter: number | null, year: number | null) => {
  if (quarter && year) {
    return `Q${quarter}/${year}`;
  }
  if (quarter) {
    return `Q${quarter}`;
  }
  if (year) {
    return `Năm ${year}`;
  }
  return "Chưa đặt quý";
};

type TaskViewMode = "gantt" | "list";
type StructureMode = "goal" | "key_result" | "task";
type ItemStatusFilter = "all" | "not-started" | "in-progress" | "overdue" | "completed";
type OverdueFilter = "all" | "only_overdue" | "exclude_overdue";

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
  unit: string | null;
  department_id: string | null;
  quarter: number | null;
  year: number | null;
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
  responsible_department_id: string | null;
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
  metric: string;
  quarter: number | null;
  year: number | null;
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

const getSearchPlaceholder = (level: StructureMode) => {
  if (level === "goal") {
    return "Tìm kiếm goal...";
  }
  if (level === "key_result") {
    return "Tìm kiếm KR...";
  }
  return "Tìm kiếm task...";
};

const getAddButtonLabel = (level: StructureMode) => {
  if (level === "goal") {
    return "+ Thêm goal";
  }
  if (level === "key_result") {
    return "+ Thêm KR";
  }
  return "+ Thêm task";
};

const STATUS_FILTER_OPTIONS: Array<{ value: ItemStatusFilter; label: string }> = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "not-started", label: "Chưa thực hiện" },
  { value: "in-progress", label: "Đang thực hiện" },
  { value: "overdue", label: "Quá hạn" },
  { value: "completed", label: "Hoàn thành" },
];

const OVERDUE_FILTER_OPTIONS: Array<{ value: OverdueFilter; label: string }> = [
  { value: "all", label: "Mọi deadline" },
  { value: "only_overdue", label: "Chỉ quá hạn" },
  { value: "exclude_overdue", label: "Ẩn quá hạn" },
];

const matchesQuarterYearFilter = (
  quarter: number | null,
  year: number | null,
  activeQuarter: "all" | string,
  activeYear: "all" | string,
) => {
  if (activeQuarter !== "all" && String(quarter ?? "") !== activeQuarter) {
    return false;
  }

  if (activeYear !== "all" && String(year ?? "") !== activeYear) {
    return false;
  }

  return true;
};

const matchesStatusFilter = (status: ItemStatusFilter, activeStatus: ItemStatusFilter) =>
  activeStatus === "all" || status === activeStatus;

const matchesOverdueFilter = (status: ItemStatusFilter, activeOverdue: OverdueFilter) => {
  if (activeOverdue === "all") {
    return true;
  }

  if (activeOverdue === "only_overdue") {
    return status === "overdue";
  }

  return status !== "overdue";
};

const normalizeGoalLite = (value: unknown): GoalLiteRow | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const quarterRaw = typeof record.quarter === "number" ? record.quarter : Number(record.quarter);
  const yearRaw = typeof record.year === "number" ? record.year : Number(record.year);

  return {
    id: String(record.id),
    name: String(record.name),
    type: record.type ? String(record.type) : null,
    target: typeof record.target === "number" ? record.target : Number(record.target ?? 0),
    unit: record.unit ? String(record.unit) : null,
    department_id: record.department_id ? String(record.department_id) : null,
    quarter: Number.isFinite(quarterRaw) ? quarterRaw : null,
    year: Number.isFinite(yearRaw) ? yearRaw : null,
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
    responsible_department_id: record.responsible_department_id
      ? String(record.responsible_department_id)
      : null,
    start_date: record.start_date ? String(record.start_date) : null,
    end_date: record.end_date ? String(record.end_date) : null,
    goal: normalizeGoalLite(rawGoal),
  };
};

const getTaskTimeline = (task: TaskItem) => getTimelineRange(task.startDate, task.endDate);

const buildTaskTooltip = (task: TaskItem) =>
  [
    task.name,
    `Độ ưu tiên: ${getTaskPriorityLabel(task.priority)}`,
    `Người phụ trách: ${task.assigneeName}`,
    `Tiến độ: ${task.progress}%`,
  ].join("\n");

const buildTaskAccessibilityLabel = (task: TaskItem) =>
  `${task.name}. ${getTaskPriorityLabel(task.priority)}. Tiến độ ${task.progress}%. ${formatTimelineRangeVi(
    task.startDate,
    task.endDate,
    {
      fallback: "Chưa có mốc thời gian",
    },
  )}`;

const buildGoalAccessibilityLabel = (goal: GoalTimelineItem) =>
  `${goal.name}. Tiến độ ${goal.progress}%. ${formatTimelineRangeVi(goal.startDate, goal.endDate, {
    fallback: "Chưa có mốc thời gian",
  })}`;

const buildKeyResultAccessibilityLabel = (keyResult: KeyResultTimelineItem) =>
  `${keyResult.name}. Tiến độ ${keyResult.progress}%. ${formatTimelineRangeVi(
    keyResult.startDate,
    keyResult.endDate,
    {
      fallback: "Chưa có mốc thời gian",
    },
  )}`;

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
      className={`inline-flex h-8 items-center rounded-lg px-3 text-sm font-semibold transition ${
        active ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
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
    <div className="relative h-full min-h-[56px]" style={{ width: timelineWidth }}>
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
                className={`border-l border-slate-200 px-2 py-2.5 text-center ${
                  visibleStartIndex + index === todayIndex ? "bg-blue-50/70" : ""
                }`}
              >
                <p className="text-xs font-semibold text-slate-700">{period.label}</p>
                <p className="mt-0.5 whitespace-nowrap text-[11px] text-slate-500">
                  {period.subLabel}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {todayIndicatorOffset !== null ? (
        <>
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-[2] w-px bg-blue-500/90"
            style={{ left: todayIndicatorOffset }}
          />
          <div
            className="pointer-events-none absolute top-1.5 z-[3] -translate-x-1/2"
            style={{ left: todayIndicatorOffset }}
          >
            <span className="inline-flex rounded-full border border-blue-200 bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
              Hôm nay
            </span>
          </div>
        </>
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
  const [pointerPosition, setPointerPosition] = useState<{ x: number; y: number } | null>(null);
  const isMissingTimeline = !getTaskTimeline(task);
  const taskStatus = getTaskStatus(task.startDate, task.endDate, task.progress, isMissingTimeline);
  const statusColors = getStatusColors(taskStatus);
  const HOVER_CARD_OFFSET = 14;
  const VIEWPORT_PADDING = 12;
  const HOVER_CARD_WIDTH = 380;
  const HOVER_CARD_HEIGHT = 260;

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

  const handlePointerMove = (event: React.PointerEvent<HTMLElement | HTMLDivElement>) => {
    setPointerPosition({ x: event.clientX, y: event.clientY });
  };

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, []);

  const hoverCardPosition = useMemo(() => {
    if (!pointerPosition || typeof window === "undefined") {
      return {
        x: VIEWPORT_PADDING,
        y: VIEWPORT_PADDING,
      };
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let nextX = pointerPosition.x + HOVER_CARD_OFFSET;
    let nextY = pointerPosition.y + HOVER_CARD_OFFSET;

    if (nextX + HOVER_CARD_WIDTH + VIEWPORT_PADDING > viewportWidth) {
      nextX = Math.max(VIEWPORT_PADDING, pointerPosition.x - HOVER_CARD_WIDTH - HOVER_CARD_OFFSET);
    }
    if (nextY + HOVER_CARD_HEIGHT + VIEWPORT_PADDING > viewportHeight) {
      nextY = Math.max(VIEWPORT_PADDING, viewportHeight - HOVER_CARD_HEIGHT - VIEWPORT_PADDING);
    }

    return {
      x: Math.max(VIEWPORT_PADDING, nextX),
      y: Math.max(VIEWPORT_PADDING, nextY),
    };
  }, [pointerPosition]);

  return (
    <>
      <Link
        href={`/tasks/${task.id}`}
        onPointerEnter={(event) => {
          handlePointerMove(event);
          openPopover();
        }}
        onPointerMove={handlePointerMove}
        onPointerLeave={closePopover}
        className={`absolute top-1/2 flex h-10 -translate-y-1/2 cursor-pointer items-center overflow-hidden rounded-lg border-2 px-3 text-left shadow-sm transition hover:brightness-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
          statusColors.barBg
        } ${statusColors.border} text-slate-900 font-medium ${
          isClamped ? "ring-2 ring-white/70" : ""
        }`}
        style={{ left, width }}
        aria-label={buildTaskAccessibilityLabel(task)}
        title={`${task.name} • ${task.assigneeName}`}
      >
        <TimelineBarContent label={task.name} progress={task.progress} width={width} />
      </Link>

      {open ? (
        <div
          onPointerEnter={openPopover}
          onPointerMove={handlePointerMove}
          onPointerLeave={closePopover}
          className="fixed z-[70] w-[380px] max-w-[calc(100vw-24px)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
          style={{
            left: hoverCardPosition.x,
            top: hoverCardPosition.y,
          }}
        >
          <div className="space-y-3">
            <p className="text-base font-semibold text-slate-900">
              {task.name} - {getTaskPriorityLabel(task.priority)}
            </p>
            <div className="h-px bg-slate-100" />
            <div className="space-y-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-600">Người phụ trách</span>
                <span className="text-right font-semibold text-slate-900">{task.assigneeName}</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-600">Tiến độ</span>
                <span className="text-right font-semibold text-slate-900">{task.progress}%</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-600">Ngày bắt đầu - kết thúc</span>
                <span className="text-right font-semibold text-slate-900">
                  {formatDateOnlyVi(task.startDate, "—")} - {formatDateOnlyVi(task.endDate, "—")}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function GoalTimelineBar({
  goal,
  left,
  width,
  isClamped,
}: {
  goal: GoalTimelineItem;
  left: number;
  width: number;
  isClamped: boolean;
}) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressHoverUntilRef = useRef(0);
  const [pointerPosition, setPointerPosition] = useState<{ x: number; y: number } | null>(null);
  const HOVER_CARD_OFFSET = 14;
  const VIEWPORT_PADDING = 12;
  const HOVER_CARD_WIDTH = 360;
  const HOVER_CARD_HEIGHT = 246;
  const goalStatus = getItemProgressStatus(goal.progress, 100, goal.endDate);
  const goalStatusColors = getProgressStatusColors(goalStatus);
  const goalStatusLabel = getProgressStatusLabel(goalStatus);

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

  const handlePointerMove = (event: React.PointerEvent<HTMLElement | HTMLDivElement>) => {
    setPointerPosition({ x: event.clientX, y: event.clientY });
  };

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, []);

  const hoverCardPosition = useMemo(() => {
    if (!pointerPosition || typeof window === "undefined") {
      return {
        x: VIEWPORT_PADDING,
        y: VIEWPORT_PADDING,
      };
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let nextX = pointerPosition.x + HOVER_CARD_OFFSET;
    let nextY = pointerPosition.y + HOVER_CARD_OFFSET;

    if (nextX + HOVER_CARD_WIDTH + VIEWPORT_PADDING > viewportWidth) {
      nextX = Math.max(VIEWPORT_PADDING, pointerPosition.x - HOVER_CARD_WIDTH - HOVER_CARD_OFFSET);
    }
    if (nextY + HOVER_CARD_HEIGHT + VIEWPORT_PADDING > viewportHeight) {
      nextY = Math.max(VIEWPORT_PADDING, viewportHeight - HOVER_CARD_HEIGHT - VIEWPORT_PADDING);
    }

    return {
      x: Math.max(VIEWPORT_PADDING, nextX),
      y: Math.max(VIEWPORT_PADDING, nextY),
    };
  }, [pointerPosition]);

  return (
    <>
      <Link
        href={goal.id !== "no-goal" ? `/goals/${goal.id}` : "/goals"}
        onPointerEnter={(event) => {
          handlePointerMove(event);
          openPopover();
        }}
        onPointerMove={handlePointerMove}
        onPointerLeave={closePopover}
        onFocus={openPopover}
        onBlur={closePopover}
        className={`absolute top-1/2 flex h-10 -translate-y-1/2 items-center overflow-hidden rounded-xl border px-3 text-left shadow-sm transition hover:brightness-[0.98] ${goalStatusColors.bg} ${goalStatusColors.border} ${
          isClamped ? "ring-2 ring-white/70" : ""
        }`}
        style={{ left, width }}
        aria-label={buildGoalAccessibilityLabel(goal)}
        title={`${goal.name} • ${goalStatusLabel.status}`}
      >
        <TimelineBarContent label={goal.name} progress={goal.progress} width={width} />
      </Link>

      {open ? (
        <div
          onPointerEnter={openPopover}
          onPointerMove={handlePointerMove}
          onPointerLeave={closePopover}
          className="fixed z-[70] w-[360px] max-w-[calc(100vw-24px)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
          style={{
            left: hoverCardPosition.x,
            top: hoverCardPosition.y,
          }}
        >
          <div className="space-y-3">
            <p className="text-base font-semibold text-slate-900">{goal.name}</p>
            <div className="h-px bg-slate-100" />
            <div className="space-y-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-600">Quý</span>
                <span className="text-right font-semibold text-slate-900">
                  {formatGoalQuarterLabel(goal.quarter, goal.year)}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-600">Tiến độ</span>
                <span className="text-right font-semibold text-slate-900">{goal.progress}%</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-600">Trạng thái</span>
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${goalStatusColors.badgeBg} ${goalStatusColors.badgeText}`}
                >
                  {goalStatusLabel.status}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-600">Ngày bắt đầu - kết thúc</span>
                <span className="text-right font-semibold text-slate-900">
                  {formatDateOnlyVi(goal.startDate, "—")} - {formatDateOnlyVi(goal.endDate, "—")}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-600">Số KR</span>
                <span className="text-right font-semibold text-slate-900">
                  {goal.keyResultCount}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-600">Số task</span>
                <span className="text-right font-semibold text-slate-900">{goal.taskCount}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function KeyResultTimelineBar({
  keyResult,
  left,
  width,
  isClamped,
}: {
  keyResult: KeyResultTimelineItem;
  left: number;
  width: number;
  isClamped: boolean;
}) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressHoverUntilRef = useRef(0);
  const [pointerPosition, setPointerPosition] = useState<{ x: number; y: number } | null>(null);
  const HOVER_CARD_OFFSET = 14;
  const VIEWPORT_PADDING = 12;
  const HOVER_CARD_WIDTH = 360;
  const HOVER_CARD_HEIGHT = 246;
  const keyResultStatus = getItemProgressStatus(keyResult.progress, 100, keyResult.endDate);
  const keyResultStatusColors = getProgressStatusColors(keyResultStatus);
  const keyResultStatusLabel = getProgressStatusLabel(keyResultStatus);

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

  const handlePointerMove = (event: React.PointerEvent<HTMLElement | HTMLDivElement>) => {
    setPointerPosition({ x: event.clientX, y: event.clientY });
  };

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, []);

  const hoverCardPosition = useMemo(() => {
    if (!pointerPosition || typeof window === "undefined") {
      return {
        x: VIEWPORT_PADDING,
        y: VIEWPORT_PADDING,
      };
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let nextX = pointerPosition.x + HOVER_CARD_OFFSET;
    let nextY = pointerPosition.y + HOVER_CARD_OFFSET;

    if (nextX + HOVER_CARD_WIDTH + VIEWPORT_PADDING > viewportWidth) {
      nextX = Math.max(VIEWPORT_PADDING, pointerPosition.x - HOVER_CARD_WIDTH - HOVER_CARD_OFFSET);
    }
    if (nextY + HOVER_CARD_HEIGHT + VIEWPORT_PADDING > viewportHeight) {
      nextY = Math.max(VIEWPORT_PADDING, viewportHeight - HOVER_CARD_HEIGHT - VIEWPORT_PADDING);
    }

    return {
      x: Math.max(VIEWPORT_PADDING, nextX),
      y: Math.max(VIEWPORT_PADDING, nextY),
    };
  }, [pointerPosition]);

  return (
    <>
      <Link
        href={
          keyResult.goalId !== "no-goal"
            ? `/goals/${keyResult.goalId}/key-results/${keyResult.id}`
            : "/tasks"
        }
        onPointerEnter={(event) => {
          handlePointerMove(event);
          openPopover();
        }}
        onPointerMove={handlePointerMove}
        onPointerLeave={closePopover}
        onFocus={openPopover}
        onBlur={closePopover}
        className={`absolute top-1/2 flex h-10 -translate-y-1/2 cursor-pointer items-center overflow-hidden rounded-xl border px-3 text-left shadow-sm transition hover:brightness-[0.98] ${keyResultStatusColors.bg} ${keyResultStatusColors.border} ${
          isClamped ? "ring-2 ring-white/70" : ""
        }`}
        style={{ left, width }}
        aria-label={buildKeyResultAccessibilityLabel(keyResult)}
        title={`${keyResult.name} • ${keyResult.goalName}`}
      >
        <TimelineBarContent label={keyResult.name} progress={keyResult.progress} width={width} />
      </Link>

      {open ? (
        <div
          onPointerEnter={openPopover}
          onPointerMove={handlePointerMove}
          onPointerLeave={closePopover}
          className="fixed z-[70] w-[360px] max-w-[calc(100vw-24px)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
          style={{
            left: hoverCardPosition.x,
            top: hoverCardPosition.y,
          }}
        >
          <div className="space-y-3">
            <p className="text-base font-semibold text-slate-900">{keyResult.name}</p>
            <div className="h-px bg-slate-100" />
            <div className="space-y-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-600">Goal</span>
                <span className="text-right font-semibold text-slate-900">
                  {keyResult.goalName}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-600">Tiến độ</span>
                <span className="text-right font-semibold text-slate-900">
                  {keyResult.progress}%
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-600">Trạng thái</span>
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${keyResultStatusColors.badgeBg} ${keyResultStatusColors.badgeText}`}
                >
                  {keyResultStatusLabel.status}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-600">Chỉ số</span>
                <span className="text-right font-semibold text-slate-900">{keyResult.metric}</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-600">Ngày bắt đầu - kết thúc</span>
                <span className="text-right font-semibold text-slate-900">
                  {formatDateOnlyVi(keyResult.startDate, "—")} -{" "}
                  {formatDateOnlyVi(keyResult.endDate, "—")}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-600">Số task</span>
                <span className="text-right font-semibold text-slate-900">
                  {keyResult.taskCount}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
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
  const [departmentFilter, setDepartmentFilter] = useState<"all" | string>("all");
  const [quarterFilter, setQuarterFilter] = useState<"all" | string>("all");
  const [yearFilter, setYearFilter] = useState<"all" | string>("all");
  const [statusFilter, setStatusFilter] = useState<ItemStatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | string>("all");
  const [overdueFilter, setOverdueFilter] = useState<OverdueFilter>("all");
  const [viewMode, setViewMode] = useState<TaskViewMode>("list");
  const [structureMode, setStructureMode] = useState<StructureMode>("task");
  const [timeScale, setTimeScale] = useState<TimelineScale>("week");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showNoTimelineSection, setShowNoTimelineSection] = useState(false);
  const [taskListPage, setTaskListPage] = useState(1);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const timelineViewportFrameRef = useRef<number | null>(null);
  const pendingViewportRatioRef = useRef<number | null>(null);
  const lastAutoFocusSignatureRef = useRef<string | null>(null);
  const hasInitializedDefaultAssigneeFilterRef = useRef(false);
  const [timelineViewport, setTimelineViewport] = useState({ scrollLeft: 0, clientWidth: 0 });

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
            .neq("is_backlog", true)
            .order("created_at", { ascending: false }),
          supabase.from("profiles").select("id,name,email").order("name", { ascending: true }),
          supabase
            .from("goals")
            .select("id,name,type,target,unit,department_id,quarter,year,start_date,end_date")
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
              responsible_department_id,
              start_date,
              end_date,
              goal:goals!key_results_goal_id_fkey(
                id,
                name,
                department_id,
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
          setTaskLoadError(goalOwnersError.message || "Không tải được owners của goal.");
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
            const goalName = keyResult?.goal?.name ?? "Chưa có goal";
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
  const goalsById = useMemo(
    () =>
      goals.reduce<Record<string, GoalLiteRow>>((acc, goal) => {
        acc[goal.id] = goal;
        return acc;
      }, {}),
    [goals],
  );
  const keyResultsById = useMemo(
    () =>
      keyResults.reduce<Record<string, KeyResultLiteRow>>((acc, keyResult) => {
        acc[keyResult.id] = keyResult;
        return acc;
      }, {}),
    [keyResults],
  );
  const departmentsById = useMemo(
    () =>
      workspaceAccess.departments.reduce<Record<string, string>>((acc, department) => {
        acc[department.id] = department.name;
        return acc;
      }, {}),
    [workspaceAccess.departments],
  );
  const departmentFilterOptions = useMemo(() => {
    const nextDepartmentIds = new Set<string>();

    if (structureMode === "goal") {
      goals.forEach((goal) => {
        if (goal.department_id) {
          nextDepartmentIds.add(goal.department_id);
        }
      });
    } else if (structureMode === "key_result") {
      keyResults.forEach((keyResult) => {
        const departmentId =
          keyResult.responsible_department_id ?? keyResult.goal?.department_id ?? null;
        if (departmentId) {
          nextDepartmentIds.add(departmentId);
        }
      });
    }

    return Array.from(nextDepartmentIds)
      .map((departmentId) => ({
        id: departmentId,
        name: departmentsById[departmentId] ?? "Phòng ban",
      }))
      .sort((left, right) => left.name.localeCompare(right.name, "vi"));
  }, [departmentsById, goals, keyResults, structureMode]);
  const yearFilterOptions = useMemo(
    () =>
      [
        ...new Set(
          goals
            .map((goal) => goal.year)
            .filter((value): value is number => value !== null && Number.isFinite(value)),
        ),
      ].sort((a, b) => b - a),
    [goals],
  );

  const activeGoalFilter = structureMode === "goal" ? "all" : goalFilter;
  const activeKeyResultFilter = structureMode === "task" ? keyResultFilter : "all";
  const activeAssigneeFilter =
    structureMode === "task" || structureMode === "key_result" ? assigneeFilter : "all";

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
        const relatedGoal = task.goalId ? (goalsById[task.goalId] ?? null) : null;
        const taskItemStatus = getItemProgressStatus(task.progress, 100, task.endDate);
        if (!matchesStatusFilter(taskItemStatus, statusFilter)) {
          return false;
        }
        if (!matchesOverdueFilter(taskItemStatus, overdueFilter)) {
          return false;
        }
        if (priorityFilter !== "all" && normalizeTaskPriority(task.priority) !== priorityFilter) {
          return false;
        }
        if (
          !matchesQuarterYearFilter(
            relatedGoal?.quarter ?? null,
            relatedGoal?.year ?? null,
            "all",
            "all",
          )
        ) {
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
  }, [
    activeAssigneeFilter,
    activeGoalFilter,
    activeKeyResultFilter,
    goalsById,
    normalizedKeyword,
    overdueFilter,
    priorityFilter,
    statusFilter,
    tasks,
  ]);

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
        metric: formatKeyResultMetric(goal.target, goal.unit),
        quarter: goal.quarter,
        year: goal.year,
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
        goalName: keyResult.goal?.name ?? "Chưa có goal",
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
        if (!matchesQuarterYearFilter(goal.quarter, goal.year, quarterFilter, yearFilter)) {
          return false;
        }
        if (departmentFilter !== "all" && goal.id !== "no-goal") {
          const relatedDepartmentId = goalsById[goal.id]?.department_id ?? null;
          if (relatedDepartmentId !== departmentFilter) {
            return false;
          }
        }

        const goalStatus = getItemProgressStatus(goal.progress, 100, goal.endDate);
        if (!matchesStatusFilter(goalStatus, statusFilter)) {
          return false;
        }

        const relatedKeyResults = keyResultsByGoalId.get(goal.id) ?? [];
        const relatedTasks = tasksByGoalId.get(goal.id) ?? [];
        const goalOwners = goalOwnersByGoalId[goal.id] ?? [];

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
      quarterFilter,
      yearFilter,
      goalOwnersByGoalId,
      goalsById,
      goalTimelineItems,
      departmentFilter,
      keyResultsByGoalId,
      normalizedKeyword,
      statusFilter,
      tasksByGoalId,
    ],
  );

  const filteredKeyResultTimelineItems = useMemo(
    () =>
      keyResultTimelineItems.filter((keyResult) => {
        if (activeGoalFilter !== "all" && keyResult.goalId !== activeGoalFilter) {
          return false;
        }

        const relatedGoal =
          keyResult.goalId !== "no-goal" ? (goalsById[keyResult.goalId] ?? null) : null;
        const relatedDepartmentId =
          keyResultsById[keyResult.id]?.responsible_department_id ??
          relatedGoal?.department_id ??
          null;
        if (departmentFilter !== "all" && relatedDepartmentId !== departmentFilter) {
          return false;
        }
        if (
          !matchesQuarterYearFilter(
            relatedGoal?.quarter ?? null,
            relatedGoal?.year ?? null,
            quarterFilter,
            yearFilter,
          )
        ) {
          return false;
        }

        const keyResultStatus = getItemProgressStatus(keyResult.progress, 100, keyResult.endDate);
        if (!matchesStatusFilter(keyResultStatus, statusFilter)) {
          return false;
        }
        const relatedTasks = tasksByKeyResultId.get(keyResult.id) ?? [];
        if (activeAssigneeFilter !== "all") {
          if (structureMode === "key_result") {
            const relatedGoalOwners =
              keyResult.goalId !== "no-goal" ? (goalOwnersByGoalId[keyResult.goalId] ?? []) : [];
            if (!relatedGoalOwners.some((owner) => owner.id === activeAssigneeFilter)) {
              return false;
            }
          } else if (!relatedTasks.some((task) => task.assigneeId === activeAssigneeFilter)) {
            return false;
          }
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
      departmentFilter,
      goalOwnersByGoalId,
      goalsById,
      keyResultsById,
      keyResultTimelineItems,
      normalizedKeyword,
      quarterFilter,
      statusFilter,
      structureMode,
      tasksByKeyResultId,
      yearFilter,
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
          label: "Goal",
          pluralLabel: "goal",
          subtitle: "Chế độ xem theo cấp goal",
          ganttTitle: "Biểu đồ goal",
          listTitle: "Danh sách goal",
          missingTitle: "Goal chưa có thời gian thực thi",
          missingDescription:
            "Các goal này chưa có đủ ngày bắt đầu và ngày kết thúc nên chưa thể hiển thị như timeline bar.",
        },
        key_result: {
          label: "Key Result",
          pluralLabel: "key result",
          subtitle: "Chế độ xem theo cấp key result",
          ganttTitle: "Biểu đồ key result",
          listTitle: "Danh sách key result",
          missingTitle: "Key Result chưa có thời gian thực thi",
          missingDescription:
            "Các key result này chưa có đủ ngày bắt đầu và ngày kết thúc nên chưa thể hiển thị như timeline bar.",
        },
        task: {
          label: "Task",
          pluralLabel: "task",
          subtitle: "Chế độ xem theo cấp task",
          ganttTitle: "Biểu đồ tiến độ task",
          listTitle: "Danh sách task",
          missingTitle: "Task chưa có mốc thời gian",
          missingDescription:
            "Các task này chưa có đủ ngày bắt đầu và ngày kết thúc nên chưa thể hiển thị như timeline bar.",
        },
      }) satisfies Record<
        StructureMode,
        {
          label: string;
          pluralLabel: string;
          subtitle: string;
          ganttTitle: string;
          listTitle: string;
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
  const ganttVisibleRowCount = Math.max(
    GANTT_MIN_VISIBLE_ROWS,
    Math.min(timelineSourceItems.length, GANTT_MAX_VISIBLE_ROWS),
  );
  const ganttBoardHeight =
    GANTT_TOP_CHROME_HEIGHT +
    GANTT_TIMELINE_HEADER_HEIGHT +
    ganttVisibleRowCount * GANTT_ROW_HEIGHT +
    BOARD_BOTTOM_SAFE_SPACE;
  const totalTaskListPages = Math.max(1, Math.ceil(filteredTasks.length / TASK_LIST_PAGE_SIZE));
  const paginatedTasks = useMemo(() => {
    const startIndex = (taskListPage - 1) * TASK_LIST_PAGE_SIZE;
    return filteredTasks.slice(startIndex, startIndex + TASK_LIST_PAGE_SIZE);
  }, [filteredTasks, taskListPage]);
  const taskListRangeStart = filteredTasks.length === 0 ? 0 : (taskListPage - 1) * TASK_LIST_PAGE_SIZE + 1;
  const taskListRangeEnd = Math.min(taskListPage * TASK_LIST_PAGE_SIZE, filteredTasks.length);
  const autoFocusSignature = `${viewMode}:${structureMode}:${timeScale}:${activeGoalFilter}:${activeKeyResultFilter}:${activeAssigneeFilter}:${quarterFilter}:${yearFilter}:${statusFilter}:${priorityFilter}:${overdueFilter}:${normalizedKeyword}`;

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

  const isGoalFilterValid = useCallback(
    (value: "all" | string) => value === "all" || goalFilters.some((goal) => goal.id === value),
    [goalFilters],
  );

  const isAssigneeFilterValid = useCallback(
    (value: "all" | string) =>
      value === "all" || assigneeFilters.some((assignee) => assignee.id === value),
    [assigneeFilters],
  );

  const isKeyResultFilterValid = useCallback(
    (value: "all" | string, selectedGoalId: "all" | string) => {
      if (value === "all") {
        return true;
      }

      const keyResult = keyResultFilters.find((item) => item.id === value);
      if (!keyResult) {
        return false;
      }

      if (selectedGoalId === "all") {
        return true;
      }

      return keyResult.goalId === selectedGoalId;
    },
    [keyResultFilters],
  );

  const handleLevelChange = useCallback(
    (nextLevel: StructureMode) => {
      if (nextLevel === structureMode) {
        return;
      }

      pendingViewportRatioRef.current = null;

      let nextGoalFilter: "all" | string = goalFilter;
      let nextKeyResultFilter: "all" | string = keyResultFilter;
      let nextAssigneeFilter: "all" | string = assigneeFilter;

      if (nextLevel === "goal") {
        nextGoalFilter = "all";
        nextKeyResultFilter = "all";
        nextAssigneeFilter = "all";
      } else if (nextLevel === "key_result") {
        nextGoalFilter = isGoalFilterValid(goalFilter) ? goalFilter : "all";
        nextKeyResultFilter = "all";
        nextAssigneeFilter = "all";
      } else {
        nextGoalFilter = isGoalFilterValid(goalFilter) ? goalFilter : "all";
        nextKeyResultFilter = isKeyResultFilterValid(keyResultFilter, nextGoalFilter)
          ? keyResultFilter
          : "all";
        nextAssigneeFilter = isAssigneeFilterValid(assigneeFilter) ? assigneeFilter : "all";
      }

      setGoalFilter(nextGoalFilter);
      setKeyResultFilter(nextKeyResultFilter);
      setAssigneeFilter(nextAssigneeFilter);
      setStructureMode(nextLevel);
    },
    [
      assigneeFilter,
      goalFilter,
      isAssigneeFilterValid,
      isGoalFilterValid,
      isKeyResultFilterValid,
      keyResultFilter,
      structureMode,
    ],
  );

  useEffect(() => {
    if (hasInitializedDefaultAssigneeFilterRef.current) {
      return;
    }

    if (!workspaceAccess.profileId || assigneeFilters.length === 0) {
      return;
    }

    const hasCurrentProfileOption = assigneeFilters.some(
      (assignee) => assignee.id === workspaceAccess.profileId,
    );

    hasInitializedDefaultAssigneeFilterRef.current = true;

    if (hasCurrentProfileOption) {
      setAssigneeFilter(workspaceAccess.profileId);
    }
  }, [assigneeFilters, workspaceAccess.profileId]);

  useEffect(() => {
    if (goalFilter !== "all" && !isGoalFilterValid(goalFilter)) {
      setGoalFilter("all");
    }
  }, [goalFilter, isGoalFilterValid]);

  useEffect(() => {
    if (assigneeFilter !== "all" && !isAssigneeFilterValid(assigneeFilter)) {
      setAssigneeFilter("all");
    }
  }, [assigneeFilter, isAssigneeFilterValid]);

  useEffect(() => {
    if (keyResultFilter === "all") {
      return;
    }

    if (!isKeyResultFilterValid(keyResultFilter, goalFilter)) {
      setKeyResultFilter("all");
    }
  }, [goalFilter, isKeyResultFilterValid, keyResultFilter]);

  useEffect(() => {
    if (structureMode !== "goal" && structureMode !== "key_result") {
      if (departmentFilter !== "all") {
        setDepartmentFilter("all");
      }
      return;
    }

    if (
      departmentFilter !== "all" &&
      !departmentFilterOptions.some((department) => department.id === departmentFilter)
    ) {
      setDepartmentFilter("all");
    }
  }, [departmentFilter, departmentFilterOptions, structureMode]);

  useEffect(() => {
    setTaskListPage(1);
  }, [
    assigneeFilter,
    departmentFilter,
    goalFilter,
    keyResultFilter,
    overdueFilter,
    priorityFilter,
    quarterFilter,
    searchKeyword,
    statusFilter,
    structureMode,
    yearFilter,
  ]);

  useEffect(() => {
    if (taskListPage > totalTaskListPages) {
      setTaskListPage(totalTaskListPages);
    }
  }, [taskListPage, totalTaskListPages]);

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

  const contextualKeyResultForNewTask = useMemo(() => {
    if (keyResultFilter !== "all") {
      const selected = keyResultFilters.find((item) => item.id === keyResultFilter);
      return selected ? { id: selected.id, goalId: selected.goalId } : null;
    }

    if (structureMode !== "key_result") {
      return null;
    }

    const firstVisibleKeyResult = filteredKeyResultTimelineItems.find(
      (item) => item.goalId !== "no-goal",
    );
    if (!firstVisibleKeyResult) {
      return null;
    }

    return {
      id: firstVisibleKeyResult.id,
      goalId: firstVisibleKeyResult.goalId,
    };
  }, [filteredKeyResultTimelineItems, keyResultFilter, keyResultFilters, structureMode]);

  const addTaskHref = useMemo(() => {
    if (!OKR_FEATURE_ENABLED) {
      return "/tasks/new";
    }

    const params = new URLSearchParams();
    const defaultDepartmentId = rootDepartments[0]?.id;
    if (defaultDepartmentId) {
      params.set("departmentId", defaultDepartmentId);
    }

    const prefilledGoalId =
      goalFilter !== "all" ? goalFilter : (contextualKeyResultForNewTask?.goalId ?? "all");
    if (prefilledGoalId !== "all") {
      params.set("goalId", prefilledGoalId);
    }

    if (contextualKeyResultForNewTask?.id) {
      params.set("keyResultId", contextualKeyResultForNewTask.id);
    }

    const query = params.toString();
    return query ? `/tasks/new?${query}` : "/tasks/new";
  }, [contextualKeyResultForNewTask, goalFilter, rootDepartments]);

  const searchPlaceholder = useMemo(() => getSearchPlaceholder(structureMode), [structureMode]);
  const addButtonLabel = useMemo(() => getAddButtonLabel(structureMode), [structureMode]);
  const selectTriggerClassName =
    "h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm transition hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:w-[168px]";
  const hasActiveToolbarFilters = useMemo(
    () =>
      searchKeyword.trim().length > 0 ||
      goalFilter !== "all" ||
      keyResultFilter !== "all" ||
      assigneeFilter !== "all" ||
      departmentFilter !== "all" ||
      quarterFilter !== "all" ||
      yearFilter !== "all" ||
      statusFilter !== "all" ||
      priorityFilter !== "all" ||
      overdueFilter !== "all",
    [
      assigneeFilter,
      departmentFilter,
      goalFilter,
      keyResultFilter,
      overdueFilter,
      priorityFilter,
      quarterFilter,
      searchKeyword,
      statusFilter,
      yearFilter,
    ],
  );

  const clearToolbarFilters = useCallback(() => {
    setSearchKeyword("");
    setGoalFilter("all");
    setKeyResultFilter("all");
    setAssigneeFilter("all");
    setDepartmentFilter("all");
    setQuarterFilter("all");
    setYearFilter("all");
    setStatusFilter("all");
    setPriorityFilter("all");
    setOverdueFilter("all");
  }, []);

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

  const renderMissingTimelineDetails = () => {
    if (structureMode === "goal") {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          {noTimelineGoalItems.map((goal) => (
            <div key={goal.id} className="rounded-xl border border-amber-200 bg-white px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="truncate text-sm font-semibold text-slate-900" title={goal.name}>
                  {goal.name}
                </p>
                <span className="inline-flex shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                  {goal.progress}%
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {formatGoalQuarterLabel(goal.quarter, goal.year)}
              </p>
              <p className="mt-2 text-xs font-medium text-amber-800">
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
      );
    }

    if (structureMode === "key_result") {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          {noTimelineKeyResultItems.map((keyResult) => (
            <div
              key={keyResult.id}
              className="rounded-xl border border-amber-200 bg-white px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="truncate text-sm font-semibold text-slate-900" title={keyResult.name}>
                  {keyResult.name}
                </p>
                <span className="inline-flex shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                  {keyResult.progress}%
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-slate-600" title={keyResult.goalName}>
                {keyResult.goalName} • {keyResult.metric}
              </p>
              <p className="mt-2 text-xs font-medium text-amber-800">
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
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-amber-300 text-[11px] uppercase tracking-[0.08em] text-slate-700">
              <th className="px-3 py-2 font-bold">Tên</th>
              <th className="px-3 py-2 font-bold">Người phụ trách</th>
              <th className="px-3 py-2 font-bold">Tiến độ</th>
              <th className="px-3 py-2 font-bold">Ưu tiên</th>
            </tr>
          </thead>
          <tbody>
            {noTimelineTasks.map((task) => (
              <tr key={task.id} className="border-b border-amber-200 align-top last:border-b-0">
                <td className="px-3 py-2.5">
                  <Link
                    href={`/tasks/${task.id}`}
                    className="font-semibold text-slate-900 hover:text-blue-700"
                  >
                    {task.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-slate-700">{task.assigneeName}</td>
                <td className="px-3 py-2.5 text-slate-600">{task.progress}%</td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${getTaskPriorityBadgeClassName(task.priority)}`}
                  >
                    {getTaskPriorityLabel(task.priority)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderMissingTimelineSection = () => {
    if (currentNoTimelineCount === 0) {
      return null;
    }

    return (
      <section className="shrink-0 rounded-2xl border border-amber-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-100 bg-amber-50/70 px-4 py-3 lg:px-5">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-amber-900">{currentModeMeta.missingTitle}</h3>
            <p className="mt-0.5 text-xs text-amber-800/90">{currentModeMeta.missingDescription}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 items-center rounded-full bg-amber-100 px-3 text-xs font-semibold text-amber-900">
              {currentNoTimelineCount} mục
            </span>
            <button
              type="button"
              onClick={() => setShowNoTimelineSection((prev) => !prev)}
              className="inline-flex h-7 items-center rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
            >
              {showNoTimelineSection ? "Thu gọn" : "Chi tiết"}
            </button>
          </div>
        </div>

        {showNoTimelineSection ? (
          <div className="scrollbar-subtle max-h-52 overflow-auto p-3 lg:p-4">
            {renderMissingTimelineDetails()}
          </div>
        ) : null}
      </section>
    );
  };

  const renderGanttBoard = () => {
    const leftPanelTitle =
      structureMode === "goal"
        ? "Danh sách goal"
        : structureMode === "key_result"
          ? "Danh sách key result"
          : "Danh sách task";

    return (
      <section
        className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white"
        style={{ height: Math.min(820, ganttBoardHeight) }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 lg:px-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{currentModeMeta.ganttTitle}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{currentModeMeta.subtitle}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="rounded-lg border border-slate-200 bg-slate-100 p-1">
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
            <ToolbarButton
              onClick={handleJumpToToday}
              active={todayIndicatorOffset !== null}
              disabled={todayIndicatorOffset === null}
            >
              Hôm nay
            </ToolbarButton>
          </div>
        </div>

        <div className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500 lg:px-5">
          Giữ `Ctrl/Cmd` + lăn chuột để zoom. Giữ `Shift` + lăn chuột để cuộn ngang.
        </div>

        <div
          ref={timelineScrollRef}
          onScroll={handleTimelineScroll}
          onWheel={handleTimelineWheel}
          className="scrollbar-subtle min-h-0 flex-1 overflow-auto overscroll-contain scroll-smooth [scrollbar-gutter:stable]"
        >
          <div className="min-w-full" style={{ width: leftPanelWidth + timelineWidth }}>
            <div
              className="sticky top-0 z-30 grid border-b border-slate-200 bg-slate-50"
              style={{ gridTemplateColumns: `${leftPanelWidth}px ${timelineWidth}px` }}
            >
              <div
                className={`sticky left-0 top-0 z-40 border-r border-slate-200 bg-slate-50 px-4 py-3 lg:px-5 ${STICKY_PANEL_SHADOW}`}
              >
                <p className="text-sm font-semibold text-slate-900">{leftPanelTitle}</p>
              </div>
              <div className="sticky top-0 z-30 bg-slate-50">
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
            </div>

            {structureMode === "goal"
              ? visibleGoalTimelineItems.map((goal) => {
                  const barLayout = getItemBarLayout(goal.startDate, goal.endDate, 12);
                  if (!barLayout) {
                    return null;
                  }

                  const progressStatus = getItemProgressStatus(goal.progress, 100, goal.endDate);
                  const progressStatusColors = getProgressStatusColors(progressStatus);
                  const progressStatusLabel = getProgressStatusLabel(progressStatus);

                  return (
                    <div
                      key={goal.id}
                      className="grid border-b border-slate-100"
                      style={{ gridTemplateColumns: `${leftPanelWidth}px ${timelineWidth}px` }}
                    >
                      <div
                        className={`sticky left-0 z-20 border-r border-slate-200 bg-white px-4 py-3 lg:px-5 ${STICKY_PANEL_SHADOW}`}
                        style={{ minHeight: GANTT_ROW_HEIGHT }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p
                              className="truncate text-sm font-semibold text-slate-900"
                              title={goal.name}
                            >
                              {goal.name}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatGoalQuarterLabel(goal.quarter, goal.year)}
                            </p>
                          </div>
                          <span
                            className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${progressStatusColors.badgeBg} ${progressStatusColors.badgeText}`}
                          >
                            {progressStatusLabel.status}
                          </span>
                        </div>
                      </div>
                      <div className="relative bg-white" style={{ minHeight: GANTT_ROW_HEIGHT }}>
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
                            className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-blue-500/80"
                            style={{ left: todayIndicatorOffset }}
                          />
                        ) : null}
                        <GoalTimelineBar
                          goal={goal}
                          left={barLayout.left}
                          width={barLayout.width}
                          isClamped={barLayout.isClamped}
                        />
                      </div>
                    </div>
                  );
                })
              : structureMode === "key_result"
                ? visibleKeyResultTimelineItems.map((keyResult) => {
                    const barLayout = getItemBarLayout(keyResult.startDate, keyResult.endDate, 12);
                    if (!barLayout) {
                      return null;
                    }

                    const progressStatus = getItemProgressStatus(
                      keyResult.progress,
                      100,
                      keyResult.endDate,
                    );
                    const progressStatusColors = getProgressStatusColors(progressStatus);
                    const progressStatusLabel = getProgressStatusLabel(progressStatus);

                    return (
                      <div
                        key={keyResult.id}
                        className="grid border-b border-slate-100"
                        style={{ gridTemplateColumns: `${leftPanelWidth}px ${timelineWidth}px` }}
                      >
                        <div
                          className={`sticky left-0 z-20 border-r border-slate-200 bg-white px-4 py-3 lg:px-5 ${STICKY_PANEL_SHADOW}`}
                          style={{ minHeight: GANTT_ROW_HEIGHT }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p
                                className="truncate text-sm font-semibold text-slate-900"
                                title={`${keyResult.name} (${keyResult.goalName})`}
                              >
                                {keyResult.name}
                              </p>
                              <p
                                className="mt-1 truncate text-xs text-slate-500"
                                title={keyResult.goalName}
                              >
                                {keyResult.goalName}
                              </p>
                            </div>
                            <span
                              className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${progressStatusColors.badgeBg} ${progressStatusColors.badgeText}`}
                            >
                              {progressStatusLabel.status}
                            </span>
                          </div>
                        </div>
                        <div className="relative bg-white" style={{ minHeight: GANTT_ROW_HEIGHT }}>
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
                              className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-blue-500/80"
                              style={{ left: todayIndicatorOffset }}
                            />
                          ) : null}
                          <KeyResultTimelineBar
                            keyResult={keyResult}
                            left={barLayout.left}
                            width={barLayout.width}
                            isClamped={barLayout.isClamped}
                          />
                        </div>
                      </div>
                    );
                  })
                : visibleTasks.map((task) => {
                    const barLayout = getItemBarLayout(task.startDate, task.endDate);
                    const taskProgressStatus = getItemProgressStatus(
                      task.progress,
                      100,
                      task.endDate,
                    );
                    const taskProgressStatusColors = getProgressStatusColors(taskProgressStatus);
                    const taskProgressStatusLabel = getProgressStatusLabel(taskProgressStatus);

                    return (
                      <div
                        key={task.id}
                        className="grid border-b border-slate-100 last:border-b-0"
                        style={{ gridTemplateColumns: `${leftPanelWidth}px ${timelineWidth}px` }}
                      >
                        <div
                          className={`sticky left-0 z-20 border-r border-slate-200 bg-white px-4 py-3 lg:px-5 ${STICKY_PANEL_SHADOW}`}
                          style={{ minHeight: GANTT_ROW_HEIGHT }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <Link
                                href={`/tasks/${task.id}`}
                                className="block truncate text-sm font-semibold text-slate-900 transition hover:text-blue-700"
                                title={`${task.name} (${task.assigneeName})`}
                              >
                                {task.name}
                              </Link>
                              <p className="mt-1 truncate text-xs text-slate-500">
                                {task.assigneeName}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${getTaskPriorityBadgeClassName(task.priority)}`}
                              >
                                {getTaskPriorityLabel(task.priority)}
                              </span>
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${taskProgressStatusColors.badgeBg} ${taskProgressStatusColors.badgeText}`}
                              >
                                {taskProgressStatusLabel.status}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="relative bg-white" style={{ minHeight: GANTT_ROW_HEIGHT }}>
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
                              className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-blue-500/80"
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
                              Task chưa có mốc thời gian
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

            <div style={{ height: BOARD_BOTTOM_SAFE_SPACE }} />
          </div>
        </div>
      </section>
    );
  };

  const renderListBoard = () => {
    if (structureMode === "goal") {
      return (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 lg:px-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {currentModeMeta.listTitle}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Theo dõi nhanh tiến độ và thời gian của từng goal.
              </p>
            </div>
            <span className="inline-flex h-7 items-center rounded-full bg-slate-100 px-3 text-xs font-semibold text-slate-700">
              {filteredGoalTimelineItems.length} mục
            </span>
          </div>

          <div className="p-3 pb-5 lg:p-4 lg:pb-6">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-[11px] uppercase tracking-[0.08em] text-slate-500">
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                      Goal
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Owner</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Quý</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                      Chỉ số
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                      Trạng thái
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                      Tiến độ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGoalTimelineItems.map((goal) => {
                    const owners = goalOwnersByGoalId[goal.id] ?? [];
                    const goalStatus = getItemProgressStatus(goal.progress, 100, goal.endDate);
                    const goalStatusColors = getProgressStatusColors(goalStatus);
                    const goalStatusLabel = getProgressStatusLabel(goalStatus);

                    return (
                      <tr key={goal.id} className="border-t border-slate-100 align-top">
                        <td className="px-4 py-3.5">
                          <Link
                            href={`/goals/${goal.id}`}
                            className="block max-w-[280px] truncate font-semibold text-slate-900 transition hover:text-blue-700"
                            title={goal.name}
                          >
                            {goal.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">
                          <span title={getGoalOwnerSearchText(owners)}>
                            {formatGoalOwnersSummary(owners)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">
                          {formatGoalQuarterLabel(goal.quarter, goal.year)}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">{goal.metric}</td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${goalStatusColors.badgeBg} ${goalStatusColors.badgeText}`}
                          >
                            {goalStatusLabel.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex w-[170px] items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <ProgressBar value={goal.progress} />
                            </div>
                            <span className="w-10 text-right text-xs font-semibold text-slate-600">
                              {goal.progress}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      );
    }

    if (structureMode === "key_result") {
      return (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 lg:px-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {currentModeMeta.listTitle}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Danh sách KR gọn hơn để so sánh tiến độ và goal liên quan.
              </p>
            </div>
            <span className="inline-flex h-7 items-center rounded-full bg-slate-100 px-3 text-xs font-semibold text-slate-700">
              {filteredKeyResultTimelineItems.length} mục
            </span>
          </div>

          <div className="p-3 pb-5 lg:p-4 lg:pb-6">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-[11px] uppercase tracking-[0.08em] text-slate-500">
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                      Key Result
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                      Goal
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Owner</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                      Chỉ số
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                      Trạng thái
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                      Tiến độ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredKeyResultTimelineItems.map((keyResult) => {
                    const owners =
                      keyResult.goalId !== "no-goal"
                        ? (goalOwnersByGoalId[keyResult.goalId] ?? [])
                        : [];
                    const keyResultStatus = getItemProgressStatus(
                      keyResult.progress,
                      100,
                      keyResult.endDate,
                    );
                    const keyResultStatusColors = getProgressStatusColors(keyResultStatus);
                    const keyResultStatusLabel = getProgressStatusLabel(keyResultStatus);

                    return (
                      <tr key={keyResult.id} className="border-t border-slate-100 align-top">
                        <td className="px-4 py-3.5">
                          <Link
                            href={
                              keyResult.goalId !== "no-goal"
                                ? `/goals/${keyResult.goalId}/key-results/${keyResult.id}`
                                : "/tasks"
                            }
                            className="block max-w-[260px] truncate font-semibold text-slate-900 transition hover:text-blue-700"
                            title={keyResult.name}
                          >
                            {keyResult.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 text-slate-700">
                          <span className="block max-w-[220px] truncate" title={keyResult.goalName}>
                            {keyResult.goalName}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">
                          <span title={getGoalOwnerSearchText(owners)}>
                            {formatGoalOwnersSummary(owners)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">{keyResult.metric}</td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${keyResultStatusColors.badgeBg} ${keyResultStatusColors.badgeText}`}
                          >
                            {keyResultStatusLabel.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex w-[170px] items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <ProgressBar value={keyResult.progress} />
                            </div>
                            <span className="w-10 text-right text-xs font-semibold text-slate-600">
                              {keyResult.progress}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 lg:px-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{currentModeMeta.listTitle}</h2>
          </div>
        </div>

        <div className="p-3 pb-5 lg:p-4 lg:pb-6">
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-slate-50">
                <tr className="text-[11px] uppercase tracking-[0.08em] text-slate-500">
                  <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                    Task
                  </th>
                  {OKR_FEATURE_ENABLED ? (
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                      Key Result
                    </th>
                  ) : null}
                  <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                    Người phụ trách
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                    Timeline
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                    Trạng thái
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Tiến độ</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Ưu tiên</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTasks.map((task) => {
                  const taskStatus = getItemProgressStatus(task.progress, 100, task.endDate);
                  const taskStatusColors = getProgressStatusColors(taskStatus);
                  const taskStatusLabel = getProgressStatusLabel(taskStatus);

                  return (
                    <tr key={task.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/tasks/${task.id}`}
                          className="block max-w-[260px] truncate font-semibold text-slate-900 transition hover:text-blue-700"
                          title={buildTaskTooltip(task)}
                        >
                          {task.name}
                        </Link>
                      </td>
                      {OKR_FEATURE_ENABLED ? (
                        <td className="px-4 py-3.5 text-slate-700">
                          <span className="block max-w-[220px] truncate" title={task.keyResultName}>
                            {task.keyResultName}
                          </span>
                        </td>
                      ) : null}
                      <td className="px-4 py-3.5 text-slate-600">{task.assigneeName}</td>
                      <td className="px-4 py-3.5 text-slate-600">
                        {formatTimelineRangeVi(task.startDate, task.endDate, {
                          fallback: "Chưa có mốc thời gian",
                        })}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${taskStatusColors.badgeBg} ${taskStatusColors.badgeText}`}
                        >
                          {taskStatusLabel.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex w-[170px] items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <ProgressBar value={task.progress} />
                          </div>
                          <span className="w-10 text-right text-xs font-semibold text-slate-600">
                            {task.progress}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${getTaskPriorityBadgeClassName(task.priority)}`}
                        >
                          {getTaskPriorityLabel(task.priority)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredTasks.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-sm text-slate-600">
                Hiển thị {taskListRangeStart}-{taskListRangeEnd} / {filteredTasks.length} task
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTaskListPage((page) => Math.max(1, page - 1))}
                  disabled={taskListPage <= 1}
                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Trước
                </button>
                <span className="text-sm font-medium text-slate-600">
                  Trang {taskListPage}/{totalTaskListPages}
                </span>
                <button
                  type="button"
                  onClick={() => setTaskListPage((page) => Math.min(totalTaskListPages, page + 1))}
                  disabled={taskListPage >= totalTaskListPages}
                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Sau
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="tasks" />

        <div className="flex min-w-0 flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader
            title="Biểu đồ task"
            items={[{ label: "Quản lý task" }]}
            compact
          />

          <main className="flex flex-1 flex-col gap-3 px-4 py-4 lg:px-7">
            {showPermissionDebug && permissionDebug ? (
              <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-xs text-slate-100">
                <p className="mb-2 font-semibold text-sky-300">
                  Debug quyền tạo task (debugPermission=1)
                </p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                  {JSON.stringify(permissionDebug, null, 2)}
                </pre>
              </div>
            ) : null}

            <section className="shrink-0 rounded-2xl border border-slate-200 bg-white p-3.5 lg:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="inline-flex h-9 items-center rounded-xl bg-slate-100 p-1">
                    <ScaleButton active={viewMode === "gantt"} onClick={() => setViewMode("gantt")}>
                      Gantt
                    </ScaleButton>
                    <ScaleButton active={viewMode === "list"} onClick={() => setViewMode("list")}>
                      Danh sách
                    </ScaleButton>
                  </div>
                  {OKR_FEATURE_ENABLED ? (
                    <div className="inline-flex h-9 items-center rounded-xl bg-slate-100 p-1">
                      <ScaleButton active={structureMode === "goal"} onClick={() => handleLevelChange("goal")}>
                        Goal
                      </ScaleButton>
                      <ScaleButton active={structureMode === "key_result"} onClick={() => handleLevelChange("key_result")}>
                        KR
                      </ScaleButton>
                      <ScaleButton active={structureMode === "task"} onClick={() => handleLevelChange("task")}>
                        Task
                      </ScaleButton>
                    </div>
                  ) : null}
                </div>

                {!isCheckingCreatePermission && canCreateTask ? (
                  <button
                    type="button"
                    onClick={() => router.push(addTaskHref)}
                    className="h-9 shrink-0 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    {addButtonLabel}
                  </button>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-start gap-2">
                <input
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-9 min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />

                {OKR_FEATURE_ENABLED && (structureMode === "key_result" || structureMode === "task") && (
                  <Select
                    value={goalFilter === "all" ? undefined : goalFilter}
                    onValueChange={(value) => {
                      setGoalFilter(value as "all" | string);
                    }}
                  >
                    <SelectTrigger className={selectTriggerClassName}>
                      <SelectValue placeholder="Goal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả goal</SelectItem>
                      {goalFilters.map((goal) => (
                        <SelectItem key={goal.id} value={goal.id}>
                          {goal.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {OKR_FEATURE_ENABLED && structureMode === "task" ? (
                  <Select
                    value={keyResultFilter === "all" ? undefined : keyResultFilter}
                    onValueChange={(value) => setKeyResultFilter(value as "all" | string)}
                  >
                    <SelectTrigger className={selectTriggerClassName}>
                      <SelectValue placeholder="Key result" />
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

                {OKR_FEATURE_ENABLED && (structureMode === "goal" || structureMode === "key_result") && (
                  <>
                    <Select
                      value={departmentFilter === "all" ? undefined : departmentFilter}
                      onValueChange={(value) => setDepartmentFilter(value as "all" | string)}
                    >
                      <SelectTrigger className={selectTriggerClassName}>
                        <SelectValue placeholder="Phòng ban" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả phòng ban</SelectItem>
                        {departmentFilterOptions.map((department) => (
                          <SelectItem key={department.id} value={department.id}>
                            {department.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={quarterFilter === "all" ? undefined : quarterFilter}
                      onValueChange={(value) => setQuarterFilter(value as "all" | string)}
                    >
                      <SelectTrigger className={selectTriggerClassName}>
                        <SelectValue placeholder="Quý" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả quý</SelectItem>
                        <SelectItem value="1">Q1</SelectItem>
                        <SelectItem value="2">Q2</SelectItem>
                        <SelectItem value="3">Q3</SelectItem>
                        <SelectItem value="4">Q4</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={yearFilter === "all" ? undefined : yearFilter}
                      onValueChange={(value) => setYearFilter(value as "all" | string)}
                    >
                      <SelectTrigger className={selectTriggerClassName}>
                        <SelectValue placeholder="Năm" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả năm</SelectItem>
                        {yearFilterOptions.map((year) => (
                          <SelectItem key={year} value={String(year)}>
                            Năm {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}

                {(structureMode === "task" || (OKR_FEATURE_ENABLED && structureMode === "key_result")) && (
                  <Select
                    value={assigneeFilter === "all" ? undefined : assigneeFilter}
                    onValueChange={(value) => setAssigneeFilter(value as "all" | string)}
                  >
                    <SelectTrigger className={selectTriggerClassName}>
                      <SelectValue
                        placeholder={structureMode === "key_result" ? "Owner" : "Người phụ trách"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {structureMode === "key_result" ? "Tất cả owner" : "Tất cả người phụ trách"}
                      </SelectItem>
                      {assigneeFilters.map((assignee) => (
                        <SelectItem key={assignee.id} value={assignee.id}>
                          {assignee.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Select
                  value={statusFilter === "all" ? undefined : statusFilter}
                  onValueChange={(value) => setStatusFilter(value as ItemStatusFilter)}
                >
                  <SelectTrigger className={selectTriggerClassName}>
                    <SelectValue placeholder="Trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {structureMode === "task" ? (
                  <>
                    <Select
                      value={priorityFilter === "all" ? undefined : priorityFilter}
                      onValueChange={(value) => setPriorityFilter(value as "all" | string)}
                    >
                      <SelectTrigger className={selectTriggerClassName}>
                        <SelectValue placeholder="Ưu tiên" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Mọi ưu tiên</SelectItem>
                        {TASK_PRIORITIES.map((priority) => (
                          <SelectItem key={priority.value} value={priority.value}>
                            {priority.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={overdueFilter === "all" ? undefined : overdueFilter}
                      onValueChange={(value) => setOverdueFilter(value as OverdueFilter)}
                    >
                      <SelectTrigger className={selectTriggerClassName}>
                        <SelectValue placeholder="Deadline" />
                      </SelectTrigger>
                      <SelectContent>
                        {OVERDUE_FILTER_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : null}

                {hasActiveToolbarFilters ? (
                  <button
                    type="button"
                    onClick={clearToolbarFilters}
                    className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                  >
                    Xóa lọc
                  </button>
                ) : null}
              </div>

            </section>

            <section className="shrink-0">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <div className="flex h-14 items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-sm font-semibold text-slate-500">Chưa thực hiện</p>
                  <p className="text-2xl font-bold leading-none text-slate-800">
                    {notStartedCount}
                  </p>
                </div>
                <div className="flex h-14 items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                  <p className="text-sm font-semibold text-emerald-700">Đang thực hiện</p>
                  <p className="text-2xl font-bold leading-none text-emerald-700">
                    {inProgressCount}
                  </p>
                </div>
                <div className="flex h-14 items-center justify-between rounded-2xl border border-red-200 bg-red-50/70 px-4 py-3">
                  <p className="text-sm font-semibold text-red-700">Quá hạn</p>
                  <p className="text-2xl font-bold leading-none text-red-700">{overdueTaskCount}</p>
                </div>
                <div className="flex h-14 items-center justify-between rounded-2xl border border-blue-200 bg-blue-50/70 px-4 py-3">
                  <p className="text-sm font-semibold text-blue-700">Hoàn thành</p>
                  <p className="text-2xl font-bold leading-none text-blue-700">{completedCount}</p>
                </div>
              </div>
            </section>

            {isLoadingTasks ? (
              <section className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-8 text-sm text-slate-600">
                Đang tải dữ liệu trục thời gian...
              </section>
            ) : null}

            {!isLoadingTasks && taskLoadError ? (
              <section className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-4 py-8 text-sm text-amber-700">
                {taskLoadError}
              </section>
            ) : null}

            {!isLoadingTasks && !taskLoadError && currentFilteredItemCount === 0 ? (
              <section className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
                <div>
                  <p className="text-base font-semibold text-slate-900">
                    Không có {currentModeMeta.pluralLabel} nào khớp bộ lọc hiện tại.
                  </p>
                  <Link
                    href="/goals"
                    className="mt-4 inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Đi tới goal
                  </Link>
                </div>
              </section>
            ) : null}

            {!isLoadingTasks && !taskLoadError && currentFilteredItemCount > 0 ? (
              viewMode === "gantt" ? (
                <div className="flex flex-col gap-3">
                  {renderMissingTimelineSection()}
                  {renderGanttBoard()}
                </div>
              ) : (
                renderListBoard()
              )
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
