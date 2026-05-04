export const TASK_STATUSES = [
  { value: "todo", label: "Cần làm" },
  { value: "doing", label: "Đang làm" },
  { value: "done", label: "Hoàn thành" },
  { value: "cancelled", label: "Đã hủy" },
] as const;

export const TASK_TYPES = [
  { value: "kpi", label: "KPI" },
  { value: "okr", label: "OKR" },
] as const;

export const TASK_PRIORITIES = [
  { value: "low", label: "Thấp", colorClassName: "bg-slate-100 text-slate-700", score: 1 },
  { value: "medium", label: "Trung bình", colorClassName: "bg-blue-50 text-blue-700", score: 2 },
  { value: "high", label: "Cao", colorClassName: "bg-amber-50 text-amber-700", score: 3 },
  { value: "urgent", label: "Khẩn cấp", colorClassName: "bg-rose-50 text-rose-700", score: 4 },
] as const;

export type TaskStatusValue = (typeof TASK_STATUSES)[number]["value"];
export type TaskTypeValue = (typeof TASK_TYPES)[number]["value"];
export type TaskPriority = (typeof TASK_PRIORITIES)[number]["value"];

export const normalizeTaskStatus = (value: string | null | undefined): TaskStatusValue => {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "done" || raw === "completed") {
    return "done";
  }
  if (raw === "doing" || raw === "inprogress" || raw === "review") {
    return "doing";
  }
  if (raw === "cancelled" || raw === "canceled") {
    return "cancelled";
  }
  return "todo";
};

export const getTaskStatusByProgress = (
  progress: number | null | undefined,
): TaskStatusValue => {
  const safe = Number.isFinite(progress) ? Number(progress) : 0;

  if (safe >= 100) {
    return "done";
  }

  if (safe > 0) {
    return "doing";
  }

  return "todo";
};

export const getTaskProgressByType = (
  taskType: string | null | undefined,
  status: TaskStatusValue,
  storedProgress: number | null | undefined,
) => {
  void taskType;
  void status;

  const safe = Number.isFinite(storedProgress) ? Number(storedProgress) : 0;
  return Math.min(100, Math.max(0, Math.round(safe)));
};

export const getTaskProgressHint = (taskType: string | null | undefined) => {
  void taskType;
  return "Task được quản lý trực tiếp theo tiến độ cập nhật, không thao tác theo trạng thái.";
};

export const normalizeTaskPriority = (value: string | null | undefined): TaskPriority => {
  if (value === "low" || value === "high" || value === "urgent") {
    return value;
  }
  return "medium";
};

export const getTaskPriorityLabel = (value: string | null | undefined) =>
  TASK_PRIORITIES.find((item) => item.value === normalizeTaskPriority(value))?.label ?? "Trung bình";

export const getTaskPriorityOptionLabel = (value: string | null | undefined) => {
  const priority =
    TASK_PRIORITIES.find((item) => item.value === normalizeTaskPriority(value)) ??
    TASK_PRIORITIES.find((item) => item.value === "medium");

  return priority ? `${priority.label} (${priority.score} điểm)` : "Trung bình (2 điểm)";
};

export const getTaskPriorityBadgeClassName = (value: string | null | undefined) =>
  TASK_PRIORITIES.find((item) => item.value === normalizeTaskPriority(value))?.colorClassName ??
  "bg-blue-50 text-blue-700";

export const getTaskPriorityScore = (value: string | null | undefined) =>
  TASK_PRIORITIES.find((item) => item.value === normalizeTaskPriority(value))?.score ?? 2;

export const compareTaskPriority = (left: string | null | undefined, right: string | null | undefined) =>
  getTaskPriorityScore(right) - getTaskPriorityScore(left);
