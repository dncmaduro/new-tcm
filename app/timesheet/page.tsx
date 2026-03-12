"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { supabase } from "@/lib/supabase";

type AttendanceStatus = "ontime" | "late" | "missing";

type CalendarDay = {
  day: number;
  status?: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  missingMinutes?: number;
};

type CorrectionRequest = {
  id: string;
  requestDateISO: string;
  correctionDateISO: string;
  type: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
};

type TimeRequestType = "leave" | "late" | "overtime";

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
  created_at: string | null;
  time_request_reviewers?: TimeRequestReviewerRow[] | null;
};

type TimesRow = {
  id: string;
  profile_id: string | null;
  date: string;
  check_in: string | null;
  check_out: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type AttendanceStats = {
  totalWorkDays: number;
  absentDays: number;
  missingMinutes: number;
  overtimeMinutes: number;
};

const weekDayLabels = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const WORK_START_MINUTES = 8 * 60 + 10;
const WORK_END_MINUTES = 17 * 60 + 30;
const BREAK_START_MINUTES = 12 * 60;
const BREAK_END_MINUTES = 13 * 60 + 30;
const REQUIRED_WORK_MINUTES =
  WORK_END_MINUTES - WORK_START_MINUTES - (BREAK_END_MINUTES - BREAK_START_MINUTES);
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

function toMinutesFromTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.getHours() * 60 + date.getMinutes();
}

function overlapMinutes(start: number, end: number, windowStart: number, windowEnd: number) {
  const overlapStart = Math.max(start, windowStart);
  const overlapEnd = Math.min(end, windowEnd);
  return Math.max(0, overlapEnd - overlapStart);
}

function workedMinutesExcludingBreak(startMinutes: number, endMinutes: number) {
  if (endMinutes <= startMinutes) {
    return 0;
  }

  const raw = endMinutes - startMinutes;
  const breakOverlap = overlapMinutes(
    startMinutes,
    endMinutes,
    BREAK_START_MINUTES,
    BREAK_END_MINUTES,
  );
  return Math.max(0, raw - breakOverlap);
}

function calculateAttendanceMetrics(checkIn: string | null, checkOut: string | null) {
  if (!checkIn || !checkOut) {
    return {
      status: "missing" as AttendanceStatus,
      missingMinutes: REQUIRED_WORK_MINUTES,
      overtimeMinutes: 0,
    };
  }

  const checkInMinutes = toMinutesFromTimestamp(checkIn);
  const checkOutMinutes = toMinutesFromTimestamp(checkOut);
  if (checkInMinutes === null || checkOutMinutes === null || checkOutMinutes <= checkInMinutes) {
    return {
      status: "missing" as AttendanceStatus,
      missingMinutes: REQUIRED_WORK_MINUTES,
      overtimeMinutes: 0,
    };
  }

  const inScheduleStart = Math.max(checkInMinutes, WORK_START_MINUTES);
  const inScheduleEnd = Math.min(checkOutMinutes, WORK_END_MINUTES);
  const inScheduleWorkedMinutes = workedMinutesExcludingBreak(inScheduleStart, inScheduleEnd);
  const actualWorkedMinutes = workedMinutesExcludingBreak(checkInMinutes, checkOutMinutes);

  const missingMinutes = Math.max(0, REQUIRED_WORK_MINUTES - inScheduleWorkedMinutes);
  const overtimeMinutes = Math.max(0, actualWorkedMinutes - REQUIRED_WORK_MINUTES);
  return {
    status: missingMinutes > 0 ? ("late" as AttendanceStatus) : ("ontime" as AttendanceStatus),
    missingMinutes,
    overtimeMinutes,
  };
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

function StatusDot({ status }: { status: AttendanceStatus }) {
  if (status === "missing") {
    return <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />;
  }
  if (status === "late") {
    return <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />;
  }
  return <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />;
}

function toDateOnlyIso(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  return value.slice(0, 10);
}

function toTimeRequestTypeLabel(type: TimeRequestType | null | undefined) {
  if (type === "leave") {
    return "Xin nghỉ";
  }
  if (type === "late") {
    return "Đi muộn";
  }
  if (type === "overtime") {
    return "Tăng ca";
  }
  return "Khác";
}

function toTimeRequestReason(type: TimeRequestType | null | undefined, minutes: number | null | undefined) {
  const safeMinutes = typeof minutes === "number" && Number.isFinite(minutes) ? minutes : 0;
  if (type === "leave") {
    return `Điều chỉnh nghỉ ${safeMinutes} phút.`;
  }
  if (type === "late") {
    return `Điều chỉnh đi muộn ${safeMinutes} phút.`;
  }
  if (type === "overtime") {
    return `Điều chỉnh tăng ca ${safeMinutes} phút.`;
  }
  return "Yêu cầu điều chỉnh thời gian làm việc.";
}

function toRequestStatus(reviewers: TimeRequestReviewerRow[] | null | undefined): CorrectionRequest["status"] {
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

export default function TimesheetPage() {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStats>({
    totalWorkDays: 0,
    absentDays: 0,
    missingMinutes: 0,
    overtimeMinutes: 0,
  });
  const [isLoadingAttendance, setIsLoadingAttendance] = useState<boolean>(true);
  const [attendanceError, setAttendanceError] = useState<string>("");
  const [correctionRequests, setCorrectionRequests] = useState<CorrectionRequest[]>([]);
  const [requestFilter, setRequestFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [isLoadingRequests, setIsLoadingRequests] = useState<boolean>(true);
  const [requestsError, setRequestsError] = useState<string>("");
  const [openedFormDateIso, setOpenedFormDateIso] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadProfileId = async () => {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
          throw authError;
        }

        if (!isActive) {
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", authData.user.id)
          .maybeSingle();

        if (!isActive) {
          return;
        }

        if (profileError || !profile?.id) {
          throw profileError ?? new Error("Không tìm thấy hồ sơ người dùng.");
        }

        setProfileId(String(profile.id));
      } catch (error) {
        if (!isActive) {
          return;
        }
        setProfileId(null);
        const message = error instanceof Error ? error.message : "Không thể tải hồ sơ người dùng.";
        setAttendanceError(message);
        setRequestsError(message);
        setIsLoadingAttendance(false);
        setIsLoadingRequests(false);
        setCorrectionRequests([]);
        setCalendarDays([]);
      } finally {
        // no-op
      }
    };

    void loadProfileId();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!profileId) {
      return;
    }

    let isActive = true;

    const loadCorrectionRequests = async () => {
      setIsLoadingRequests(true);
      setRequestsError("");

      try {
        const { data, error } = await supabase
          .from("time_requests")
          .select("id,date,type,minutes,created_at,time_request_reviewers(is_approved,reviewed_at,created_at)")
          .eq("profile_id", profileId)
          .order("created_at", { ascending: false });

        if (error) {
          throw error;
        }

        if (!isActive) {
          return;
        }

        const mapped = ((data ?? []) as TimeRequestRow[]).map((item) => ({
          id: item.id,
          requestDateISO: toDateOnlyIso(item.created_at),
          correctionDateISO: toDateOnlyIso(item.date),
          type: toTimeRequestTypeLabel(item.type),
          reason: toTimeRequestReason(item.type, item.minutes),
          status: toRequestStatus(item.time_request_reviewers),
        }));

        setCorrectionRequests(mapped);
      } catch (error) {
        if (!isActive) {
          return;
        }
        const message = error instanceof Error ? error.message : "Không thể tải yêu cầu điều chỉnh công.";
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
  }, [profileId]);

  useEffect(() => {
    if (!profileId) {
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

        const { data, error } = await supabase
          .from("times")
          .select("id,profile_id,date,check_in,check_out,created_at,updated_at")
          .eq("profile_id", profileId)
          .gte("date", startIso)
          .lt("date", endIso)
          .order("date", { ascending: true });

        if (error) {
          throw error;
        }

        if (!isActive) {
          return;
        }

        const typedRows = (data ?? []) as TimesRow[];
        const byDay = new Map<number, CalendarDay>();
        let totalWorkDays = 0;
        let absentDays = 0;
        let missingMinutes = 0;
        let overtimeMinutes = 0;

        typedRows.forEach((row) => {
          const dateValue = new Date(`${row.date}T00:00:00`);
          if (Number.isNaN(dateValue.getTime())) {
            return;
          }
          const day = dateValue.getDate();
          const isSunday = dateValue.getDay() === 0;

          if (isSunday) {
            byDay.set(day, {
              day,
              checkIn: toLocalTimeHHmm(row.check_in),
              checkOut: toLocalTimeHHmm(row.check_out),
              missingMinutes: 0,
            });
            return;
          }

          const metrics = calculateAttendanceMetrics(row.check_in, row.check_out);
          byDay.set(day, {
            day,
            status: metrics.status,
            checkIn: toLocalTimeHHmm(row.check_in),
            checkOut: toLocalTimeHHmm(row.check_out),
            missingMinutes: metrics.missingMinutes,
          });

          if (metrics.status === "missing") {
            absentDays += 1;
          } else {
            totalWorkDays += 1;
          }
          missingMinutes += metrics.missingMinutes;
          overtimeMinutes += metrics.overtimeMinutes;
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
          const isSunday = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), day).getDay() === 0;
          if (isSunday) {
            continue;
          }

          byDay.set(day, {
            day,
            status: "missing",
            checkIn: "--:--",
            checkOut: "--:--",
            missingMinutes: ABSENT_NO_DATA_MISSING_MINUTES,
          });
          absentDays += 1;
          missingMinutes += ABSENT_NO_DATA_MISSING_MINUTES;
        }

        setCalendarDays(Array.from(byDay.values()));
        setAttendanceStats({
          totalWorkDays,
          absentDays,
          missingMinutes,
          overtimeMinutes,
        });
      } catch (error) {
        if (!isActive) {
          return;
        }
        const message = error instanceof Error ? error.message : "Không thể tải dữ liệu chấm công.";
        setAttendanceError(message);
        setCalendarDays([]);
        setAttendanceStats({
          totalWorkDays: 0,
          absentDays: 0,
          missingMinutes: 0,
          overtimeMinutes: 0,
        });
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
  }, [profileId, selectedMonth]);

  const calendarYear = selectedMonth.getFullYear();
  const calendarMonth = selectedMonth.getMonth() + 1;
  const firstWeekdayIndex = new Date(calendarYear, calendarMonth - 1, 1).getDay();
  const totalDays = new Date(calendarYear, calendarMonth, 0).getDate();
  const cellCount = Math.ceil((firstWeekdayIndex + totalDays) / 7) * 7;

  const dayMap = useMemo(() => {
    return calendarDays.reduce<Record<number, CalendarDay>>((acc, day) => {
      acc[day.day] = day;
      return acc;
    }, {});
  }, [calendarDays]);

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

  const activeRequests = openedFormDateIso
    ? correctionRequests.filter((item) => item.correctionDateISO === openedFormDateIso)
    : [];
  const activeDateLabel = openedFormDateIso ? formatDateVi(openedFormDateIso) : "";
  const statCards = [
    { label: "Tổng ngày làm việc", value: String(attendanceStats.totalWorkDays), accent: "text-blue-600" },
    { label: "Ngày vắng mặt", value: String(attendanceStats.absentDays), accent: "text-rose-500" },
    { label: "Thiếu giờ", value: formatDurationLabel(attendanceStats.missingMinutes), accent: "text-amber-500" },
    { label: "Tổng tăng ca", value: formatDurationLabel(attendanceStats.overtimeMinutes), accent: "text-emerald-500" },
  ];

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="timesheet" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[280px]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-7">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-3xl font-semibold tracking-[-0.02em] text-slate-900">Chấm công</h1>
              <div className="flex items-center gap-2">
                <Link
                  href="/timesheet/time-request/new"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Tạo yêu cầu
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedMonth(
                      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                    )
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
                    setSelectedMonth(
                      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                    )
                  }
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  ›
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Xuất CSV
                </button>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-7">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {statCards.map((item) => (
                <article key={item.label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                  <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">{item.label}</p>
                  <p className={`mt-2 text-4xl font-semibold tracking-[-0.02em] ${item.accent}`}>{item.value}</p>
                </article>
              ))}
            </section>

            {isLoadingAttendance ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                Đang tải dữ liệu chấm công...
              </div>
            ) : null}

            {attendanceError ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {attendanceError}
              </div>
            ) : null}

            <section className="mt-5 rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
                <h2 className="text-2xl font-semibold text-slate-900">Nhật ký chấm công theo tháng</h2>
                <div className="flex items-center gap-4 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    Đúng giờ
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                    Trễ/Sớm
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                    Thiếu công
                  </span>
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
                          isSundayColumn
                            ? "border-slate-200 bg-slate-50"
                            : "border-slate-100"
                        }`}
                      />
                    );
                  }

                  const meta = cell.meta;
                  const dateIso = toIsoDate(calendarYear, calendarMonth, cell.day);
                  const dayRequests = correctionRequests.filter((item) => item.correctionDateISO === dateIso);
                  const hasDayRequests = dayRequests.length > 0;
                  const hasMissingHours = typeof meta?.missingMinutes === "number" && meta.missingMinutes > 0;
                  const missingHoursLabel =
                    typeof meta?.missingMinutes === "number"
                      ? formatDurationLabel(meta.missingMinutes)
                      : "--";

                  return (
                    <div
                      key={`day-${cell.day}`}
                      className={`relative h-28 border-l border-t px-2.5 py-2 first:border-l-0 ${
                        isSundayColumn
                          ? "border-slate-200 bg-slate-50"
                          : "border-slate-100"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <span
                          className={`text-base font-semibold ${
                            isSundayColumn ? "text-slate-400" : "text-slate-800"
                          }`}
                        >
                          {cell.day}
                        </span>
                        <span className={meta?.status ? "inline-flex" : "hidden"}>
                          {meta?.status ? <StatusDot status={meta.status} /> : null}
                        </span>
                      </div>

                      <div className="absolute inset-x-2.5 top-1/2 h-10 -translate-y-1/2 space-y-1">
                        <div className="grid grid-cols-2 gap-1">
                          <p
                            className={`rounded-md border px-1.5 py-0.5 text-center text-[11px] font-semibold ${
                              isSundayColumn
                                ? "border-slate-200 bg-slate-100 text-slate-400"
                                : hasMissingHours
                                  ? "border-rose-200 bg-rose-50 text-rose-700"
                                  : "border-slate-200 bg-slate-50 text-slate-700"
                            }`}
                          >
                            {meta?.checkIn ?? "--:--"}
                          </p>
                          <p
                            className={`rounded-md border px-1.5 py-0.5 text-center text-[11px] font-semibold ${
                              isSundayColumn
                                ? "border-slate-200 bg-slate-100 text-slate-400"
                                : hasMissingHours
                                  ? "border-rose-200 bg-rose-50 text-rose-700"
                                  : "border-slate-200 bg-slate-50 text-slate-700"
                            }`}
                          >
                            {meta?.checkOut ?? "--:--"}
                          </p>
                        </div>
                        <p
                          className={`text-center text-[11px] font-semibold text-rose-600 ${
                            hasMissingHours && !isSundayColumn ? "" : "hidden"
                          }`}
                        >
                          Thiếu giờ: {missingHoursLabel}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setOpenedFormDateIso(dateIso)}
                        className={`absolute bottom-2 left-2 right-2 h-6 rounded-md border border-blue-200 bg-blue-50 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 ${
                          hasDayRequests && !isSundayColumn ? "inline-flex items-center justify-center" : "hidden"
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
                    {isLoadingRequests ? (
                      <tr className="border-t border-slate-100">
                        <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                          Đang tải yêu cầu...
                        </td>
                      </tr>
                    ) : requestsError ? (
                      <tr className="border-t border-slate-100">
                        <td colSpan={6} className="px-5 py-8 text-center text-sm text-rose-600">
                          {requestsError}
                        </td>
                      </tr>
                    ) : filteredCorrectionRequests.length === 0 ? (
                      <tr className="border-t border-slate-100">
                        <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                          Chưa có yêu cầu điều chỉnh công.
                        </td>
                      </tr>
                    ) : (
                      filteredCorrectionRequests.map((item) => (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="px-5 py-4 text-sm font-medium text-slate-700">
                            {formatDateVi(item.requestDateISO)}
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-600">{formatDateVi(item.correctionDateISO)}</td>
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
            </section>
          </main>
        </div>
      </div>

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
                  <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{item.type}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Ngày gửi: {formatDateVi(item.requestDateISO)}
                        </p>
                      </div>
                      <RequestStatus status={item.status} />
                    </div>
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
    </div>
  );
}
