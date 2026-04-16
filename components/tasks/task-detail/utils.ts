import {
  TASK_STATUSES,
  TASK_TYPES,
  normalizeTaskStatus,
  type TaskStatusValue,
  type TaskTypeValue,
} from "@/lib/constants/tasks";
import { getComputedTaskProgress } from "@/lib/okr";
import type {
  KeyResultLiteRow,
  ProgressTone,
  TaskFormState,
  TaskRow,
  TaskTimelineFormState,
} from "./types";

type TaskStatusMeta = {
  label: string;
  tone: ProgressTone;
  badgeClassName: string;
  dotClassName: string;
};

const taskStatusMetaMap: Record<TaskStatusValue, TaskStatusMeta> = {
  todo: {
    label: "Cần làm",
    tone: "slate",
    badgeClassName: "bg-slate-100 text-slate-700 ring-slate-200",
    dotClassName: "bg-slate-500",
  },
  doing: {
    label: "Đang làm",
    tone: "blue",
    badgeClassName: "bg-blue-50 text-blue-700 ring-blue-200",
    dotClassName: "bg-blue-600",
  },
  done: {
    label: "Hoàn thành",
    tone: "emerald",
    badgeClassName: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dotClassName: "bg-emerald-600",
  },
  cancelled: {
    label: "Đã hủy",
    tone: "rose",
    badgeClassName: "bg-rose-50 text-rose-700 ring-rose-200",
    dotClassName: "bg-rose-600",
  },
};

export const clampProgress = (value: number | null | undefined) => {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return Math.min(100, Math.max(0, Math.round(safe)));
};

export const getTaskTypeValue = (value: string | null | undefined): TaskTypeValue =>
  value === "okr" ? "okr" : "kpi";

export const getTaskTypeLabel = (value: string | null | undefined) =>
  TASK_TYPES.find((item) => item.value === getTaskTypeValue(value))?.label ?? "KPI";

export const getTaskCycleLabel = (isRecurring: boolean | null | undefined) =>
  isRecurring ? "Lặp lại" : "Một lần";

export const getTaskStatusMeta = (status: string | null | undefined) =>
  taskStatusMetaMap[normalizeTaskStatus(status)];

export const getTaskStatusLabel = (status: string | null | undefined) =>
  TASK_STATUSES.find((item) => item.value === normalizeTaskStatus(status))?.label ?? "Cần làm";

export const formatDateTime = (value: string | null) => {
  if (!value) {
    return "Chưa có";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Không hợp lệ";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

export const buildTaskFormState = (task: TaskRow): TaskFormState => ({
  name: task.name,
  description: task.description ?? "",
  note: task.note ?? "",
  isRecurring: Boolean(task.is_recurring),
  hypothesis: task.hypothesis ?? "",
  result: task.result ?? "",
  type: getTaskTypeValue(task.type),
  status: normalizeTaskStatus(task.status),
  progress: getComputedTaskProgress(task),
  weight: typeof task.weight === "number" ? task.weight : Number(task.weight ?? 1),
});

export const buildTaskTimelineForm = (
  task: TaskRow | null,
  keyResult: KeyResultLiteRow | null,
): TaskTimelineFormState => ({
  startDate: task?.start_date ?? keyResult?.start_date ?? "",
  endDate: task?.end_date ?? keyResult?.end_date ?? "",
});
