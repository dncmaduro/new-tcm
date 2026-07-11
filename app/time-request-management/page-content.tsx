"use client";

import {
  AlertTriangle,
  BadgeCheck,
  CircleX,
  Clock3,
  Eye,
  Inbox,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ActionGroup } from "@/components/detail-ui";
import { TimeRequestDetailDialog } from "@/components/timesheet/time-request-detail-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  getEarlyLeaveTimeValueFromMinutes,
  getLeaveRequestSubtypeDetailLabel,
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
import { canReadTimekeepingData } from "@/lib/timekeeping-access";
import {
  buildTimeRequestSharePath,
  resolveCurrentViewerProfileId,
} from "@/lib/time-request-access";
import { cn } from "@/lib/utils";
import { calculateWorkedMinutesBetweenTimestamps } from "@/lib/work-time";

type ProfileRow = {
  id: string;
  name: string | null;
  email?: string | null;
  is_timekeeping_enabled?: boolean | null;
};

type RequestStatus = TimeRequestReviewStatus;
type SummaryFilterValue = "all" | RequestStatus;

type TimeRequestReviewerRow = {
  id: string;
  profile_id: string | null;
  is_approved: boolean | null;
  comment: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type TimeRequestReviewerLinkRow = {
  time_request_id: string | null;
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

const formatLeaveDetailLabel = (
  subtype: LeaveRequestSubtype | null,
  session: LeaveRequestSession | null,
  minutes: number | null,
) =>
  subtype
    ? getLeaveRequestSubtypeDetailLabel(subtype, session, {
        minutes,
      })
    : null;

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

const getStatusMeta = (status: SummaryFilterValue) => {
  if (status === "approved") {
    return {
      label: "Đã duyệt",
      badgeClassName: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      dotClassName: "bg-emerald-500",
      cardClassName: "border-l-emerald-500",
      cardActiveClassName: "border-emerald-200 bg-emerald-50/70 ring-2 ring-emerald-100",
      iconClassName: "bg-emerald-100 text-emerald-700",
      numberClassName: "text-emerald-700",
    };
  }

  if (status === "rejected") {
    return {
      label: "Từ chối",
      badgeClassName: "bg-rose-50 text-rose-700 ring-rose-200",
      dotClassName: "bg-rose-500",
      cardClassName: "border-l-rose-500",
      cardActiveClassName: "border-rose-200 bg-rose-50/70 ring-2 ring-rose-100",
      iconClassName: "bg-rose-100 text-rose-700",
      numberClassName: "text-rose-700",
    };
  }

  if (status === "pending") {
    return {
      label: "Chờ duyệt",
      badgeClassName: "bg-amber-50 text-amber-700 ring-amber-200",
      dotClassName: "bg-amber-500",
      cardClassName: "border-l-amber-500",
      cardActiveClassName: "border-amber-200 bg-amber-50/70 ring-2 ring-amber-100",
      iconClassName: "bg-amber-100 text-amber-700",
      numberClassName: "text-amber-700",
    };
  }

  return {
    label: "Tổng yêu cầu",
    badgeClassName: "bg-slate-100 text-slate-700 ring-slate-200",
    dotClassName: "bg-slate-500",
    cardClassName: "border-l-slate-400",
    cardActiveClassName: "border-slate-200 bg-slate-50 ring-2 ring-slate-100",
    iconClassName: "bg-slate-100 text-slate-700",
    numberClassName: "text-slate-900",
  };
};

const SUMMARY_CARDS: Array<{
  value: SummaryFilterValue;
  label: string;
  icon: LucideIcon;
}> = [
  { value: "all", label: "Tổng yêu cầu", icon: Inbox },
  { value: "pending", label: "Chờ duyệt", icon: Clock3 },
  { value: "approved", label: "Đã duyệt", icon: BadgeCheck },
  { value: "rejected", label: "Đã từ chối", icon: CircleX },
];

const STATUS_FILTER_OPTIONS: Array<{ value: SummaryFilterValue; label: string }> = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "pending", label: "Chờ duyệt" },
  { value: "approved", label: "Đã duyệt" },
  { value: "rejected", label: "Từ chối" },
];

const REQUESTS_PAGE_SIZE = 10;

const ROW_ACTION_BUTTON_CLASS_NAME =
  "inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";

const getRemoteTimeRangeLabel = (request: TimeRequestRow) => {
  if (request.type !== "remote") {
    return null;
  }

  return `${formatTimeVi(request.remote_check_in)} - ${formatTimeVi(request.remote_check_out)}`;
};

function StatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  const meta = getStatusMeta(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        meta.badgeClassName,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dotClassName)} />
      {meta.label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  count,
  active,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: SummaryFilterValue;
  count: number;
  active: boolean;
  icon: LucideIcon;
  onClick: (value: SummaryFilterValue) => void;
}) {
  const meta = getStatusMeta(value);

  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        "group rounded-2xl border border-slate-200 border-l-4 bg-white px-5 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200",
        meta.cardClassName,
        active ? meta.cardActiveClassName : "hover:border-slate-300",
      )}
      aria-pressed={active}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
            {label}
          </p>
          <p
            className={cn(
              "mt-2 text-3xl font-semibold tracking-[-0.02em] text-slate-900",
              meta.numberClassName,
            )}
          >
            {count}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-xl transition",
            meta.iconClassName,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </button>
  );
}

function RowActionGroup({
  requestId,
  canReview,
  canUndo,
  isApproving,
  showHolidayWarning,
  onView,
  onReject,
  onApprove,
  onUndo,
}: {
  requestId: string;
  canReview: boolean;
  canUndo: boolean;
  isApproving: boolean;
  showHolidayWarning: boolean;
  onView: (requestId: string) => void;
  onReject: (requestId: string) => void;
  onApprove: (requestId: string) => void;
  onUndo: (requestId: string) => void;
}) {
  return (
    <ActionGroup className="justify-end gap-1.5 whitespace-nowrap flex-nowrap">
      {showHolidayWarning ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">Yêu cầu thiếu giờ rơi vào ngày nghỉ.</TooltipContent>
        </Tooltip>
      ) : null}
      <button
        type="button"
        onClick={() => onView(requestId)}
        title="Xem chi tiết"
        aria-label="Xem chi tiết"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
      >
        <Eye className="h-4 w-4" />
      </button>
      {canReview ? (
        <>
          <button
            type="button"
            disabled={isApproving}
            onClick={() => onReject(requestId)}
            className={cn(
              ROW_ACTION_BUTTON_CLASS_NAME,
              "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
            )}
          >
            Từ chối
          </button>
          <button
            type="button"
            disabled={isApproving}
            onClick={() => onApprove(requestId)}
            className={cn(
              ROW_ACTION_BUTTON_CLASS_NAME,
              "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
            )}
          >
            Duyệt
          </button>
        </>
      ) : canUndo ? (
        <button
          type="button"
          disabled={isApproving}
          onClick={() => onUndo(requestId)}
          className={cn(
            ROW_ACTION_BUTTON_CLASS_NAME,
            "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
          )}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Hoàn tác
        </button>
      ) : null}
    </ActionGroup>
  );
}

function TimeRequestManagementPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
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
  const [dateFromFilter, setDateFromFilter] = useState<string>("");
  const [dateToFilter, setDateToFilter] = useState<string>("");
  const [requestPage, setRequestPage] = useState<number>(1);
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
        const { data: reviewerLinksData, error: reviewerLinksError } = await supabase
          .from("time_request_reviewers")
          .select("time_request_id")
          .eq("profile_id", viewerProfileId);

        if (reviewerLinksError) {
          throw new Error(reviewerLinksError.message || "Không tải được phạm vi duyệt yêu cầu.");
        }

        const authorizedRequestIds = [
          ...new Set(
            ((reviewerLinksData ?? []) as TimeRequestReviewerLinkRow[])
              .map((row) => row.time_request_id)
              .filter((requestId): requestId is string => Boolean(requestId)),
          ),
        ];

        let requestRows: TimeRequestRow[] = [];
        if (authorizedRequestIds.length > 0) {
          const { data, error } = await supabase
            .from("time_requests")
            .select(
              "id,profile_id,date,type,leave_subtype,leave_session,requested_hours,minutes,reason,remote_check_in,remote_check_out,created_at,updated_at,time_request_reviewers(id,profile_id,is_approved,comment,reviewed_at,created_at)",
            )
            .in("id", authorizedRequestIds)
            .order("created_at", { ascending: false });

          if (error) {
            throw new Error(error.message || "Không tải được yêu cầu thời gian.");
          }

          requestRows = (data ?? []) as TimeRequestRow[];
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

        const requestProfileIds = [
          ...new Set(
            requestRows
              .map((request) => request.profile_id)
              .filter((profileId): profileId is string => Boolean(profileId)),
          ),
        ];

        if (requestProfileIds.length === 0) {
          setRequests([]);
          setProfileNameById({});
          return;
        }

        const { data: requestProfilesData, error: requestProfilesError } = await supabase
          .from("profiles")
          .select("id,name,email,is_timekeeping_enabled")
          .in("id", requestProfileIds);

        if (requestProfilesError) {
          throw new Error(requestProfilesError.message || "Không tải được thông tin nhân sự.");
        }

        if (!isActive) {
          return;
        }

        const eligibleProfiles = ((requestProfilesData ?? []) as ProfileRow[]).filter((profile) =>
          canReadTimekeepingData(profile),
        );
        const eligibleProfileIds = new Set(eligibleProfiles.map((profile) => String(profile.id)));

        setRequests(
          requestRows
            .filter((request) => request.profile_id && eligibleProfileIds.has(request.profile_id))
            .map((item) => ({
              ...item,
              minutes: resolveRequestMinutes(item),
            })),
        );

        const nameMap = eligibleProfiles.reduce<Record<string, string>>((acc, profile) => {
          acc[String(profile.id)] = profile.name
            ? String(profile.name)
            : profile.email
              ? String(profile.email)
              : "Không rõ";
          return acc;
        }, {});
        setProfileNameById(nameMap);
      } catch (error) {
        if (!isActive) {
          return;
        }
        setLoadError(
          error instanceof Error ? error.message : "Không tải được dữ liệu duyệt yêu cầu.",
        );
        setCurrentProfileId(null);
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
          .select("id")
          .eq("id", openedRequestId)
          .maybeSingle();

        if (error || !data?.id) {
          throw new Error(error?.message ?? "Không tìm thấy yêu cầu thời gian.");
        }

        const { data: reviewerData, error: reviewerError } = await supabase
          .from("time_request_reviewers")
          .select("id")
          .eq("time_request_id", openedRequestId)
          .eq("profile_id", currentProfileId)
          .maybeSingle();

        if (reviewerError) {
          throw new Error(reviewerError.message || "Không thể kiểm tra quyền duyệt yêu cầu.");
        }

        if (!reviewerData?.id) {
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
    openedRequestId,
    requests,
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

      if (!existingId) {
        throw new Error("Bạn không có quyền duyệt yêu cầu này.");
      }

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

      if (dateFromFilter && (!item.date || item.date < dateFromFilter)) {
        return false;
      }

      if (dateToFilter && (!item.date || item.date > dateToFilter)) {
        return false;
      }

      return true;
    });
  }, [dateFromFilter, dateToFilter, filter, profileFilter, requestTypeFilter, requests]);

  const summaryCardCounts = useMemo(
    () => ({
      all: requestSummary.total,
      pending: requestSummary.pending,
      approved: requestSummary.approved,
      rejected: requestSummary.rejected,
    }),
    [requestSummary],
  );

  const showRemoteTimeColumn = useMemo(
    () => filteredRequests.some((item) => item.type === "remote"),
    [filteredRequests],
  );

  const totalRequestPages = useMemo(
    () => Math.max(1, Math.ceil(filteredRequests.length / REQUESTS_PAGE_SIZE)),
    [filteredRequests.length],
  );

  const safeRequestPage = Math.min(requestPage, totalRequestPages);

  const paginatedRequests = useMemo(() => {
    const startIndex = (safeRequestPage - 1) * REQUESTS_PAGE_SIZE;
    return filteredRequests.slice(startIndex, startIndex + REQUESTS_PAGE_SIZE);
  }, [filteredRequests, safeRequestPage]);

  const tableColumnCount = showRemoteTimeColumn ? 8 : 7;

  useEffect(() => {
    setRequestPage(1);
  }, [dateFromFilter, dateToFilter, filter, profileFilter, requestTypeFilter]);

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
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
          : requestStatus === "rejected"
            ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
            : "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
      durationLabel:
        openedRequest.leave_subtype === "early_leave"
          ? `Về lúc ${getEarlyLeaveTimeValueFromMinutes(openedRequest.minutes) ?? "--:--"}`
          : formatDurationLabel(openedRequest.minutes),
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
        openedRequest.minutes,
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
    <TooltipProvider>
      <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
        <div className="flex min-h-screen w-full">
          <WorkspaceSidebar active="timeRequestManagement" />

          <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
            <WorkspacePageHeader
              title="Duyệt yêu cầu thời gian"
              items={[{ label: "Quản lý yêu cầu thời gian" }]}
            />

            <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-7">
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {SUMMARY_CARDS.map((card) => (
                  <SummaryCard
                    key={card.value}
                    label={card.label}
                    value={card.value}
                    count={summaryCardCounts[card.value]}
                    active={filter === card.value}
                    icon={card.icon}
                    onClick={setFilter}
                  />
                ))}
              </section>

              <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold text-slate-900">Danh sách yêu cầu</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Hiển thị {filteredRequests.length} / {requests.length} yêu cầu
                    </p>
                  </div>
                  <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-auto xl:grid-cols-[220px_220px_180px_180px_180px]">
                    <Select value={profileFilter} onValueChange={setProfileFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Nhân sự" />
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
                    <Select
                      value={requestTypeFilter}
                      onValueChange={(value) =>
                        setRequestTypeFilter(value as "all" | TimeRequestType)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Loại request" />
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
                    <Select
                      value={filter}
                      onValueChange={(value) => setFilter(value as SummaryFilterValue)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Trạng thái" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_FILTER_OPTIONS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className="space-y-1">
                      <span className="block text-xs font-semibold text-slate-500">Từ ngày</span>
                      <input
                        type="date"
                        value={dateFromFilter}
                        onChange={(event) => setDateFromFilter(event.target.value)}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-xs font-semibold text-slate-500">Đến ngày</span>
                      <input
                        type="date"
                        value={dateToFilter}
                        onChange={(event) => setDateToFilter(event.target.value)}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                  </div>
                </div>

                {actionError || openRequestError ? (
                  <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">
                    {actionError || openRequestError}
                  </div>
                ) : null}

                <div className="overflow-x-auto">
                  <table
                    className={cn(
                      "w-full text-left",
                      showRemoteTimeColumn ? "min-w-[1160px]" : "min-w-[980px]",
                    )}
                  >
                    <thead className="bg-slate-50/90 text-xs uppercase tracking-[0.08em] text-slate-400">
                      <tr>
                        <th className="sticky top-0 z-10 w-[180px] min-w-[180px] bg-slate-50/95 px-5 py-3 font-semibold backdrop-blur">
                          Nhân sự
                        </th>
                        <th className="sticky top-0 z-10 w-[160px] min-w-[160px] bg-slate-50/95 px-5 py-3 font-semibold backdrop-blur">
                          Ngày cần sửa
                        </th>
                        <th className="sticky top-0 z-10 w-[220px] min-w-[220px] bg-slate-50/95 px-5 py-3 font-semibold backdrop-blur">
                          Loại
                        </th>
                        {showRemoteTimeColumn ? (
                          <th className="sticky top-0 z-10 w-[170px] min-w-[170px] bg-slate-50/95 px-5 py-3 font-semibold backdrop-blur">
                            Giờ làm việc từ xa
                          </th>
                        ) : null}
                        <th className="sticky top-0 z-10 bg-slate-50/95 px-5 py-3 font-semibold backdrop-blur">
                          Lý do
                        </th>
                        <th className="sticky top-0 z-10 w-[170px] min-w-[170px] bg-slate-50/95 px-5 py-3 font-semibold backdrop-blur">
                          Ngày gửi
                        </th>
                        <th className="sticky top-0 z-10 w-[140px] min-w-[140px] bg-slate-50/95 px-5 py-3 font-semibold backdrop-blur">
                          Trạng thái
                        </th>
                        <th className="sticky top-0 z-10 w-[240px] min-w-[240px] bg-slate-50/95 px-5 py-3 text-right font-semibold backdrop-blur">
                          Thao tác
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                        <tr className="border-b border-slate-100">
                          <td
                            colSpan={tableColumnCount}
                            className="px-5 py-8 text-center text-sm text-slate-500"
                          >
                            Đang tải yêu cầu thời gian...
                          </td>
                        </tr>
                      ) : loadError ? (
                        <tr className="border-b border-slate-100">
                          <td
                            colSpan={tableColumnCount}
                            className="px-5 py-8 text-center text-sm text-rose-600"
                          >
                            {loadError}
                          </td>
                        </tr>
                      ) : filteredRequests.length === 0 ? (
                        <tr className="border-b border-slate-100">
                          <td
                            colSpan={tableColumnCount}
                            className="px-5 py-8 text-center text-sm text-slate-500"
                          >
                            Không có yêu cầu phù hợp.
                          </td>
                        </tr>
                      ) : (
                        paginatedRequests.map((item) => {
                          const reviewers = item.time_request_reviewers ?? [];
                          const myReview = currentProfileId
                            ? (reviewers.find(
                                (reviewer) => reviewer.profile_id === currentProfileId,
                              ) ?? null)
                            : null;
                          const status = toRequestStatus(reviewers);
                          const isApproving = processingRequestId === item.id;
                          const canReview = status === "pending" && Boolean(myReview);
                          const canUndo = !canReview && Boolean(myReview);
                          const holiday = item.date ? (holidaysByDate.get(item.date) ?? null) : null;
                          const isHolidayRequest = Boolean(holiday);
                          const remoteTimeRange = getRemoteTimeRangeLabel(item);
                          const leaveDetail = isMissingTimeRequestType(item.type)
                            ? formatLeaveDetailLabel(
                                item.leave_subtype,
                                item.leave_session,
                                item.minutes,
                              )
                            : null;
                          const reasonLabel = item.reason?.trim()
                            ? item.reason.trim()
                            : getTimeRequestReason(item.type, item.minutes, {
                                leaveSubtype: item.leave_subtype,
                                leaveSession: item.leave_session,
                                requestedHours: item.requested_hours,
                              });

                          return (
                            <tr
                              key={item.id}
                              className="border-b border-slate-100 align-top transition hover:bg-slate-50/70 last:border-b-0"
                            >
                              <td className="px-5 py-4 text-sm font-medium text-slate-700">
                                <p className="truncate">
                                  {item.profile_id
                                    ? (profileNameById[item.profile_id] ?? item.profile_id)
                                    : "--"}
                                </p>
                              </td>
                              <td className="px-5 py-4 text-sm text-slate-600">
                                <div className="space-y-1">
                                  <p className="font-medium text-slate-700">{formatDateVi(item.date)}</p>
                                  {isHolidayRequest ? (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                        Ngày nghỉ
                                      </span>
                                      {holiday?.name?.trim() ? (
                                        <span className="truncate text-[11px] text-emerald-700">
                                          {holiday.name.trim()}
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-5 py-4 text-sm text-slate-700">
                                <div className="space-y-1">
                                  <span
                                    className={cn(
                                      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                                      getTypeBadgeClassName(item.type),
                                    )}
                                  >
                                    {getTimeRequestDisplayLabel(item.type, {
                                      leaveSubtype: item.leave_subtype,
                                      leaveSession: item.leave_session,
                                    })}
                                  </span>
                                  {leaveDetail ? (
                                    <p className="truncate text-xs text-slate-500">{leaveDetail}</p>
                                  ) : null}
                                </div>
                              </td>
                              {showRemoteTimeColumn ? (
                                <td className="px-5 py-4 text-sm text-slate-600">
                                  {remoteTimeRange ? (
                                    <div className="space-y-1">
                                      <p className="font-medium text-slate-700">{remoteTimeRange}</p>
                                      <p className="text-[11px] text-slate-500">Làm việc từ xa</p>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400">--</span>
                                  )}
                                </td>
                              ) : null}
                              <td className="max-w-0 px-5 py-4 text-sm text-slate-600">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <p className="truncate">{reasonLabel}</p>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    align="start"
                                    className="max-w-sm whitespace-pre-wrap break-words"
                                  >
                                    {reasonLabel}
                                  </TooltipContent>
                                </Tooltip>
                              </td>
                              <td className="px-5 py-4 text-sm text-slate-600">
                                <span className="whitespace-nowrap">{formatDateTime(item.created_at)}</span>
                              </td>
                              <td className="px-5 py-4">
                                <StatusBadge status={status} />
                              </td>
                              <td className="px-5 py-4 text-right">
                                <RowActionGroup
                                  requestId={item.id}
                                  canReview={canReview}
                                  canUndo={canUndo}
                                  isApproving={isApproving}
                                  showHolidayWarning={Boolean(
                                    isHolidayRequest && isMissingTimeRequestType(item.type),
                                  )}
                                  onView={updateRequestQuery}
                                  onReject={(requestId) => void handleReviewRequest(requestId, false)}
                                  onApprove={(requestId) => void handleReviewRequest(requestId, true)}
                                  onUndo={(requestId) => void handleUndoReview(requestId)}
                                />
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredRequests.length > 0 ? (
                  <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm">
                    <p className="text-slate-500">
                      Trang {safeRequestPage}/{totalRequestPages} · {filteredRequests.length} yêu
                      cầu
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setRequestPage((prev) => Math.max(1, prev - 1))}
                        disabled={safeRequestPage <= 1}
                        className="h-9 rounded-lg border border-slate-200 bg-white px-3 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Trước
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setRequestPage((prev) => Math.min(totalRequestPages, prev + 1))
                        }
                        disabled={safeRequestPage >= totalRequestPages}
                        className="h-9 rounded-lg border border-slate-200 bg-white px-3 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Sau
                      </button>
                    </div>
                  </div>
                ) : null}
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
                {toRequestStatus(openedRequest.time_request_reviewers) === "pending" &&
                currentProfileId &&
                (openedRequest.time_request_reviewers ?? []).some(
                  (reviewer) => reviewer.profile_id === currentProfileId,
                ) ? (
                  <>
                    {openedRequest.date &&
                    holidaysByDate.get(openedRequest.date) &&
                    isMissingTimeRequestType(openedRequest.type) ? (
                      <p className="text-sm font-medium text-emerald-700">
                        Cảnh báo: đang duyệt request thiếu giờ trên ngày nghỉ.
                      </p>
                    ) : null}
                    <ActionGroup className="justify-end">
                      <button
                        type="button"
                        disabled={processingRequestId === openedRequest.id}
                        onClick={() => void handleReviewRequest(openedRequest.id, false)}
                        className="inline-flex h-9 items-center rounded-lg border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Từ chối
                      </button>
                      <button
                        type="button"
                        disabled={processingRequestId === openedRequest.id}
                        onClick={() => void handleReviewRequest(openedRequest.id, true)}
                        className="inline-flex h-9 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Duyệt
                      </button>
                    </ActionGroup>
                  </>
                ) : currentProfileId &&
                  (openedRequest.time_request_reviewers ?? []).some(
                    (reviewer) => reviewer.profile_id === currentProfileId,
                  ) ? (
                  <ActionGroup className="justify-end">
                    <button
                      type="button"
                      disabled={processingRequestId === openedRequest.id}
                      onClick={() => void handleUndoReview(openedRequest.id)}
                      className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Hoàn tác
                    </button>
                  </ActionGroup>
                ) : null}
              </div>
            ) : null
          }
        />
      </div>
    </TooltipProvider>
  );
}

export default function TimeRequestManagementPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f3f5fa]" />}>
      <TimeRequestManagementPageContent />
    </Suspense>
  );
}
