"use client";

import Link from "next/link";
import { ActionIcon, Tooltip } from "@mantine/core";
import { FileText, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  getLeaveRequestSubtypeLabel,
  getLeaveRequestSubtypeDetailLabel,
  getTimeRequestDisplayLabel,
  getTimeRequestReason,
  getTimeRequestReviewStatus,
  type LeaveRequestSession,
  type LeaveRequestSubtype,
  type TimeRequestReviewStatus,
  type TimeRequestType,
} from "@/lib/constants/time-requests";
import {
  buildTimesDeviceFilter,
  collectAttendanceDeviceLinks,
  collectAttendanceIds,
  mergeAttendanceRowsByDate,
  normalizeAttendanceId,
  type AttendanceDeviceLink,
  type AttendanceTimeRow,
} from "@/lib/attendance";
import {
  calculateAttendanceMetrics,
  calculateHalfDayAttendanceMetrics,
  type AttendanceStatus,
} from "@/lib/attendance-metrics";
import { formatDateDdMmYyyy } from "@/lib/date-format";
import { buildHolidayMap, fetchHolidaysInRange, type Holiday } from "@/lib/holidays";
import { supabase } from "@/lib/supabase";
import {
  canReadTimekeepingData as canReadTimekeepingProfileData,
  getEarliestAllowedTimeRequestDateIso,
} from "@/lib/timekeeping-access";
import { calculateWorkedMinutesBetweenTimestamps } from "@/lib/work-time";

export type CalendarDay = {
  day: number;
  status?: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  dateIso?: string;
  workingMinutes?: number;
  requiredWorkingMinutes?: number;
  lateMinutes?: number;
  earlyLeaveMinutes?: number;
  missingMinutes?: number;
  overtimeMinutes?: number;
  isHoliday?: boolean;
  holiday?: Holiday | null;
  sourceType?: "machine" | "remote";
  sourceNote?: string;
};

export type CorrectionRequest = {
  id: string;
  requestDateISO: string;
  correctionDateISO: string;
  type: string;
  typeValue: TimeRequestType | null;
  leaveSubtype: LeaveRequestSubtype | null;
  leaveSession: LeaveRequestSession | null;
  requestedHours: number | null;
  minutes: number;
  reason: string;
  status: TimeRequestReviewStatus;
  remoteCheckIn: string | null;
  remoteCheckOut: string | null;
};

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
  is_timekeeping_enabled?: boolean | null;
};

type TimesProfileLinkRow = {
  attendance_id: number | null;
  device_id: number | null;
  created_at?: string | null;
};

export type AttendanceStats = {
  totalWorkDays: number;
  requiredWorkDays: number;
  absentDays: number;
  missingMinutes: number;
  overtimeMinutes: number;
};

type AttendanceBinding = {
  directAttendanceId: number | null;
  attendanceIds: number[];
  linkedAttendanceIds: number[];
  linkedDeviceBindings: AttendanceDeviceLink[];
};

export type TimesheetRequestDurationSummary = {
  approvedLeaveMinutes: number;
  unauthorizedLeaveMinutes: number;
  remoteMinutes: number;
  requestedOvertimeMinutes: number;
};

export type TimesheetExportRow = {
  dateIso: string;
  weekday: string;
  checkIn: string;
  checkOut: string;
  statusLabel: string;
  missingHours: string;
  requestCount: number;
  requestSummary: string;
};

export type TimesheetExportContext = {
  selectedMonth: Date;
  exportRows: TimesheetExportRow[];
  adjustedCalendarDays: CalendarDay[];
  adjustedAttendanceStats: AttendanceStats;
  correctionRequests: CorrectionRequest[];
  requestDurationSummary: TimesheetRequestDurationSummary;
};

type TimesheetOverviewProps = {
  profileId: string | null;
  isProfileLoading?: boolean;
  profileError?: string | null;
  canReadTimekeepingData?: boolean;
  createRequestHref?: string | null;
  showExportButton?: boolean;
  exportFileLabel?: string | null;
  exportButtonLabel?: string;
  selectedMonth?: Date;
  onSelectedMonthChange?: (value: Date) => void;
  onExportRequest?: (selectedMonth: Date) => Promise<void> | void;
  onExport?: (context: TimesheetExportContext) => Promise<void> | void;
};

const weekDayLabels = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
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
  if (!value) {
    return "--:--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatMonthLabel(value: Date) {
  return `Tháng ${String(value.getMonth() + 1).padStart(2, "0")}/${value.getFullYear()}`;
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

function formatDateVi(isoDate: string) {
  return formatDateDdMmYyyy(isoDate, "--", "--");
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

function appendQueryParams(
  href: string,
  params: Record<string, string | null | undefined>,
) {
  const [pathname, queryString = ""] = href.split("?");
  const searchParams = new URLSearchParams(queryString);

  Object.entries(params).forEach(([key, value]) => {
    if (!value) {
      searchParams.delete(key);
      return;
    }
    searchParams.set(key, value);
  });

  const nextQuery = searchParams.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
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
      sourceNote: `Có đơn ${getLeaveRequestSubtypeDetailLabel("early_leave", null, {
        minutes: request.minutes,
      }).toLowerCase()} được duyệt`,
    };
  }

  return day;
}

function escapeCsvValue(value: string | number | null | undefined) {
  const normalized = value == null ? "" : String(value);
  const escaped = normalized.replace(/"/g, '""');
  return `"${escaped}"`;
}

function sanitizeFileSegment(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
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

function RequestStatus({ status }: { status: CorrectionRequest["status"] }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Đã duyệt
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        Từ chối
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Chờ duyệt
    </span>
  );
}

export function TimesheetOverview({
  profileId,
  isProfileLoading = false,
  profileError = null,
  canReadTimekeepingData = true,
  createRequestHref = null,
  showExportButton = false,
  exportFileLabel = null,
  exportButtonLabel = "Xuất CSV",
  selectedMonth: selectedMonthProp,
  onSelectedMonthChange,
  onExportRequest,
  onExport,
}: TimesheetOverviewProps) {
  const [internalSelectedMonth, setInternalSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const selectedMonth = selectedMonthProp ?? internalSelectedMonth;
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState<boolean>(false);
  const [attendanceError, setAttendanceError] = useState<string>("");
  const [attendanceBinding, setAttendanceBinding] = useState<AttendanceBinding | null>(null);
  const [correctionRequests, setCorrectionRequests] = useState<CorrectionRequest[]>([]);
  const [openedFormDateIso, setOpenedFormDateIso] = useState<string | null>(null);
  const [openedMobileDateIso, setOpenedMobileDateIso] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const setSelectedMonth = (value: Date | ((current: Date) => Date)) => {
    const resolvedValue =
      typeof value === "function" ? value(new Date(selectedMonth.getTime())) : value;
    const normalizedValue = new Date(
      resolvedValue.getFullYear(),
      resolvedValue.getMonth(),
      1,
    );

    if (!selectedMonthProp) {
      setInternalSelectedMonth(normalizedValue);
    }
    onSelectedMonthChange?.(normalizedValue);
  };

  useEffect(() => {
    setOpenedFormDateIso(null);
    setOpenedMobileDateIso(null);
  }, [profileId]);

  useEffect(() => {
    let isActive = true;

    const loadHolidays = async () => {
      const { start, end } = getMonthDateRange(selectedMonth);
      const endInclusive = new Date(end.getFullYear(), end.getMonth(), 0);
      const data = await fetchHolidaysInRange(supabase, start, endInclusive);

      if (!isActive) {
        return;
      }

      setHolidays(data);
    };

    void loadHolidays();

    return () => {
      isActive = false;
    };
  }, [selectedMonth]);

  useEffect(() => {
    if (!profileId || !canReadTimekeepingData) {
      setCorrectionRequests([]);
      return;
    }

    let isActive = true;

    const loadCorrectionRequests = async () => {
      try {
        const { start, end } = getMonthDateRange(selectedMonth);
        const startIso = toIsoDate(start.getFullYear(), start.getMonth() + 1, start.getDate());
        const endIso = toIsoDate(end.getFullYear(), end.getMonth() + 1, end.getDate());

        const { data, error } = await supabase
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

        if (!isActive) {
          return;
        }

        const mapped = ((data ?? []) as TimeRequestRow[]).map((item) => {
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
          };
        });

        setCorrectionRequests(mapped);
      } catch {
        if (!isActive) {
          return;
        }
        setCorrectionRequests([]);
      }
    };

    void loadCorrectionRequests();

    return () => {
      isActive = false;
    };
  }, [canReadTimekeepingData, profileError, profileId, selectedMonth]);

  useEffect(() => {
    if (!profileId || !canReadTimekeepingData) {
      setIsLoadingAttendance(false);
      setAttendanceError(!profileId ? profileError ?? "" : "");
      setAttendanceBinding(null);
      setCalendarDays([]);
      return;
    }

    let isActive = true;

    const loadAttendance = async () => {
      setIsLoadingAttendance(true);
      setAttendanceError("");

      try {
        const { start, end } = getMonthDateRange(selectedMonth);
        const startIso = toIsoDate(start.getFullYear(), start.getMonth() + 1, start.getDate());
        const endIso = toIsoDate(end.getFullYear(), end.getMonth() + 1, end.getDate());

        const [
          { data: profileAttendanceData, error: profileAttendanceError },
          { data: attendanceLinkRows, error: attendanceLinkError },
        ] = await Promise.all([
          supabase
            .from("profiles")
            .select("id,attendance_id,is_timekeeping_enabled")
            .eq("id", profileId)
            .maybeSingle(),
          supabase
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

        if (
          !canReadTimekeepingProfileData(profileAttendanceData as ProfileAttendanceRow | null)
        ) {
          if (!isActive) {
            return;
          }

          setAttendanceError("");
          setAttendanceBinding(null);
          setCalendarDays([]);
          return;
        }

        const directAttendanceId = normalizeAttendanceId(
          (profileAttendanceData as ProfileAttendanceRow | null)?.attendance_id,
        );
        const linkedDeviceBindings = collectAttendanceDeviceLinks(
          (attendanceLinkRows ?? []) as TimesProfileLinkRow[],
        );
        const linkedAttendanceIds = collectAttendanceIds(
          (attendanceLinkRows ?? []) as TimesProfileLinkRow[],
        );
        const attendanceIds = collectAttendanceIds([
          directAttendanceId,
          ...((attendanceLinkRows ?? []) as TimesProfileLinkRow[]),
        ]);

        if (!isActive) {
          return;
        }

        setAttendanceBinding({
          directAttendanceId,
          attendanceIds,
          linkedAttendanceIds,
          linkedDeviceBindings,
        });

        if (linkedDeviceBindings.length === 0 && directAttendanceId === null) {
          setAttendanceError("");
          setCalendarDays([]);
          return;
        }

        let timeQuery = supabase
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

        if (!isActive) {
          return;
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
              workingMinutes:
                calculateWorkedMinutesBetweenTimestamps(row.check_in, row.check_out) ?? 0,
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

          const metrics = calculateAttendanceMetrics(
            row.date,
            row.check_in,
            row.check_out,
            holidays,
          );
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
            overtimeMinutes: 0,
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

        setCalendarDays(Array.from(byDay.values()));
      } catch (error) {
        if (!isActive) {
          return;
        }
        const message = error instanceof Error ? error.message : "Không thể tải dữ liệu chấm công.";
        setAttendanceError(message);
        setAttendanceBinding(null);
        setCalendarDays([]);
      } finally {
        if (isActive) {
          setIsLoadingAttendance(false);
        }
      }
    };

    void loadAttendance();

    return () => {
      isActive = false;
    };
  }, [canReadTimekeepingData, holidays, profileError, profileId, selectedMonth]);

  const calendarYear = selectedMonth.getFullYear();
  const calendarMonth = selectedMonth.getMonth() + 1;
  const now = new Date();
  const firstWeekdayIndex = new Date(calendarYear, calendarMonth - 1, 1).getDay();
  const totalDays = new Date(calendarYear, calendarMonth, 0).getDate();
  const cellCount = Math.ceil((firstWeekdayIndex + totalDays) / 7) * 7;
  const holidayByDate = useMemo(() => buildHolidayMap(holidays), [holidays]);

  const approvedLeaveRequestsByDate = useMemo(() => {
    return correctionRequests.reduce<Record<string, CorrectionRequest[]>>((acc, item) => {
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
    }, {});
  }, [correctionRequests]);

  const approvedRemoteRequestByDate = useMemo(() => {
    return correctionRequests.reduce<Record<string, CorrectionRequest>>((acc, item) => {
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
    }, {});
  }, [correctionRequests]);

  const approvedOvertimeMinutesByDate = useMemo(() => {
    return correctionRequests.reduce<Record<string, number>>((acc, item) => {
      if (
        item.status !== "approved" ||
        item.typeValue !== "overtime" ||
        !item.correctionDateISO
      ) {
        return acc;
      }

      acc[item.correctionDateISO] = (acc[item.correctionDateISO] ?? 0) + Math.max(0, item.minutes);
      return acc;
    }, {});
  }, [correctionRequests]);

  const adjustedCalendarDays = useMemo(() => {
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
        overtimeMinutes: 0,
        isHoliday: metrics.isHoliday,
        holiday: metrics.holiday,
        sourceType: "remote",
        sourceNote: "Dữ liệu từ đơn làm việc từ xa",
      });
    });

    return Array.from(calendarByDay.values()).map((day) => {
      const dateIso = day.dateIso ?? toIsoDate(calendarYear, calendarMonth, day.day);
      const approvedLeaveRequests = approvedLeaveRequestsByDate[dateIso] ?? [];
      const dayWithLeaveAdjustments =
        day.isHoliday || approvedLeaveRequests.length === 0
          ? day
          : approvedLeaveRequests.reduce((currentDay, request) => {
              return applyApprovedLeaveRequest(currentDay, request);
            }, day);

      return {
        ...dayWithLeaveAdjustments,
        overtimeMinutes: approvedOvertimeMinutesByDate[dateIso] ?? 0,
      };
    });
  }, [
    approvedLeaveRequestsByDate,
    approvedOvertimeMinutesByDate,
    approvedRemoteRequestByDate,
    calendarDays,
    calendarMonth,
    calendarYear,
    holidays,
  ]);

  const adjustedAttendanceStats = useMemo(() => {
    return adjustedCalendarDays.reduce<AttendanceStats>(
      (acc, day) => {
        acc.overtimeMinutes +=
          typeof day.overtimeMinutes === "number" && Number.isFinite(day.overtimeMinutes)
            ? Math.max(0, day.overtimeMinutes)
            : 0;

        if (day.isHoliday) {
          return acc;
        }

        const missingMinutes =
          typeof day.missingMinutes === "number" && Number.isFinite(day.missingMinutes)
            ? Math.max(0, day.missingMinutes)
            : 0;
        const requiredWorkingMinutes =
          typeof day.requiredWorkingMinutes === "number" &&
          Number.isFinite(day.requiredWorkingMinutes)
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
  }, [adjustedCalendarDays]);

  const dayMap = useMemo(() => {
    return adjustedCalendarDays.reduce<Record<number, CalendarDay>>((acc, day) => {
      acc[day.day] = day;
      return acc;
    }, {});
  }, [adjustedCalendarDays]);

  const monthCells = Array.from({ length: cellCount }, (_, index) => {
    const day = index - firstWeekdayIndex + 1;
    if (day < 1 || day > totalDays) {
      return null;
    }
    return { day, meta: dayMap[day] };
  });
  const todayDateIso = toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const earliestAllowedRequestDateIso =
    getEarliestAllowedTimeRequestDateIso(now) ?? todayDateIso;
  const openedMobileDay = openedMobileDateIso
    ? dayMap[Number(openedMobileDateIso.slice(-2))]
    : undefined;
  const openedMobileDayRequests = openedMobileDateIso
    ? correctionRequests.filter((item) => item.correctionDateISO === openedMobileDateIso)
    : [];
  const openedMobileHoliday = openedMobileDateIso
    ? openedMobileDay?.holiday ?? holidayByDate.get(openedMobileDateIso) ?? null
    : null;
  const openedMobileDate = openedMobileDateIso ? new Date(`${openedMobileDateIso}T00:00:00`) : null;
  const openedMobileIsSunday = openedMobileDate?.getDay() === 0;
  const openedMobileHasMissingHours =
    typeof openedMobileDay?.missingMinutes === "number" && openedMobileDay.missingMinutes > 0;
  const openedMobileHasSameCheckInAndCheckOut =
    Boolean(openedMobileDay?.checkIn) &&
    Boolean(openedMobileDay?.checkOut) &&
    openedMobileDay?.checkIn !== "--:--" &&
    openedMobileDay?.checkOut !== "--:--" &&
    openedMobileDay?.checkIn === openedMobileDay?.checkOut;
  const openedMobileIsTodaySinglePunch =
    openedMobileDateIso === todayDateIso && openedMobileHasSameCheckInAndCheckOut;
  const openedMobileShouldHighlightMissing =
    openedMobileHasMissingHours && !openedMobileIsTodaySinglePunch;
  const openedMobileTimeClass = openedMobileIsSunday
    ? "border-slate-200 bg-slate-100 text-slate-400"
    : openedMobileDay?.sourceType === "remote"
      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
      : openedMobileShouldHighlightMissing
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : openedMobileHoliday
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-700";

  const openMobileDayDrawer = (dateIso: string) => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setOpenedMobileDateIso(dateIso);
    }
  };

  const activeRequests = openedFormDateIso
    ? correctionRequests.filter((item) => item.correctionDateISO === openedFormDateIso)
    : [];
  const activeDateLabel = openedFormDateIso ? formatDateVi(openedFormDateIso) : "";
  const requestDurationSummary = useMemo(() => {
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
  }, [correctionRequests, holidayByDate, selectedMonth]);

  const requestsByDate = useMemo(() => {
    return correctionRequests.reduce<Record<string, CorrectionRequest[]>>((acc, item) => {
      if (!item.correctionDateISO) {
        return acc;
      }

      if (!acc[item.correctionDateISO]) {
        acc[item.correctionDateISO] = [];
      }

      acc[item.correctionDateISO].push(item);
      return acc;
    }, {});
  }, [correctionRequests]);

  const exportRows = useMemo(() => {
    return Array.from({ length: totalDays }, (_, index) => {
      const day = index + 1;
      const dateIso = toIsoDate(calendarYear, calendarMonth, day);
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
  }, [calendarMonth, calendarYear, dayMap, holidayByDate, requestsByDate, totalDays]);

  const handleExport = async () => {
    if (isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      if (onExportRequest) {
        await onExportRequest(new Date(selectedMonth.getTime()));
        return;
      }

      if (onExport) {
        await onExport({
          selectedMonth: new Date(selectedMonth.getTime()),
          exportRows,
          adjustedCalendarDays,
          adjustedAttendanceStats,
          correctionRequests,
          requestDurationSummary,
        });
        return;
      }

      const header = [
        "Ngay",
        "Thu",
        "Check-in",
        "Check-out",
        "Trang thai",
        "Thieu gio",
        "So yeu cau",
        "Chi tiet yeu cau",
      ];

      const lines = [
        header.map(escapeCsvValue).join(","),
        ...exportRows.map((row) =>
          [
            row.dateIso,
            row.weekday,
            row.checkIn,
            row.checkOut,
            row.statusLabel,
            row.missingHours,
            row.requestCount,
            row.requestSummary,
          ]
            .map(escapeCsvValue)
            .join(","),
        ),
      ];

      const csvContent = `\uFEFF${lines.join("\n")}`;
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const monthToken = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, "0")}`;
      const labelToken = sanitizeFileSegment(exportFileLabel) || "timesheet";

      link.href = objectUrl;
      link.download = `cham-cong-${labelToken}-${monthToken}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 0);
    } finally {
      setIsExporting(false);
    }
  };

  const statCards = [
    {
      label: "Thiếu giờ",
      value: formatDurationLabel(adjustedAttendanceStats.missingMinutes),
      accent: "text-amber-500",
    },
    {
      label: "Nghỉ không phép",
      value: formatDurationLabel(requestDurationSummary.unauthorizedLeaveMinutes),
      accent: "text-red-500",
    },
    {
      label: "Nghỉ có phép",
      value: formatDurationLabel(requestDurationSummary.approvedLeaveMinutes),
      accent: "text-orange-500",
    },
    {
      label: "Tổng tăng ca",
      value: formatDurationLabel(requestDurationSummary.requestedOvertimeMinutes),
      accent: "text-emerald-500",
    },
    {
      label: "Ngày vắng mặt",
      value: String(adjustedAttendanceStats.absentDays),
      accent: "text-rose-500",
    },
  ];
  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {statCards.map((item) => (
          <article
            key={item.label}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-4"
          >
            <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">
              {item.label}
            </p>
            <p className={`mt-2 text-4xl font-semibold tracking-[-0.02em] ${item.accent}`}>
              {item.value}
            </p>
          </article>
        ))}
      </section>

      {profileError || attendanceError ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {profileError || attendanceError}
        </div>
      ) : null}

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <h2 className="text-2xl font-semibold text-slate-900">Chấm công tháng</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setSelectedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
              }
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              ‹
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {formatMonthLabel(selectedMonth)}
            </button>
            <button
              type="button"
              onClick={() =>
                setSelectedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
              }
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              ›
            </button>
            {showExportButton ? (
              <button
                type="button"
                onClick={handleExport}
                disabled={
                  isExporting ||
                  isProfileLoading ||
                  isLoadingAttendance ||
                  !profileId ||
                  attendanceBinding?.attendanceIds.length === 0
                }
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                {isExporting ? "Đang xuất..." : exportButtonLabel}
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
          {weekDayLabels.map((label, index) => (
            <div
              key={label}
              className={`flex h-12 items-center justify-center border-l text-center text-xs font-bold uppercase tracking-[0.08em] first:border-l-0 ${
                index === 0
                  ? "border-slate-200 bg-slate-100 text-slate-300"
                  : "border-slate-100 text-slate-400"
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {monthCells.map((cell, index) => {
            const isSundayColumn = index % 7 === 0;
            if (!cell) {
              return (
                <div
                  key={`empty-${index}`}
                  className={`h-36 border-l border-t first:border-l-0 md:h-28 ${
                    isSundayColumn ? "border-slate-200 bg-slate-50" : "border-slate-100"
                  }`}
                />
              );
            }

            const meta = cell.meta;
            const dateIso = toIsoDate(calendarYear, calendarMonth, cell.day);
            const dayRequests = requestsByDate[dateIso] ?? [];
            const hasDayRequests = dayRequests.length > 0;
            const hasMissingHours =
              typeof meta?.missingMinutes === "number" && meta.missingMinutes > 0;
            const isRemoteSource = meta?.sourceType === "remote";
            const holiday = meta?.holiday ?? holidayByDate.get(dateIso) ?? null;
            const isHolidayDate = Boolean(holiday);
            const isTodayDate = dateIso === todayDateIso;
            const hasSameCheckInAndCheckOut =
              Boolean(meta?.checkIn) &&
              Boolean(meta?.checkOut) &&
              meta?.checkIn !== "--:--" &&
              meta?.checkOut !== "--:--" &&
              meta?.checkIn === meta?.checkOut;
            const isTodaySinglePunchState = isTodayDate && hasSameCheckInAndCheckOut;
            const shouldHighlightMissingState = hasMissingHours && !isTodaySinglePunchState;
            const shouldShowMissingHoursLabel =
              shouldHighlightMissingState && !isSundayColumn && !isHolidayDate;
            const missingHoursLabel =
              typeof meta?.missingMinutes === "number"
                ? formatDurationLabel(meta.missingMinutes)
                : "--";
            const displayedCheckOut = hasSameCheckInAndCheckOut ? "--:--" : (meta?.checkOut ?? "--:--");

            return (
              <div
                key={`day-${cell.day}`}
                onClick={() => openMobileDayDrawer(dateIso)}
                className={`relative h-36 cursor-pointer border-l border-t px-1.5 py-2 first:border-l-0 md:h-28 md:cursor-default md:px-2.5 ${
                  isSundayColumn ? "border-slate-200 bg-slate-50" : "border-slate-100"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`block text-base font-semibold ${
                        isSundayColumn ? "text-slate-400" : "text-slate-800"
                      }`}
                    >
                      {cell.day}
                    </span>
                    {hasDayRequests && !isSundayColumn ? (
                      <Tooltip
                        label={`Xem ${dayRequests.length} form của ngày ${formatDateVi(dateIso)}`}
                        withArrow
                        position="top-start"
                        openDelay={120}
                      >
                        <ActionIcon
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (window.matchMedia("(max-width: 767px)").matches) {
                              setOpenedMobileDateIso(dateIso);
                              return;
                            }
                            setOpenedFormDateIso(dateIso);
                          }}
                          variant="light"
                          color="blue"
                          size="sm"
                          radius="xl"
                          aria-label={`Xem ${dayRequests.length} form của ngày ${formatDateVi(dateIso)}`}
                        >
                          <FileText size={14} strokeWidth={2.2} />
                        </ActionIcon>
                      </Tooltip>
                    ) : null}
                    {isHolidayDate ? (
                      <Tooltip
                        label={holiday?.name?.trim() || "Ngày nghỉ"}
                        withArrow
                        position="top-start"
                        openDelay={120}
                      >
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Ngày nghỉ
                        </span>
                      </Tooltip>
                    ) : null}
                  </div>
                  {createRequestHref &&
                  hasMissingHours &&
                  !isSundayColumn &&
                  dateIso >= earliestAllowedRequestDateIso ? (
                    <Tooltip
                      label={`Tạo yêu cầu điều chỉnh cho ngày ${formatDateVi(dateIso)}`}
                      withArrow
                      position="left"
                      openDelay={120}
                    >
                      <ActionIcon
                        component={Link}
                        href={appendQueryParams(createRequestHref, { date: dateIso })}
                        onClick={(event) => event.stopPropagation()}
                        variant="light"
                        color="blue"
                        size="sm"
                        radius="xl"
                        aria-label={`Tạo yêu cầu cho ngày ${formatDateVi(dateIso)}`}
                      >
                        <Plus size={14} strokeWidth={2.4} />
                      </ActionIcon>
                    </Tooltip>
                  ) : (
                    <span className="h-6 w-6" />
                  )}
                </div>

                <div className="mt-3 space-y-1 pr-0">
                  <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
                    <p
                      className={`rounded-md border px-1.5 py-0.5 text-center text-[11px] leading-4 font-semibold ${
                        isSundayColumn
                          ? "border-slate-200 bg-slate-100 text-slate-400"
                          : isRemoteSource
                            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                            : shouldHighlightMissingState
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : isHolidayDate
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {meta?.checkIn ?? "--:--"}
                    </p>
                    <p
                      className={`rounded-md border px-1.5 py-0.5 text-center text-[11px] leading-4 font-semibold ${
                        isSundayColumn
                          ? "border-slate-200 bg-slate-100 text-slate-400"
                          : isRemoteSource
                            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                            : shouldHighlightMissingState
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : isHolidayDate
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {displayedCheckOut}
                    </p>
                  </div>
                  {isRemoteSource ? (
                    <div>
                      <p className="text-center text-[11px] font-semibold text-indigo-600">
                        Làm việc từ xa
                      </p>
                    </div>
                  ) : null}
                  <p
                    className={`min-h-4 text-center text-[11px] leading-4 font-semibold ${
                      shouldShowMissingHoursLabel ? "text-rose-600" : "invisible"
                    }`}
                  >
                    {shouldShowMissingHoursLabel
                      ? `Thiếu giờ: ${missingHoursLabel}`
                      : "Thiếu giờ: --"}
                  </p>
                </div>

              </div>
            );
          })}
        </div>
      </section>

      {openedMobileDateIso ? (
        <div
          className="fixed inset-0 z-50 bg-slate-900/45 md:hidden"
          onClick={() => setOpenedMobileDateIso(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Chi tiết chấm công ngày ${formatDateVi(openedMobileDateIso)}`}
            className="fixed inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-[28px] border-t border-slate-200 bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl animate-[mobile-attendance-drawer-in_180ms_ease-out]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                  Chi tiết chấm công
                </p>
                <h3 className="mt-1 text-xl font-semibold text-slate-900">
                  {formatDateVi(openedMobileDateIso)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setOpenedMobileDateIso(null)}
                className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                aria-label="Đóng chi tiết chấm công"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {openedMobileHoliday ? (
              <p className="mt-3 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                Ngày nghỉ{openedMobileHoliday.name?.trim() ? ` · ${openedMobileHoliday.name.trim()}` : ""}
              </p>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className={`rounded-xl border p-3 ${openedMobileTimeClass}`}>
                <p className="text-xs font-semibold opacity-75">Check-in</p>
                <p className="mt-1 text-xl font-bold">{openedMobileDay?.checkIn ?? "--:--"}</p>
              </div>
              <div className={`rounded-xl border p-3 ${openedMobileTimeClass}`}>
                <p className="text-xs font-semibold opacity-75">Check-out</p>
                <p className="mt-1 text-xl font-bold">
                  {openedMobileHasSameCheckInAndCheckOut ? "--:--" : (openedMobileDay?.checkOut ?? "--:--")}
                </p>
              </div>
            </div>

            {openedMobileDay?.sourceType === "remote" ? (
              <p className="mt-3 text-sm font-semibold text-indigo-600">Làm việc từ xa</p>
            ) : null}
            {openedMobileShouldHighlightMissing && !openedMobileIsSunday && !openedMobileHoliday ? (
              <p className="mt-3 text-sm font-semibold text-rose-600">
                Thiếu giờ: {formatDurationLabel(openedMobileDay?.missingMinutes ?? 0)}
              </p>
            ) : null}

            {createRequestHref &&
            openedMobileHasMissingHours &&
            !openedMobileIsSunday &&
            openedMobileDateIso >= earliestAllowedRequestDateIso ? (
              <Link
                href={appendQueryParams(createRequestHref, { date: openedMobileDateIso })}
                className="mt-4 flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />Tạo yêu cầu điều chỉnh
              </Link>
            ) : null}

            {openedMobileDayRequests.length > 0 ? (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <h4 className="text-sm font-semibold text-slate-900">Form điều chỉnh công</h4>
                <div className="mt-3 space-y-3">
                  {openedMobileDayRequests.map((item) => (
                    <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{item.type}</p>
                          <p className="mt-0.5 text-xs text-slate-500">Ngày gửi: {formatDateVi(item.requestDateISO)}</p>
                        </div>
                        <RequestStatus status={item.status} />
                      </div>
                      {item.typeValue === "remote" && hasValidRemoteWindow(item.remoteCheckIn, item.remoteCheckOut) ? (
                        <p className="mt-2 text-xs font-medium text-indigo-600">
                          Làm việc từ xa: {toLocalTimeHHmm(item.remoteCheckIn)} - {toLocalTimeHHmm(item.remoteCheckOut)}
                        </p>
                      ) : null}
                      <p className="mt-2 text-sm text-slate-700">{item.reason}</p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {openedFormDateIso ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          onClick={() => setOpenedFormDateIso(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Form điều chỉnh công</h3>
                <p className="text-sm text-slate-500">Ngày {activeDateLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpenedFormDateIso(null)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Đóng
              </button>
            </div>

            <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4">
              {activeRequests.length > 0 ? (
                activeRequests.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{item.type}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Ngày gửi: {formatDateVi(item.requestDateISO)}
                        </p>
                        {holidayByDate.has(item.correctionDateISO) ? (
                          <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            Ngày nghỉ
                          </span>
                        ) : null}
                      </div>
                      <RequestStatus status={item.status} />
                    </div>
                    {item.typeValue === "remote" &&
                    hasValidRemoteWindow(item.remoteCheckIn, item.remoteCheckOut) ? (
                      <p className="mt-2 text-xs font-medium text-indigo-600">
                        Làm việc từ xa: {toLocalTimeHHmm(item.remoteCheckIn)} -{" "}
                        {toLocalTimeHHmm(item.remoteCheckOut)}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm text-slate-700">{item.reason}</p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-slate-500">Không có form cho ngày này.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
