export const KEY_RESULT_UNITS = [
  { value: "percent", label: "Phần trăm" },
  { value: "currency", label: "Doanh thu" },
  { value: "count", label: "Số lượng" },
] as const;

export type KeyResultUnitValue = (typeof KEY_RESULT_UNITS)[number]["value"];

export const KEY_RESULT_TYPES = [
  { value: "kpi", label: "KPI" },
  { value: "okr", label: "OKR" },
] as const;

export type KeyResultTypeValue = (typeof KEY_RESULT_TYPES)[number]["value"];

export const KEY_RESULT_CONTRIBUTION_TYPES = [
  { value: "direct", label: "Trực tiếp" },
  { value: "support", label: "Hỗ trợ" },
] as const;

export type KeyResultContributionTypeValue =
  (typeof KEY_RESULT_CONTRIBUTION_TYPES)[number]["value"];

export const keyResultUnitLabelMap = KEY_RESULT_UNITS.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

export const keyResultTypeLabelMap = KEY_RESULT_TYPES.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

export const keyResultContributionTypeLabelMap = KEY_RESULT_CONTRIBUTION_TYPES.reduce<
  Record<string, string>
>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

export const normalizeKeyResultTypeValue = (
  value: string | null | undefined,
): KeyResultTypeValue => (value === "okr" ? "okr" : "kpi");

export const normalizeKeyResultContributionTypeValue = (
  value: string | null | undefined,
): KeyResultContributionTypeValue => (value === "support" ? "support" : "direct");

export const formatKeyResultTypeLabel = (value: string | null | undefined) =>
  keyResultTypeLabelMap[normalizeKeyResultTypeValue(value)] ?? "KPI";

export const formatKeyResultContributionTypeLabel = (value: string | null | undefined) =>
  keyResultContributionTypeLabelMap[normalizeKeyResultContributionTypeValue(value)] ?? "Trực tiếp";

export const formatMetricValue = (value: number | null, precision = 2) => {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: precision,
  }).format(safe);
};

export const formatKeyResultUnit = (unit: string | null) => {
  if (!unit) {
    return "Đơn vị mặc định";
  }
  return keyResultUnitLabelMap[unit] ?? unit;
};

export const formatKeyResultMetric = (value: number | null, unit: string | null) => {
  const safe = Number.isFinite(value) ? Number(value) : 0;

  if (unit === "percent") {
    return `${formatMetricValue(safe)}%`;
  }

  if (unit === "currency") {
    return `${formatMetricValue(safe)} đ`;
  }

  return formatMetricValue(safe);
};

export const getKeyResultProgressHint = (unit: string | null) => {
  const unitLabel = formatKeyResultUnit(unit);
  if (unit === "percent") {
    return `Tiến độ KR được tính trực tiếp từ giá trị hiện tại so với chỉ tiêu, theo đơn vị ${unitLabel}. Công việc chỉ dùng để theo dõi phần thực hiện.`;
  }
  if (unit === "currency") {
    return `Giá trị hiện tại của KR là nguồn đo chính theo đơn vị ${unitLabel}. Công việc không được cộng dồn vào chỉ số kinh doanh của KR.`;
  }
  return `Tiến độ KR được hiển thị theo giá trị hiện tại so với chỉ tiêu, với đơn vị ${unitLabel}. Công việc chỉ phản ánh mức độ thực hiện.`;
};
