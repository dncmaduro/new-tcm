import { getHoliday, type Holiday } from "@/lib/holidays";
import {
  overlapMinutes,
  REQUIRED_WORK_MINUTES,
  calculateWorkedMinutesBetweenTimestamps,
  toMinutesFromTimestamp,
} from "@/lib/work-time";
import type { LeaveRequestSession } from "@/lib/constants/time-requests";

export type AttendanceStatus = "ontime" | "late" | "missing" | "holiday";

export type AttendanceDayMetrics = {
  status: AttendanceStatus;
  isHoliday: boolean;
  holiday: Holiday | null;
  workingMinutes: number;
  requiredWorkingMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  missingMinutes: number;
  overtimeMinutes: number;
};

export const WORK_START_MINUTES = 8 * 60;
export const MORNING_END_MINUTES = 12 * 60;
export const AFTERNOON_START_MINUTES = 13 * 60 + 30;
export const WORK_END_MINUTES = 17 * 60 + 30;
export const HALF_DAY_WORK_MINUTES = 4 * 60;

export function calculateAttendanceMetrics(
  date: Date | string,
  checkIn: string | null,
  checkOut: string | null,
  holidays: Holiday[],
): AttendanceDayMetrics {
  const holiday = getHoliday(date, holidays);
  const workedMinutes = calculateWorkedMinutesBetweenTimestamps(checkIn, checkOut) ?? 0;

  if (holiday) {
    return {
      status: checkIn || checkOut ? "ontime" : "holiday",
      isHoliday: true,
      holiday,
      workingMinutes: workedMinutes,
      requiredWorkingMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      missingMinutes: 0,
      overtimeMinutes: 0,
    };
  }

  if (!checkIn || !checkOut) {
    return {
      status: "missing",
      isHoliday: false,
      holiday: null,
      workingMinutes: workedMinutes,
      requiredWorkingMinutes: REQUIRED_WORK_MINUTES,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      missingMinutes: REQUIRED_WORK_MINUTES,
      overtimeMinutes: 0,
    };
  }

  const checkInMinutes = toMinutesFromTimestamp(checkIn);
  const checkOutMinutes = toMinutesFromTimestamp(checkOut);
  if (checkInMinutes === null || checkOutMinutes === null || checkOutMinutes <= checkInMinutes) {
    return {
      status: "missing",
      isHoliday: false,
      holiday: null,
      workingMinutes: workedMinutes,
      requiredWorkingMinutes: REQUIRED_WORK_MINUTES,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      missingMinutes: REQUIRED_WORK_MINUTES,
      overtimeMinutes: 0,
    };
  }

  const lateMinutes = Math.max(0, checkInMinutes - WORK_START_MINUTES);
  const earlyLeaveMinutes = Math.max(0, WORK_END_MINUTES - checkOutMinutes);
  const missingMinutes = lateMinutes + earlyLeaveMinutes;
  const overtimeMinutes = Math.max(0, workedMinutes - REQUIRED_WORK_MINUTES);

  return {
    status: lateMinutes > 0 || earlyLeaveMinutes > 0 || missingMinutes > 0 ? "late" : "ontime",
    isHoliday: false,
    holiday: null,
    workingMinutes: workedMinutes,
    requiredWorkingMinutes: REQUIRED_WORK_MINUTES,
    lateMinutes,
    earlyLeaveMinutes,
    missingMinutes,
    overtimeMinutes,
  };
}

export function calculateHalfDayAttendanceMetrics(
  session: LeaveRequestSession,
  checkIn: string | null,
  checkOut: string | null,
) {
  const sessionStartMinutes =
    session === "morning" ? WORK_START_MINUTES : AFTERNOON_START_MINUTES;
  const sessionEndMinutes =
    session === "morning" ? MORNING_END_MINUTES : WORK_END_MINUTES;
  const requiredWorkingMinutes = HALF_DAY_WORK_MINUTES;
  const workedMinutes = calculateWorkedMinutesBetweenTimestamps(checkIn, checkOut) ?? 0;

  if (!checkIn || !checkOut) {
    return {
      status: "missing" as const,
      workingMinutes: workedMinutes,
      requiredWorkingMinutes,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      missingMinutes: requiredWorkingMinutes,
      overtimeMinutes: 0,
    };
  }

  const checkInMinutes = toMinutesFromTimestamp(checkIn);
  const checkOutMinutes = toMinutesFromTimestamp(checkOut);
  if (checkInMinutes === null || checkOutMinutes === null || checkOutMinutes <= checkInMinutes) {
    return {
      status: "missing" as const,
      workingMinutes: workedMinutes,
      requiredWorkingMinutes,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      missingMinutes: requiredWorkingMinutes,
      overtimeMinutes: 0,
    };
  }

  const workedSessionMinutes = overlapMinutes(
    checkInMinutes,
    checkOutMinutes,
    sessionStartMinutes,
    sessionEndMinutes,
  );

  if (workedSessionMinutes <= 0) {
    return {
      status: "missing" as const,
      workingMinutes: workedMinutes,
      requiredWorkingMinutes,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      missingMinutes: requiredWorkingMinutes,
      overtimeMinutes: 0,
    };
  }

  const clampedStartMinutes = Math.max(sessionStartMinutes, Math.min(checkInMinutes, sessionEndMinutes));
  const clampedEndMinutes = Math.max(sessionStartMinutes, Math.min(checkOutMinutes, sessionEndMinutes));
  const lateMinutes = Math.max(0, clampedStartMinutes - sessionStartMinutes);
  const earlyLeaveMinutes = Math.max(0, sessionEndMinutes - clampedEndMinutes);
  const missingMinutes = Math.max(0, requiredWorkingMinutes - workedSessionMinutes);

  return {
    status: missingMinutes > 0 ? ("late" as const) : ("ontime" as const),
    workingMinutes: workedMinutes,
    requiredWorkingMinutes,
    lateMinutes,
    earlyLeaveMinutes,
    missingMinutes,
    overtimeMinutes: 0,
  };
}
