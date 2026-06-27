"use client";

import Link from "next/link";
import { Eye, Link2, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  getLeaveRequestSubtypeDetailLabel,
  getEarlyLeaveTimeValueFromMinutes,
  getTimeRequestDisplayLabel,
  getTimeRequestReason,
  getTimeRequestReviewStatus,
  type LeaveRequestSession,
  type LeaveRequestSubtype,
  type TimeRequestReviewStatus,
  type TimeRequestType,
} from "@/lib/constants/time-requests";
import { TimeRequestDetailDialog } from "@/components/timesheet/time-request-detail-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateDdMmYyyy } from "@/lib/date-format";
import { supabase } from "@/lib/supabase";
import { buildTimeRequestSharePath } from "@/lib/time-request-access";
import { calculateWorkedMinutesBetweenTimestamps } from "@/lib/work-time";

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

type CorrectionRequest = {
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

type TimeRequestManagementOverviewProps = {
  profileId: string | null;
  isProfileLoading?: boolean;
  profileError?: string | null;
  canReadTimekeepingData?: boolean;
  createRequestHref?: string | null;
};

const REQUESTS_PAGE_SIZE = 10;

function getMonthDateRange(value: Date) {
  const start = new Date(value.getFullYear(), value.getMonth(), 1);
  const end = new Date(value.getFullYear(), value.getMonth() + 1, 1);
  return { start, end };
}

function toIsoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toDateOnlyIso(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  return value.slice(0, 10);
}

function formatDateVi(isoDate: string) {
  return formatDateDdMmYyyy(isoDate, "--", "--");
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

function resolveRequestMinutes(item: TimeRequestRow) {
  if (item.type === "remote") {
    return calculateWorkedMinutesBetweenTimestamps(item.remote_check_in, item.remote_check_out) ?? 0;
  }

  return typeof item.minutes === "number" && Number.isFinite(item.minutes)
    ? Math.max(0, item.minutes)
    : 0;
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

export function TimeRequestManagementOverview({
  profileId,
  isProfileLoading = false,
  profileError = null,
  canReadTimekeepingData = true,
  createRequestHref = null,
}: TimeRequestManagementOverviewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [correctionRequests, setCorrectionRequests] = useState<CorrectionRequest[]>([]);
  const [requestFilter, setRequestFilter] = useState<"all" | "pending" | "approved" | "rejected">(
    "all",
  );
  const [requestPage, setRequestPage] = useState(1);
  const [isLoadingRequests, setIsLoadingRequests] = useState<boolean>(false);
  const [requestsError, setRequestsError] = useState<string>("");
  const [openRequestError, setOpenRequestError] = useState<string>("");
  const [requestActionSuccess, setRequestActionSuccess] = useState<string>("");
  const [requestActionError, setRequestActionError] = useState<string>("");
  const [copiedRequestId, setCopiedRequestId] = useState<string | null>(null);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
  const [pendingDeleteRequest, setPendingDeleteRequest] = useState<CorrectionRequest | null>(null);
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

  const handleCopyLink = async (requestId: string) => {
    const sharePath = buildTimeRequestSharePath(requestId);
    const shareUrl = typeof window === "undefined" ? sharePath : `${window.location.origin}${sharePath}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedRequestId(requestId);
      window.setTimeout(() => {
        setCopiedRequestId((current) => (current === requestId ? null : current));
      }, 1800);
      setOpenRequestError("");
    } catch {
      setOpenRequestError("Không thể sao chép link. Trình duyệt hiện tại không hỗ trợ thao tác này.");
    }
  };

  const handleDeleteRequest = async (request: CorrectionRequest) => {
    if (request.status !== "pending") {
      setRequestActionSuccess("");
      setRequestActionError("Chỉ có thể xóa yêu cầu đang ở trạng thái chờ duyệt.");
      return;
    }

    setDeletingRequestId(request.id);
    setRequestActionSuccess("");
    setRequestActionError("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? null;
      if (!accessToken) {
        throw new Error("Phiên đăng nhập không hợp lệ.");
      }

      const response = await fetch(`/api/time-requests?id=${encodeURIComponent(request.id)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const responseBody = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(responseBody?.error || "Không thể xóa yêu cầu thời gian.");
      }

      setCorrectionRequests((current) => current.filter((item) => item.id !== request.id));
      setCopiedRequestId((current) => (current === request.id ? null : current));
      setOpenRequestError("");
      setRequestActionSuccess("Đã xóa yêu cầu chờ duyệt.");
      setPendingDeleteRequest((current) => (current?.id === request.id ? null : current));

      if (openedRequestId === request.id) {
        updateRequestQuery(null);
      }
    } catch (error) {
      setRequestActionError(
        error instanceof Error ? error.message : "Không thể xóa yêu cầu thời gian.",
      );
    } finally {
      setDeletingRequestId(null);
    }
  };

  const openDeleteConfirm = (request: CorrectionRequest) => {
    if (request.status !== "pending") {
      setRequestActionSuccess("");
      setRequestActionError("Chỉ có thể xóa yêu cầu đang ở trạng thái chờ duyệt.");
      return;
    }

    setPendingDeleteRequest(request);
  };

  useEffect(() => {
    if (!profileId || !canReadTimekeepingData) {
      setIsLoadingRequests(false);
      setRequestsError(!profileId ? profileError ?? "" : "");
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
  }, [canReadTimekeepingData, profileError, profileId, selectedMonth]);

  useEffect(() => {
    if (!openedRequestId) {
      setOpenRequestError("");
      return;
    }

    if (!profileId || !canReadTimekeepingData) {
      return;
    }

    let isActive = true;

    const syncOpenedRequestMonth = async () => {
      try {
        const { data, error } = await supabase
          .from("time_requests")
          .select("id,date,profile_id")
          .eq("id", openedRequestId)
          .maybeSingle();

        if (error || !data?.id) {
          throw new Error(error?.message ?? "Không tìm thấy yêu cầu thời gian.");
        }

        if (!data.profile_id || String(data.profile_id) !== profileId) {
          throw new Error("Yêu cầu này không thuộc danh sách cá nhân của bạn.");
        }

        if (!isActive) {
          return;
        }

        setOpenRequestError("");

        if (typeof data.date === "string" && data.date) {
          const requestDate = new Date(`${data.date}T00:00:00`);
          if (!Number.isNaN(requestDate.getTime())) {
            const requestMonth = new Date(requestDate.getFullYear(), requestDate.getMonth(), 1);
            if (
              requestMonth.getFullYear() !== selectedMonth.getFullYear() ||
              requestMonth.getMonth() !== selectedMonth.getMonth()
            ) {
              setSelectedMonth(requestMonth);
            }
          }
        }
      } catch (error) {
        if (!isActive) {
          return;
        }

        setOpenRequestError(error instanceof Error ? error.message : "Không thể mở yêu cầu thời gian.");
      }
    };

    void syncOpenedRequestMonth();

    return () => {
      isActive = false;
    };
  }, [canReadTimekeepingData, openedRequestId, profileId, selectedMonth]);

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

  const openedRequest = useMemo(() => {
    if (!openedRequestId) {
      return null;
    }

    return correctionRequests.find((item) => item.id === openedRequestId) ?? null;
  }, [correctionRequests, openedRequestId]);

  const openedRequestDetail = useMemo(() => {
    if (!openedRequest) {
      return null;
    }

    const remoteTimeLabel =
      openedRequest.typeValue === "remote" && openedRequest.remoteCheckIn && openedRequest.remoteCheckOut
        ? `Khung giờ làm việc từ xa: ${openedRequest.remoteCheckIn.slice(11, 16)} - ${openedRequest.remoteCheckOut.slice(11, 16)}`
        : null;

    const leaveDetailLabel =
      openedRequest.typeValue === "approved_leave" || openedRequest.typeValue === "unauthorized_leave"
        ? getLeaveRequestSubtypeDetailLabel(openedRequest.leaveSubtype, openedRequest.leaveSession, {
            minutes: openedRequest.minutes,
          })
        : null;
    const earlyLeaveTimeLabel =
      openedRequest.leaveSubtype === "early_leave"
        ? getEarlyLeaveTimeValueFromMinutes(openedRequest.minutes)
        : null;

    return {
      id: openedRequest.id,
      typeLabel: openedRequest.type,
      requestDateLabel: formatDateVi(openedRequest.requestDateISO),
      correctionDateLabel: formatDateVi(openedRequest.correctionDateISO),
      statusLabel:
        openedRequest.status === "approved"
          ? "Đã duyệt"
          : openedRequest.status === "rejected"
            ? "Từ chối"
            : "Chờ duyệt",
      statusClassName:
        openedRequest.status === "approved"
          ? "bg-emerald-50 text-emerald-700"
          : openedRequest.status === "rejected"
            ? "bg-rose-50 text-rose-700"
            : "bg-amber-50 text-amber-700",
      durationLabel: earlyLeaveTimeLabel
        ? `Về lúc ${earlyLeaveTimeLabel}`
        : openedRequest.minutes > 0
          ? formatDurationLabel(openedRequest.minutes)
          : "--",
      reason: openedRequest.reason,
      sharePath: buildTimeRequestSharePath(openedRequest.id),
      leaveDetailLabel,
      remoteTimeLabel,
    };
  }, [openedRequest]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <h2 className="text-2xl font-semibold text-slate-900">Quản lý form điều chỉnh công</h2>
        <div className="flex flex-wrap items-center gap-2">
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
          {createRequestHref ? (
            <Link
              href={createRequestHref}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Tạo yêu cầu
            </Link>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <p className="text-sm text-slate-500">Danh sách yêu cầu theo tháng đã chọn</p>
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

      {openRequestError ? (
        <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">{openRequestError}</div>
      ) : null}
      {requestActionSuccess ? (
        <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm text-emerald-700">
          {requestActionSuccess}
        </div>
      ) : null}
      {requestActionError ? (
        <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">
          {requestActionError}
        </div>
      ) : null}

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
                    {formatDateVi(item.correctionDateISO)}
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-1">
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                        {item.type}
                      </span>
                      {item.leaveSubtype ? (
                        <p className="text-xs text-slate-500">
                          {getLeaveRequestSubtypeDetailLabel(item.leaveSubtype, item.leaveSession, {
                            minutes: item.minutes,
                          })}
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-500">
                    <p className="max-w-[280px] truncate">{item.reason}</p>
                  </td>
                  <td className="px-5 py-4">
                    <RequestStatus status={item.status} />
                  </td>
                  <td className="px-5 py-4">
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
                      <button
                        type="button"
                        onClick={() => void handleCopyLink(item.id)}
                        title="Sao chép link"
                        aria-label="Sao chép link"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                      >
                        <Link2 className="h-4 w-4" />
                      </button>
                      {item.status === "pending" ? (
                        <button
                          type="button"
                          disabled={deletingRequestId === item.id}
                          onClick={() => openDeleteConfirm(item)}
                          title="Xóa yêu cầu"
                          aria-label="Xóa yêu cầu"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filteredCorrectionRequests.length > 0 ? (
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
          <p className="text-slate-500">
            Trang {safeRequestPage}/{totalRequestPages} · {filteredCorrectionRequests.length} yêu cầu
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

      <TimeRequestDetailDialog
        open={Boolean(openedRequestDetail)}
        onOpenChange={(open) => {
          if (!open) {
            updateRequestQuery(null);
          }
        }}
        request={openedRequestDetail}
        isCopyingLink={Boolean(openedRequestDetail && copiedRequestId === openedRequestDetail.id)}
        onCopyLink={
          openedRequestDetail ? () => void handleCopyLink(openedRequestDetail.id) : undefined
        }
        footerActions={
          openedRequest?.status === "pending" ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">Bạn có thể xóa yêu cầu này khi vẫn đang chờ duyệt.</p>
              <button
                type="button"
                disabled={deletingRequestId === openedRequest.id}
                onClick={() => openDeleteConfirm(openedRequest)}
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingRequestId === openedRequest.id ? "Đang xóa..." : "Xóa yêu cầu"}
              </button>
            </div>
          ) : null
        }
      />

      <Dialog
        open={Boolean(pendingDeleteRequest)}
        onOpenChange={(open) => {
          if (!open && deletingRequestId !== pendingDeleteRequest?.id) {
            setPendingDeleteRequest(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận xóa yêu cầu</DialogTitle>
            <DialogDescription>
              Yêu cầu này đang ở trạng thái chờ duyệt. Nếu tiếp tục, yêu cầu sẽ bị xóa vĩnh viễn và không thể khôi phục.
            </DialogDescription>
          </DialogHeader>

          {pendingDeleteRequest ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Loại:</span> {pendingDeleteRequest.type}
              </p>
              <p className="mt-1">
                <span className="font-semibold">Ngày cần sửa:</span>{" "}
                {formatDateVi(pendingDeleteRequest.correctionDateISO)}
              </p>
              <p className="mt-1 line-clamp-2">
                <span className="font-semibold">Lý do:</span> {pendingDeleteRequest.reason}
              </p>
            </div>
          ) : null}

          <DialogFooter>
            <button
              type="button"
              disabled={Boolean(
                pendingDeleteRequest && deletingRequestId === pendingDeleteRequest.id,
              )}
              onClick={() => setPendingDeleteRequest(null)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={
                !pendingDeleteRequest ||
                deletingRequestId === pendingDeleteRequest.id
              }
              onClick={() => {
                if (!pendingDeleteRequest) {
                  return;
                }

                void handleDeleteRequest(pendingDeleteRequest);
              }}
              className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingDeleteRequest && deletingRequestId === pendingDeleteRequest.id
                ? "Đang xóa..."
                : "Xác nhận xóa"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
