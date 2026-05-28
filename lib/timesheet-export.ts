import {
  buildTimesDeviceFilter,
  collectAttendanceDeviceLinks,
  mergeAttendanceRowsByDate,
  normalizeAttendanceId,
  type AttendanceTimeRow,
} from "@/lib/attendance";
import {
  calculateAttendanceMetrics,
  calculateHalfDayAttendanceMetrics,
  type AttendanceStatus,
} from "@/lib/attendance-metrics";
import {
  getLeaveRequestSubtypeLabel,
  getTimeRequestDisplayLabel,
  getTimeRequestReason,
  getTimeRequestReviewStatus,
  type LeaveRequestSession,
  type LeaveRequestSubtype,
  type TimeRequestType,
} from "@/lib/constants/time-requests";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildHolidayMap, fetchHolidaysInRange, type Holiday } from "@/lib/holidays";
import { supabase } from "@/lib/supabase";
import { canReadTimekeepingData } from "@/lib/timekeeping-access";
import {
  calculateWorkedMinutesBetweenTimestamps,
  formatTimestampToVietnamHHmm,
} from "@/lib/work-time";
import type {
  CalendarDay,
  CorrectionRequest,
  TimesheetExportContext,
  TimesheetExportRow,
  TimesheetRequestDurationSummary,
} from "@/components/timesheet/timesheet-overview";

type TimeRequestReviewerRow = {
  is_approved: boolean | null;
  reviewed_at: string | null;
  created_at: string;
};

type TimeRequestRow = {
  id: string;
  date: string | null;
  type: TimeRequestType | null;
  leave_subtype: LeaveRequestSubtype | null;
  leave_session: LeaveRequestSession | null;
  requested_hours: number | null;
  minutes: number | null;
  reason: string | null;
  created_at: string | null;
  remote_check_in: string | null;
  remote_check_out: string | null;
  time_request_reviewers?: TimeRequestReviewerRow[] | null;
};

type ProfileAttendanceRow = {
  id: string;
  attendance_id: number | null;
  is_timekeeping_enabled: boolean | null;
};

type TimesProfileLinkRow = {
  attendance_id: number | null;
  device_id: number | null;
  created_at?: string | null;
};

type AttendanceStats = TimesheetExportContext["adjustedAttendanceStats"];

const ABSENT_NO_DATA_MISSING_MINUTES = 8 * 60;

function getMonthDateRange(value: Date) {
  const start = new Date(value.getFullYear(), value.getMonth(), 1);
  const end = new Date(value.getFullYear(), value.getMonth() + 1, 1);
  return { start, end };
}

function toIsoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toLocalTimeHHmm(value: string | null | undefined) {
  return formatTimestampToVietnamHHmm(value);
}

function formatDurationLabel(totalMinutes: number) {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

function formatWeekdayVi(isoDate: string) {
  if (!isoDate) {
    return "--";
  }
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat("vi-VN", { weekday: "long" }).format(date);
}

function hasValidRemoteWindow(startValue: string | null, endValue: string | null) {
  if (!startValue || !endValue) {
    return false;
  }

  const startDate = new Date(startValue);
  const endDate = new Date(endValue);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return false;
  }

  return endDate.getTime() > startDate.getTime();
}

function resolveRequestMinutes(item: TimeRequestRow) {
  if (item.type === "remote") {
    return (
      calculateWorkedMinutesBetweenTimestamps(item.remote_check_in, item.remote_check_out) ?? 0
    );
  }

  return typeof item.minutes === "number" && Number.isFinite(item.minutes)
    ? Math.max(0, item.minutes)
    : 0;
}

function toDateOnlyIso(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  return value.slice(0, 10);
}

function toRequestStatus(
  reviewers: TimeRequestReviewerRow[] | null | undefined,
): CorrectionRequest["status"] {
  return getTimeRequestReviewStatus(reviewers);
}

function applyApprovedLeaveRequest(day: CalendarDay, request: CorrectionRequest) {
  if (request.leaveSubtype === "full_day") {
    return {
      ...day,
      status: "ontime" as AttendanceStatus,
      requiredWorkingMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      missingMinutes: 0,
      sourceNote: "Có đơn nghỉ cả ngày được duyệt",
    };
  }

  if (request.leaveSubtype === "half_day") {
    const leaveSession = request.leaveSession ?? "morning";
    const metrics = calculateHalfDayAttendanceMetrics(
      leaveSession,
      day.checkIn && day.checkIn !== "--:--" ? `${request.correctionDateISO}T${day.checkIn}:00` : null,
      day.checkOut && day.checkOut !== "--:--" ? `${request.correctionDateISO}T${day.checkOut}:00` : null,
    );

    return {
      ...day,
      status: metrics.status,
      requiredWorkingMinutes: metrics.requiredWorkingMinutes,
      lateMinutes: metrics.lateMinutes,
      earlyLeaveMinutes: metrics.earlyLeaveMinutes,
      missingMinutes: metrics.missingMinutes,
      overtimeMinutes: 0,
      sourceNote: `Có đơn ${getLeaveRequestSubtypeLabel(
        request.leaveSubtype,
        leaveSession,
      ).toLowerCase()} được duyệt`,
    };
  }

  if (request.leaveSubtype === "early_leave") {
    const currentEarlyLeaveMinutes =
      typeof day.earlyLeaveMinutes === "number" && Number.isFinite(day.earlyLeaveMinutes)
        ? Math.max(0, day.earlyLeaveMinutes)
        : 0;
    const currentLateMinutes =
      typeof day.lateMinutes === "number" && Number.isFinite(day.lateMinutes)
        ? Math.max(0, day.lateMinutes)
        : 0;
    const nextEarlyLeaveMinutes = Math.max(0, currentEarlyLeaveMinutes - request.minutes);
    const nextMissingMinutes = currentLateMinutes + nextEarlyLeaveMinutes;

    return {
      ...day,
      status: nextMissingMinutes === 0 ? ("ontime" as AttendanceStatus) : day.status,
      earlyLeaveMinutes: nextEarlyLeaveMinutes,
      missingMinutes: nextMissingMinutes,
      sourceNote: "Có đơn xin về sớm được duyệt",
    };
  }

  return day;
}

async function loadCorrectionRequests(
  profileId: string,
  selectedMonth: Date,
  supabaseClient: SupabaseClient,
) {
  const { start, end } = getMonthDateRange(selectedMonth);
  const startIso = toIsoDate(start.getFullYear(), start.getMonth() + 1, start.getDate());
  const endIso = toIsoDate(end.getFullYear(), end.getMonth() + 1, end.getDate());

  const { data, error } = await supabaseClient
    .from("time_requests")
    .select(
      "id,date,type,leave_subtype,leave_session,requested_hours,minutes,reason,remote_check_in,remote_check_out,created_at,time_request_reviewers(is_approved,reviewed_at,created_at)",
    )
    .eq("profile_id", profileId)
    .gte("date", startIso)
    .lt("date", endIso)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as TimeRequestRow[]).map((item) => {
    const resolvedMinutes = resolveRequestMinutes(item);

    return {
      id: item.id,
      requestDateISO: toDateOnlyIso(item.created_at),
      correctionDateISO: toDateOnlyIso(item.date),
      type: getTimeRequestDisplayLabel(item.type, {
        leaveSubtype: item.leave_subtype,
        leaveSession: item.leave_session,
      }),
      typeValue: item.type ?? null,
      leaveSubtype: item.leave_subtype ?? null,
      leaveSession: item.leave_session ?? null,
      requestedHours: item.requested_hours ?? null,
      minutes: resolvedMinutes,
      reason: item.reason?.trim()
        ? item.reason.trim()
        : getTimeRequestReason(item.type, resolvedMinutes, {
            leaveSubtype: item.leave_subtype,
            leaveSession: item.leave_session,
            requestedHours: item.requested_hours,
          }),
      status: toRequestStatus(item.time_request_reviewers),
      remoteCheckIn: item.remote_check_in ?? null,
      remoteCheckOut: item.remote_check_out ?? null,
    } satisfies CorrectionRequest;
  });
}

async function loadBaseCalendarDays(
  profileId: string,
  selectedMonth: Date,
  holidays: Holiday[],
  supabaseClient: SupabaseClient,
): Promise<CalendarDay[]> {
  const { start, end } = getMonthDateRange(selectedMonth);
  const startIso = toIsoDate(start.getFullYear(), start.getMonth() + 1, start.getDate());
  const endIso = toIsoDate(end.getFullYear(), end.getMonth() + 1, end.getDate());

  const [
    { data: profileAttendanceData, error: profileAttendanceError },
    { data: attendanceLinkRows, error: attendanceLinkError },
  ] = await Promise.all([
    supabaseClient
      .from("profiles")
      .select("id,attendance_id,is_timekeeping_enabled")
      .eq("id", profileId)
      .maybeSingle(),
    supabaseClient
      .from("times_profiles")
      .select("attendance_id,device_id,created_at")
      .eq("profile_id", profileId),
  ]);

  if (profileAttendanceError) {
    throw profileAttendanceError;
  }
  if (attendanceLinkError) {
    throw attendanceLinkError;
  }

  if (!canReadTimekeepingData(profileAttendanceData as ProfileAttendanceRow | null)) {
    return [];
  }

  const directAttendanceId = normalizeAttendanceId(
    (profileAttendanceData as ProfileAttendanceRow | null)?.attendance_id,
  );
  const linkedDeviceBindings = collectAttendanceDeviceLinks(
    (attendanceLinkRows ?? []) as TimesProfileLinkRow[],
  );
  if (linkedDeviceBindings.length === 0 && directAttendanceId === null) {
    return [];
  }

  let timeQuery = supabaseClient
    .from("times")
    .select("id,attendance_id,device_id,date,check_in,check_out,created_at,updated_at")
    .gte("date", startIso)
    .lt("date", endIso);

  if (linkedDeviceBindings.length > 0) {
    timeQuery = timeQuery.or(buildTimesDeviceFilter(linkedDeviceBindings));
  } else if (directAttendanceId !== null) {
    timeQuery = timeQuery.eq("attendance_id", directAttendanceId);
  }

  const { data, error } = await timeQuery
    .order("date", { ascending: true })
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const typedRows = mergeAttendanceRowsByDate((data ?? []) as AttendanceTimeRow[]);
  const holidayMap = buildHolidayMap(holidays);
  const byDay = new Map<number, CalendarDay>();

  typedRows.forEach((row) => {
    const dateValue = new Date(`${row.date}T00:00:00`);
    if (Number.isNaN(dateValue.getTime())) {
      return;
    }
    const day = dateValue.getDate();
    const isSunday = dateValue.getDay() === 0;
    const holiday = holidayMap.get(row.date) ?? null;

    if (isSunday) {
      byDay.set(day, {
        day,
        dateIso: row.date,
        checkIn: toLocalTimeHHmm(row.check_in),
        checkOut: toLocalTimeHHmm(row.check_out),
        workingMinutes: calculateWorkedMinutesBetweenTimestamps(row.check_in, row.check_out) ?? 0,
        requiredWorkingMinutes: 0,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        missingMinutes: 0,
        overtimeMinutes: 0,
        isHoliday: Boolean(holiday),
        holiday,
        sourceType: "machine",
      });
      return;
    }

    const metrics = calculateAttendanceMetrics(row.date, row.check_in, row.check_out, holidays);
    byDay.set(day, {
      day,
      dateIso: row.date,
      status: metrics.status,
      checkIn: toLocalTimeHHmm(row.check_in),
      checkOut: toLocalTimeHHmm(row.check_out),
      workingMinutes: metrics.workingMinutes,
      requiredWorkingMinutes: metrics.requiredWorkingMinutes,
      lateMinutes: metrics.lateMinutes,
      earlyLeaveMinutes: metrics.earlyLeaveMinutes,
      missingMinutes: metrics.missingMinutes,
      overtimeMinutes: metrics.overtimeMinutes,
      isHoliday: metrics.isHoliday,
      holiday: metrics.holiday,
      sourceType: "machine",
    });
  });

  const totalDaysInMonth = new Date(
    selectedMonth.getFullYear(),
    selectedMonth.getMonth() + 1,
    0,
  ).getDate();
  const now = new Date();
  const selectedMonthKey = selectedMonth.getFullYear() * 12 + selectedMonth.getMonth();
  const currentMonthKey = now.getFullYear() * 12 + now.getMonth();

  let cutoffPastDay = 0;
  if (selectedMonthKey < currentMonthKey) {
    cutoffPastDay = totalDaysInMonth;
  } else if (selectedMonthKey === currentMonthKey) {
    cutoffPastDay = Math.max(0, now.getDate() - 1);
  }

  for (let day = 1; day <= cutoffPastDay; day += 1) {
    if (byDay.has(day)) {
      continue;
    }
    const dateValue = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), day);
    const dateIso = toIsoDate(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, day);
    const isSunday = dateValue.getDay() === 0;
    const holiday = holidayMap.get(dateIso) ?? null;
    if (isSunday) {
      continue;
    }

    if (holiday) {
      byDay.set(day, {
        day,
        dateIso,
        status: "holiday",
        checkIn: "--:--",
        checkOut: "--:--",
        workingMinutes: 0,
        requiredWorkingMinutes: 0,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        missingMinutes: 0,
        overtimeMinutes: 0,
        isHoliday: true,
        holiday,
      });
      continue;
    }

    byDay.set(day, {
      day,
      dateIso,
      status: "missing",
      checkIn: "--:--",
      checkOut: "--:--",
      workingMinutes: 0,
      requiredWorkingMinutes: ABSENT_NO_DATA_MISSING_MINUTES,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      missingMinutes: ABSENT_NO_DATA_MISSING_MINUTES,
      overtimeMinutes: 0,
      isHoliday: false,
      holiday: null,
    });
  }

  return Array.from(byDay.values());
}

function buildAdjustedCalendarDays(
  selectedMonth: Date,
  holidays: Holiday[],
  calendarDays: CalendarDay[],
  correctionRequests: CorrectionRequest[],
) {
  const calendarYear = selectedMonth.getFullYear();
  const calendarMonth = selectedMonth.getMonth() + 1;

  const approvedLeaveRequestsByDate = correctionRequests.reduce<Record<string, CorrectionRequest[]>>(
    (acc, item) => {
      if (
        item.status !== "approved" ||
        item.typeValue !== "approved_leave" ||
        !item.correctionDateISO
      ) {
        return acc;
      }

      if (!acc[item.correctionDateISO]) {
        acc[item.correctionDateISO] = [];
      }

      acc[item.correctionDateISO].push(item);
      return acc;
    },
    {},
  );

  const approvedRemoteRequestByDate = correctionRequests.reduce<Record<string, CorrectionRequest>>(
    (acc, item) => {
      if (
        item.status !== "approved" ||
        item.typeValue !== "remote" ||
        !item.correctionDateISO ||
        !hasValidRemoteWindow(item.remoteCheckIn, item.remoteCheckOut)
      ) {
        return acc;
      }

      if (!acc[item.correctionDateISO]) {
        acc[item.correctionDateISO] = item;
      }

      return acc;
    },
    {},
  );

  const calendarByDay = calendarDays.reduce<Map<number, CalendarDay>>((acc, day) => {
    acc.set(day.day, day);
    return acc;
  }, new Map());

  holidays.forEach((holiday) => {
    const date = new Date(`${holiday.date}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return;
    }

    const day = date.getDate();
    const existingDay = calendarByDay.get(day);
    const existingHasAttendance =
      (existingDay?.checkIn && existingDay.checkIn !== "--:--") ||
      (existingDay?.checkOut && existingDay.checkOut !== "--:--");
    calendarByDay.set(day, {
      ...(existingDay ?? { day }),
      day,
      dateIso: holiday.date,
      status: existingHasAttendance ? "ontime" : ("holiday" as AttendanceStatus),
      checkIn: existingDay?.checkIn ?? "--:--",
      checkOut: existingDay?.checkOut ?? "--:--",
      workingMinutes: existingDay?.workingMinutes ?? 0,
      requiredWorkingMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      missingMinutes: 0,
      overtimeMinutes: existingDay?.overtimeMinutes ?? 0,
      isHoliday: true,
      holiday,
      sourceType: existingDay?.sourceType,
      sourceNote: existingDay?.sourceNote,
    });
  });

  Object.entries(approvedRemoteRequestByDate).forEach(([dateIso, request]) => {
    const date = new Date(`${dateIso}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return;
    }

    const day = date.getDate();
    const metrics = calculateAttendanceMetrics(
      dateIso,
      request.remoteCheckIn,
      request.remoteCheckOut,
      holidays,
    );
    calendarByDay.set(day, {
      ...(calendarByDay.get(day) ?? { day }),
      day,
      dateIso,
      status: metrics.status,
      checkIn: toLocalTimeHHmm(request.remoteCheckIn),
      checkOut: toLocalTimeHHmm(request.remoteCheckOut),
      workingMinutes: metrics.workingMinutes,
      requiredWorkingMinutes: metrics.requiredWorkingMinutes,
      lateMinutes: metrics.lateMinutes,
      earlyLeaveMinutes: metrics.earlyLeaveMinutes,
      missingMinutes: metrics.missingMinutes,
      overtimeMinutes: metrics.overtimeMinutes,
      isHoliday: metrics.isHoliday,
      holiday: metrics.holiday,
      sourceType: "remote",
      sourceNote: "Dữ liệu từ đơn làm việc từ xa",
    });
  });

  return Array.from(calendarByDay.values()).map((day) => {
    const dateIso = day.dateIso ?? toIsoDate(calendarYear, calendarMonth, day.day);
    const approvedLeaveRequests = approvedLeaveRequestsByDate[dateIso] ?? [];
    if (day.isHoliday || approvedLeaveRequests.length === 0) {
      return day;
    }

    return approvedLeaveRequests.reduce((currentDay, request) => {
      return applyApprovedLeaveRequest(currentDay, request);
    }, day);
  });
}

function buildAdjustedAttendanceStats(adjustedCalendarDays: CalendarDay[]): AttendanceStats {
  return adjustedCalendarDays.reduce<AttendanceStats>(
    (acc, day) => {
      if (day.isHoliday) {
        return acc;
      }

      const missingMinutes =
        typeof day.missingMinutes === "number" && Number.isFinite(day.missingMinutes)
          ? Math.max(0, day.missingMinutes)
          : 0;
      const requiredWorkingMinutes =
        typeof day.requiredWorkingMinutes === "number" && Number.isFinite(day.requiredWorkingMinutes)
          ? Math.max(0, day.requiredWorkingMinutes)
          : 0;

      if (requiredWorkingMinutes > 0) {
        acc.requiredWorkDays += 1;
      }

      if (day.status === "missing") {
        acc.absentDays += 1;
      }
      if (day.status === "ontime" || day.status === "late") {
        acc.totalWorkDays += 1;
      }

      acc.missingMinutes += missingMinutes;
      acc.overtimeMinutes +=
        typeof day.overtimeMinutes === "number" && Number.isFinite(day.overtimeMinutes)
          ? Math.max(0, day.overtimeMinutes)
          : 0;
      return acc;
    },
    {
      totalWorkDays: 0,
      requiredWorkDays: 0,
      absentDays: 0,
      missingMinutes: 0,
      overtimeMinutes: 0,
    },
  );
}

function buildRequestDurationSummary(
  correctionRequests: CorrectionRequest[],
  selectedMonth: Date,
  holidayByDate: Map<string, Holiday>,
): TimesheetRequestDurationSummary {
  const selectedYear = selectedMonth.getFullYear();
  const selectedMonthIndex = selectedMonth.getMonth();
  let approvedLeaveMinutes = 0;
  let unauthorizedLeaveMinutes = 0;
  let remoteMinutes = 0;
  let requestedOvertimeMinutes = 0;

  correctionRequests.forEach((item) => {
    if (item.status !== "approved" || !item.correctionDateISO) {
      return;
    }
    const date = new Date(`${item.correctionDateISO}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return;
    }
    if (date.getFullYear() !== selectedYear || date.getMonth() !== selectedMonthIndex) {
      return;
    }
    const isHolidayDate = holidayByDate.has(item.correctionDateISO);

    if (item.typeValue === "approved_leave") {
      if (!isHolidayDate) {
        approvedLeaveMinutes += item.minutes;
      }
      return;
    }
    if (item.typeValue === "unauthorized_leave") {
      if (!isHolidayDate) {
        unauthorizedLeaveMinutes += item.minutes;
      }
      return;
    }
    if (item.typeValue === "remote") {
      remoteMinutes += item.minutes;
      return;
    }
    if (item.typeValue === "overtime") {
      requestedOvertimeMinutes += item.minutes;
    }
  });

  return {
    approvedLeaveMinutes,
    unauthorizedLeaveMinutes,
    remoteMinutes,
    requestedOvertimeMinutes,
  };
}

function buildExportRows(
  adjustedCalendarDays: CalendarDay[],
  correctionRequests: CorrectionRequest[],
  selectedMonth: Date,
  holidays: Holiday[],
): TimesheetExportRow[] {
  const totalDays = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0).getDate();
  const dayMap = adjustedCalendarDays.reduce<Record<number, CalendarDay>>((acc, day) => {
    acc[day.day] = day;
    return acc;
  }, {});
  const requestsByDate = correctionRequests.reduce<Record<string, CorrectionRequest[]>>((acc, item) => {
    if (!item.correctionDateISO) {
      return acc;
    }
    if (!acc[item.correctionDateISO]) {
      acc[item.correctionDateISO] = [];
    }
    acc[item.correctionDateISO].push(item);
    return acc;
  }, {});
  const holidayByDate = buildHolidayMap(holidays);

  return Array.from({ length: totalDays }, (_, index) => {
    const day = index + 1;
    const dateIso = toIsoDate(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, day);
    const date = new Date(`${dateIso}T00:00:00`);
    const isSunday = date.getDay() === 0;
    const meta = dayMap[day];
    const dayRequests = requestsByDate[dateIso] ?? [];
    const holiday = holidayByDate.get(dateIso) ?? null;
    const hasAttendanceData =
      (meta?.checkIn && meta.checkIn !== "--:--") ||
      (meta?.checkOut && meta.checkOut !== "--:--");

    let statusLabel = "Chưa có dữ liệu";
    if (holiday && !hasAttendanceData) {
      statusLabel = "Ngày nghỉ";
    } else if (meta?.sourceType === "remote") {
      statusLabel = "Làm việc từ xa";
    } else if (meta?.status === "ontime") {
      statusLabel = holiday ? "Đúng giờ (Ngày nghỉ)" : "Đúng giờ";
    } else if (meta?.status === "late") {
      statusLabel = holiday ? "Chấm công ngày nghỉ" : "Trễ/Sớm";
    } else if (meta?.status === "missing") {
      statusLabel = "Thiếu công";
    } else if (isSunday) {
      statusLabel = "Chủ nhật";
    }

    const requestSummary = dayRequests
      .map((item) => {
        const durationLabel = item.minutes > 0 ? formatDurationLabel(item.minutes) : "--";
        return `${item.type} | ${item.status} | ${durationLabel} | ${item.reason}`;
      })
      .join(" ; ");

    return {
      dateIso,
      weekday: formatWeekdayVi(dateIso),
      checkIn: meta?.checkIn ?? "--:--",
      checkOut: meta?.checkOut ?? "--:--",
      statusLabel,
      missingHours:
        typeof meta?.missingMinutes === "number" && meta.missingMinutes > 0
          ? formatDurationLabel(meta.missingMinutes)
          : "0h",
      requestCount: dayRequests.length,
      requestSummary,
    };
  });
}

function buildEmptyExportContext(selectedMonth: Date): TimesheetExportContext {
  return {
    selectedMonth: new Date(selectedMonth.getTime()),
    exportRows: [],
    adjustedCalendarDays: [],
    adjustedAttendanceStats: {
      totalWorkDays: 0,
      requiredWorkDays: 0,
      absentDays: 0,
      missingMinutes: 0,
      overtimeMinutes: 0,
    },
    correctionRequests: [],
    requestDurationSummary: {
      approvedLeaveMinutes: 0,
      unauthorizedLeaveMinutes: 0,
      remoteMinutes: 0,
      requestedOvertimeMinutes: 0,
    },
  };
}

export async function loadTimesheetExportContext(
  profileId: string,
  selectedMonth: Date,
  options?: {
    holidaysOverride?: Holiday[];
    supabaseClient?: SupabaseClient;
  },
): Promise<TimesheetExportContext> {
  const supabaseClient = options?.supabaseClient ?? supabase;
  const { data: profileData, error: profileError } = await supabaseClient
    .from("profiles")
    .select("id,is_timekeeping_enabled")
    .eq("id", profileId)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (!profileData || !canReadTimekeepingData(profileData)) {
    return buildEmptyExportContext(selectedMonth);
  }

  const holidays =
    options?.holidaysOverride ??
    (await (async () => {
      const { start, end } = getMonthDateRange(selectedMonth);
      const endInclusive = new Date(end.getFullYear(), end.getMonth(), 0);
      return fetchHolidaysInRange(supabaseClient, start, endInclusive);
    })());

  const [correctionRequests, calendarDays] = await Promise.all([
    loadCorrectionRequests(profileId, selectedMonth, supabaseClient),
    loadBaseCalendarDays(profileId, selectedMonth, holidays, supabaseClient),
  ]);

  const adjustedCalendarDays = buildAdjustedCalendarDays(
    selectedMonth,
    holidays,
    calendarDays,
    correctionRequests,
  );
  const adjustedAttendanceStats = buildAdjustedAttendanceStats(adjustedCalendarDays);
  const holidayByDate = buildHolidayMap(holidays);
  const requestDurationSummary = buildRequestDurationSummary(
    correctionRequests,
    selectedMonth,
    holidayByDate,
  );
  const exportRows = buildExportRows(
    adjustedCalendarDays,
    correctionRequests,
    selectedMonth,
    holidays,
  );

  return {
    selectedMonth: new Date(selectedMonth.getTime()),
    exportRows,
    adjustedCalendarDays,
    adjustedAttendanceStats,
    correctionRequests,
    requestDurationSummary,
  };
}
