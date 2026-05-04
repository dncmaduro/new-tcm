"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { useEffect, useState } from "react";
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
  TIME_REQUEST_TYPES,
  getTimeRequestTypeDescription,
  type TimeRequestType,
  roundLeaveMinutesUp,
} from "@/lib/constants/time-requests";
import { fetchHolidaysInRange, type Holiday } from "@/lib/holidays";
import { supabase } from "@/lib/supabase";
import { calculateWorkedMinutesBetweenTimestamps } from "@/lib/work-time";

type RoleRow = {
  id: string;
  name: string | null;
};

type UserRoleRow = {
  profile_id: string | null;
  department_id: string | null;
  role_id: string | null;
};

type DepartmentRow = {
  id: string;
  parent_department_id: string | null;
};

type LeaveBalanceRow = {
  id: string;
  profile_id: string | null;
  month: string | null;
  total_hours: number | null;
  used_hours: number | null;
  created_at: string | null;
};

const normalizeText = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

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

const parseMinutesInput = (value: string) => {
  const normalizedValue = value.trim();
  if (normalizedValue === "") {
    return null;
  }
  return Number(normalizedValue);
};

const formatHoursLabel = (value: number) => `${Math.max(0, value)} giờ`;

const combineDateAndTimeToIso = (date: Date, timeValue: string) => {
  if (!timeValue || !/^\d{2}:\d{2}$/.test(timeValue)) {
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

const formatDurationShort = (minutes: number) => {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const restMinutes = safeMinutes % 60;

  if (hours === 0) {
    return `${restMinutes} phút`;
  }
  if (restMinutes === 0) {
    return `${hours} giờ`;
  }

  return `${hours} giờ ${restMinutes} phút`;
};

const fetchCurrentProfileId = async () => {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error("Không xác thực được người dùng.");
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (profileError || !profileData?.id) {
    throw new Error(profileError?.message ?? "Không tìm thấy hồ sơ người dùng.");
  }

  return String(profileData.id);
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

const getAncestors = (
  startDepartmentIds: string[],
  parentDepartmentById: Record<string, string | null>,
  includeSelf: boolean,
) => {
  const scoped = new Set<string>();
  startDepartmentIds.forEach((startId) => {
    let cursor: string | null = startId;
    let isFirst = true;
    while (cursor) {
      if ((includeSelf || !isFirst) && !scoped.has(cursor)) {
        scoped.add(cursor);
      }
      cursor = parentDepartmentById[cursor] ?? null;
      isFirst = false;
    }
  });
  return Array.from(scoped);
};

export default function CreateTimeRequestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryCorrectionDate = searchParams.get("date");
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [requestType, setRequestType] = useState<TimeRequestType | "">("");
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
  const isApprovedLeaveRequest = requestType === "approved_leave";
  const isUnauthorizedLeaveRequest = requestType === "unauthorized_leave";
  const isRemoteRequest = requestType === "remote";
  const requiresMinutesInput = isApprovedLeaveRequest;
  const parsedMinutesPreview = parseMinutesInput(minutesInput);
  const roundedLeaveMinutesPreview =
    isApprovedLeaveRequest &&
    parsedMinutesPreview !== null &&
    Number.isFinite(parsedMinutesPreview) &&
    parsedMinutesPreview > 0
      ? roundLeaveMinutesUp(parsedMinutesPreview)
      : 0;
  const requestedLeaveHoursPreview =
    roundedLeaveMinutesPreview > 0 ? roundedLeaveMinutesPreview / 60 : 0;
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

  const resolveCurrentProfileId = async () => {
    if (currentProfileId) {
      return currentProfileId;
    }

    const resolvedProfileId = await fetchCurrentProfileId();
    setCurrentProfileId(resolvedProfileId);
    return resolvedProfileId;
  };

  useEffect(() => {
    let isActive = true;

    const bootstrapProfile = async () => {
      try {
        const profileId = await fetchCurrentProfileId();
        if (!isActive) {
          return;
        }
        setCurrentProfileId(profileId);
      } catch {
        if (!isActive) {
          return;
        }
        setCurrentProfileId(null);
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
    if (!isApprovedLeaveRequest || !currentProfileId || !correctionDate) {
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
  }, [correctionDate, currentProfileId, isApprovedLeaveRequest]);

  const handleMinutesBlur = () => {
    if (!isApprovedLeaveRequest) {
      return;
    }

    const parsedValue = parseMinutesInput(minutesInput);
    if (parsedValue === null || !Number.isFinite(parsedValue) || parsedValue <= 0) {
      return;
    }

    const roundedMinutes = roundLeaveMinutesUp(parsedValue);
    if (roundedMinutes !== parsedValue) {
      setMinutesInput(String(roundedMinutes));
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setSubmitSuccess("");

    const reviewerDebug = {
      submittedAt: new Date().toISOString(),
      requestType,
      correctionDate: correctionDate ? toIsoDate(correctionDate) : null,
      inputMinutes: minutesInput,
      remoteCheckIn: remoteCheckInIso,
      remoteCheckOut: remoteCheckOutIso,
      roundedLeaveMinutes: null as number | null,
      requestedLeaveHours: null as number | null,
      reason: reasonInput,
      requesterProfileId: null as string | null,
      leaveBalance: null as null | {
        total_hours: number;
        used_hours: number;
        remaining_hours: number;
      },
      roles: [] as Array<{ id: string; name: string | null }>,
      memberRoleIds: [] as string[],
      leaderRoleIds: [] as string[],
      directorRoleIds: [] as string[],
      requesterRoles: [] as Array<{ department_id: string | null; role_id: string | null }>,
      requesterScope: null as "member" | "leader" | "director" | null,
      ownLeaderDepartmentIds: [] as string[],
      parentDepartmentIds: [] as string[],
      scopedDepartmentIds: [] as string[],
      parentLeaders: [] as string[],
      directorReviewers: [] as string[],
      reviewerProfileIds: [] as string[],
      error: null as string | null,
    };

    if (!requestType) {
      setFormError("Vui lòng chọn loại yêu cầu.");
      return;
    }
    if (!correctionDate) {
      setFormError("Vui lòng chọn ngày cần điều chỉnh.");
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

    const parsedMinutes = parseMinutesInput(minutesInput);
    if (
      parsedMinutes !== null &&
      (!Number.isFinite(parsedMinutes) || parsedMinutes < 0 || !Number.isInteger(parsedMinutes))
    ) {
      setFormError("Số phút phải là số nguyên từ 0 trở lên, hoặc để trống.");
      return;
    }
    const normalizedMinutes = isRemoteRequest
      ? computedRemoteMinutes
      : isApprovedLeaveRequest
        ? roundLeaveMinutesUp(parsedMinutes)
        : parsedMinutes;
    reviewerDebug.roundedLeaveMinutes = normalizedMinutes;
    reviewerDebug.requestedLeaveHours =
      isApprovedLeaveRequest && typeof normalizedMinutes === "number"
        ? normalizedMinutes / 60
        : null;

    if (requiresMinutesInput && (parsedMinutes === null || normalizedMinutes === 0)) {
      setFormError("Thiếu thời gian có phép phải nhập số phút thiếu lớn hơn 0.");
      return;
    }
    const normalizedReason = reasonInput.trim();
    if (!normalizedReason) {
      setFormError("Vui lòng nhập lý do.");
      return;
    }

    setIsSubmitting(true);

    try {
      const requesterProfileId = await resolveCurrentProfileId();
      reviewerDebug.requesterProfileId = requesterProfileId;

      if (
        isApprovedLeaveRequest &&
        typeof normalizedMinutes === "number" &&
        normalizedMinutes > 0
      ) {
        const leaveBalanceRow = await fetchLeaveBalanceForMonth(requesterProfileId, correctionDate);
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

        reviewerDebug.leaveBalance = {
          total_hours: totalHours,
          used_hours: usedHours,
          remaining_hours: remainingHours,
        };

        if (requestedHours > remainingHours) {
          throw new Error(
            `Số giờ phép còn lại của tháng này không đủ. Còn ${remainingHours} giờ, yêu cầu ${requestedHours} giờ.`,
          );
        }
      }

      const [
        { data: rolesData, error: rolesError },
        { data: requesterRolesData, error: requesterRolesError },
      ] = await Promise.all([
        supabase.from("roles").select("id,name"),
        supabase
          .from("user_role_in_department")
          .select("profile_id,department_id,role_id")
          .eq("profile_id", requesterProfileId),
      ]);

      if (rolesError) {
        throw new Error(rolesError.message || "Không tải được danh sách vai trò.");
      }
      if (requesterRolesError) {
        throw new Error(
          requesterRolesError.message || "Không tải được vai trò của người tạo yêu cầu.",
        );
      }

      const typedRoles = (rolesData ?? []) as RoleRow[];
      const typedRequesterRoles = (requesterRolesData ?? []) as UserRoleRow[];
      reviewerDebug.roles = typedRoles.map((role) => ({
        id: String(role.id),
        name: role.name ?? null,
      }));
      reviewerDebug.requesterRoles = typedRequesterRoles.map((row) => ({
        department_id: row.department_id ? String(row.department_id) : null,
        role_id: row.role_id ? String(row.role_id) : null,
      }));

      const leaderRoleIds = typedRoles
        .filter((role) => {
          const roleName = normalizeText(role.name);
          return (
            roleName === "leader" || roleName.includes("leader") || roleName.includes("truong nhom")
          );
        })
        .map((role) => String(role.id));
      const memberRoleIds = typedRoles
        .filter((role) => {
          const roleName = normalizeText(role.name);
          return (
            roleName === "member" || roleName.includes("member") || roleName.includes("thanh vien")
          );
        })
        .map((role) => String(role.id));
      const directorRoleIds = typedRoles
        .filter((role) => {
          const roleName = normalizeText(role.name);
          return (
            roleName === "giam doc" || roleName.includes("giam doc") || roleName === "director"
          );
        })
        .map((role) => String(role.id));
      reviewerDebug.leaderRoleIds = leaderRoleIds;
      reviewerDebug.memberRoleIds = memberRoleIds;
      reviewerDebug.directorRoleIds = directorRoleIds;

      const hasDirectorRole = typedRequesterRoles.some(
        (row) => row.role_id && directorRoleIds.includes(String(row.role_id)),
      );
      const hasLeaderRole = typedRequesterRoles.some(
        (row) => row.role_id && leaderRoleIds.includes(String(row.role_id)),
      );
      const requesterScope: "member" | "leader" | "director" = hasDirectorRole
        ? "director"
        : hasLeaderRole
          ? "leader"
          : "member";
      reviewerDebug.requesterScope = requesterScope;

      const { data: departmentsData, error: departmentsError } = await supabase
        .from("departments")
        .select("id,parent_department_id");
      if (departmentsError) {
        throw new Error(departmentsError.message || "Không tải được cây phòng ban.");
      }

      const parentDepartmentById = ((departmentsData ?? []) as DepartmentRow[]).reduce<
        Record<string, string | null>
      >((acc, item) => {
        acc[String(item.id)] = item.parent_department_id ? String(item.parent_department_id) : null;
        return acc;
      }, {});

      let reviewerProfileIds: string[] = [];

      if (requesterScope === "member") {
        const currentDepartmentIds = [
          ...new Set(
            typedRequesterRoles
              .filter(
                (row) =>
                  row.department_id && row.role_id && memberRoleIds.includes(String(row.role_id)),
              )
              .map((row) => String(row.department_id)),
          ),
        ];
        const fallbackDepartmentIds =
          currentDepartmentIds.length > 0
            ? currentDepartmentIds
            : [
                ...new Set(
                  typedRequesterRoles
                    .map((row) => row.department_id)
                    .filter(Boolean)
                    .map((item) => String(item)),
                ),
              ];

        const scopedDepartmentIds = getAncestors(fallbackDepartmentIds, parentDepartmentById, true);
        reviewerDebug.scopedDepartmentIds = scopedDepartmentIds;

        if (leaderRoleIds.length > 0 && scopedDepartmentIds.length > 0) {
          const { data: reviewerRows, error: reviewerError } = await supabase
            .from("user_role_in_department")
            .select("profile_id")
            .in("department_id", scopedDepartmentIds)
            .in("role_id", leaderRoleIds);

          if (reviewerError) {
            throw new Error(
              reviewerError.message || "Không tải được danh sách Leader duyệt yêu cầu.",
            );
          }

          reviewerProfileIds = [
            ...new Set(
              (reviewerRows ?? [])
                .map((row) => row.profile_id)
                .filter(Boolean)
                .map((item) => String(item))
                .filter((item) => item !== requesterProfileId),
            ),
          ];
        }
      } else if (requesterScope === "leader") {
        const ownLeaderDepartmentIds = [
          ...new Set(
            typedRequesterRoles
              .filter(
                (row) =>
                  row.department_id && row.role_id && leaderRoleIds.includes(String(row.role_id)),
              )
              .map((row) => String(row.department_id)),
          ),
        ];
        reviewerDebug.ownLeaderDepartmentIds = ownLeaderDepartmentIds;

        const parentDepartmentIds = getAncestors(
          ownLeaderDepartmentIds,
          parentDepartmentById,
          false,
        );
        reviewerDebug.parentDepartmentIds = parentDepartmentIds;
        let parentLeaders: string[] = [];
        if (leaderRoleIds.length > 0 && parentDepartmentIds.length > 0) {
          const { data: parentLeaderRows, error: parentLeaderError } = await supabase
            .from("user_role_in_department")
            .select("profile_id")
            .in("department_id", parentDepartmentIds)
            .in("role_id", leaderRoleIds);

          if (parentLeaderError) {
            throw new Error(parentLeaderError.message || "Không tải được Leader phòng ban cha.");
          }

          parentLeaders = [
            ...new Set(
              (parentLeaderRows ?? [])
                .map((row) => row.profile_id)
                .filter(Boolean)
                .map((item) => String(item)),
            ),
          ];
          reviewerDebug.parentLeaders = parentLeaders;
        }

        let directorReviewers: string[] = [];
        if (directorRoleIds.length > 0) {
          const { data: directorRows, error: directorError } = await supabase
            .from("user_role_in_department")
            .select("profile_id")
            .in("role_id", directorRoleIds);

          if (directorError) {
            throw new Error(
              directorError.message || "Không tải được người duyệt vai trò Giám đốc.",
            );
          }

          directorReviewers = [
            ...new Set(
              (directorRows ?? [])
                .map((row) => row.profile_id)
                .filter(Boolean)
                .map((item) => String(item)),
            ),
          ];
          reviewerDebug.directorReviewers = directorReviewers;
        }

        reviewerProfileIds = [...new Set([...parentLeaders, ...directorReviewers])].filter(
          (item) => item !== requesterProfileId,
        );
      }

      reviewerDebug.reviewerProfileIds = reviewerProfileIds;

      if (
        (requesterScope === "member" || requesterScope === "leader") &&
        reviewerProfileIds.length === 0
      ) {
        if (requesterScope === "leader") {
          throw new Error(
            "Không tìm thấy người duyệt cho Leader. Cần có Leader phòng ban cha hoặc role Giám đốc trong user_role_in_department.",
          );
        }
        throw new Error("Không tìm thấy người duyệt phù hợp theo cấu hình phòng ban hiện tại.");
      }

      const { data: createdRequest, error: createRequestError } = await supabase
        .from("time_requests")
        .insert({
          profile_id: requesterProfileId,
          date: toIsoDate(correctionDate),
          type: requestType,
          minutes: normalizedMinutes,
          reason: normalizedReason,
          remote_check_in: isRemoteRequest ? remoteCheckInIso : null,
          remote_check_out: isRemoteRequest ? remoteCheckOutIso : null,
        })
        .select("id")
        .maybeSingle();

      if (createRequestError || !createdRequest?.id) {
        throw new Error(createRequestError?.message || "Không thể tạo yêu cầu thời gian.");
      }

      if (reviewerProfileIds.length > 0) {
        const reviewerPayload = reviewerProfileIds.map((reviewerProfileId) => ({
          time_request_id: String(createdRequest.id),
          profile_id: reviewerProfileId,
        }));

        const { error: insertReviewerError } = await supabase
          .from("time_request_reviewers")
          .insert(reviewerPayload);
        if (insertReviewerError) {
          throw new Error(insertReviewerError.message || "Không thể tạo danh sách người duyệt.");
        }
      }

      setSubmitSuccess("Tạo yêu cầu thành công.");
      router.push("/timesheet");
      router.refresh();
    } catch (error) {
      reviewerDebug.error = error instanceof Error ? error.message : "Không thể gửi yêu cầu.";
      setFormError(error instanceof Error ? error.message : "Không thể gửi yêu cầu.");
    } finally {
      setIsSubmitting(false);
      console.groupCollapsed("[time-request/new] Debug người duyệt");
      console.log(reviewerDebug);
      console.groupEnd();
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="timesheet" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader
            title="Tạo yêu cầu điều chỉnh công"
            items={[
              { label: "Chấm công", href: "/timesheet" },
              { label: "Yêu cầu công" },
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
                  <p className="text-xs text-slate-500">
                    {requestType
                      ? getTimeRequestTypeDescription(requestType)
                      : "Thiếu thời gian có phép/không phép dùng chung cho nghỉ, về sớm và đi muộn."}
                  </p>
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
                      {isApprovedLeaveRequest || isUnauthorizedLeaveRequest
                        ? " · Yêu cầu thiếu giờ trên ngày này vẫn có thể tạo nhưng sẽ không bị tính vào thiếu giờ hoặc nghỉ không phép."
                        : " · Ngày này không phát sinh requiredWorkingMinutes."}
                    </p>
                  </div>
                ) : null}

                {isApprovedLeaveRequest ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-amber-900">
                          Quỹ phép tháng đang chọn
                        </p>
                        <p className="text-xs text-amber-700">
                          Quỹ phép được cộng dồn nhưng tổng mỗi tháng không vượt quá 16 giờ.
                        </p>
                      </div>
                      {correctionDate ? (
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-700">
                          {format(correctionDate, "MM/yyyy", { locale: vi })}
                        </span>
                      ) : null}
                    </div>

                    {isLoadingLeaveBalance ? (
                      <p className="mt-3 text-sm text-amber-700">Đang tải quỹ phép...</p>
                    ) : leaveBalanceError ? (
                      <p className="mt-3 text-sm text-rose-700">{leaveBalanceError}</p>
                    ) : leaveBalance ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-amber-200 bg-white px-4 py-3">
                          <p className="text-xs font-semibold tracking-[0.08em] text-amber-500 uppercase">
                            Tổng giờ phép trong tháng
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-amber-950">
                            {formatHoursLabel(totalLeaveHours)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-amber-200 bg-white px-4 py-3">
                          <p className="text-xs font-semibold tracking-[0.08em] text-amber-500 uppercase">
                            Đã dùng
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-amber-950">
                            {formatHoursLabel(usedLeaveHours)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-amber-200 bg-white px-4 py-3">
                          <p className="text-xs font-semibold tracking-[0.08em] text-amber-500 uppercase">
                            Còn lại
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-amber-950">
                            {formatHoursLabel(remainingLeaveHours)}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {isRemoteRequest ? (
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-800">
                          Giờ bắt đầu làm việc từ xa *
                        </label>
                        <input
                          type="time"
                          step={60}
                          value={remoteCheckInInput}
                          onChange={(event) => setRemoteCheckInInput(event.target.value)}
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-800">
                          Giờ kết thúc làm việc từ xa *
                        </label>
                        <input
                          type="time"
                          step={60}
                          value={remoteCheckOutInput}
                          onChange={(event) => setRemoteCheckOutInput(event.target.value)}
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl border border-indigo-100 bg-white px-4 py-3">
                      <p className="text-xs font-semibold tracking-[0.08em] text-indigo-500 uppercase">
                        Tổng thời gian làm việc từ xa
                      </p>
                      <p className="mt-2 text-lg font-semibold text-indigo-900">
                        {computedRemoteMinutes !== null
                          ? formatDurationShort(computedRemoteMinutes)
                          : "--"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Hệ thống tự tính `minutes` từ chênh lệch giữa giờ bắt đầu và giờ kết thúc
                        làm việc từ xa.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800">
                      Số phút điều chỉnh {requiresMinutesInput ? "*" : "(tùy chọn)"}
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
                          ? "Nhập tổng số phút thiếu"
                          : "Ví dụ: 30 (để trống nếu không áp dụng)"
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    <p className="text-xs text-slate-500">
                      {isApprovedLeaveRequest
                        ? requiresMinutesInput
                          ? "Nhập tổng thời gian thiếu cho trường hợp nghỉ, về sớm hoặc đi muộn."
                          : "Có thể để trống. Nếu có nhập, hệ thống sẽ làm tròn lên theo giờ."
                        : isUnauthorizedLeaveRequest
                          ? "Nhập đúng số phút thiếu cho trường hợp nghỉ, về sớm hoặc đi muộn không phép."
                          : "Lưu trực tiếp vào cột minutes của bảng time_requests."}
                    </p>
                    {isApprovedLeaveRequest ? (
                      <p className="text-xs font-medium text-amber-700">
                        {parsedMinutesPreview !== null &&
                        Number.isFinite(parsedMinutesPreview) &&
                        parsedMinutesPreview > 0
                          ? `Hệ thống sẽ quy đổi ${parsedMinutesPreview} phút thành ${roundedLeaveMinutesPreview} phút (${requestedLeaveHoursPreview} giờ) theo bội số 60 phút gần nhất.${leaveBalance && !isLoadingLeaveBalance && !leaveBalanceError ? ` Sau khi gửi sẽ còn ${Math.max(0, remainingLeaveHours - requestedLeaveHoursPreview)} giờ phép.` : ""}`
                          : "Thời gian thiếu có phép sẽ được quy đổi lên theo bội số 60 phút gần nhất."}
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
                    placeholder="Nhập lý do điều chỉnh..."
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                  <Link
                    href="/timesheet"
                    className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Hủy
                  </Link>
                  <button
                    type="submit"
                    disabled={isSubmitting || (isApprovedLeaveRequest && isLoadingLeaveBalance)}
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
    </div>
  );
}
