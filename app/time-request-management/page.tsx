"use client";

import { Eye } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { TimeRequestDetailDialog } from "@/components/timesheet/time-request-detail-dialog";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TIME_REQUEST_TYPES,
  getLeaveRequestSubtypeLabel,
  getTimeRequestDisplayLabel,
  getTimeRequestReason,
  getTimeRequestReviewStatus,
  isMissingTimeRequestType,
  type LeaveRequestSession,
  type LeaveRequestSubtype,
  type TimeRequestReviewStatus,
  type TimeRequestType,
} from "@/lib/constants/time-requests";
import { formatDateDdMmYyyy, formatDateTimeDdMmYyyy } from "@/lib/date-format";
import { buildHolidayMap, fetchHolidaysInRange, type Holiday } from "@/lib/holidays";
import { supabase } from "@/lib/supabase";
import {
  buildTimeRequestSharePath,
  canManageTimeRequestProfile,
  resolveCurrentViewerProfileId,
  resolveTimeRequestManagementScope,
  type TimeRequestRoleScope,
} from "@/lib/time-request-access";
import { calculateWorkedMinutesBetweenTimestamps } from "@/lib/work-time";

type ProfileRow = {
  id: string;
  name: string | null;
  email?: string | null;
};

type RequestStatus = TimeRequestReviewStatus;

type TimeRequestReviewerRow = {
  id: string;
  profile_id: string | null;
  is_approved: boolean | null;
  comment: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type TimeRequestRow = {
  id: string;
  profile_id: string | null;
  date: string | null;
  type: TimeRequestType | null;
  leave_subtype: LeaveRequestSubtype | null;
  leave_session: LeaveRequestSession | null;
  requested_hours: number | null;
  minutes: number | null;
  reason: string | null;
  remote_check_in: string | null;
  remote_check_out: string | null;
  created_at: string | null;
  updated_at: string | null;
  time_request_reviewers?: TimeRequestReviewerRow[] | null;
};

const formatDateVi = (value: string | null) => {
  return formatDateDdMmYyyy(value, "--", "--");
};

const formatDateViLong = (value: string | null) => {
  return formatDateDdMmYyyy(value, "--", "--");
};

const formatTimeVi = (value: string | null) => {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

const formatDateTime = (value: string | null) => {
  return formatDateTimeDdMmYyyy(value, "--", "--");
};

const formatDurationLabel = (totalMinutes: number | null) => {
  if (typeof totalMinutes !== "number" || !Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return "--";
  }

  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h${String(minutes).padStart(2, "0")}`;
};

const toRequestStatus = (reviewers: TimeRequestReviewerRow[] | null | undefined): RequestStatus =>
  getTimeRequestReviewStatus(reviewers);

const formatMinutesLabel = (type: TimeRequestType | null, minutes: number | null) => {
  if (typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0) {
    if (isMissingTimeRequestType(type)) {
      return `${minutes} phút thiếu`;
    }
    if (type === "remote") {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      if (hours === 0) {
        return `${minutes} phút làm việc từ xa`;
      }
      if (remainingMinutes === 0) {
        return `${hours} giờ làm việc từ xa`;
      }
      return `${hours} giờ ${remainingMinutes} phút làm việc từ xa`;
    }
    return `${minutes} phút`;
  }

  if (type === "unauthorized_leave") {
    return "Không khai báo";
  }

  return "--";
};

const formatLeaveDetailLabel = (
  subtype: LeaveRequestSubtype | null,
  session: LeaveRequestSession | null,
  requestedHours: number | null,
) => {
  if (!subtype) {
    return null;
  }

  const subtypeLabel = getLeaveRequestSubtypeLabel(subtype, session);
  if (
    subtype === "early_leave" &&
    typeof requestedHours === "number" &&
    Number.isFinite(requestedHours) &&
    requestedHours > 0
  ) {
    return `${subtypeLabel} ${requestedHours} giờ`;
  }

  return subtypeLabel;
};

const resolveRequestMinutes = (request: TimeRequestRow) => {
  if (request.type === "remote") {
    return (
      calculateWorkedMinutesBetweenTimestamps(request.remote_check_in, request.remote_check_out) ??
      0
    );
  }

  return typeof request.minutes === "number" && Number.isFinite(request.minutes)
    ? Math.max(0, request.minutes)
    : null;
};

const getTypeBadgeClassName = (type: TimeRequestType | null) => {
  if (type === "approved_leave") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (type === "unauthorized_leave") {
    return "bg-rose-50 text-rose-700";
  }
  if (type === "overtime") {
    return "bg-blue-50 text-blue-700";
  }
  if (type === "remote") {
    return "bg-indigo-50 text-indigo-700";
  }
  return "bg-slate-100 text-slate-700";
};

function StatusBadge({ status }: { status: RequestStatus }) {
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

function TimeRequestManagementPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [roleScope, setRoleScope] = useState<TimeRequestRoleScope>("member");
  const [managedProfileIds, setManagedProfileIds] = useState<string[] | null>([]);
  const [requests, setRequests] = useState<TimeRequestRow[]>([]);
  const [holidaysByDate, setHolidaysByDate] = useState<Map<string, Holiday>>(new Map());
  const [profileNameById, setProfileNameById] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openRequestError, setOpenRequestError] = useState<string | null>(null);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | RequestStatus>("all");
  const [profileFilter, setProfileFilter] = useState<string>("all");
  const [requestTypeFilter, setRequestTypeFilter] = useState<"all" | TimeRequestType>("all");
  const [reloadSeed, setReloadSeed] = useState<number>(0);
  const openedRequestId = searchParams.get("request")?.trim() || null;

  const updateRequestQuery = (requestId: string | null) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (requestId) {
      nextParams.set("request", requestId);
    } else {
      nextParams.delete("request");
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  };

  useEffect(() => {
    let isActive = true;

    const loadRequests = async () => {
      setIsLoading(true);
      setLoadError(null);
      setActionError(null);

      try {
        const viewerProfileId = await resolveCurrentViewerProfileId();

        if (!isActive) {
          return;
        }
        setCurrentProfileId(viewerProfileId);
        const managementScope = await resolveTimeRequestManagementScope(viewerProfileId);

        if (!isActive) {
          return;
        }
        setRoleScope(managementScope.roleScope);
        setManagedProfileIds(managementScope.managedProfileIds);

        const requestsQuery = supabase
          .from("time_requests")
          .select(
            "id,profile_id,date,type,leave_subtype,leave_session,requested_hours,minutes,reason,remote_check_in,remote_check_out,created_at,updated_at,time_request_reviewers(id,profile_id,is_approved,comment,reviewed_at,created_at)",
          )
          .order("created_at", { ascending: false });

        let requestRows: TimeRequestRow[] = [];
        if (managementScope.roleScope === "director") {
          const { data, error } = await requestsQuery.neq("profile_id", viewerProfileId);
          if (error) {
            throw new Error(error.message || "Không tải được yêu cầu thời gian.");
          }
          requestRows = (data ?? []) as TimeRequestRow[];
        } else {
          const targetProfileIds = managementScope.managedProfileIds ?? [];
          if (targetProfileIds.length === 0) {
            requestRows = [];
          } else {
            const { data, error } = await requestsQuery.in("profile_id", targetProfileIds);
            if (error) {
              throw new Error(error.message || "Không tải được yêu cầu thời gian.");
            }
            requestRows = (data ?? []) as TimeRequestRow[];
          }
        }

        if (!isActive) {
          return;
        }
        const requestDateValues = requestRows
          .map((item) => item.date)
          .filter((value): value is string => Boolean(value))
          .sort((a, b) => a.localeCompare(b));
        if (requestDateValues.length > 0) {
          const holidayRows = await fetchHolidaysInRange(
            supabase,
            requestDateValues[0],
            requestDateValues[requestDateValues.length - 1],
          );

          if (!isActive) {
            return;
          }

          setHolidaysByDate(buildHolidayMap(holidayRows));
        } else {
          setHolidaysByDate(new Map());
        }

        setRequests(
          requestRows.map((item) => ({
            ...item,
            minutes: resolveRequestMinutes(item),
          })),
        );

        const requesterProfileIds = [
          ...new Set(
            requestRows
              .map((row) => row.profile_id)
              .filter(Boolean)
              .map((item) => String(item)),
          ),
        ];

        if (requesterProfileIds.length === 0) {
          setProfileNameById({});
          return;
        }

        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id,name,email")
          .in("id", requesterProfileIds);

        if (profilesError) {
          throw new Error(profilesError.message || "Không tải được thông tin nhân sự.");
        }

        if (!isActive) {
          return;
        }

        const nameMap = ((profilesData ?? []) as ProfileRow[]).reduce<Record<string, string>>(
          (acc, profile) => {
            acc[String(profile.id)] = profile.name
              ? String(profile.name)
              : profile.email
                ? String(profile.email)
                : "Không rõ";
            return acc;
          },
          {},
        );
        setProfileNameById(nameMap);
      } catch (error) {
        if (!isActive) {
          return;
        }
        setLoadError(
          error instanceof Error ? error.message : "Không tải được dữ liệu duyệt yêu cầu.",
        );
        setCurrentProfileId(null);
        setRoleScope("member");
        setManagedProfileIds([]);
        setRequests([]);
        setHolidaysByDate(new Map());
        setProfileNameById({});
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadRequests();

    return () => {
      isActive = false;
    };
  }, [reloadSeed]);

  useEffect(() => {
    if (!openedRequestId) {
      setOpenRequestError(null);
      return;
    }

    if (isLoading || loadError || !currentProfileId) {
      return;
    }

    if (requests.some((item) => item.id === openedRequestId)) {
      setOpenRequestError(null);
      return;
    }

    let isActive = true;

    const validateOpenedRequest = async () => {
      try {
        const { data, error } = await supabase
          .from("time_requests")
          .select("id,profile_id")
          .eq("id", openedRequestId)
          .maybeSingle();

        if (error || !data?.id) {
          throw new Error(error?.message ?? "Không tìm thấy yêu cầu thời gian.");
        }

        const isAllowed = canManageTimeRequestProfile(currentProfileId, data.profile_id, {
          roleScope,
          managedProfileIds,
        });

        if (!isAllowed) {
          throw new Error("Yêu cầu này không nằm trong phạm vi duyệt của bạn.");
        }

        if (!isActive) {
          return;
        }

        setOpenRequestError("Yêu cầu hợp lệ nhưng chưa hiển thị trong danh sách hiện tại.");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setOpenRequestError(
          error instanceof Error ? error.message : "Không thể mở yêu cầu thời gian.",
        );
      }
    };

    void validateOpenedRequest();

    return () => {
      isActive = false;
    };
  }, [
    currentProfileId,
    isLoading,
    loadError,
    managedProfileIds,
    openedRequestId,
    requests,
    roleScope,
  ]);

  const handleReviewRequest = async (requestId: string, isApproved: boolean) => {
    if (!currentProfileId) {
      return;
    }

    setProcessingRequestId(requestId);
    setActionError(null);

    try {
      const { data: existingRows, error: existingError } = await supabase
        .from("time_request_reviewers")
        .select("id")
        .eq("time_request_id", requestId)
        .eq("profile_id", currentProfileId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (existingError) {
        throw new Error(existingError.message || "Không thể kiểm tra lịch sử duyệt.");
      }

      const reviewedAt = new Date().toISOString();
      const existingId = existingRows?.[0]?.id ? String(existingRows[0].id) : null;

      if (existingId) {
        const { error: updateError } = await supabase
          .from("time_request_reviewers")
          .update({
            is_approved: isApproved,
            reviewed_at: reviewedAt,
          })
          .eq("id", existingId);

        if (updateError) {
          throw new Error(updateError.message || "Không thể cập nhật quyết định duyệt.");
        }
      } else {
        const { error: insertError } = await supabase.from("time_request_reviewers").insert({
          time_request_id: requestId,
          profile_id: currentProfileId,
          is_approved: isApproved,
          reviewed_at: reviewedAt,
        });

        if (insertError) {
          throw new Error(insertError.message || "Không thể lưu quyết định duyệt.");
        }
      }

      setReloadSeed((prev) => prev + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể duyệt yêu cầu.");
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleUndoReview = async (requestId: string) => {
    if (!currentProfileId) {
      return;
    }

    setProcessingRequestId(requestId);
    setActionError(null);

    try {
      const { data: existingRows, error: existingError } = await supabase
        .from("time_request_reviewers")
        .select("id")
        .eq("time_request_id", requestId)
        .eq("profile_id", currentProfileId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (existingError) {
        throw new Error(existingError.message || "Không thể kiểm tra lịch sử duyệt.");
      }

      const existingId = existingRows?.[0]?.id ? String(existingRows[0].id) : null;
      if (!existingId) {
        throw new Error("Không tìm thấy quyết định duyệt để hoàn tác.");
      }

      const { error: updateError } = await supabase
        .from("time_request_reviewers")
        .update({
          is_approved: null,
          reviewed_at: null,
        })
        .eq("id", existingId);

      if (updateError) {
        throw new Error(updateError.message || "Không thể hoàn tác quyết định duyệt.");
      }

      setReloadSeed((prev) => prev + 1);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Không thể hoàn tác quyết định duyệt.",
      );
    } finally {
      setProcessingRequestId(null);
    }
  };

  const requestSummary = useMemo(() => {
    const total = requests.length;
    const pending = requests.filter(
      (item) => toRequestStatus(item.time_request_reviewers) === "pending",
    ).length;
    const approved = requests.filter(
      (item) => toRequestStatus(item.time_request_reviewers) === "approved",
    ).length;
    const rejected = requests.filter(
      (item) => toRequestStatus(item.time_request_reviewers) === "rejected",
    ).length;
    return { total, pending, approved, rejected };
  }, [requests]);

  const requesterOptions = useMemo(
    () =>
      Object.entries(profileNameById)
        .map(([id, name]) => ({
          id,
          name: name?.trim() || id,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "vi")),
    [profileNameById],
  );

  const requestTypeOptions = useMemo(() => {
    const availableTypes = new Set(
      requests.map((item) => item.type).filter((item): item is TimeRequestType => Boolean(item)),
    );

    return TIME_REQUEST_TYPES.filter((item) => availableTypes.has(item.value));
  }, [requests]);

  const filteredRequests = useMemo(() => {
    return requests.filter((item) => {
      if (filter !== "all" && toRequestStatus(item.time_request_reviewers) !== filter) {
        return false;
      }

      if (profileFilter !== "all" && item.profile_id !== profileFilter) {
        return false;
      }

      if (requestTypeFilter !== "all" && item.type !== requestTypeFilter) {
        return false;
      }

      return true;
    });
  }, [filter, profileFilter, requestTypeFilter, requests]);

  const openedRequest = useMemo(() => {
    if (!openedRequestId) {
      return null;
    }

    return requests.find((item) => item.id === openedRequestId) ?? null;
  }, [openedRequestId, requests]);

  const openedRequestDetail = useMemo(() => {
    if (!openedRequest) {
      return null;
    }

    const requestStatus = toRequestStatus(openedRequest.time_request_reviewers);
    const holiday = openedRequest.date ? (holidaysByDate.get(openedRequest.date) ?? null) : null;

    return {
      id: openedRequest.id,
      typeLabel: getTimeRequestDisplayLabel(openedRequest.type, {
        leaveSubtype: openedRequest.leave_subtype,
        leaveSession: openedRequest.leave_session,
      }),
      requestDateLabel: formatDateTime(openedRequest.created_at),
      correctionDateLabel: formatDateVi(openedRequest.date),
      statusLabel:
        requestStatus === "approved"
          ? "Đã duyệt"
          : requestStatus === "rejected"
            ? "Từ chối"
            : "Chờ duyệt",
      statusClassName:
        requestStatus === "approved"
          ? "bg-emerald-50 text-emerald-700"
          : requestStatus === "rejected"
            ? "bg-rose-50 text-rose-700"
            : "bg-amber-50 text-amber-700",
      durationLabel: formatDurationLabel(openedRequest.minutes),
      reason: openedRequest.reason?.trim()
        ? openedRequest.reason.trim()
        : getTimeRequestReason(openedRequest.type, openedRequest.minutes, {
            leaveSubtype: openedRequest.leave_subtype,
            leaveSession: openedRequest.leave_session,
            requestedHours: openedRequest.requested_hours,
          }),
      sharePath: buildTimeRequestSharePath(openedRequest.id),
      requesterName: openedRequest.profile_id
        ? (profileNameById[openedRequest.profile_id] ?? openedRequest.profile_id)
        : "Không rõ",
      leaveDetailLabel: formatLeaveDetailLabel(
        openedRequest.leave_subtype,
        openedRequest.leave_session,
        openedRequest.requested_hours,
      ),
      remoteTimeLabel:
        openedRequest.type === "remote"
          ? `Khung giờ làm việc từ xa: ${formatTimeVi(openedRequest.remote_check_in)} - ${formatTimeVi(openedRequest.remote_check_out)}`
          : null,
      holidayLabel: holiday?.name?.trim()
        ? `Ngày nghỉ: ${holiday.name.trim()}`
        : holiday
          ? "Ngày nghỉ"
          : null,
    };
  }, [holidaysByDate, openedRequest, profileNameById]);

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="timeRequestManagement" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader
            title="Duyệt yêu cầu thời gian"
            items={[{ label: "Quản lý yêu cầu thời gian" }]}
          />

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-7">
            <section className="grid gap-4 md:grid-cols-4">
              <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">
                  Tổng yêu cầu
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-slate-900">
                  {requestSummary.total}
                </p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">
                  Chờ duyệt
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-amber-600">
                  {requestSummary.pending}
                </p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">
                  Đã duyệt
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-emerald-600">
                  {requestSummary.approved}
                </p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">
                  Đã từ chối
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-rose-600">
                  {requestSummary.rejected}
                </p>
              </article>
            </section>

            <section className="mt-5 rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900">Danh sách yêu cầu</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Hiển thị {filteredRequests.length} / {requests.length} yêu cầu trong phạm vi
                    hiện tại.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="w-[220px] min-w-[220px]">
                    <Select value={profileFilter} onValueChange={setProfileFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Lọc theo nhân sự" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả nhân sự</SelectItem>
                        {requesterOptions.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-[240px] min-w-[240px]">
                    <Select
                      value={requestTypeFilter}
                      onValueChange={(value) =>
                        setRequestTypeFilter(value as "all" | TimeRequestType)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Lọc theo loại request" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả loại request</SelectItem>
                        {requestTypeOptions.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="inline-flex rounded-xl bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setFilter("all")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        filter === "all" ? "bg-white text-slate-700" : "text-slate-500"
                      }`}
                    >
                      Tất cả
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilter("pending")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        filter === "pending" ? "bg-white text-slate-700" : "text-slate-500"
                      }`}
                    >
                      Chờ duyệt
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilter("approved")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        filter === "approved" ? "bg-white text-slate-700" : "text-slate-500"
                      }`}
                    >
                      Đã duyệt
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilter("rejected")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        filter === "rejected" ? "bg-white text-slate-700" : "text-slate-500"
                      }`}
                    >
                      Từ chối
                    </button>
                  </div>
                </div>
              </div>

              {actionError || openRequestError ? (
                <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">
                  {actionError || openRequestError}
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1200px] text-left">
                  <thead>
                    <tr className="text-xs tracking-[0.08em] text-slate-400 uppercase">
                      <th className="px-5 py-3 font-semibold">Nhân sự</th>
                      <th className="px-5 py-3 font-semibold">Ngày cần sửa</th>
                      <th className="px-5 py-3 font-semibold">Loại</th>
                      <th className="px-5 py-3 font-semibold">Giờ làm việc từ xa</th>
                      <th className="px-5 py-3 font-semibold">Thời lượng</th>
                      <th className="px-5 py-3 font-semibold">Lý do</th>
                      <th className="px-5 py-3 font-semibold">Ngày gửi</th>
                      <th className="px-5 py-3 font-semibold">Trạng thái</th>
                      <th className="px-5 py-3 font-semibold text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr className="border-t border-slate-100">
                        <td colSpan={10} className="px-5 py-8 text-center text-sm text-slate-500">
                          Đang tải yêu cầu thời gian...
                        </td>
                      </tr>
                    ) : loadError ? (
                      <tr className="border-t border-slate-100">
                        <td colSpan={10} className="px-5 py-8 text-center text-sm text-rose-600">
                          {loadError}
                        </td>
                      </tr>
                    ) : roleScope === "member" ? (
                      <tr className="border-t border-slate-100">
                        <td colSpan={10} className="px-5 py-8 text-center text-sm text-slate-500">
                          Bạn chưa có phạm vi duyệt yêu cầu của cấp dưới.
                        </td>
                      </tr>
                    ) : filteredRequests.length === 0 ? (
                      <tr className="border-t border-slate-100">
                        <td colSpan={10} className="px-5 py-8 text-center text-sm text-slate-500">
                          Không có yêu cầu nào khớp với bộ lọc hiện tại.
                        </td>
                      </tr>
                    ) : (
                      filteredRequests.map((item) => {
                        const reviewers = item.time_request_reviewers ?? [];
                        const myReview = currentProfileId
                          ? (reviewers.find(
                              (reviewer) => reviewer.profile_id === currentProfileId,
                            ) ?? null)
                          : null;
                        const status = toRequestStatus(reviewers);
                        const isApproving = processingRequestId === item.id;
                        const canReview = status === "pending";
                        const canUndo = !canReview && Boolean(myReview);
                        const holiday = item.date ? (holidaysByDate.get(item.date) ?? null) : null;
                        const isHolidayRequest = Boolean(holiday);
                        return (
                          <tr key={item.id} className="border-t border-slate-100">
                            <td className="px-5 py-4 text-sm text-slate-700">
                              {item.profile_id
                                ? (profileNameById[item.profile_id] ?? item.profile_id)
                                : "--"}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">
                              <div className="space-y-1">
                                <p>{formatDateVi(item.date)}</p>
                                {isHolidayRequest ? (
                                  <>
                                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                      Ngày nghỉ
                                    </span>
                                    {holiday?.name?.trim() ? (
                                      <p className="text-[11px] text-emerald-700">
                                        {holiday.name.trim()}
                                      </p>
                                    ) : null}
                                  </>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-700">
                              <div className="space-y-1">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getTypeBadgeClassName(item.type)}`}
                                >
                                  {getTimeRequestDisplayLabel(item.type, {
                                    leaveSubtype: item.leave_subtype,
                                    leaveSession: item.leave_session,
                                  })}
                                </span>
                                {/* <p className="text-xs text-slate-500">{getTimeRequestTypeDescription(item.type)}</p> */}
                                {/* {isMissingTimeRequestType(item.type) ? (
                                  <p className="text-xs text-slate-500">
                                    {formatLeaveDetailLabel(
                                      item.leave_subtype,
                                      item.leave_session,
                                      item.requested_hours,
                                    ) ?? "--"}
                                  </p>
                                ) : null} */}
                              </div>
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-700">
                              {item.type === "remote" ? (
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold text-slate-500">
                                    Giờ bắt đầu làm việc từ xa
                                  </p>
                                  <p className="font-medium text-slate-800">
                                    {formatTimeVi(item.remote_check_in)} ·{" "}
                                    {formatDateViLong(item.remote_check_in)}
                                  </p>
                                  <p className="pt-1 text-xs font-semibold text-slate-500">
                                    Giờ kết thúc làm việc từ xa
                                  </p>
                                  <p className="font-medium text-slate-800">
                                    {formatTimeVi(item.remote_check_out)} ·{" "}
                                    {formatDateViLong(item.remote_check_out)}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-slate-400">--</span>
                              )}
                            </td>
                            <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                              {formatMinutesLabel(item.type, item.minutes)}
                              {item.type === "remote" ? (
                                <p className="mt-1 text-xs font-normal text-indigo-600">
                                  Làm việc từ xa
                                </p>
                              ) : null}
                              {isHolidayRequest && isMissingTimeRequestType(item.type) ? (
                                <p className="mt-1 text-xs font-normal text-emerald-700">
                                  {holiday?.name?.trim() || "Ngày nghỉ"}: yêu cầu này không được
                                  tính vào thiếu giờ hoặc nghỉ không phép.
                                </p>
                              ) : null}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">
                              <p className="max-w-[280px] truncate">
                                {item.reason?.trim()
                                  ? item.reason.trim()
                                  : getTimeRequestReason(item.type, item.minutes, {
                                      leaveSubtype: item.leave_subtype,
                                      leaveSession: item.leave_session,
                                      requestedHours: item.requested_hours,
                                    })}
                              </p>
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">
                              {formatDateTime(item.created_at)}
                            </td>
                            <td className="px-5 py-4">
                              <StatusBadge status={status} />
                            </td>

                            <td className="px-5 py-4">
                              <div className="items-center gap-2 justify-end text-right flex">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => updateRequestQuery(item.id)}
                                    title="Xem chi tiết"
                                    aria-label="Xem chi tiết"
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>
                                </div>
                                {canReview ? (
                                  <>
                                    {isHolidayRequest && isMissingTimeRequestType(item.type) ? (
                                      <p className="text-[11px] font-medium text-emerald-700">
                                        Cảnh báo: đang duyệt request thiếu giờ trên ngày nghỉ.
                                      </p>
                                    ) : null}
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        disabled={isApproving}
                                        onClick={() => void handleReviewRequest(item.id, false)}
                                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        Từ chối
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isApproving}
                                        onClick={() => void handleReviewRequest(item.id, true)}
                                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        Duyệt
                                      </button>
                                    </div>
                                  </>
                                ) : canUndo ? (
                                  <button
                                    type="button"
                                    disabled={isApproving}
                                    onClick={() => void handleUndoReview(item.id)}
                                    className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Hoàn tác
                                  </button>
                                ) : (
                                  <span className="block text-right text-xs text-slate-400">
                                    Đã xử lý
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        </div>
      </div>

      <TimeRequestDetailDialog
        open={Boolean(openedRequestDetail)}
        onOpenChange={(open) => {
          if (!open) {
            updateRequestQuery(null);
          }
        }}
        request={openedRequestDetail}
        showShareSection={false}
        footerActions={
          openedRequest && openedRequestDetail ? (
            <div className="space-y-3">
              {toRequestStatus(openedRequest.time_request_reviewers) === "pending" ? (
                <>
                  {openedRequest.date &&
                  holidaysByDate.get(openedRequest.date) &&
                  isMissingTimeRequestType(openedRequest.type) ? (
                    <p className="text-sm font-medium text-emerald-700">
                      Cảnh báo: đang duyệt request thiếu giờ trên ngày nghỉ.
                    </p>
                  ) : null}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={processingRequestId === openedRequest.id}
                      onClick={() => void handleReviewRequest(openedRequest.id, false)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Từ chối
                    </button>
                    <button
                      type="button"
                      disabled={processingRequestId === openedRequest.id}
                      onClick={() => void handleReviewRequest(openedRequest.id, true)}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Duyệt
                    </button>
                  </div>
                </>
              ) : currentProfileId &&
                (openedRequest.time_request_reviewers ?? []).some(
                  (reviewer) => reviewer.profile_id === currentProfileId,
                ) ? (
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    disabled={processingRequestId === openedRequest.id}
                    onClick={() => void handleUndoReview(openedRequest.id)}
                    className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Hoàn tác
                  </button>
                </div>
              ) : null}
            </div>
          ) : null
        }
      />
    </div>
  );
}

export default function TimeRequestManagementPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f3f5fa]" />}>
      <TimeRequestManagementPageContent />
    </Suspense>
  );
}
