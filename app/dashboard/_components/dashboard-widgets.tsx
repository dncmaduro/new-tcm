"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import {
  formatDateShortVi,
  formatTimeVi,
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
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.02em] text-slate-900">{title}</h2>
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
  ctaHref,
  ctaLabel,
}: {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyText: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  if (loading) {
    return (
      <div className="space-y-2 px-4 py-4">
        <LoadingBlock className="h-4 w-2/3" />
        <LoadingBlock className="h-3.5 w-full" />
        <LoadingBlock className="h-3.5 w-5/6" />
      </div>
    );
  }

  if (error) {
    return <div className="px-4 py-4 text-sm text-slate-500">Không tải được dữ liệu lúc này.</div>;
  }

  if (empty) {
    return (
      <div className="px-4 py-4 text-sm text-slate-500">
        <p>{emptyText}</p>
        {ctaHref && ctaLabel ? (
          <Link href={ctaHref} className="mt-2 inline-flex font-semibold text-blue-600 hover:text-blue-700">
            {ctaLabel}
          </Link>
        ) : null}
      </div>
    );
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
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {(loading ? placeholders : cards).map((item, index) => {
        if (loading) {
          return (
            <article
              key={`summary-loading-${index}`}
              className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]"
            >
              <LoadingBlock className="h-6 w-24 rounded-full" />
              <LoadingBlock className="mt-4 h-7 w-2/3" />
              <LoadingBlock className="mt-2 h-3.5 w-3/4" />
            </article>
          );
        }

        const card = item as DashboardSummaryCard;
        const isCompactValue = /[A-Za-zÀ-ỹ]/u.test(card.value) || card.value.length > 10;

        return (
          <article
            key={card.title}
            className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]"
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
              className={`mt-4 font-semibold tracking-[-0.03em] text-slate-950 ${
                isCompactValue ? "text-xl leading-tight" : "text-3xl leading-none"
              }`}
            >
              {card.value}
            </p>
            <p className="mt-2 text-xs text-slate-600">{card.note}</p>
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
          emptyText="Không có data"
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
          emptyText="Chưa có KR nổi bật. Vào mục tiêu để cập nhật tiến độ hoặc nhận KR mới."
          ctaHref={actionHref}
          ctaLabel={actionLabel}
        />
      ) : (
        <div className="divide-y divide-slate-100">
          {items.slice(0, 5).map((item) => (
            <div key={item.id} className="space-y-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="block truncate text-sm font-semibold text-slate-900 hover:text-blue-700"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-semibold text-slate-900">{item.label}</p>
                  )}
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {item.endDateAt ? `Hạn ${formatDateShortVi(item.endDateAt)}` : "Chưa đặt hạn"}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-slate-900">{item.progress}%</span>
              </div>
              <ProgressBar
                value={item.progress}
                tone={item.progress >= 80 ? "emerald" : item.progress >= 50 ? "blue" : "amber"}
              />
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
          emptyText="Không có data"
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
  return (
    <CardShell title="Chấm công hôm nay">
      {loading || error || (data.empty && !data.isHoliday) ? (
        <CardState
          loading={loading}
          error={error}
          empty={data.empty && !data.isHoliday}
          emptyText="Chưa có bản ghi chấm công hôm nay. Mở chấm công để bắt đầu."
          ctaHref="/timesheet"
          ctaLabel="Mở chấm công"
        />
      ) : (
        <div className="space-y-3 px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
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
          emptyText="Chưa có task ưu tiên. Vào danh sách task để cập nhật việc cần làm tiếp theo."
          ctaHref="/tasks"
          ctaLabel="Xem task"
        />
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((item) => (
            <div key={item.id} className="space-y-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/tasks/${item.id}`}
                    className="block truncate text-sm font-semibold text-slate-900 hover:text-blue-700"
                  >
                    {item.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${item.statusClassName}`}>
                      {item.statusLabel}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${item.dueClassName}`}>
                      {item.dueDateAt ? formatDateShortVi(item.dueDateAt) : item.dueLabel}
                    </span>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold text-slate-900">{item.progress}%</span>
              </div>
              {item.progress > 0 ? (
                <ProgressBar
                  value={item.progress}
                  tone={item.progress >= 80 ? "emerald" : item.progress >= 50 ? "blue" : "amber"}
                />
              ) : null}
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
          emptyText="Chưa có hoạt động mới. Khi có cập nhật task hoặc mục tiêu, phần này sẽ hiện ở đây."
        />
      ) : (
        <div className="divide-y divide-slate-100">
          {items.slice(0, 4).map((item) => (
            <div key={item.id} className="space-y-1 px-4 py-3">
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
        <div className="space-y-3 px-4 py-4">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500">Hoàn thành</span>
              <span className="text-xl font-semibold tracking-[-0.03em] text-slate-900">
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
