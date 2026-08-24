export type TimekeepingReadProfile = {
  is_timekeeping_enabled?: boolean | null;
};

export type TimekeepingCreateProfile = {
  is_active?: boolean | null;
  is_timekeeping_enabled?: boolean | null;
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";
const VIETNAM_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: VIETNAM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const TIMEKEEPING_DISABLED_MESSAGE =
  "Nhân sự này không còn hoạt động hoặc không được bật tính công.";
export const TIME_REQUEST_BACKDATE_LIMIT_DAYS = 7;
export const TIME_REQUEST_DATE_WINDOW_MESSAGE =
  "Chỉ có thể tạo yêu cầu từ 7 ngày trước đến các ngày sau đó.";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateToIsoDate(value: Date) {
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
}

function shiftIsoDateByDays(isoDate: string, days: number) {
  const [yearToken, monthToken, dayToken] = isoDate.split("-");
  const year = Number(yearToken);
  const month = Number(monthToken);
  const day = Number(dayToken);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const shiftedDate = new Date(Date.UTC(year, month - 1, day));
  shiftedDate.setUTCDate(shiftedDate.getUTCDate() + days);

  return `${shiftedDate.getUTCFullYear()}-${pad2(shiftedDate.getUTCMonth() + 1)}-${pad2(
    shiftedDate.getUTCDate(),
  )}`;
}

function normalizeDateOnlyValue(value: string | Date) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return formatDateToIsoDate(value);
  }

  const normalizedValue = value.trim();
  return DATE_ONLY_PATTERN.test(normalizedValue) ? normalizedValue : null;
}

export function getVietnamTodayIsoDate(now = new Date()) {
  const yearPart = VIETNAM_DATE_FORMATTER.formatToParts(now).find((part) => part.type === "year");
  const monthPart = VIETNAM_DATE_FORMATTER
    .formatToParts(now)
    .find((part) => part.type === "month");
  const dayPart = VIETNAM_DATE_FORMATTER.formatToParts(now).find((part) => part.type === "day");

  if (!yearPart || !monthPart || !dayPart) {
    return formatDateToIsoDate(now);
  }

  return `${yearPart.value}-${monthPart.value}-${dayPart.value}`;
}

export function getEarliestAllowedTimeRequestDateIso(now = new Date()) {
  return shiftIsoDateByDays(getVietnamTodayIsoDate(now), -TIME_REQUEST_BACKDATE_LIMIT_DAYS);
}

export function isTimeRequestDateTooFarInPast(value: string | Date, now = new Date()) {
  const normalizedValue = normalizeDateOnlyValue(value);
  const earliestAllowedDate = getEarliestAllowedTimeRequestDateIso(now);

  if (!normalizedValue || !earliestAllowedDate) {
    return false;
  }

  return normalizedValue < earliestAllowedDate;
}

export function canReadTimekeepingData(profile?: TimekeepingReadProfile | null) {
  return profile?.is_timekeeping_enabled === true;
}

export function canCreateTimeRequest(profile?: TimekeepingCreateProfile | null) {
  return profile?.is_active === true && profile?.is_timekeeping_enabled === true;
}
