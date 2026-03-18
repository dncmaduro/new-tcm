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

export type TaskStatusValue = (typeof TASK_STATUSES)[number]["value"];
export type TaskTypeValue = (typeof TASK_TYPES)[number]["value"];

const okrProgressByStatus: Record<TaskStatusValue, number> = {
  todo: 0,
  doing: 50,
  done: 100,
  cancelled: 0,
};

export const getTaskProgressByType = (
  taskType: string | null | undefined,
  status: TaskStatusValue,
  storedProgress: number | null | undefined,
) => {
  if (taskType === "okr") {
    return okrProgressByStatus[status];
  }

  const safe = Number.isFinite(storedProgress) ? Number(storedProgress) : 0;
  return Math.min(100, Math.max(0, Math.round(safe)));
};

export const getTaskProgressHint = (taskType: string | null | undefined) => {
  if (taskType === "okr") {
    return "Task OKR lấy tiến độ theo trạng thái: Cần làm 0%, Đang làm 50%, Hoàn thành 100%, Đã hủy 0%.";
  }

  return "Task KPI dùng trực tiếp trường progress do người phụ trách cập nhật.";
};
