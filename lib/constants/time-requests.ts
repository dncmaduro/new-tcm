export const TIME_REQUEST_TYPES = [
  {
    value: "approved_leave",
    label: "Nghỉ có phép / thiếu công có phép",
    description: "Dùng cho nghỉ, về sớm hoặc đi muộn có phép.",
  },
  {
    value: "unauthorized_leave",
    label: "Nghỉ không phép / thiếu công không phép",
    description: "Dùng cho nghỉ, về sớm hoặc đi muộn không phép.",
  },
  {
    value: "overtime",
    label: "Tăng ca",
    description: "Dùng cho thời gian làm thêm ngoài giờ.",
  },
  {
    value: "remote",
    label: "Làm việc từ xa",
    description: "Dùng cho ngày hoặc khoảng thời gian làm việc từ xa.",
  },
] as const;

export type TimeRequestType = (typeof TIME_REQUEST_TYPES)[number]["value"];

export function getTimeRequestTypeLabel(type: TimeRequestType | null | undefined) {
  return TIME_REQUEST_TYPES.find((item) => item.value === type)?.label ?? "Khác";
}

export function getTimeRequestTypeDescription(type: TimeRequestType | null | undefined) {
  return TIME_REQUEST_TYPES.find((item) => item.value === type)?.description ?? "Yêu cầu điều chỉnh thời gian làm việc.";
}

export function isMissingTimeRequestType(type: TimeRequestType | null | undefined) {
  return type === "approved_leave" || type === "unauthorized_leave";
}

export function roundLeaveMinutesUp(minutes: number | null | undefined) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) {
    return 0;
  }

  return Math.ceil(minutes / 60) * 60;
}

export function getTimeRequestReason(type: TimeRequestType | null | undefined, minutes: number | null | undefined) {
  const safeMinutes = typeof minutes === "number" && Number.isFinite(minutes) ? Math.max(0, minutes) : 0;

  if (type === "approved_leave") {
    return `Xin thiếu thời gian có phép ${safeMinutes} phút.`;
  }
  if (type === "unauthorized_leave") {
    return `Xin ghi nhận thiếu thời gian không phép ${safeMinutes} phút.`;
  }
  if (type === "overtime") {
    return `Điều chỉnh tăng ca ${safeMinutes} phút.`;
  }
  if (type === "remote") {
    return safeMinutes > 0
      ? `Đăng ký làm việc từ xa ${safeMinutes} phút.`
      : "Đăng ký làm việc từ xa.";
  }

  return "Yêu cầu điều chỉnh thời gian làm việc.";
}
