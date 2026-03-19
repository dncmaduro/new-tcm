export const KEY_RESULT_UNITS = [
  { value: "percent", label: "Phần trăm" },
  { value: "currency", label: "Doanh thu" },
  { value: "count", label: "Số lượng" },
] as const;

export type KeyResultUnitValue = (typeof KEY_RESULT_UNITS)[number]["value"];

export const keyResultUnitLabelMap = KEY_RESULT_UNITS.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

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
  if (unit === "percent") {
    return "Tiến độ KR = trung bình có trọng số của các task thuộc KR. Unit phần trăm chỉ dùng để hiển thị chỉ số.";
  }
  if (unit === "currency") {
    return "Tiến độ KR = trung bình có trọng số của các task thuộc KR. Unit doanh thu dùng để hiển thị giá trị theo tiền.";
  }
  return "Tiến độ KR = trung bình có trọng số của các task thuộc KR. Unit số lượng chỉ dùng để hiển thị chỉ số.";
};
