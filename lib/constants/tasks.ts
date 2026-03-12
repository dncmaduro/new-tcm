export const TASK_STATUSES = [
  { value: "todo", label: "Cần làm" },
  { value: "doing", label: "Đang làm" },
  { value: "done", label: "Hoàn thành" },
  { value: "cancelled", label: "Đã hủy" },
] as const;

export type TaskStatusValue = (typeof TASK_STATUSES)[number]["value"];
