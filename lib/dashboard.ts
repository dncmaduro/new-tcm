import { formatGoalTypeLabel } from "@/lib/constants/goals";
import {
  getTaskPriorityBadgeClassName,
  getTaskPriorityLabel,
  getTaskPriorityScore,
} from "@/lib/constants/tasks";
import { getComputedTaskProgress, buildGoalProgressMap, buildKeyResultProgressMap } from "@/lib/okr";

export type DashboardRoleScope = "member" | "leader" | "director";

export type DashboardTaskStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "overdue"
  | "paused";

export type DashboardSummaryCard = {
  title: string;
  value: string;
  note: string;
  helper?: string | null;
  tone: "slate" | "blue" | "amber" | "emerald";
  ctaLabel?: string | null;
  ctaHref?: string | null;
};

export type DashboardPriorityTaskItem = {
  id: string;
  name: string;
  status: DashboardTaskStatus;
  statusLabel: string;
  statusClassName: string;
  priorityLabel: string;
  priorityClassName: string;
  dueDateAt: string | null;
  dueLabel: string;
  dueClassName: string;
  relationLabel: string | null;
};

export type DashboardDeadlineItem = {
  id: string;
  name: string;
  statusLabel: string;
  statusClassName: string;
  priorityLabel: string;
  priorityClassName: string;
  dueDateAt: string;
  dueLabel: string;
  dueClassName: string;
};

export type DashboardGoalItem = {
  id: string;
  label: string;
  scopeLabel: string;
  typeLabel: string;
  progress: number;
  endDateAt: string | null;
  timeLabel: string;
  href: string | null;
};

export type DashboardActivityItem = {
  id: string;
  message: string;
  when: string;
};

export type DashboardTrendPoint = {
  key: string;
  label: string;
  completedCount: number;
};

export type DashboardAttendanceBadge = {
  label: string;
  className: string;
};

export type DashboardTimeTrackerData = {
  statusLabel: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number;
  isRunning: boolean;
  empty: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  badges: DashboardAttendanceBadge[];
};

export type DashboardWeeklyPerformance = {
  title: string;
  completedTasks: number;
  totalTasks: number;
  progress: number;
  note: string | null;
  ctaLabel: string;
  ctaHref: string;
};

export type DashboardProfileSummary = {
  profileId: string;
  profileName: string;
  departmentName: string | null;
  roleScope: DashboardRoleScope;
};

export type DashboardPayload = {
  profile: DashboardProfileSummary | null;
  summaryCards: DashboardSummaryCard[];
  priorityTasks: DashboardPriorityTaskItem[];
  goalProgress: DashboardGoalItem[];
  taskTrend: DashboardTrendPoint[];
  timeTracker: DashboardTimeTrackerData;
  upcomingDeadlines: DashboardDeadlineItem[];
  recentActivities: DashboardActivityItem[];
  weeklyPerformance: DashboardWeeklyPerformance;
};

export const dashboardStatusMeta: Record<
  DashboardTaskStatus,
  { label: string; badgeClassName: string }
> = {
  not_started: {
    label: "Chưa bắt đầu",
    badgeClassName: "bg-slate-100 text-slate-700",
  },
  in_progress: {
    label: "Đang làm",
    badgeClassName: "bg-blue-50 text-blue-700",
  },
  completed: {
    label: "Hoàn thành",
    badgeClassName: "bg-emerald-50 text-emerald-700",
  },
  overdue: {
    label: "Quá hạn",
    badgeClassName: "bg-rose-50 text-rose-700",
  },
  paused: {
    label: "Tạm dừng",
    badgeClassName: "bg-amber-50 text-amber-700",
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

const normalizeProgress = (value: number | null | undefined) => {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return Math.min(100, Math.max(0, Math.round(safe)));
};

export const formatDateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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

export const formatDateShortVi = (value: string | null) => {
  if (!value) {
    return "Chưa đặt";
  }

  const date = toValidDate(value);
  if (!date) {
    return "Không hợp lệ";
  }

  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(date);
};

export const formatTimeVi = (value: string | null) => {
  if (!value) {
    return "--:--";
  }

  const date = toValidDate(value);
  if (!date) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const formatDurationClock = (totalSeconds: number) => {
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

export const formatHoursShort = (minutes: number) => {
  if (minutes <= 0) {
    return "0h";
  }

  const hourPart = Math.floor(minutes / 60);
  const minutePart = minutes % 60;

  if (minutePart === 0) {
    return `${hourPart}h`;
  }

  return `${hourPart}h ${minutePart}p`;
};

export const getWorkedMinutes = (
  checkInAt: string | null,
  checkOutAt: string | null,
  now = new Date(),
) => {
  if (!checkInAt) {
    return 0;
  }

  const checkIn = toValidDate(checkInAt);
  if (!checkIn) {
    return 0;
  }

  const end = checkOutAt ? toValidDate(checkOutAt) : now;
  if (!end) {
    return 0;
  }

  return Math.max(0, Math.round((end.getTime() - checkIn.getTime()) / 60000));
};

export const getDateDiffFromToday = (value: string | null | undefined, now = new Date()) => {
  const targetDate = toValidDate(value);
  if (!targetDate) {
    return null;
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
};

export const getDateUrgencyMeta = (value: string | null | undefined, now = new Date()) => {
  const diffDays = getDateDiffFromToday(value, now);
  if (diffDays === null) {
    return {
      rank: 4,
      label: "Chưa đặt hạn",
      className: "bg-slate-100 text-slate-600",
    };
  }

  if (diffDays < 0) {
    return {
      rank: 0,
      label: "Quá hạn",
      className: "bg-rose-50 text-rose-700",
    };
  }

  if (diffDays === 0) {
    return {
      rank: 1,
      label: "Hôm nay",
      className: "bg-amber-50 text-amber-700",
    };
  }

  if (diffDays <= 3) {
    return {
      rank: 2,
      label: `${diffDays} ngày nữa`,
      className: "bg-amber-50 text-amber-700",
    };
  }

  return {
    rank: 3,
    label: formatDateShortVi(value ?? null),
    className: "bg-slate-100 text-slate-600",
  };
};

export const formatRelativeTimeVi = (value: string | null, now = new Date()) => {
  const date = toValidDate(value);
  if (!date) {
    return "Vừa cập nhật";
  }

  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) {
    return "Vừa cập nhật";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} phút trước`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} giờ trước`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} ngày trước`;
  }

  return formatDateShortVi(value);
};

const toEntityLabel = (entityType: string | null) => {
  if (entityType === "goal") {
    return "mục tiêu";
  }
  if (entityType === "key_result") {
    return "KR";
  }
  if (entityType === "task") {
    return "công việc";
  }
  if (entityType === "time_request") {
    return "yêu cầu thời gian";
  }
  return "bản ghi";
};

const toRawStatusLabel = (status: string | null) => {
  const raw = (status ?? "").trim().toLowerCase();
  if (!raw) {
    return "Không rõ";
  }
  if (raw === "draft") {
    return "Nháp";
  }
  if (raw === "active") {
    return "Đang hoạt động";
  }
  if (raw === "completed" || raw === "done") {
    return "Hoàn thành";
  }
  if (raw === "cancelled" || raw === "canceled") {
    return "Đã hủy";
  }
  if (raw === "todo") {
    return "Chưa bắt đầu";
  }
  if (raw === "doing" || raw === "in_progress" || raw === "review") {
    return "Đang làm";
  }
  if (raw === "paused" || raw === "blocked" || raw === "on_hold") {
    return "Tạm dừng";
  }
  return status ?? "Không rõ";
};

const getEntityName = (oldValue: Record<string, unknown> | null, newValue: Record<string, unknown> | null) => {
  const candidate = newValue?.name ?? oldValue?.name ?? null;
  return candidate ? String(candidate) : null;
};

export const formatActivityMessage = ({
  action,
  entityType,
  oldValue,
  newValue,
}: {
  action: string | null;
  entityType: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
}) => {
  const entityLabel = toEntityLabel(entityType);
  const entityName = getEntityName(oldValue, newValue);
  const oldProgress =
    typeof oldValue?.progress === "number" ? Math.round(oldValue.progress) : null;
  const newProgress =
    typeof newValue?.progress === "number" ? Math.round(newValue.progress) : null;
  const oldStatus = oldValue?.status ? String(oldValue.status) : null;
  const newStatus = newValue?.status ? String(newValue.status) : null;

  if (action?.includes("approved")) {
    return `${entityName ?? "Yêu cầu"} đã được duyệt`;
  }
  if (action?.includes("rejected")) {
    return `${entityName ?? "Yêu cầu"} đã bị từ chối`;
  }
  if (action?.includes("created")) {
    return `Đã tạo ${entityLabel}${entityName ? ` ${entityName}` : ""}`;
  }
  if (action?.includes("deleted")) {
    return `Đã xóa ${entityLabel}${entityName ? ` ${entityName}` : ""}`;
  }
  if (oldProgress !== null && newProgress !== null && oldProgress !== newProgress) {
    return `Đã cập nhật tiến độ ${entityLabel}${entityName ? ` ${entityName}` : ""} từ ${oldProgress}% lên ${newProgress}%`;
  }
  if (oldStatus && newStatus && oldStatus !== newStatus) {
    return `Đã đổi trạng thái ${entityLabel}${entityName ? ` ${entityName}` : ""} từ ${toRawStatusLabel(oldStatus)} sang ${toRawStatusLabel(newStatus)}`;
  }
  return `Đã cập nhật ${entityLabel}${entityName ? ` ${entityName}` : ""}`;
};

export const getDashboardTaskProgress = (task: {
  current?: number | null;
  target?: number | null;
  progress?: number | null;
  type?: string | null;
}) =>
  normalizeProgress(
    getComputedTaskProgress({
      current: task.current ?? null,
      target: task.target ?? null,
      progress: task.progress ?? null,
      type: task.type ?? null,
    }),
  );

export const normalizeDashboardTaskStatus = ({
  rawStatus,
  progress,
  dueDateAt,
  now = new Date(),
}: {
  rawStatus?: string | null;
  progress: number;
  dueDateAt?: string | null;
  now?: Date;
}): DashboardTaskStatus => {
  const normalizedRaw = (rawStatus ?? "").trim().toLowerCase();

  if (normalizedRaw === "paused" || normalizedRaw === "blocked" || normalizedRaw === "on_hold") {
    return "paused";
  }

  if (normalizedRaw === "done" || normalizedRaw === "completed" || progress >= 100) {
    return "completed";
  }

  const dueDiff = getDateDiffFromToday(dueDateAt ?? null, now);
  if (dueDiff !== null && dueDiff < 0) {
    return "overdue";
  }

  if (normalizedRaw === "doing" || normalizedRaw === "in_progress" || normalizedRaw === "review") {
    return "in_progress";
  }

  if (progress > 0) {
    return "in_progress";
  }

  return "not_started";
};

export const buildCompletedTrend = (
  tasks: Array<{ updatedAt: string | null; status: DashboardTaskStatus }>,
  now = new Date(),
) => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - offset));
    const dayKey = formatDateKey(day);
    const completedCount = tasks.filter((task) => {
      if (task.status !== "completed" || !task.updatedAt) {
        return false;
      }

      const updatedAt = toValidDate(task.updatedAt);
      return updatedAt ? formatDateKey(updatedAt) === dayKey : false;
    }).length;

    return {
      key: dayKey,
      label: new Intl.DateTimeFormat("vi-VN", { weekday: "short" }).format(day),
      completedCount,
    } satisfies DashboardTrendPoint;
  });
};

export const buildGoalProgressItems = ({
  goals,
  goalDepartments,
  keyResults,
  departmentNamesById,
  now = new Date(),
}: {
  goals: Array<{
    id: string;
    name: string;
    type: string | null;
    status: string | null;
    department_id: string | null;
    target: number | null;
    unit: string | null;
    end_date: string | null;
  }>;
  goalDepartments: Array<{
    goal_id: string | null;
    department_id: string | null;
    role?: string | null;
  }>;
  keyResults: Array<{
    id: string;
    goal_id: string | null;
    contribution_type?: string | null;
    start_value: number | null;
    current: number | null;
    target: number | null;
    weight?: number | null;
  }>;
  departmentNamesById: Record<string, string>;
  now?: Date;
}) => {
  const keyResultProgressMap = buildKeyResultProgressMap(keyResults);
  const goalProgressMap = buildGoalProgressMap(
    goals.map((goal) => ({ id: goal.id, type: goal.type, target: goal.target })),
    keyResults,
    keyResultProgressMap,
  );

  const participantDepartmentIdsByGoalId = goalDepartments.reduce<Record<string, string[]>>((acc, item) => {
    const goalId = item.goal_id ? String(item.goal_id) : null;
    const departmentId = item.department_id ? String(item.department_id) : null;
    if (!goalId || !departmentId) {
      return acc;
    }

    if (!acc[goalId]) {
      acc[goalId] = [];
    }

    if (!acc[goalId].includes(departmentId)) {
      acc[goalId].push(departmentId);
    }

    return acc;
  }, {});

  return goals.map((goal) => {
    const participantIds = participantDepartmentIdsByGoalId[goal.id] ?? [];
    const scopeNames = [
      goal.department_id ? departmentNamesById[goal.department_id] ?? null : null,
      ...participantIds.map((departmentId) => departmentNamesById[departmentId] ?? null),
    ].filter((item, index, array): item is string => Boolean(item) && array.indexOf(item) === index);

    const diffDays = getDateDiffFromToday(goal.end_date, now);
    const timeLabel =
      diffDays === null
        ? "Chưa đặt ngày kết thúc"
        : diffDays < 0
          ? `Quá ${Math.abs(diffDays)} ngày`
          : diffDays === 0
            ? "Kết thúc hôm nay"
            : `${diffDays} ngày còn lại`;

    return {
      id: goal.id,
      label: goal.name,
      scopeLabel: scopeNames.join(" · ") || "Chưa gán phòng ban",
      typeLabel: formatGoalTypeLabel(goal.type),
      progress: goalProgressMap[goal.id] ?? 0,
      endDateAt: goal.end_date,
      timeLabel,
      href: `/goals/${goal.id}`,
    } satisfies DashboardGoalItem;
  });
};

export const sortPriorityTasks = <
  TTask extends {
    status: DashboardTaskStatus;
    dueDateAt: string | null;
    priority: string | null;
  },
>(
  tasks: TTask[],
  now = new Date(),
) => {
  return tasks.slice().sort((left, right) => {
    const priorityDiff = getTaskPriorityScore(right.priority) - getTaskPriorityScore(left.priority);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    const leftDue = getDateDiffFromToday(left.dueDateAt, now);
    const rightDue = getDateDiffFromToday(right.dueDateAt, now);

    const leftGroup = left.status === "overdue" ? 0 : leftDue === 0 ? 1 : 2;
    const rightGroup = right.status === "overdue" ? 0 : rightDue === 0 ? 1 : 2;

    if (leftGroup !== rightGroup) {
      return leftGroup - rightGroup;
    }

    const leftDueTs = toValidDate(left.dueDateAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightDueTs = toValidDate(right.dueDateAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return leftDueTs - rightDueTs;
  });
};

export const toTaskBadgeMeta = ({
  status,
  priority,
  dueDateAt,
  now = new Date(),
}: {
  status: DashboardTaskStatus;
  priority: string | null;
  dueDateAt: string | null;
  now?: Date;
}) => ({
  statusLabel: dashboardStatusMeta[status].label,
  statusClassName: dashboardStatusMeta[status].badgeClassName,
  priorityLabel: getTaskPriorityLabel(priority),
  priorityClassName: getTaskPriorityBadgeClassName(priority),
  dueLabel: getDateUrgencyMeta(dueDateAt, now).label,
  dueClassName: getDateUrgencyMeta(dueDateAt, now).className,
});
