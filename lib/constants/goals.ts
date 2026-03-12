export const GOAL_TYPES = [
  { value: "stats", label: "KPI" },
  { value: "okr", label: "OKR" },
] as const;

export const GOAL_STATUSES = [
  { value: "draft", label: "Nháp" },
  { value: "active", label: "Đang hoạt động" },
  { value: "completed", label: "Hoàn thành" },
  { value: "cancelled", label: "Đã hủy" },
] as const;

export type GoalTypeValue = (typeof GOAL_TYPES)[number]["value"];
export type GoalStatusValue = (typeof GOAL_STATUSES)[number]["value"];
