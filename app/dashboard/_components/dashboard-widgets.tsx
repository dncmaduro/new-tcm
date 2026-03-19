"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  formatDateShortVi,
  formatDurationClock,
  formatHoursShort,
  formatTimeVi,
  getWorkedMinutes,
  type DashboardActivityItem,
  type DashboardDeadlineItem,
  type DashboardGoalItem,
  type DashboardMyTaskItem,
  type DashboardSummaryCard,
  type DashboardTeamPerformanceItem,
  type DashboardTimeTrackerData,
  type DashboardTrendPoint,
} from "@/lib/dashboard";

function TinyDot({ className }: { className: string }) {
  return <span className={`inline-flex h-2.5 w-2.5 rounded-full ${className}`} />;
}

function ProgressBar({ value, colorClass }: { value: number; colorClass?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full ${colorClass ?? "bg-blue-600"}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
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
    return <div className="px-5 py-10 text-sm text-slate-500">Đang tải dữ liệu...</div>;
  }
  if (error) {
    return <div className="px-5 py-10 text-sm text-rose-600">{error}</div>;
  }
  if (empty) {
    return <div className="px-5 py-10 text-sm text-slate-500">{emptyText}</div>;
  }
  return null;
}

export function DashboardSummaryCards({
  cards,
  loading,
}: {
  cards: DashboardSummaryCard[];
  loading: boolean;
}) {
  const placeholders = Array.from({ length: 4 }, (_, index) => index);

  return (
    <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
      {(loading ? placeholders : cards).map((item, index) => {
        const card = loading
          ? {
              title: "Đang tải",
              value: "--",
              badge: "Loading",
              badgeClass: "bg-slate-100 text-slate-400",
              note: "Đang đồng bộ dữ liệu",
              iconClass: "bg-slate-100 text-slate-400",
            }
          : (item as DashboardSummaryCard);

        return (
          <article
            key={loading ? `placeholder-${index}` : card.title}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]"
          >
            <div className="flex items-start justify-between">
              <span className={`grid h-10 w-10 place-items-center rounded-xl ${card.iconClass}`}>•</span>
              <span
                className={`rounded-lg px-2 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase ${card.badgeClass}`}
              >
                {card.badge}
              </span>
            </div>
            <p className="mt-4 text-[47px] font-semibold leading-none tracking-[-0.03em] text-slate-950">
              {card.value}
            </p>
            <p className="mt-1 text-sm text-slate-500">{card.title}</p>
            <p className="mt-4 text-sm text-slate-600">{card.note}</p>
          </article>
        );
      })}
    </section>
  );
}

export function DashboardTaskTrendChart({
  points,
  loading,
  error,
}: {
  points: DashboardTrendPoint[];
  loading: boolean;
  error: string | null;
}) {
  const maxValue = Math.max(1, ...points.map((item) => Math.max(item.createdCount, item.completedCount)));
  const createdPoints = points
    .map((item, index) => `${30 + index * 100},${210 - (item.createdCount / maxValue) * 150}`)
    .join(" ");
  const completedPoints = points
    .map((item, index) => `${30 + index * 100},${210 - (item.completedCount / maxValue) * 150}`)
    .join(" ");

  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-slate-900">
          Xu hướng hoàn thành công việc
        </h2>
        <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          7 ngày qua
        </span>
      </div>
      {loading || error || points.length === 0 ? (
        <CardState
          loading={loading}
          error={error}
          empty={points.length === 0}
          emptyText="Chưa có đủ dữ liệu công việc để dựng xu hướng."
        />
      ) : (
        <div className="p-5">
          <div className="h-[290px] rounded-xl bg-gradient-to-b from-blue-50/60 to-white p-4">
            <svg viewBox="0 0 700 240" className="h-full w-full">
              <polyline
                points={createdPoints}
                fill="none"
                stroke="#2563eb"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points={completedPoints}
                fill="none"
                stroke="#34d399"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="5 6"
              />
              {points.map((point, index) => (
                <g key={point.key} fill="#94a3b8" fontSize="13">
                  <text x={52 + index * 98} y="228">
                    {point.label}
                  </text>
                </g>
              ))}
            </svg>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-2">
                <TinyDot className="bg-blue-600" />
                Công việc tạo mới
              </span>
              <span className="inline-flex items-center gap-2">
                <TinyDot className="bg-emerald-500" />
                Công việc hoàn thành
              </span>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

export function DashboardTimeTracker({
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
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [data.isRunning]);

  const workedMinutes = data.isRunning
    ? getWorkedMinutes(data.checkInAt, data.checkOutAt, now)
    : data.workedMinutes;
  const workedClock = formatDurationClock(workedMinutes * 60);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-slate-900">
          Theo dõi thời gian
        </h2>
        <span
          className={`rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase ${
            data.isRunning ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          {data.isRunning ? "Đang làm" : "Chưa chạy"}
        </span>
      </div>
      {loading || error || data.empty ? (
        <CardState
          loading={loading}
          error={error}
          empty={data.empty}
          emptyText="Hôm nay chưa có dữ liệu chấm công. Hãy vào chấm công để bắt đầu ghi nhận thời gian."
        />
      ) : (
        <div className="space-y-4 px-5 py-5">
          <p className="text-center text-[62px] font-semibold leading-none tracking-[-0.04em] text-slate-950">
            {workedClock}
          </p>
          <p className="text-center text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
            Tổng thời gian hôm nay
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-400">Vào ca</p>
              <p className="text-xl font-semibold text-slate-700">{formatTimeVi(data.checkInAt)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-400">Ra ca</p>
              <p className={`text-xl font-semibold ${data.checkOutAt ? "text-slate-700" : "text-slate-400"}`}>
                {formatTimeVi(data.checkOutAt)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/timesheet"
              className="rounded-xl bg-slate-100 py-2 text-center text-sm font-medium text-slate-700"
            >
              Mở chấm công
            </Link>
            <Link
              href="/timesheet"
              className="rounded-xl bg-rose-500 py-2 text-center text-sm font-semibold text-white"
            >
              Quản lý ca làm
            </Link>
          </div>
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
              Tóm tắt hôm nay
            </p>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span className="flex items-center gap-2">
                <TinyDot className="bg-blue-500" />
                Tổng giờ làm
              </span>
              <span>{formatHoursShort(workedMinutes)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span className="flex items-center gap-2">
                <TinyDot className="bg-slate-300" />
                Trạng thái
              </span>
              <span>{data.isRunning ? "Đang trong ca" : "Đã kết thúc hoặc chưa check-in"}</span>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

export function DashboardMyTasks({
  tasks,
  loading,
  error,
}: {
  tasks: DashboardMyTaskItem[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-slate-900">
          Công việc của tôi
        </h2>
        <Link href="/tasks" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
          Xem tất cả
        </Link>
      </div>
      {loading || error || tasks.length === 0 ? (
        <CardState
          loading={loading}
          error={error}
          empty={tasks.length === 0}
          emptyText="Bạn chưa có công việc nào được giao."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[660px] text-left">
            <thead>
              <tr className="text-[11px] tracking-[0.08em] text-slate-400 uppercase">
                <th className="px-5 py-3 font-semibold">Tên công việc</th>
                <th className="px-5 py-3 font-semibold">Liên kết OKR</th>
                <th className="px-5 py-3 font-semibold">Trạng thái</th>
                <th className="px-5 py-3 font-semibold">Tiến độ</th>
                <th className="px-5 py-3 font-semibold">Hạn chót</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-t border-slate-100">
                  <td className="px-5 py-4 text-sm font-medium text-slate-700">
                    <Link href={`/tasks/${task.id}`} className="hover:text-blue-700">
                      {task.name}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-500">
                    <p className="font-medium text-slate-700">{task.keyResultName}</p>
                    <p className="mt-1 text-xs text-slate-500">{task.goalName}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-semibold tracking-[0.06em] uppercase ${task.statusClassName}`}
                    >
                      {task.statusLabel}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <ProgressBar
                      value={task.progress}
                      colorClass={task.progress === 100 ? "bg-emerald-500" : "bg-blue-600"}
                    />
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-500">{formatDateShortVi(task.deadlineAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
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
    <article className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-slate-900">Hạn sắp tới</h2>
      </div>
      {loading || error || items.length === 0 ? (
        <CardState
          loading={loading}
          error={error}
          empty={items.length === 0}
          emptyText="Không có deadline nào cần chú ý trong vài ngày tới."
        />
      ) : (
        <>
          <div className="space-y-4 px-5 py-4">
            {items.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                <div className="w-14 rounded-xl bg-slate-50 px-2 py-1 text-center text-[11px] font-bold text-slate-700 uppercase">
                  {formatDateShortVi(item.deadlineAt)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                  <p className="text-xs text-slate-500">
                    <span className={`font-semibold ${item.tagClassName}`}>{item.tag}</span>
                    {" · "}
                    {item.keyResultName}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{item.goalName}</p>
                </div>
              </div>
            ))}
          </div>
          <Link
            href="/tasks"
            className="m-4 block w-[calc(100%-2rem)] rounded-xl border border-slate-200 bg-slate-50 py-2 text-center text-xs font-semibold tracking-[0.06em] text-slate-600 uppercase"
          >
            Xem toàn bộ deadline
          </Link>
        </>
      )}
    </article>
  );
}

export function DashboardGoalProgress({
  items,
  loading,
  error,
}: {
  items: DashboardGoalItem[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-slate-900">Tiến độ mục tiêu</h2>
      </div>
      {loading || error || items.length === 0 ? (
        <CardState
          loading={loading}
          error={error}
          empty={items.length === 0}
          emptyText="Chưa có mục tiêu phù hợp để tính tiến độ."
        />
      ) : (
        <div className="space-y-5 px-5 py-5">
          {items.map((item) => (
            <div key={item.id} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <p className="font-medium text-slate-700">{item.label}</p>
                <span className="font-semibold text-slate-500">{item.progress}%</span>
              </div>
              <ProgressBar
                value={item.progress}
                colorClass={item.progress > 80 ? "bg-emerald-500" : "bg-blue-600"}
              />
              <p className="text-xs text-slate-400">{item.team}</p>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function DashboardTeamPerformance({
  items,
  loading,
  error,
}: {
  items: DashboardTeamPerformanceItem[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-slate-900">Hiệu suất nhóm</h2>
      </div>
      {loading || error || items.length === 0 ? (
        <CardState
          loading={loading}
          error={error}
          empty={items.length === 0}
          emptyText="Chưa xác định được thành viên cùng team để thống kê."
        />
      ) : (
        <div className="space-y-4 px-5 py-5">
          {items.map((member) => (
            <div key={member.id} className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 uppercase">
                <p className="font-semibold text-slate-600">{member.name}</p>
                <p>{member.tasks} công việc · {member.completedRate}% done</p>
              </div>
              <ProgressBar value={member.progress} />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function DashboardRecentActivity({
  items,
  loading,
  error,
}: {
  items: DashboardActivityItem[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-slate-900">Hoạt động gần đây</h2>
      </div>
      {loading || error || items.length === 0 ? (
        <CardState
          loading={loading}
          error={error}
          empty={items.length === 0}
          emptyText="Chưa có hoạt động gần đây trong phạm vi team hiện tại."
        />
      ) : (
        <div className="space-y-4 px-5 py-5">
          {items.map((activity) => (
            <div key={activity.id} className="flex items-start gap-3">
              <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                {activity.actorInitial}
              </span>
              <div>
                <p className="text-sm text-slate-700">{activity.message}</p>
                <p className="text-xs text-slate-400">{activity.when}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
