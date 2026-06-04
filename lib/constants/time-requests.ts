export const TIME_REQUEST_TYPES = [
  {
    value: "approved_leave",
    label: "Nghỉ có phép / thiếu công có phép",
  },
  {
    value: "unauthorized_leave",
    label: "Nghỉ không phép / thiếu công không phép",
  },
  {
    value: "overtime",
    label: "Tăng ca",
  },
  {
    value: "remote",
    label: "Làm việc từ xa",
  },
] as const;

export type TimeRequestType = (typeof TIME_REQUEST_TYPES)[number]["value"];
export type LeaveRequestSubtype = "half_day" | "full_day" | "early_leave";
export type LeaveRequestSession = "morning" | "afternoon";
export type TimeRequestReviewStatus = "pending" | "approved" | "rejected";
export const EARLY_LEAVE_FIXED_CHECKOUT_TIME = "17:30";
export const EARLY_LEAVE_MAX_MINUTES = 4 * 60;

export const LEAVE_REQUEST_SUBTYPES: Array<{
  value: LeaveRequestSubtype;
  label: string;
}> = [
  {
    value: "half_day",
    label: "Nghỉ buổi sáng",
  },
  {
    value: "full_day",
    label: "Nghỉ cả ngày",
  },
  {
    value: "early_leave",
    label: "Xin về sớm",
  },
];

export const LEAVE_REQUEST_SESSIONS: Array<{
  value: LeaveRequestSession;
  label: string;
}> = [
  {
    value: "morning",
    label: "Buổi sáng",
  },
  {
    value: "afternoon",
    label: "Buổi chiều",
  },
];

export function getTimeRequestTypeLabel(type: TimeRequestType | null | undefined) {
  return TIME_REQUEST_TYPES.find((item) => item.value === type)?.label ?? "Khác";
}

export function isMissingTimeRequestType(type: TimeRequestType | null | undefined) {
  return type === "approved_leave" || type === "unauthorized_leave";
}

export function isLeaveRequestSubtype(value: unknown): value is LeaveRequestSubtype {
  return value === "half_day" || value === "full_day" || value === "early_leave";
}

export function isLeaveRequestSession(value: unknown): value is LeaveRequestSession {
  return value === "morning" || value === "afternoon";
}

export function getLeaveRequestSubtypeLabel(
  subtype: LeaveRequestSubtype | null | undefined,
  session?: LeaveRequestSession | null,
) {
  if (subtype === "half_day") {
    if (session === "afternoon") {
      return "Nghỉ buổi chiều";
    }
    if (session === "morning" || !session) {
      return "Nghỉ buổi sáng";
    }
  }

  if (subtype === "full_day") {
    return "Nghỉ cả ngày";
  }

  if (subtype === "early_leave") {
    return "Xin về sớm";
  }

  return "Khác";
}

function parseTimeValueToMinutes(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalizedValue = value.trim();
  const match = normalizedValue.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatMinutesToTimeValue(totalMinutes: number) {
  const normalizedMinutes = Math.max(0, Math.trunc(totalMinutes));
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function getEarlyLeaveMinutesFromTimeValue(value: string | null | undefined) {
  const checkoutMinutes = parseTimeValueToMinutes(EARLY_LEAVE_FIXED_CHECKOUT_TIME);
  const selectedMinutes = parseTimeValueToMinutes(value);

  if (checkoutMinutes === null || selectedMinutes === null) {
    return null;
  }

  const diffMinutes = checkoutMinutes - selectedMinutes;
  if (diffMinutes <= 0 || diffMinutes > EARLY_LEAVE_MAX_MINUTES) {
    return null;
  }

  return diffMinutes;
}

export function getEarlyLeaveTimeValueFromMinutes(minutes: number | null | undefined) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }

  const checkoutMinutes = parseTimeValueToMinutes(EARLY_LEAVE_FIXED_CHECKOUT_TIME);
  if (checkoutMinutes === null) {
    return null;
  }

  const selectedMinutes = checkoutMinutes - Math.round(minutes);
  if (selectedMinutes < 0) {
    return null;
  }

  return formatMinutesToTimeValue(selectedMinutes);
}

export function getEarlyLeaveHoursFromMinutes(minutes: number | null | undefined) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) {
    return 0;
  }

  return minutes / 60;
}

export function getLeaveRequestSubtypeDetailLabel(
  subtype: LeaveRequestSubtype | null | undefined,
  session?: LeaveRequestSession | null,
  options?: {
    minutes?: number | null;
  },
) {
  if (subtype === "early_leave") {
    const earlyLeaveTime = getEarlyLeaveTimeValueFromMinutes(options?.minutes);
    return earlyLeaveTime ? `Xin về sớm lúc ${earlyLeaveTime}` : "Xin về sớm";
  }

  return getLeaveRequestSubtypeLabel(subtype, session);
}

export function getLeaveRequestDurationMinutes(
  subtype: LeaveRequestSubtype | null | undefined,
  requestedHours?: number | null,
) {
  if (subtype === "full_day") {
    return 8 * 60;
  }

  if (subtype === "half_day") {
    return 4 * 60;
  }

  if (
    subtype === "early_leave" &&
    typeof requestedHours === "number" &&
    Number.isFinite(requestedHours) &&
    requestedHours > 0
  ) {
    return requestedHours * 60;
  }

  return 0;
}

export function getLeaveRequestHours(
  subtype: LeaveRequestSubtype | null | undefined,
  requestedHours?: number | null,
) {
  return getLeaveRequestDurationMinutes(subtype, requestedHours) / 60;
}

export function getTimeRequestDisplayLabel(
  type: TimeRequestType | null | undefined,
  options?: {
    leaveSubtype?: LeaveRequestSubtype | null;
    leaveSession?: LeaveRequestSession | null;
  },
) {
  if (!isMissingTimeRequestType(type)) {
    return getTimeRequestTypeLabel(type);
  }

  if (!options?.leaveSubtype) {
    return getTimeRequestTypeLabel(type);
  }

  const subtypeLabel = getLeaveRequestSubtypeLabel(
    options?.leaveSubtype,
    options?.leaveSession ?? null,
  );

  if (type === "approved_leave") {
    return `${subtypeLabel} có phép`;
  }

  if (type === "unauthorized_leave") {
    return `${subtypeLabel} không phép`;
  }

  return getTimeRequestTypeLabel(type);
}

export function roundLeaveMinutesUp(minutes: number | null | undefined) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) {
    return 0;
  }

  return Math.ceil(minutes / 60) * 60;
}

export function getTimeRequestReason(
  type: TimeRequestType | null | undefined,
  minutes: number | null | undefined,
  options?: {
    leaveSubtype?: LeaveRequestSubtype | null;
    leaveSession?: LeaveRequestSession | null;
    requestedHours?: number | null;
  },
) {
  const safeMinutes = typeof minutes === "number" && Number.isFinite(minutes) ? Math.max(0, minutes) : 0;

  if (type === "approved_leave") {
    if (!options?.leaveSubtype) {
      return `Xin thiếu thời gian có phép ${safeMinutes} phút.`;
    }
    if (options.leaveSubtype === "early_leave") {
      const earlyLeaveTime = getEarlyLeaveTimeValueFromMinutes(safeMinutes);
      return earlyLeaveTime
        ? `Xin về sớm có phép lúc ${earlyLeaveTime}.`
        : `Xin về sớm có phép ${safeMinutes} phút.`;
    }
    const subtypeLabel = getLeaveRequestSubtypeLabel(options?.leaveSubtype, options?.leaveSession ?? null).toLowerCase();
    return `Xin ${subtypeLabel} có phép ${safeMinutes} phút.`;
  }
  if (type === "unauthorized_leave") {
    if (!options?.leaveSubtype) {
      return `Xin ghi nhận thiếu thời gian không phép ${safeMinutes} phút.`;
    }
    if (options.leaveSubtype === "early_leave") {
      const earlyLeaveTime = getEarlyLeaveTimeValueFromMinutes(safeMinutes);
      return earlyLeaveTime
        ? `Xin ghi nhận về sớm không phép lúc ${earlyLeaveTime}.`
        : `Xin ghi nhận về sớm không phép ${safeMinutes} phút.`;
    }
    const subtypeLabel = getLeaveRequestSubtypeLabel(options?.leaveSubtype, options?.leaveSession ?? null).toLowerCase();
    return `Xin ghi nhận ${subtypeLabel} không phép ${safeMinutes} phút.`;
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

export function getTimeRequestReviewStatus(
  reviewers: Array<{ is_approved: boolean | null }> | null | undefined,
): TimeRequestReviewStatus {
  if (!reviewers || reviewers.length === 0) {
    return "pending";
  }

  if (reviewers.some((item) => item.is_approved === false)) {
    return "rejected";
  }

  if (reviewers.some((item) => item.is_approved === true)) {
    return "approved";
  }

  return "pending";
}
