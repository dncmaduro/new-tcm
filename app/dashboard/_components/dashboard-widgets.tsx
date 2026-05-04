"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import {
  formatDateShortVi,
  formatDurationClock,
  formatHoursShort,
  formatTimeVi,
  getWorkedMinutes,
  type DashboardActivityItem,
  type DashboardDeadlineItem,
  type DashboardGoalItem,
  type DashboardPriorityTaskItem,
  type DashboardSummaryCard,
  type DashboardTimeTrackerData,
  type DashboardTrendPoint,
  type DashboardWeeklyPerformance,
} from "@/lib/dashboard";

function CardShell({
  title,
  action,
  children,
  footer,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-slate-900">{title}</h2>
        </div>
        {action}
      </div>
      {children}
      {footer}
    </article>
  );
}

function LoadingBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-100 ${className}`} />;
}

function CardState({
  loading,
  error,
  empty,
  emptyText,
}: {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyText: string;
}) {
  if (loading) {
    return (
      <div className="space-y-3 px-5 py-5">
        <LoadingBlock className="h-5 w-2/3" />
        <LoadingBlock className="h-4 w-full" />
        <LoadingBlock className="h-4 w-5/6" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-5 py-10 text-sm text-slate-500">
        Không tải được dữ liệu. Vui lòng thử lại.
      </div>
    );
  }

  if (empty) {
    return <div className="px-5 py-10 text-sm text-slate-500">{emptyText}</div>;
  }

  return null;
}

function ProgressBar({
  value,
  tone = "blue",
}: {
  value: number;
  tone?: "blue" | "emerald" | "amber";
}) {
  const colorClassName =
    tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-blue-600";

  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full transition-[width] ${colorClassName}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

const summaryToneClassName: Record<DashboardSummaryCard["tone"], string> = {
  slate: "bg-slate-100 text-slate-700",
  blue: "bg-blue-50 text-blue-700",
  amber: "bg-amber-50 text-amber-700",
  emerald: "bg-emerald-50 text-emerald-700",
};

export function DashboardSummaryCards({
  cards,
  loading,
}: {
  cards: DashboardSummaryCard[];
  loading: boolean;
}) {
  const placeholders = Array.from({ length: 4 }, (_, index) => index);

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {(loading ? placeholders : cards).map((item, index) => {
        if (loading) {
          return (
            <article
              key={`summary-loading-${index}`}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]"
            >
              <LoadingBlock className="h-8 w-8 rounded-xl" />
              <LoadingBlock className="mt-5 h-8 w-2/3" />
              <LoadingBlock className="mt-3 h-4 w-1/2" />
              <LoadingBlock className="mt-5 h-4 w-full" />
            </article>
          );
        }

        const card = item as DashboardSummaryCard;
        const isCompactValue = /[A-Za-zÀ-ỹ]/u.test(card.value) || card.value.length > 10;

        return (
          <article
            key={card.title}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]"
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${summaryToneClassName[card.tone]}`}
              >
                {card.title}
              </span>
              {card.ctaHref && card.ctaLabel ? (
                <Link
                  href={card.ctaHref}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                >
                  {card.ctaLabel}
                </Link>
              ) : null}
            </div>

            <p
              className={`mt-5 font-semibold tracking-[-0.03em] text-slate-950 ${
                isCompactValue ? "text-2xl leading-tight" : "text-5xl leading-none"
              }`}
            >
              {card.value}
            </p>
            <p className="mt-3 text-sm text-slate-600">{card.note}</p>
          </article>
        );
      })}
    </section>
  );
}

export function DashboardPriorityTasks({
  tasks,
  loading,
  error,
}: {
  tasks: DashboardPriorityTaskItem[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <CardShell
      title="Công việc cần ưu tiên"
      action={
        <Link href="/tasks" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
          Xem công việc
        </Link>
      }
    >
      {loading || error || tasks.length === 0 ? (
        <CardState
          loading={loading}
          error={error}
          empty={tasks.length === 0}
          emptyText="Không có công việc cần xử lý ngay."
        />
      ) : (
        <div className="divide-y divide-slate-100">
          {tasks.map((task) => (
            <div key={task.id} className="space-y-3 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/tasks/${task.id}`}
                  className="text-sm font-semibold text-slate-900 hover:text-blue-700"
                >
                  {task.name}
                </Link>
                {task.dueDateAt ? (
                  <p className="text-xs text-slate-400">{formatDateShortVi(task.dueDateAt)}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className={`rounded-full px-2.5 py-1 ${task.statusClassName}`}>
                  {task.statusLabel}
                </span>
                <span className={`rounded-full px-2.5 py-1 ${task.priorityClassName}`}>
                  {task.priorityLabel}
                </span>
                <span className={`rounded-full px-2.5 py-1 ${task.dueClassName}`}>
                  {task.dueLabel}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}

export function DashboardGoalProgress({
  items,
  title,
  actionHref,
  actionLabel,
  loading,
  error,
}: {
  items: DashboardGoalItem[];
  title: string;
  actionHref: string;
  actionLabel: string;
  loading: boolean;
  error: string | null;
}) {
  return (
    <CardShell
      title={title}
      action={
        <Link href={actionHref} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
          {actionLabel}
        </Link>
      }
    >
      {loading || error || items.length === 0 ? (
        <CardState
          loading={loading}
          error={error}
          empty={items.length === 0}
          emptyText="Chưa có dữ liệu."
        />
      ) : (
        <div className="space-y-5 px-5 py-5">
          {items.map((item) => (
            <div key={item.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
                  >
                    Xem
                  </Link>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-500">Tiến độ</span>
                <span className="font-semibold text-slate-900">{item.progress}%</span>
              </div>
              <ProgressBar
                value={item.progress}
                tone={item.progress >= 80 ? "emerald" : item.progress >= 50 ? "blue" : "amber"}
              />
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-500">Hạn</span>
                <span className="font-medium text-slate-700">
                  {item.endDateAt ? formatDateShortVi(item.endDateAt) : item.timeLabel}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}

export function DashboardCompletedTrend({
  points,
  loading,
  error,
}: {
  points: DashboardTrendPoint[];
  loading: boolean;
  error: string | null;
}) {
  const maxValue = Math.max(0, ...points.map((item) => item.completedCount));
  const hasData = maxValue > 0;

  return (
    <CardShell title="Công việc hoàn thành 7 ngày qua">
      {loading || error || !hasData ? (
        <CardState
          loading={loading}
          error={error}
          empty={!hasData}
          emptyText="Chưa có dữ liệu để hiển thị."
        />
      ) : (
        <div className="px-5 py-5">
          <div className="grid h-[240px] grid-cols-7 items-end gap-3 rounded-2xl bg-slate-50/80 p-4">
            {points.map((point) => {
              const barHeight = Math.max(12, Math.round((point.completedCount / maxValue) * 100));
              return (
                <div
                  key={point.key}
                  className="flex h-full flex-col items-center justify-end gap-2"
                >
                  <span className="text-xs font-semibold text-slate-500">
                    {point.completedCount}
                  </span>
                  <div className="flex h-[150px] w-full items-end">
                    <div
                      className="w-full rounded-t-xl bg-blue-600"
                      style={{ height: `${barHeight}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500">{point.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </CardShell>
  );
}

export function DashboardAttendanceToday({
  data,
  loading,
  error,
}: {
  data: DashboardTimeTrackerData;
  loading: boolean;
  error: string | null;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!data.isRunning) {
      return;
    }

    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, [data.isRunning]);

  const workedMinutes = data.isRunning
    ? getWorkedMinutes(data.checkInAt, data.checkOutAt, now)
    : data.workedMinutes;

  return (
    <CardShell
      title="Chấm công hôm nay"
      action={
        <Link href="/timesheet" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
          Chấm công
        </Link>
      }
    >
      {loading || error || (data.empty && !data.isHoliday) ? (
        <CardState
          loading={loading}
          error={error}
          empty={data.empty && !data.isHoliday}
          emptyText="Chưa có dữ liệu chấm công hôm nay."
        />
      ) : (
        <div className="space-y-4 px-5 py-5">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-400">Trạng thái</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{data.statusLabel}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-400">Giờ vào</p>
              <p className="mt-1 text-base font-semibold text-slate-900">
                {formatTimeVi(data.checkInAt)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-400">Giờ ra</p>
              <p className="mt-1 text-base font-semibold text-slate-900">
                {formatTimeVi(data.checkOutAt)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-400">Tổng thời gian</p>
              <div className="mt-1 flex items-end justify-between gap-3">
                <p className="text-base font-semibold text-slate-900">
                  {formatDurationClock(workedMinutes * 60)}
                </p>
                <span className="text-sm font-semibold text-slate-500">
                  {formatHoursShort(workedMinutes)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </CardShell>
  );
}

export function DashboardUpcomingDeadlines({
  items,
  loading,
  error,
}: {
  items: DashboardDeadlineItem[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <CardShell
      title="Task cần ưu tiên"
      action={
        <Link href="/tasks" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
          Xem công việc
        </Link>
      }
    >
      {loading || error || items.length === 0 ? (
        <CardState
          loading={loading}
          error={error}
          empty={items.length === 0}
          emptyText="Không có hạn cần theo dõi."
        />
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 px-5 py-4">
              <Link
                href={`/tasks/${item.id}`}
                className="text-sm font-semibold text-slate-900 hover:text-blue-700"
              >
                {item.name}
              </Link>
              <span className="text-sm text-slate-500">{formatDateShortVi(item.dueDateAt)}</span>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}

export function DashboardRecentActivities({
  items,
  loading,
  error,
}: {
  items: DashboardActivityItem[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <CardShell title="Hoạt động gần đây">
      {loading || error || items.length === 0 ? (
        <CardState
          loading={loading}
          error={error}
          empty={items.length === 0}
          emptyText="Chưa có hoạt động gần đây."
        />
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((item) => (
            <div key={item.id} className="space-y-1.5 px-5 py-4">
              <p className="text-sm text-slate-700">{item.message}</p>
              <p className="text-xs text-slate-400">{item.when}</p>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}

export function DashboardWeeklyPerformance({
  data,
  loading,
  error,
}: {
  data: DashboardWeeklyPerformance;
  loading: boolean;
  error: string | null;
}) {
  return (
    <CardShell
      title={data.title}
      action={
        <Link
          href={data.ctaHref}
          className="text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          {data.ctaLabel}
        </Link>
      }
    >
      {loading || error ? (
        <CardState loading={loading} error={error} empty={false} emptyText="" />
      ) : (
        <div className="space-y-4 px-5 py-5">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500">Hoàn thành</span>
              <span className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">
                {data.completedTasks} / {data.totalTasks}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500">Tiến độ</span>
              <span className="font-semibold text-slate-900">{data.progress}%</span>
            </div>
            <ProgressBar
              value={data.progress}
              tone={data.progress >= 80 ? "emerald" : data.progress >= 50 ? "blue" : "amber"}
            />
          </div>
        </div>
      )}
    </CardShell>
  );
}
