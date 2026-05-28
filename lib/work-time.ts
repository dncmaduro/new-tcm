export const BREAK_START_MINUTES = 12 * 60;
export const BREAK_END_MINUTES = 13 * 60 + 30;
export const REQUIRED_WORK_MINUTES = 8 * 60;
const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";
const TIME_PARTS_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: VIETNAM_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function getVietnamTimeParts(date: Date) {
  const hourPart = TIME_PARTS_FORMATTER.formatToParts(date).find((part) => part.type === "hour");
  const minutePart = TIME_PARTS_FORMATTER
    .formatToParts(date)
    .find((part) => part.type === "minute");

  if (!hourPart || !minutePart) {
    return null;
  }

  const hours = Number(hourPart.value);
  const minutes = Number(minutePart.value);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return { hours, minutes };
}

export function formatTimestampToVietnamHHmm(value: string | null | undefined) {
  if (!value) {
    return "--:--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  const parts = getVietnamTimeParts(date);
  if (!parts) {
    return "--:--";
  }

  return `${String(parts.hours).padStart(2, "0")}:${String(parts.minutes).padStart(2, "0")}`;
}

export function toMinutesFromTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = getVietnamTimeParts(date);
  if (!parts) {
    return null;
  }

  return parts.hours * 60 + parts.minutes;
}

export function overlapMinutes(
  startMinutes: number,
  endMinutes: number,
  windowStartMinutes: number,
  windowEndMinutes: number,
) {
  const overlapStart = Math.max(startMinutes, windowStartMinutes);
  const overlapEnd = Math.min(endMinutes, windowEndMinutes);
  return Math.max(0, overlapEnd - overlapStart);
}

export function workedMinutesExcludingBreak(startMinutes: number, endMinutes: number) {
  if (endMinutes <= startMinutes) {
    return 0;
  }

  const rawWorkedMinutes = endMinutes - startMinutes;
  const breakMinutes = overlapMinutes(
    startMinutes,
    endMinutes,
    BREAK_START_MINUTES,
    BREAK_END_MINUTES,
  );

  return Math.max(0, rawWorkedMinutes - breakMinutes);
}

export function calculateWorkedMinutesBetweenTimestamps(
  startTimestamp: string | null | undefined,
  endTimestamp: string | null | undefined,
) {
  const startMinutes = toMinutesFromTimestamp(startTimestamp);
  const endMinutes = toMinutesFromTimestamp(endTimestamp);

  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return null;
  }

  return workedMinutesExcludingBreak(startMinutes, endMinutes);
}
