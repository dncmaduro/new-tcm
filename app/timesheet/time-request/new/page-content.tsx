"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Suspense, useEffect, useState } from "react";
import { useLeaveFormConfirm } from "@/components/use-leave-form-confirm";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EARLY_LEAVE_FIXED_CHECKOUT_TIME,
  getEarlyLeaveHoursFromMinutes,
  getEarlyLeaveMinutesFromTimeValue,
  LEAVE_REQUEST_SUBTYPES,
  getLeaveRequestDurationMinutes,
  TIME_REQUEST_TYPES,
  isMissingTimeRequestType,
  type LeaveRequestSession,
  type LeaveRequestSubtype,
  type TimeRequestType,
} from "@/lib/constants/time-requests";
import { fetchHolidaysInRange, type Holiday } from "@/lib/holidays";
import { supabase } from "@/lib/supabase";
import {
  canCreateTimeRequest,
  getEarliestAllowedTimeRequestDateIso,
  isTimeRequestDateTooFarInPast,
  TIMEKEEPING_DISABLED_MESSAGE,
  TIME_REQUEST_BACKDATE_LIMIT_DAYS,
  TIME_REQUEST_DATE_WINDOW_MESSAGE,
  type TimekeepingCreateProfile,
} from "@/lib/timekeeping-access";
import { calculateWorkedMinutesBetweenTimestamps } from "@/lib/work-time";

type CurrentProfileAccess = TimekeepingCreateProfile & {
  id: string;
};

type LeaveBalanceRow = {
  id: string;
  profile_id: string | null;
  month: string | null;
  total_hours: number | null;
  used_hours: number | null;
  created_at: string | null;
};

const toIsoDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toMonthStartIso = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
};

const fromIsoDateParam = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
};

const parseIntegerInput = (value: string) => {
  const normalizedValue = value.trim();
  if (normalizedValue === "") {
    return null;
  }
  return Number(normalizedValue);
};

const formatHoursLabel = (value: number) => `${Math.max(0, value)} giờ`;

const isValid24HourTimeValue = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);

const normalize24HourTimeInput = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

const sanitizeReturnPath = (value: string | null) => {
  if (!value) {
    return null;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  if (!value.startsWith("/timesheet")) {
    return null;
  }

  return value;
};

const combineDateAndTimeToIso = (date: Date, timeValue: string) => {
  if (!timeValue || !isValid24HourTimeValue(timeValue)) {
    return null;
  }

  const [hoursToken, minutesToken] = timeValue.split(":");
  const hours = Number.parseInt(hoursToken, 10);
  const minutes = Number.parseInt(minutesToken, 10);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  const combined = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    0,
    0,
  );

  if (Number.isNaN(combined.getTime())) {
    return null;
  }

  return combined.toISOString();
};

const fetchCurrentProfileAccess = async (): Promise<CurrentProfileAccess> => {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error("Không xác thực được người dùng.");
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id,is_active,is_timekeeping_enabled")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (profileError || !profileData?.id) {
    throw new Error(profileError?.message ?? "Không tìm thấy hồ sơ người dùng.");
  }

  return {
    id: String(profileData.id),
    is_active: profileData.is_active,
    is_timekeeping_enabled: profileData.is_timekeeping_enabled,
  };
};

const fetchLeaveBalanceForMonth = async (profileId: string, targetDate: Date) => {
  const targetMonth = toMonthStartIso(targetDate);

  const { error: ensureError } = await supabase.rpc("ensure_leave_balance_for_profile_month", {
    p_profile_id: profileId,
    p_month: targetMonth,
  });

  if (ensureError) {
    const message = ensureError.message || "Không thể khởi tạo quỹ phép của tháng đã chọn.";
    const isMissingRpc =
      message.includes(
        "Could not find the function public.ensure_leave_balance_for_profile_month",
      ) || message.includes("schema cache");

    if (!isMissingRpc) {
      throw new Error(message);
    }
  }

  const { data, error } = await supabase
    .from("leave_balances")
    .select("id,profile_id,month,total_hours,used_hours,created_at")
    .eq("profile_id", profileId)
    .eq("month", targetMonth)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Không tải được quỹ phép của tháng đã chọn.");
  }

  if (!data) {
    throw new Error(
      "Chưa tìm thấy quỹ phép của tháng đã chọn. Cần apply migration leave_balances và reload schema cache của Supabase.",
    );
  }

  return data as LeaveBalanceRow;
};

function CreateTimeRequestPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryCorrectionDate = searchParams.get("date");
  const queryReturnTo = searchParams.get("returnTo");
  const returnToHref = sanitizeReturnPath(queryReturnTo) ?? "/timesheet/requests";
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [currentProfileAccess, setCurrentProfileAccess] = useState<CurrentProfileAccess | null>(
    null,
  );
  const [requestType, setRequestType] = useState<TimeRequestType | "">("");
  const [leaveSubtype, setLeaveSubtype] = useState<LeaveRequestSubtype | "">("");
  const [earlyLeaveTimeInput, setEarlyLeaveTimeInput] = useState<string>("");
  const [correctionDate, setCorrectionDate] = useState<Date | undefined>(
    () => fromIsoDateParam(queryCorrectionDate) ?? new Date(),
  );
  const [minutesInput, setMinutesInput] = useState<string>("");
  const [reasonInput, setReasonInput] = useState<string>("");
  const [remoteCheckInInput, setRemoteCheckInInput] = useState<string>("");
  const [remoteCheckOutInput, setRemoteCheckOutInput] = useState<string>("");
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceRow | null>(null);
  const [selectedHoliday, setSelectedHoliday] = useState<Holiday | null>(null);
  const [isLoadingLeaveBalance, setIsLoadingLeaveBalance] = useState<boolean>(false);
  const [leaveBalanceError, setLeaveBalanceError] = useState<string>("");
  const [formError, setFormError] = useState<string>("");
  const [submitSuccess, setSubmitSuccess] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const { leaveConfirmDialog, runWithoutConfirm } = useLeaveFormConfirm({
    enabled: !isSubmitting,
  });
  const earliestAllowedCorrectionDateIso = getEarliestAllowedTimeRequestDateIso();
  const earliestAllowedCorrectionDate = earliestAllowedCorrectionDateIso
    ? fromIsoDateParam(earliestAllowedCorrectionDateIso)
    : undefined;
  const isApprovedLeaveRequest = requestType === "approved_leave";
  const isMissingLeaveRequest = isMissingTimeRequestType(requestType || null);
  const isRemoteRequest = requestType === "remote";
  const isBlockedPastDate = correctionDate ? isTimeRequestDateTooFarInPast(correctionDate) : false;
  const requiresMinutesInput = !isMissingLeaveRequest && !isRemoteRequest;
  const parsedMinutesPreview = parseIntegerInput(minutesInput);
  const normalizedLeaveSubtype = isMissingLeaveRequest ? leaveSubtype || null : null;
  const normalizedLeaveSession =
    isMissingLeaveRequest && leaveSubtype === "half_day"
      ? ("morning" as LeaveRequestSession)
      : null;
  const normalizedEarlyLeaveMinutesPreview =
    isMissingLeaveRequest && leaveSubtype === "early_leave"
      ? getEarlyLeaveMinutesFromTimeValue(earlyLeaveTimeInput)
      : null;
  const requestedLeaveMinutesPreview = isMissingLeaveRequest
    ? leaveSubtype === "early_leave"
      ? (normalizedEarlyLeaveMinutesPreview ?? 0)
      : getLeaveRequestDurationMinutes(normalizedLeaveSubtype, null)
    : 0;
  const requestedLeaveHoursPreview = isMissingLeaveRequest
    ? getEarlyLeaveHoursFromMinutes(requestedLeaveMinutesPreview)
    : 0;
  const totalLeaveHours =
    typeof leaveBalance?.total_hours === "number" ? Math.max(0, leaveBalance.total_hours) : 0;
  const usedLeaveHours =
    typeof leaveBalance?.used_hours === "number" ? Math.max(0, leaveBalance.used_hours) : 0;
  const remainingLeaveHours = Math.max(0, totalLeaveHours - usedLeaveHours);
  const remoteCheckInIso =
    correctionDate && isRemoteRequest
      ? combineDateAndTimeToIso(correctionDate, remoteCheckInInput)
      : null;
  const remoteCheckOutIso =
    correctionDate && isRemoteRequest
      ? combineDateAndTimeToIso(correctionDate, remoteCheckOutInput)
      : null;
  const computedRemoteMinutes =
    remoteCheckInIso && remoteCheckOutIso
      ? calculateWorkedMinutesBetweenTimestamps(remoteCheckInIso, remoteCheckOutIso)
      : null;

  const resolveCurrentProfileAccess = async () => {
    if (currentProfileAccess?.id) {
      return currentProfileAccess;
    }

    const resolvedProfile = await fetchCurrentProfileAccess();
    setCurrentProfileId(resolvedProfile.id);
    setCurrentProfileAccess(resolvedProfile);
    return resolvedProfile;
  };

  useEffect(() => {
    let isActive = true;

    const bootstrapProfile = async () => {
      try {
        const profile = await fetchCurrentProfileAccess();
        if (!isActive) {
          return;
        }
        setCurrentProfileId(profile.id);
        setCurrentProfileAccess(profile);
        if (!canCreateTimeRequest(profile)) {
          setFormError(TIMEKEEPING_DISABLED_MESSAGE);
        }
      } catch {
        if (!isActive) {
          return;
        }
        setCurrentProfileId(null);
        setCurrentProfileAccess(null);
      }
    };

    void bootstrapProfile();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const parsedQueryDate = fromIsoDateParam(queryCorrectionDate);
    if (!parsedQueryDate) {
      return;
    }

    setCorrectionDate(parsedQueryDate);
  }, [queryCorrectionDate]);

  useEffect(() => {
    if (isRemoteRequest) {
      if (computedRemoteMinutes !== null) {
        setMinutesInput(String(computedRemoteMinutes));
      } else if (minutesInput) {
        setMinutesInput("");
      }
      return;
    }

    setRemoteCheckInInput("");
    setRemoteCheckOutInput("");
  }, [computedRemoteMinutes, isRemoteRequest, minutesInput]);

  useEffect(() => {
    if (isMissingLeaveRequest) {
      return;
    }

    setLeaveSubtype("");
    setEarlyLeaveTimeInput("");
  }, [isMissingLeaveRequest]);

  useEffect(() => {
    if (leaveSubtype !== "early_leave" && earlyLeaveTimeInput) {
      setEarlyLeaveTimeInput("");
    }
  }, [earlyLeaveTimeInput, leaveSubtype]);

  useEffect(() => {
    if (!correctionDate) {
      setSelectedHoliday(null);
      return;
    }

    let isActive = true;

    const loadHoliday = async () => {
      const [holiday] = await fetchHolidaysInRange(supabase, correctionDate, correctionDate);
      if (!isActive) {
        return;
      }

      setSelectedHoliday(holiday ?? null);
    };

    void loadHoliday();

    return () => {
      isActive = false;
    };
  }, [correctionDate]);

  useEffect(() => {
    if (
      !isApprovedLeaveRequest ||
      !currentProfileId ||
      !correctionDate ||
      !canCreateTimeRequest(currentProfileAccess)
    ) {
      setLeaveBalance(null);
      setLeaveBalanceError("");
      setIsLoadingLeaveBalance(false);
      return;
    }

    let isActive = true;

    const fetchLeaveBalance = async () => {
      setIsLoadingLeaveBalance(true);
      setLeaveBalanceError("");

      try {
        const balance = await fetchLeaveBalanceForMonth(currentProfileId, correctionDate);
        if (!isActive) {
          return;
        }
        setLeaveBalance(balance);
      } catch (error) {
        if (!isActive) {
          return;
        }
        setLeaveBalance(null);
        setLeaveBalanceError(error instanceof Error ? error.message : "Không tải được quỹ phép.");
      } finally {
        if (isActive) {
          setIsLoadingLeaveBalance(false);
        }
      }
    };

    void fetchLeaveBalance();

    return () => {
      isActive = false;
    };
  }, [correctionDate, currentProfileAccess, currentProfileId, isApprovedLeaveRequest]);

  const handleMinutesBlur = () => {
    if (!requiresMinutesInput) {
      return;
    }

    const parsedValue = parseIntegerInput(minutesInput);
    if (parsedValue === null || !Number.isFinite(parsedValue) || parsedValue < 0) {
      return;
    }

    const normalizedValue = Math.trunc(parsedValue);
    if (normalizedValue !== parsedValue) {
      setMinutesInput(String(normalizedValue));
    }
  };

  const handleRemoteTimeBlur = (value: string, setter: (nextValue: string) => void) => {
    const normalizedValue = normalize24HourTimeInput(value.trim());
    setter(normalizedValue);
  };

  const handleCancel = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(returnToHref);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setSubmitSuccess("");

    if (!requestType) {
      setFormError("Vui lòng chọn loại yêu cầu.");
      return;
    }
    if (!correctionDate) {
      setFormError("Vui lòng chọn ngày cần điều chỉnh.");
      return;
    }
    if (isTimeRequestDateTooFarInPast(correctionDate)) {
      setFormError(TIME_REQUEST_DATE_WINDOW_MESSAGE);
      return;
    }
    if (isRemoteRequest) {
      if (!remoteCheckInInput || !remoteCheckOutInput || !remoteCheckInIso || !remoteCheckOutIso) {
        setFormError("Làm việc từ xa phải nhập đủ giờ bắt đầu và giờ kết thúc.");
        return;
      }

      if (!computedRemoteMinutes) {
        setFormError("Giờ kết thúc làm việc từ xa phải lớn hơn giờ bắt đầu.");
        return;
      }
    }

    if (isMissingLeaveRequest && !leaveSubtype) {
      setFormError("Vui lòng chọn hình thức nghỉ.");
      return;
    }

    const parsedEarlyLeaveMinutes =
      isMissingLeaveRequest && leaveSubtype === "early_leave"
        ? getEarlyLeaveMinutesFromTimeValue(earlyLeaveTimeInput)
        : null;
    if (
      isMissingLeaveRequest &&
      leaveSubtype === "early_leave" &&
      parsedEarlyLeaveMinutes === null
    ) {
      setFormError(`Giờ về sớm phải trước ${EARLY_LEAVE_FIXED_CHECKOUT_TIME} và tối đa 4 giờ.`);
      return;
    }

    const parsedMinutes = parseIntegerInput(minutesInput);
    if (
      parsedMinutes !== null &&
      (!Number.isFinite(parsedMinutes) || parsedMinutes < 0 || !Number.isInteger(parsedMinutes))
    ) {
      setFormError("Số phút phải là số nguyên từ 0 trở lên, hoặc để trống.");
      return;
    }

    const normalizedMinutes = isRemoteRequest
      ? computedRemoteMinutes
      : isMissingLeaveRequest
        ? leaveSubtype === "early_leave"
          ? parsedEarlyLeaveMinutes
          : getLeaveRequestDurationMinutes(leaveSubtype || null, null)
        : parsedMinutes;

    if (isMissingLeaveRequest && (!normalizedMinutes || normalizedMinutes <= 0)) {
      setFormError("Không xác định được thời lượng nghỉ hợp lệ.");
      return;
    }

    if (requiresMinutesInput && (parsedMinutes === null || normalizedMinutes === 0)) {
      setFormError("Vui lòng nhập số phút điều chỉnh lớn hơn 0.");
      return;
    }
    const normalizedReason = reasonInput.trim();
    if (!normalizedReason) {
      setFormError("Vui lòng nhập lý do.");
      return;
    }

    setIsSubmitting(true);

    try {
      const requesterProfile = await resolveCurrentProfileAccess();

      if (!canCreateTimeRequest(requesterProfile)) {
        throw new Error(TIMEKEEPING_DISABLED_MESSAGE);
      }

      if (
        isApprovedLeaveRequest &&
        typeof normalizedMinutes === "number" &&
        normalizedMinutes > 0
      ) {
        const leaveBalanceRow = await fetchLeaveBalanceForMonth(
          requesterProfile.id,
          correctionDate,
        );
        const totalHours =
          typeof leaveBalanceRow.total_hours === "number"
            ? Math.max(0, leaveBalanceRow.total_hours)
            : 0;
        const usedHours =
          typeof leaveBalanceRow.used_hours === "number"
            ? Math.max(0, leaveBalanceRow.used_hours)
            : 0;
        const remainingHours = Math.max(0, totalHours - usedHours);
        const requestedHours = typeof normalizedMinutes === "number" ? normalizedMinutes / 60 : 0;

        if (requestedHours > remainingHours) {
          throw new Error(
            `Số giờ phép còn lại của tháng này không đủ. Còn ${remainingHours} giờ, yêu cầu ${requestedHours} giờ.`,
          );
        }
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? null;
      if (!accessToken) {
        throw new Error("Phiên đăng nhập không hợp lệ.");
      }

      const response = await fetch("/api/time-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          correctionDate: toIsoDate(correctionDate),
          requestType,
          leaveSubtype: isMissingLeaveRequest ? leaveSubtype || null : null,
          leaveSession: normalizedLeaveSession,
          requestedHours:
            isMissingLeaveRequest &&
            leaveSubtype === "early_leave" &&
            typeof normalizedMinutes === "number"
              ? normalizedMinutes / 60
              : null,
          earlyLeaveTime:
            isMissingLeaveRequest && leaveSubtype === "early_leave" ? earlyLeaveTimeInput : null,
          minutes: normalizedMinutes,
          reason: normalizedReason,
          remoteCheckIn: isRemoteRequest ? remoteCheckInIso : null,
          remoteCheckOut: isRemoteRequest ? remoteCheckOutIso : null,
        }),
      });

      const responseBody = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(responseBody?.error || "Không thể tạo yêu cầu thời gian.");
      }

      setSubmitSuccess("Tạo yêu cầu thành công.");
      runWithoutConfirm(() => {
        router.push(returnToHref);
        router.refresh();
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Không thể gửi yêu cầu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="timeRequestForms" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader
            title="Tạo yêu cầu điều chỉnh công"
            items={[
              { label: "Chấm công", href: "/timesheet" },
              { label: "Yêu cầu thời gian", href: "/timesheet/requests" },
              { label: "Tạo mới" },
            ]}
          />

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-7">
            <section className="mx-auto w-full max-w-[920px] rounded-2xl border border-slate-200 bg-white p-5 lg:p-6">
              <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
                {formError ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {formError}
                  </div>
                ) : null}
                {submitSuccess ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {submitSuccess}
                  </div>
                ) : null}
                {isBlockedPastDate ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Chỉ có thể tạo yêu cầu lùi tối đa {TIME_REQUEST_BACKDATE_LIMIT_DAYS} ngày. Nếu
                    ngày thuộc tháng trước nhưng vẫn nằm trong khoảng này thì vẫn được phép tạo.
                  </div>
                ) : null}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-800">Loại yêu cầu</label>
                  <Select
                    value={requestType || undefined}
                    onValueChange={(value) => setRequestType(value as TimeRequestType)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn loại yêu cầu" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_REQUEST_TYPES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-3 text-sm font-semibold text-slate-800">
                    Chọn ngày cần điều chỉnh
                  </p>
                  <div className="max-w-[280px]">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-11 w-full justify-start rounded-xl border-slate-200 px-3 text-left text-sm"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 text-slate-500" />
                          {correctionDate
                            ? format(correctionDate, "dd/MM/yyyy", { locale: vi })
                            : "Chọn ngày"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={correctionDate}
                          onSelect={setCorrectionDate}
                          disabled={
                            earliestAllowedCorrectionDate
                              ? { before: earliestAllowedCorrectionDate }
                              : undefined
                          }
                          locale={vi}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {selectedHoliday ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    <p className="font-semibold">Ngày nghỉ</p>
                    <p className="mt-1">
                      {selectedHoliday.name}
                      {isMissingLeaveRequest
                        ? " · Yêu cầu nghỉ trên ngày này vẫn có thể tạo nhưng sẽ không bị tính vào thiếu giờ hoặc nghỉ không phép."
                        : " · Ngày này không phát sinh requiredWorkingMinutes."}
                    </p>
                  </div>
                ) : null}

                {isApprovedLeaveRequest ? (
                  isLoadingLeaveBalance ? (
                    <p className="text-sm font-medium text-amber-700">Đang tải quỹ phép...</p>
                  ) : leaveBalanceError ? (
                    <p className="text-sm font-medium text-rose-700">{leaveBalanceError}</p>
                  ) : leaveBalance ? (
                    <p className="text-sm font-medium text-amber-700">
                      Quỹ phép của tháng đã chọn còn lại: {formatHoursLabel(remainingLeaveHours)}.
                    </p>
                  ) : null
                ) : null}

                {isRemoteRequest ? (
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-800">
                          Giờ bắt đầu làm việc từ xa *
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={remoteCheckInInput}
                          onChange={(event) =>
                            setRemoteCheckInInput(normalize24HourTimeInput(event.target.value))
                          }
                          onBlur={() =>
                            handleRemoteTimeBlur(remoteCheckInInput, setRemoteCheckInInput)
                          }
                          placeholder="08:30"
                          maxLength={5}
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-800">
                          Giờ kết thúc làm việc từ xa *
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={remoteCheckOutInput}
                          onChange={(event) =>
                            setRemoteCheckOutInput(normalize24HourTimeInput(event.target.value))
                          }
                          onBlur={() =>
                            handleRemoteTimeBlur(remoteCheckOutInput, setRemoteCheckOutInput)
                          }
                          placeholder="17:30"
                          maxLength={5}
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>
                  </div>
                ) : isMissingLeaveRequest ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-800">
                        Hình thức nghỉ *
                      </label>
                      <Select
                        value={leaveSubtype || undefined}
                        onValueChange={(value) => setLeaveSubtype(value as LeaveRequestSubtype)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn hình thức nghỉ" />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAVE_REQUEST_SUBTYPES.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {leaveSubtype === "early_leave" ? (
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-800">Giờ về sớm *</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={earlyLeaveTimeInput}
                          onChange={(event) =>
                            setEarlyLeaveTimeInput(normalize24HourTimeInput(event.target.value))
                          }
                          onBlur={() =>
                            handleRemoteTimeBlur(earlyLeaveTimeInput, setEarlyLeaveTimeInput)
                          }
                          placeholder="Ví dụ: 14:00"
                          maxLength={5}
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />

                        {normalizedEarlyLeaveMinutesPreview ? (
                          <p className="text-xs font-medium text-slate-500">
                            Hệ thống sẽ ghi nhận {normalizedEarlyLeaveMinutesPreview} phút thiếu
                            công.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800">
                      Số phút điều chỉnh {requiresMinutesInput ? "*" : ""}
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={minutesInput}
                      onChange={(event) => setMinutesInput(event.target.value)}
                      onBlur={handleMinutesBlur}
                      placeholder={
                        requiresMinutesInput
                          ? "Ví dụ: 120"
                          : "Ví dụ: 30 (để trống nếu không áp dụng)"
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    {parsedMinutesPreview !== null &&
                    Number.isFinite(parsedMinutesPreview) &&
                    parsedMinutesPreview > 0 ? (
                      <p className="text-xs font-medium text-slate-500">
                        Hệ thống sẽ ghi nhận {parsedMinutesPreview} phút điều chỉnh.
                      </p>
                    ) : null}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-800">Lý do</label>
                  <textarea
                    rows={4}
                    value={reasonInput}
                    onChange={(event) => setReasonInput(event.target.value)}
                    placeholder="Nhập lý do..."
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={
                      isBlockedPastDate ||
                      isSubmitting ||
                      (isApprovedLeaveRequest && isLoadingLeaveBalance) ||
                      !canCreateTimeRequest(currentProfileAccess)
                    }
                    className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSubmitting ? "Đang gửi..." : "Gửi yêu cầu"}
                  </button>
                </div>
              </form>
            </section>
          </main>
        </div>
      </div>
      {leaveConfirmDialog}
    </div>
  );
}

export default function CreateTimeRequestPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f3f5fa]" />}>
      <CreateTimeRequestPageContent />
    </Suspense>
  );
}
