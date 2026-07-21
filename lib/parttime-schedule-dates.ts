import { addDays, format, startOfWeek } from "date-fns";

const HANOI_TIME_ZONE = "Asia/Ho_Chi_Minh";
const dateOnlyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: HANOI_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: HANOI_TIME_ZONE,
  dateStyle: "short",
  timeStyle: "short",
});

const displayDateFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: HANOI_TIME_ZONE,
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});

function dateFromYmd(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function hanoiToday(now = new Date()) {
  const parts = dateOnlyFormatter.formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function getMondayOfWeek(value: Date | string = new Date()) {
  const date = typeof value === "string" ? dateFromYmd(value) : dateFromYmd(hanoiToday(value));
  return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function getWeekDates(weekStart: string) {
  const monday = dateFromYmd(getMondayOfWeek(weekStart));
  return Array.from({ length: 7 }, (_, index) => format(addDays(monday, index), "yyyy-MM-dd"));
}

export function formatHanoiDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return displayDateFormatter.format(dateFromYmd(value));
  }
  return dateTimeFormatter.format(new Date(value));
}

export function formatHanoiDateTime(value: string | null | undefined) {
  return value ? dateTimeFormatter.format(new Date(value)) : "Chưa có";
}

export function isBeforeWorkDateInHanoi(workDate: string, now = new Date()) {
  return workDate <= hanoiToday(now);
}

export function isRegistrationClosed(weekStart: string, now = new Date()) {
  const monday = getMondayOfWeek(weekStart);
  const [year, month, day] = monday.split("-").map(Number);
  // 07:00 tại Hà Nội tương ứng 00:00 UTC cùng ngày trong suốt năm.
  return now.getTime() >= Date.UTC(year, month - 1, day, 0, 0, 0);
}

export function getDefaultRegistrationWeek(now = new Date()) {
  const thisMonday = getMondayOfWeek(now);
  return isRegistrationClosed(thisMonday, now) ? nextWeekStart(thisMonday) : thisMonday;
}

export function nextWeekStart(weekStart: string) {
  return format(addDays(dateFromYmd(getMondayOfWeek(weekStart)), 7), "yyyy-MM-dd");
}

export function previousWeekStart(weekStart: string) {
  return format(addDays(dateFromYmd(getMondayOfWeek(weekStart)), -7), "yyyy-MM-dd");
}
