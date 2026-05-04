"use client";

import Link from "next/link";
import { ActionIcon, Tooltip } from "@mantine/core";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  getTimeRequestReason,
  getTimeRequestTypeLabel,
  type TimeRequestType,
} from "@/lib/constants/time-requests";
import {
  collectAttendanceIds,
  mergeAttendanceRowsByDate,
  normalizeAttendanceId,
  type AttendanceTimeRow,
} from "@/lib/attendance";
import {
  calculateAttendanceMetrics,
  type AttendanceStatus,
} from "@/lib/attendance-metrics";
import {
  buildHolidayMap,
  fetchHolidaysInRange,
  type Holiday,
} from "@/lib/holidays";
import { supabase } from "@/lib/supabase";
import { calculateWorkedMinutesBetweenTimestamps } from "@/lib/work-time";

type CalendarDay = {
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

type CorrectionRequest = {
  id: string;
  requestDateISO: string;
  correctionDateISO: string;
  type: string;
  typeValue: TimeRequestType | null;
  minutes: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
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
};

type TimesProfileLinkRow = {
  attendance_id: number | null;
  created_at?: string | null;
};

type AttendanceStats = {
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
};

type TimesheetOverviewProps = {
  profileId: string | null;
  isProfileLoading?: boolean;
  profileError?: string | null;
  createRequestHref?: string | null;
  showExportButton?: boolean;
  exportFileLabel?: string | null;
  onExportCsv?: (context: { selectedMonth: Date }) => Promise<void> | void;
};

const weekDayLabels = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const ABSENT_NO_DATA_MISSING_MINUTES = 8 * 60;
const REQUESTS_PAGE_SIZE = 10;

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
  if (!isoDate) {
    return "--";
  }
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(date);
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
    return calculateWorkedMinutesBetweenTimestamps(item.remote_check_in, item.remote_check_out) ?? 0;
  }

  return typeof item.minutes === "number" && Number.isFinite(item.minutes)
    ? Math.max(0, item.minutes)
    : 0;
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
  if (!reviewers || reviewers.length === 0) {
    return "pending";
  }
  if (reviewers.some((item) => item.is_approved === false)) {
    return "rejected";
  }
  if (reviewers.every((item) => item.is_approved === true)) {
    return "approved";
  }
  return "pending";
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
  createRequestHref = null,
  showExportButton = false,
  exportFileLabel = null,
  onExportCsv,
}: TimesheetOverviewProps) {
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState<boolean>(false);
  const [attendanceError, setAttendanceError] = useState<string>("");
  const [attendanceBinding, setAttendanceBinding] = useState<AttendanceBinding | null>(null);
  const [correctionRequests, setCorrectionRequests] = useState<CorrectionRequest[]>([]);
  const [requestFilter, setRequestFilter] = useState<"all" | "pending" | "approved" | "rejected">(
    "all",
  );
  const [requestPage, setRequestPage] = useState(1);
  const [isLoadingRequests, setIsLoadingRequests] = useState<boolean>(false);
  const [requestsError, setRequestsError] = useState<string>("");
  const [openedFormDateIso, setOpenedFormDateIso] = useState<string | null>(null);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  useEffect(() => {
    setOpenedFormDateIso(null);
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
    if (!profileId) {
      setIsLoadingRequests(false);
      setRequestsError(profileError ?? "");
      setCorrectionRequests([]);
      return;
    }

    let isActive = true;

    const loadCorrectionRequests = async () => {
      setIsLoadingRequests(true);
      setRequestsError("");

      try {
        const { start, end } = getMonthDateRange(selectedMonth);
        const startIso = toIsoDate(start.getFullYear(), start.getMonth() + 1, start.getDate());
        const endIso = toIsoDate(end.getFullYear(), end.getMonth() + 1, end.getDate());

        const { data, error } = await supabase
          .from("time_requests")
          .select(
            "id,date,type,minutes,reason,remote_check_in,remote_check_out,created_at,time_request_reviewers(is_approved,reviewed_at,created_at)",
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
            type: getTimeRequestTypeLabel(item.type),
            typeValue: item.type ?? null,
            minutes: resolvedMinutes,
            reason: item.reason?.trim()
              ? item.reason.trim()
              : getTimeRequestReason(item.type, resolvedMinutes),
            status: toRequestStatus(item.time_request_reviewers),
            remoteCheckIn: item.remote_check_in ?? null,
            remoteCheckOut: item.remote_check_out ?? null,
          };
        });

        setCorrectionRequests(mapped);
      } catch (error) {
        if (!isActive) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Không thể tải yêu cầu điều chỉnh công.";
        setRequestsError(message);
        setCorrectionRequests([]);
      } finally {
        if (isActive) {
          setIsLoadingRequests(false);
        }
      }
    };

    void loadCorrectionRequests();

    return () => {
      isActive = false;
    };
  }, [profileError, profileId, selectedMonth]);

  useEffect(() => {
    if (!profileId) {
      setIsLoadingAttendance(false);
      setAttendanceError(profileError ?? "");
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
          supabase.from("profiles").select("id,attendance_id").eq("id", profileId).maybeSingle(),
          supabase
            .from("times_profiles")
            .select("attendance_id,created_at")
            .eq("profile_id", profileId),
        ]);

        if (profileAttendanceError) {
          throw profileAttendanceError;
        }

        if (attendanceLinkError) {
          throw attendanceLinkError;
        }

        const directAttendanceId = normalizeAttendanceId(
          (profileAttendanceData as ProfileAttendanceRow | null)?.attendance_id,
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
        });

        if (attendanceIds.length === 0) {
          setAttendanceError("");
          setCalendarDays([]);
          return;
        }

        const { data, error } = await supabase
          .from("times")
          .select("id,attendance_id,date,check_in,check_out,created_at,updated_at")
          .in("attendance_id", attendanceIds)
          .gte("date", startIso)
          .lt("date", endIso)
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
          const dateIso = toIsoDate(
            selectedMonth.getFullYear(),
            selectedMonth.getMonth() + 1,
            day,
          );
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
  }, [holidays, profileError, profileId, selectedMonth]);

  const calendarYear = selectedMonth.getFullYear();
  const calendarMonth = selectedMonth.getMonth() + 1;
  const firstWeekdayIndex = new Date(calendarYear, calendarMonth - 1, 1).getDay();
  const totalDays = new Date(calendarYear, calendarMonth, 0).getDate();
  const cellCount = Math.ceil((firstWeekdayIndex + totalDays) / 7) * 7;
  const holidayByDate = useMemo(() => buildHolidayMap(holidays), [holidays]);

  const approvedLeaveMinutesByDate = useMemo(() => {
    return correctionRequests.reduce<Record<string, number>>((acc, item) => {
      if (
        item.status !== "approved" ||
        item.typeValue !== "approved_leave" ||
        !item.correctionDateISO
      ) {
        return acc;
      }

      acc[item.correctionDateISO] = (acc[item.correctionDateISO] ?? 0) + item.minutes;
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
        overtimeMinutes: metrics.overtimeMinutes,
        isHoliday: metrics.isHoliday,
        holiday: metrics.holiday,
        sourceType: "remote",
        sourceNote: "Dữ liệu từ đơn làm việc từ xa",
      });
    });

    return Array.from(calendarByDay.values()).map((day) => {
      const dateIso = day.dateIso ?? toIsoDate(calendarYear, calendarMonth, day.day);
      const approvedLeaveMinutes = approvedLeaveMinutesByDate[dateIso] ?? 0;
      const originalMissingMinutes =
        typeof day.missingMinutes === "number" && Number.isFinite(day.missingMinutes)
          ? Math.max(0, day.missingMinutes)
          : 0;

      if (day.isHoliday || approvedLeaveMinutes <= 0 || originalMissingMinutes <= 0) {
        return day;
      }

      const adjustedMissingMinutes = Math.max(0, originalMissingMinutes - approvedLeaveMinutes);
      const adjustedStatus =
        day.status && adjustedMissingMinutes === 0 ? ("ontime" as AttendanceStatus) : day.status;

      return {
        ...day,
        status: adjustedStatus,
        missingMinutes: adjustedMissingMinutes,
      };
    });
  }, [
    approvedLeaveMinutesByDate,
    approvedRemoteRequestByDate,
    calendarDays,
    calendarMonth,
    calendarYear,
    holidays,
  ]);

  const adjustedAttendanceStats = useMemo(() => {
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

  const filteredCorrectionRequests = useMemo(() => {
    if (requestFilter === "all") {
      return correctionRequests;
    }
    return correctionRequests.filter((item) => item.status === requestFilter);
  }, [correctionRequests, requestFilter]);
  const totalRequestPages = useMemo(
    () => Math.max(1, Math.ceil(filteredCorrectionRequests.length / REQUESTS_PAGE_SIZE)),
    [filteredCorrectionRequests.length],
  );
  const safeRequestPage = Math.min(requestPage, totalRequestPages);
  const paginatedCorrectionRequests = useMemo(() => {
    const start = (safeRequestPage - 1) * REQUESTS_PAGE_SIZE;
    return filteredCorrectionRequests.slice(start, start + REQUESTS_PAGE_SIZE);
  }, [filteredCorrectionRequests, safeRequestPage]);

  useEffect(() => {
    setRequestPage(1);
  }, [requestFilter, selectedMonth]);

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
        (meta?.checkIn && meta.checkIn !== "--:--") || (meta?.checkOut && meta.checkOut !== "--:--");

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

  const handleExportCsv = async () => {
    if (isExportingCsv) {
      return;
    }

    setIsExportingCsv(true);

    try {
      if (onExportCsv) {
        await onExportCsv({ selectedMonth: new Date(selectedMonth.getTime()) });
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
      setIsExportingCsv(false);
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
      value: formatDurationLabel(adjustedAttendanceStats.overtimeMinutes),
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

      {isProfileLoading || isLoadingAttendance ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          Đang tải dữ liệu chấm công...
        </div>
      ) : null}

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
              onClick={() => setSelectedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
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
              onClick={() => setSelectedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              ›
            </button>
            {showExportButton ? (
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={
                  isExportingCsv ||
                  (!onExportCsv &&
                    (isProfileLoading ||
                      isLoadingAttendance ||
                      !profileId ||
                      attendanceBinding?.attendanceIds.length === 0))
                }
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                {isExportingCsv ? "Đang xuất..." : "Xuất CSV"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
          {weekDayLabels.map((label, index) => (
            <div
              key={label}
              className={`h-12 border-l text-center text-xs font-bold tracking-[0.08em] leading-[48px] uppercase first:border-l-0 ${
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
                  className={`h-28 border-l border-t first:border-l-0 ${
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
            const missingHoursLabel =
              typeof meta?.missingMinutes === "number"
                ? formatDurationLabel(meta.missingMinutes)
                : "--";

            return (
              <div
                key={`day-${cell.day}`}
                className={`relative h-28 border-l border-t px-2.5 py-2 first:border-l-0 ${
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
                  {createRequestHref && hasMissingHours && !isSundayColumn ? (
                    <Tooltip
                      label={`Tạo yêu cầu điều chỉnh cho ngày ${formatDateVi(dateIso)}`}
                      withArrow
                      position="left"
                      openDelay={120}
                    >
                      <ActionIcon
                        component={Link}
                        href={`${createRequestHref}?date=${dateIso}`}
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
                    <span className="h-7 w-7" />
                  )}
                </div>

                <div className="mt-3 space-y-1 pr-0">
                  <div className="grid grid-cols-2 gap-1">
                    <p
                      className={`rounded-md border px-1.5 py-0.5 text-center text-[11px] font-semibold ${
                        isSundayColumn
                          ? "border-slate-200 bg-slate-100 text-slate-400"
                          : isRemoteSource
                            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                          : hasMissingHours
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                          : isHolidayDate
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {meta?.checkIn ?? "--:--"}
                    </p>
                    <p
                      className={`rounded-md border px-1.5 py-0.5 text-center text-[11px] font-semibold ${
                        isSundayColumn
                          ? "border-slate-200 bg-slate-100 text-slate-400"
                          : isRemoteSource
                            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                          : hasMissingHours
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                          : isHolidayDate
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {meta?.checkOut ?? "--:--"}
                    </p>
                  </div>
                  {isRemoteSource ? (
                    <div className="space-y-0.5">
                      <p className="text-center text-[11px] font-semibold text-indigo-600">
                        Làm việc từ xa
                      </p>
                      <p className="text-center text-[10px] text-indigo-500">{meta?.sourceNote}</p>
                    </div>
                  ) : null}
                  <p
                    className={`text-center text-[11px] font-semibold text-rose-600 ${
                      hasMissingHours && !isSundayColumn && !isHolidayDate ? "" : "hidden"
                    }`}
                  >
                    Thiếu giờ: {missingHoursLabel}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setOpenedFormDateIso(dateIso)}
                  className={`absolute bottom-2 left-2 right-2 h-6 rounded-md border border-blue-200 bg-blue-50 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 ${
                    hasDayRequests && !isSundayColumn
                      ? "inline-flex items-center justify-center"
                      : "hidden"
                  }`}
                >
                  Xem form ({dayRequests.length})
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <h2 className="text-2xl font-semibold text-slate-900">Yêu cầu điều chỉnh công</h2>
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setRequestFilter("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                requestFilter === "all" ? "bg-white text-slate-700" : "text-slate-500"
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => setRequestFilter("pending")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                requestFilter === "pending" ? "bg-white text-slate-700" : "text-slate-500"
              }`}
            >
              Chờ duyệt
            </button>
            <button
              type="button"
              onClick={() => setRequestFilter("approved")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                requestFilter === "approved" ? "bg-white text-slate-700" : "text-slate-500"
              }`}
            >
              Đã duyệt
            </button>
            <button
              type="button"
              onClick={() => setRequestFilter("rejected")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                requestFilter === "rejected" ? "bg-white text-slate-700" : "text-slate-500"
              }`}
            >
              Từ chối
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left">
            <thead>
              <tr className="text-xs tracking-[0.08em] text-slate-400 uppercase">
                <th className="px-5 py-3 font-semibold">Ngày gửi</th>
                <th className="px-5 py-3 font-semibold">Ngày cần sửa</th>
                <th className="px-5 py-3 font-semibold">Loại điều chỉnh</th>
                <th className="px-5 py-3 font-semibold">Lý do</th>
                <th className="px-5 py-3 font-semibold">Trạng thái</th>
                <th className="px-5 py-3 font-semibold text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isProfileLoading || isLoadingRequests ? (
                <tr className="border-t border-slate-100">
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                    Đang tải yêu cầu...
                  </td>
                </tr>
              ) : profileError || requestsError ? (
                <tr className="border-t border-slate-100">
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-rose-600">
                    {profileError || requestsError}
                  </td>
                </tr>
              ) : filteredCorrectionRequests.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                    Chưa có yêu cầu điều chỉnh công.
                  </td>
                </tr>
              ) : (
                paginatedCorrectionRequests.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-5 py-4 text-sm font-medium text-slate-700">
                      {formatDateVi(item.requestDateISO)}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      <div className="space-y-1">
                        <p>{formatDateVi(item.correctionDateISO)}</p>
                        {holidayByDate.has(item.correctionDateISO) ? (
                          <>
                            <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              Ngày nghỉ
                            </span>
                            {holidayByDate.get(item.correctionDateISO)?.name?.trim() ? (
                              <p className="text-[11px] text-emerald-700">
                                {holidayByDate.get(item.correctionDateISO)?.name?.trim()}
                              </p>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                        {item.type}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-500">
                      <p className="max-w-[280px] truncate">{item.reason}</p>
                    </td>
                    <td className="px-5 py-4">
                      <RequestStatus status={item.status} />
                    </td>
                    <td className="px-5 py-4 text-right text-lg text-slate-400">◉</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filteredCorrectionRequests.length > 0 ? (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
            <p className="text-slate-500">
              Trang {safeRequestPage}/{totalRequestPages} · {filteredCorrectionRequests.length} yêu
              cầu
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRequestPage((prev) => Math.max(1, prev - 1))}
                disabled={safeRequestPage <= 1}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Trước
              </button>
              <button
                type="button"
                onClick={() => setRequestPage((prev) => Math.min(totalRequestPages, prev + 1))}
                disabled={safeRequestPage >= totalRequestPages}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sau
              </button>
            </div>
          </div>
        ) : null}
      </section>

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
                    {item.typeValue === "remote" && hasValidRemoteWindow(item.remoteCheckIn, item.remoteCheckOut) ? (
                      <p className="mt-2 text-xs font-medium text-indigo-600">
                        Làm việc từ xa: {toLocalTimeHHmm(item.remoteCheckIn)} - {toLocalTimeHHmm(item.remoteCheckOut)}
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
