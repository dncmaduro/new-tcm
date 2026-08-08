"use client";

import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  LoaderCircle,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getTimeRequestDisplayLabel,
  getTimeRequestReviewStatus,
  type LeaveRequestSession,
  type LeaveRequestSubtype,
} from "@/lib/constants/time-requests";
import { formatDateDdMmYyyy } from "@/lib/date-format";
import { getVietnamTodayIsoDate } from "@/lib/timekeeping-access";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/supabase/cloud/database.types";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";

type LeaveBalanceRow = Database["public"]["Tables"]["leave_balances"]["Row"];

type LeaveRequestRow = {
  id: string;
  date: string | null;
  leave_session: LeaveRequestSession | null;
  leave_subtype: LeaveRequestSubtype | null;
  minutes: number | null;
  reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  time_request_reviewers?: Array<{
    is_approved: boolean | null;
    reviewed_at: string | null;
  }> | null;
};

type LeaveHistoryItem = {
  id: string;
  date: string;
  kind: "carryover" | "usage";
  title: string;
  detail: string;
  hours: number;
};

const formatHours = (value: number) => {
  const safeValue = Math.max(0, value);
  if (Number.isInteger(safeValue)) {
    return `${safeValue} giờ`;
  }
  return `${safeValue.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} giờ`;
};

const monthStart = (value: string) => `${value.slice(0, 7)}-01`;

const getMonthLabel = (month: string) => {
  const parsed = new Date(`${month.slice(0, 7)}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return month;
  }
  return new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(parsed);
};

const isConsecutiveMonth = (previousMonth: string, currentMonth: string) => {
  const previous = new Date(`${previousMonth.slice(0, 7)}-01T00:00:00`);
  const current = new Date(`${currentMonth.slice(0, 7)}-01T00:00:00`);
  return (
    current.getFullYear() === previous.getFullYear() + (previous.getMonth() === 11 ? 1 : 0) &&
    current.getMonth() === (previous.getMonth() + 1) % 12
  );
};

const getBalanceRemainingHours = (balance: LeaveBalanceRow) =>
  Math.max(0, Number(balance.total_hours) - Number(balance.used_hours));

export default function LeaveBalancePageContent() {
  const [balances, setBalances] = useState<LeaveBalanceRow[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequestRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTimekeepingEnabled, setIsTimekeepingEnabled] = useState(true);

  const currentMonth = monthStart(getVietnamTodayIsoDate());

  const loadLeaveData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user?.id) {
        throw authError ?? new Error("Không xác thực được người dùng.");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id,is_timekeeping_enabled")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (profileError || !profile?.id) {
        throw profileError ?? new Error("Không tìm thấy hồ sơ người dùng.");
      }

      const profileId = String(profile.id);
      const timekeepingEnabled = profile.is_timekeeping_enabled === true;
      setIsTimekeepingEnabled(timekeepingEnabled);

      if (!timekeepingEnabled) {
        setBalances([]);
        setLeaveRequests([]);
        return;
      }

      const { error: ensureError } = await supabase.rpc("ensure_leave_balance_for_profile_month", {
        p_profile_id: profileId,
        p_month: currentMonth,
      });
      if (ensureError) {
        throw new Error(ensureError.message || "Không thể khởi tạo quỹ phép tháng hiện tại.");
      }

      const [balancesResult, requestsResult] = await Promise.all([
        supabase
          .from("leave_balances")
          .select("id,profile_id,month,total_hours,used_hours,created_at")
          .eq("profile_id", profileId)
          .order("month", { ascending: false }),
        supabase
          .from("time_requests")
          .select(
            "id,date,leave_subtype,leave_session,minutes,reason,created_at,updated_at,time_request_reviewers(is_approved,reviewed_at)",
          )
          .eq("profile_id", profileId)
          .eq("type", "approved_leave")
          .order("date", { ascending: false }),
      ]);

      if (balancesResult.error) {
        throw new Error(balancesResult.error.message || "Không tải được quỹ phép.");
      }
      if (requestsResult.error) {
        throw new Error(requestsResult.error.message || "Không tải được lịch sử dùng phép.");
      }

      setBalances((balancesResult.data ?? []) as LeaveBalanceRow[]);
      setLeaveRequests((requestsResult.data ?? []) as LeaveRequestRow[]);
    } catch (loadError) {
      setBalances([]);
      setLeaveRequests([]);
      setError(loadError instanceof Error ? loadError.message : "Không thể tải thông tin quỹ phép.");
    } finally {
      setIsLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    void loadLeaveData();
  }, [loadLeaveData]);

  const currentBalance = useMemo(
    () => balances.find((balance) => balance.month === currentMonth) ?? null,
    [balances, currentMonth],
  );

  const history = useMemo<LeaveHistoryItem[]>(() => {
    const carryovers: LeaveHistoryItem[] = [];
    const balancesByMonth = [...balances].sort((left, right) => left.month.localeCompare(right.month));

    for (let index = 1; index < balancesByMonth.length; index += 1) {
      const previousBalance = balancesByMonth[index - 1];
      const currentBalanceRow = balancesByMonth[index];
      if (!isConsecutiveMonth(previousBalance.month, currentBalanceRow.month)) {
        continue;
      }

      const previousRemaining = getBalanceRemainingHours(previousBalance);
      const carriedHours = Math.min(previousRemaining, Math.max(0, Number(currentBalanceRow.total_hours)));
      if (carriedHours <= 0) {
        continue;
      }

      carryovers.push({
        id: `carryover-${currentBalanceRow.id}`,
        date: currentBalanceRow.month,
        kind: "carryover",
        title: `Cộng phép từ ${getMonthLabel(previousBalance.month)}`,
        detail: `Số dư chưa dùng của ${getMonthLabel(previousBalance.month)} được chuyển sang quỹ tháng mới.`,
        hours: carriedHours,
      });
    }

    const usages = leaveRequests.flatMap<LeaveHistoryItem>((request) => {
      const reviewers = request.time_request_reviewers ?? [];
      if (getTimeRequestReviewStatus(reviewers) !== "approved") {
        return [];
      }

      const minutes = typeof request.minutes === "number" ? Math.max(0, request.minutes) : 0;
      if (minutes <= 0) {
        return [];
      }

      const approvedAt = reviewers
        .filter((reviewer) => reviewer.is_approved === true && reviewer.reviewed_at)
        .map((reviewer) => String(reviewer.reviewed_at))
        .sort()[0];
      const eventDate = approvedAt ?? request.updated_at ?? request.created_at ?? request.date;
      if (!eventDate) {
        return [];
      }

      return [
        {
          id: `usage-${request.id}`,
          date: eventDate,
          kind: "usage",
          title: `Đã dùng phép · ${getTimeRequestDisplayLabel("approved_leave", {
            leaveSubtype: request.leave_subtype,
            leaveSession: request.leave_session,
          })}`,
          detail: request.reason?.trim() || "Yêu cầu nghỉ có phép đã được duyệt.",
          hours: minutes / 60,
        },
      ];
    });

    return [...carryovers, ...usages].sort((left, right) => right.date.localeCompare(left.date));
  }, [balances, leaveRequests]);

  const totalHours = currentBalance ? Math.max(0, Number(currentBalance.total_hours)) : 0;
  const usedHours = currentBalance ? Math.max(0, Number(currentBalance.used_hours)) : 0;
  const remainingHours = Math.max(0, totalHours - usedHours);

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="leaveBalance" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader
            title="Quỹ phép"
            items={[{ label: "Thời gian" }, { label: "Quỹ phép" }]}
            actions={
              <button
                type="button"
                onClick={() => void loadLeaveData()}
                disabled={isLoading}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                Làm mới
              </button>
            }
          />

          <main className="min-h-0 flex-1 px-4 py-5 lg:px-7">
            {!isLoading && error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {!isLoading && !error && !isTimekeepingEnabled ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
                Bạn chưa được bật chấm công, nên chưa thể xem quỹ phép cá nhân.
              </div>
            ) : null}

            {isLoading ? (
              <div className="flex min-h-56 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
                <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Đang tải quỹ phép...
              </div>
            ) : null}

            {!isLoading && !error && isTimekeepingEnabled ? (
              <div className="mx-auto w-full max-w-6xl space-y-6">
                <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-700 to-blue-900 p-5 text-white shadow-sm lg:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-blue-100">
                        <WalletCards className="h-5 w-5" />
                        <p className="text-sm font-semibold">Quỹ phép {getMonthLabel(currentMonth)}</p>
                      </div>
                      <p className="mt-3 text-4xl font-bold tracking-[-0.04em]">{formatHours(remainingHours)}</p>
                      <p className="mt-1 text-sm text-blue-100">phép còn lại</p>
                    </div>
                    <Link
                      href="/timesheet/time-request/new?returnTo=%2Fleave-balance"
                      className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-bold text-blue-800 transition hover:bg-blue-50"
                    >
                      Tạo đơn nghỉ phép
                    </Link>
                  </div>
                </section>

                <section className="grid gap-4 md:grid-cols-3">
                  {[
                    { label: "Tổng quỹ tháng", value: totalHours, icon: CalendarDays, accent: "text-blue-700" },
                    { label: "Đã dùng", value: usedHours, icon: ArrowUpRight, accent: "text-rose-600" },
                    { label: "Còn lại", value: remainingHours, icon: WalletCards, accent: "text-emerald-600" },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <article key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5">
                        <Icon className={`h-5 w-5 ${item.accent}`} />
                        <p className="mt-5 text-sm font-semibold text-slate-500">{item.label}</p>
                        <p className="mt-1 text-2xl font-bold text-slate-900">{formatHours(item.value)}</p>
                      </article>
                    );
                  })}
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                    <div>
                      <h2 className="font-bold text-slate-900">Lịch sử thay đổi phép</h2>
                      <p className="mt-1 text-sm text-slate-500">Bao gồm các lần dùng phép đã duyệt và số phép chuyển từ tháng liền trước.</p>
                    </div>
                    <Clock3 className="h-5 w-5 text-slate-400" />
                  </div>

                  {history.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-slate-500">Chưa có thay đổi quỹ phép để hiển thị.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {history.map((item) => {
                        const isCarryover = item.kind === "carryover";
                        const ItemIcon = isCarryover ? ArrowDownLeft : ArrowUpRight;
                        return (
                          <article key={item.id} className="flex gap-3 px-5 py-4">
                            <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${isCarryover ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                              <ItemIcon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                <p className="font-semibold text-slate-800">{item.title}</p>
                                <p className={`shrink-0 font-bold ${isCarryover ? "text-emerald-700" : "text-rose-700"}`}>
                                  {isCarryover ? "+" : "−"}{formatHours(item.hours)}
                                </p>
                              </div>
                              <p className="mt-1 text-sm leading-6 text-slate-500">{item.detail}</p>
                              <p className="mt-1.5 text-xs font-medium text-slate-400">{formatDateDdMmYyyy(item.date, "--", "--")}</p>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <h2 className="font-bold text-slate-900">Quỹ phép theo tháng</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[620px] w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-5 py-3 font-semibold">Tháng</th>
                          <th className="px-5 py-3 font-semibold">Tổng quỹ</th>
                          <th className="px-5 py-3 font-semibold">Đã dùng</th>
                          <th className="px-5 py-3 font-semibold">Còn lại</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {balances.map((balance) => (
                          <tr key={balance.id}>
                            <td className="px-5 py-3.5 font-semibold capitalize text-slate-800">{getMonthLabel(balance.month)}</td>
                            <td className="px-5 py-3.5 text-slate-600">{formatHours(Number(balance.total_hours))}</td>
                            <td className="px-5 py-3.5 text-rose-700">{formatHours(Number(balance.used_hours))}</td>
                            <td className="px-5 py-3.5 font-semibold text-emerald-700">{formatHours(getBalanceRemainingHours(balance))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
