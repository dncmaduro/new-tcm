import { formatGoalTypeLabel, getGoalProgressHelp } from "@/lib/constants/goals";
import { formatKeyResultMetric, formatKeyResultUnit } from "@/lib/constants/key-results";
import { buildGoalProgressMap, buildKeyResultProgressMap, getComputedTaskProgress } from "@/lib/okr";

export type DashboardTaskStatus = "todo" | "doing" | "done" | "blocked" | "cancelled";

export type DashboardBaseTask = {
  id: string;
  name: string;
  keyResultId: string | null;
  keyResultName: string;
  goalId: string | null;
  goalName: string;
  assigneeId: string | null;
  assigneeName: string;
  status: DashboardTaskStatus;
  progress: number;
  executionStartAt: string | null;
  executionEndAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type DashboardMyTaskItem = DashboardBaseTask & {
  statusLabel: string;
  statusClassName: string;
  urgencyRank: number;
};

export type DashboardUpcomingTaskItem = {
  id: string;
  title: string;
  goalName: string;
  keyResultName: string;
  endDateAt: string;
  tag: string;
  tagClassName: string;
};

export type DashboardGoalItem = {
  id: string;
  label: string;
  team: string;
  progress: number;
  goalTypeLabel: string;
  metricLabel: string;
  progressHelp: string;
  statusLabel: string;
};

export type DashboardTeamPerformanceItem = {
  id: string;
  name: string;
  tasks: number;
  progress: number;
  completedRate: number;
};

export type DashboardActivityItem = {
  id: string;
  actorName: string;
  actorInitial: string;
  message: string;
  when: string;
};

export type DashboardTrendPoint = {
  key: string;
  label: string;
  createdCount: number;
  completedCount: number;
};

export type DashboardTimeTrackerData = {
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number;
  isRunning: boolean;
  empty: boolean;
};

export type DashboardSummaryCard = {
  title: string;
  value: string;
  badge: string;
  badgeClass: string;
  note: string;
  iconClass: string;
};

export type DashboardProfileSummary = {
  profileId: string;
  profileName: string;
  departmentName: string | null;
};

export type DashboardPayload = {
  profile: DashboardProfileSummary | null;
  summaryCards: DashboardSummaryCard[];
  taskTrend: DashboardTrendPoint[];
  timeTracker: DashboardTimeTrackerData;
  myTasks: DashboardMyTaskItem[];
  upcomingDeadlines: DashboardUpcomingTaskItem[];
  goalProgress: DashboardGoalItem[];
  teamPerformance: DashboardTeamPerformanceItem[];
  recentActivities: DashboardActivityItem[];
};

export const dashboardStatusMeta: Record<
  DashboardTaskStatus,
  { label: string; badgeClassName: string }
> = {
  todo: {
    label: "Cần làm",
    badgeClassName: "bg-slate-100 text-slate-600",
  },
  doing: {
    label: "Đang làm",
    badgeClassName: "bg-blue-50 text-blue-600",
  },
  done: {
    label: "Hoàn thành",
    badgeClassName: "bg-emerald-50 text-emerald-600",
  },
  blocked: {
    label: "Bị chặn",
    badgeClassName: "bg-rose-50 text-rose-600",
  },
  cancelled: {
    label: "Đã hủy",
    badgeClassName: "bg-slate-200 text-slate-600",
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toStartOfDay = (value: Date) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const toValidDate = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const normalizeDashboardStatus = (value: string | null | undefined): DashboardTaskStatus => {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "blocked") {
    return "blocked";
  }
  if (raw === "doing" || raw === "in_progress" || raw === "inprogress" || raw === "review") {
    return "doing";
  }
  if (raw === "done" || raw === "completed") {
    return "done";
  }
  if (raw === "cancelled" || raw === "canceled") {
    return "cancelled";
  }
  return "todo";
};

export const getInitial = (name: string) => {
  const parts = name
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!parts.length) {
    return "•";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
};

export const formatDateShortVi = (value: string | null) => {
  if (!value) {
    return "Chưa đặt";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Không hợp lệ";
  }
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(date);
};

export const formatTimeVi = (value: string | null) => {
  if (!value) {
    return "-:--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-:--";
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
  const hours = minutes / 60;
  return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
};

export const getWorkedMinutes = (
  checkInAt: string | null,
  checkOutAt: string | null,
  now = new Date(),
) => {
  if (!checkInAt) {
    return 0;
  }

  const checkIn = new Date(checkInAt);
  if (Number.isNaN(checkIn.getTime())) {
    return 0;
  }

  const end = checkOutAt ? new Date(checkOutAt) : now;
  if (Number.isNaN(end.getTime())) {
    return 0;
  }

  return Math.max(0, Math.round((end.getTime() - checkIn.getTime()) / 60000));
};

export const buildTaskTrend = (tasks: Array<{ createdAt: string | null; updatedAt: string | null; status: DashboardTaskStatus }>) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - offset));
    const dayKey = day.toISOString().slice(0, 10);
    const createdCount = tasks.filter((task) => task.createdAt?.slice(0, 10) === dayKey).length;
    const completedCount = tasks.filter(
      (task) => task.status === "done" && task.updatedAt?.slice(0, 10) === dayKey,
    ).length;

    return {
      key: dayKey,
      label: new Intl.DateTimeFormat("vi-VN", { weekday: "short" }).format(day),
      createdCount,
      completedCount,
    } satisfies DashboardTrendPoint;
  });
};

export const getDateDiffFromToday = (value: string | null | undefined, now = new Date()) => {
  const targetDate = toValidDate(value);
  if (!targetDate) {
    return null;
  }

  const today = toStartOfDay(now);
  targetDate.setHours(0, 0, 0, 0);
  return Math.round((targetDate.getTime() - today.getTime()) / DAY_MS);
};

export const getDateUrgencyMeta = (value: string | null | undefined, now = new Date()) => {
  const diffDays = getDateDiffFromToday(value, now);
  if (diffDays === null) {
    return {
      rank: 5,
      label: "Chưa đặt",
      className: "text-slate-400",
    };
  }

  if (diffDays < 0) {
    return {
      rank: 0,
      label: "Quá hạn",
      className: "text-rose-500",
    };
  }
  if (diffDays === 0) {
    return {
      rank: 1,
      label: "Hôm nay",
      className: "text-rose-500",
    };
  }
  if (diffDays <= 3) {
    return {
      rank: 2,
      label: "Cao",
      className: "text-rose-500",
    };
  }
  if (diffDays <= 7) {
    return {
      rank: 3,
      label: "Trung bình",
      className: "text-amber-500",
    };
  }
  return {
    rank: 4,
    label: "Thấp",
    className: "text-emerald-500",
  };
};

export const formatRelativeTimeVi = (value: string | null, now = new Date()) => {
  if (!value) {
    return "Vừa xong";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Không rõ";
  }

  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) {
    return "Vừa xong";
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
  return "bản ghi";
};

const toStatusLabel = (status: string | null) => {
  const normalized = status?.trim().toLowerCase() ?? "";
  if (normalized === "draft") {
    return "Nháp";
  }
  if (normalized === "active") {
    return "Đang hoạt động";
  }
  if (normalized === "completed" || normalized === "done") {
    return "Hoàn thành";
  }
  if (normalized === "cancelled") {
    return "Đã hủy";
  }
  if (normalized === "todo") {
    return "Cần làm";
  }
  if (normalized === "doing" || normalized === "in_progress") {
    return "Đang làm";
  }
  if (normalized === "blocked") {
    return "Bị chặn";
  }
  return status ?? "Không rõ";
};

const getEntityName = (oldValue: Record<string, unknown> | null, newValue: Record<string, unknown> | null) => {
  const candidate = newValue?.name ?? oldValue?.name ?? null;
  return candidate ? String(candidate) : null;
};

export const formatActivityMessage = ({
  actorName,
  action,
  entityType,
  oldValue,
  newValue,
}: {
  actorName: string;
  action: string | null;
  entityType: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
}) => {
  const entityLabel = toEntityLabel(entityType);
  const entityName = getEntityName(oldValue, newValue);
  const oldProgress = typeof oldValue?.progress === "number" ? Math.round(oldValue.progress) : null;
  const newProgress = typeof newValue?.progress === "number" ? Math.round(newValue.progress) : null;
  const oldStatus = oldValue?.status ? String(oldValue.status) : null;
  const newStatus = newValue?.status ? String(newValue.status) : null;

  if (action?.includes("created")) {
    return `${actorName} đã tạo ${entityLabel}${entityName ? ` ${entityName}` : ""}`;
  }
  if (action?.includes("deleted")) {
    return `${actorName} đã xóa ${entityLabel}${entityName ? ` ${entityName}` : ""}`;
  }
  if (oldProgress !== null && newProgress !== null && oldProgress !== newProgress) {
    return `${actorName} đã cập nhật tiến độ ${entityLabel} từ ${oldProgress}% lên ${newProgress}%`;
  }
  if (oldStatus && newStatus && oldStatus !== newStatus) {
    return `${actorName} đã đổi trạng thái ${entityLabel} từ ${toStatusLabel(oldStatus)} sang ${toStatusLabel(newStatus)}`;
  }
  return `${actorName} đã cập nhật ${entityLabel}${entityName ? ` ${entityName}` : ""}`;
};

export const buildGoalProgressItems = ({
  goals,
  goalDepartments,
  keyResults,
  departmentNamesById,
}: {
  goals: Array<{
    id: string;
    name: string;
    type: string | null;
    status: string | null;
    department_id: string | null;
    target: number | null;
    unit: string | null;
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

  return goals.map((goal) => ({
    id: goal.id,
    label: goal.name,
    team: (() => {
      const participantIds = participantDepartmentIdsByGoalId[goal.id] ?? [];
      const primaryDepartmentName = goal.department_id
        ? departmentNamesById[goal.department_id] ?? "Không rõ phòng ban"
        : null;
      const participantNames = participantIds
        .map((departmentId) => departmentNamesById[departmentId] ?? "Không rõ phòng ban")
        .filter((name, index, array) => array.indexOf(name) === index);

      if (primaryDepartmentName && participantNames.length === 0) {
        return primaryDepartmentName;
      }
      if (!primaryDepartmentName && participantNames.length === 0) {
        return "Chưa gán phòng ban";
      }
      if (primaryDepartmentName && participantNames.length > 0) {
        return `${primaryDepartmentName} + ${Math.max(0, participantNames.length - 1)} phòng ban`;
      }
      return participantNames.join(", ");
    })(),
    progress: goalProgressMap[goal.id] ?? 0,
    goalTypeLabel: formatGoalTypeLabel(goal.type),
    metricLabel:
      goal.target !== null || goal.unit
        ? `${formatKeyResultMetric(goal.target, goal.unit)} · ${formatKeyResultUnit(goal.unit)}`
        : "Chưa đặt chỉ tiêu mục tiêu",
    progressHelp: getGoalProgressHelp(goal.type),
    statusLabel: goal.status ? String(goal.status) : "Không rõ",
  }));
};

export const sortMyTasks = (tasks: DashboardMyTaskItem[]) => {
  return tasks
    .slice()
    .sort((a, b) => {
      if (a.urgencyRank !== b.urgencyRank) {
        return a.urgencyRank - b.urgencyRank;
      }
      if (a.status !== b.status) {
        const aPriority = a.status === "doing" ? 0 : a.status === "blocked" ? 1 : a.status === "todo" ? 2 : 3;
        const bPriority = b.status === "doing" ? 0 : b.status === "blocked" ? 1 : b.status === "todo" ? 2 : 3;
        return aPriority - bPriority;
      }
      const aSchedule = toValidDate(a.executionEndAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bSchedule = toValidDate(b.executionEndAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aSchedule - bSchedule;
    });
};

export const toDashboardTaskProgress = (task: {
  type?: string | null;
  status?: string | null;
  progress?: number | null;
}) =>
  getComputedTaskProgress({
    type: task.type ?? null,
    status: task.status ?? null,
    progress: task.progress ?? null,
  });
