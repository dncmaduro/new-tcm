export const GOAL_TYPES = [
  { value: "kpi", label: "KPI" },
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

export const normalizeGoalTypeValue = (value: string | null | undefined): GoalTypeValue =>
  value === "okr" ? "okr" : "kpi";

export const formatGoalTypeLabel = (value: string | null | undefined) =>
  GOAL_TYPES.find((item) => item.value === normalizeGoalTypeValue(value))?.label ?? "KPI";

export const getGoalProgressHelp = (value: string | null | undefined) => {
  if (normalizeGoalTypeValue(value) === "okr") {
    return "Goal OKR lấy tiến độ trung bình của các KR trực tiếp. KR hỗ trợ không được cộng vào tiến độ goal, và task chỉ dùng để theo dõi thực thi.";
  }

  return "Goal KPI lấy tổng giá trị hiện tại của các KR trực tiếp chia cho chỉ tiêu goal. KR hỗ trợ không được dùng để tính tiến độ goal.";
};

export const isKeyResultWeightApplied = (
  goalType: string | null | undefined,
  contributionType: string | null | undefined,
) => normalizeGoalTypeValue(goalType) === "okr" && contributionType !== "support";

export const getKeyResultWeightHelp = (
  goalType: string | null | undefined,
  contributionType: string | null | undefined,
) => {
  const normalizedGoalType = normalizeGoalTypeValue(goalType);

  if (normalizedGoalType === "kpi") {
    return "Goal KPI không dùng trọng số KR để tính tiến độ. Tiến độ chỉ cộng dồn giá trị hiện tại của các KR trực tiếp.";
  }

  if (contributionType === "support") {
    return "KR hỗ trợ không được cộng vào tiến độ goal OKR.";
  }

  return "Tiến độ goal OKR hiện coi các KR trực tiếp như nhau.";
};

export const formatGoalParticipationRoleLabel = (value: string | null | undefined) => {
  if (value === "owner") {
    return "Chính";
  }
  if (value === "participant") {
    return "Tham gia";
  }
  if (value === "supporter") {
    return "Hỗ trợ";
  }
  return value || "Tham gia";
};
