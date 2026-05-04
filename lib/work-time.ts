export const BREAK_START_MINUTES = 12 * 60;
export const BREAK_END_MINUTES = 13 * 60 + 30;
export const REQUIRED_WORK_MINUTES = 8 * 60;

export function toMinutesFromTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.getHours() * 60 + date.getMinutes();
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
