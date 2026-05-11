"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getTimeRequestReason, getTimeRequestTypeLabel, type TimeRequestType } from "@/lib/constants/time-requests";
import { formatDateDdMmYyyy } from "@/lib/date-format";
import { supabase } from "@/lib/supabase";
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
  minutes: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
};

type TimeRequestManagementOverviewProps = {
  profileId: string | null;
  isProfileLoading?: boolean;
  profileError?: string | null;
  createRequestHref: string;
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

export function TimeRequestManagementOverview({
  profileId,
  isProfileLoading = false,
  profileError = null,
  createRequestHref,
}: TimeRequestManagementOverviewProps) {
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
            minutes: resolvedMinutes,
            reason: item.reason?.trim()
              ? item.reason.trim()
              : getTimeRequestReason(item.type, resolvedMinutes),
            status: toRequestStatus(item.time_request_reviewers),
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
          <Link
            href={createRequestHref}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Tạo yêu cầu
          </Link>
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
    </section>
  );
}
