import { getHoliday, type Holiday } from "@/lib/holidays";
import {
  REQUIRED_WORK_MINUTES,
  calculateWorkedMinutesBetweenTimestamps,
  toMinutesFromTimestamp,
} from "@/lib/work-time";

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

export const FLEXIBLE_START_END_MINUTES = 8 * 60 + 10;
export const WORK_END_MINUTES = 17 * 60 + 30;

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

  const lateMinutes = Math.max(0, checkInMinutes - FLEXIBLE_START_END_MINUTES);
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
