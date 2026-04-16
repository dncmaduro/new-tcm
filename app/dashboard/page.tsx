"use client";

import { useMemo, useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  DashboardGoalProgress,
  DashboardMyTasks,
  DashboardRecentActivity,
  DashboardSummaryCards,
  DashboardTaskTrendChart,
  DashboardTeamPerformance,
  DashboardTimeTracker,
  DashboardUpcomingDeadlines,
} from "@/app/dashboard/_components/dashboard-widgets";
import { useDashboardData } from "@/app/dashboard/use-dashboard-data";

function TinyDot({ className }: { className: string }) {
  return <span className={`inline-flex h-2.5 w-2.5 rounded-full ${className}`} />;
}

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboardData();
  const [searchKeyword, setSearchKeyword] = useState("");

  const keyword = searchKeyword.trim().toLowerCase();

  const filteredMyTasks = useMemo(() => {
    if (!keyword) {
      return data.myTasks;
    }
    return data.myTasks.filter((task) =>
      `${task.name} ${task.goalName} ${task.keyResultName}`.toLowerCase().includes(keyword),
    );
  }, [data.myTasks, keyword]);

  const filteredDeadlines = useMemo(() => {
    if (!keyword) {
      return data.upcomingDeadlines;
    }
    return data.upcomingDeadlines.filter((item) =>
      `${item.title} ${item.goalName} ${item.keyResultName}`.toLowerCase().includes(keyword),
    );
  }, [data.upcomingDeadlines, keyword]);

  const filteredGoals = useMemo(() => {
    if (!keyword) {
      return data.goalProgress;
    }
    return data.goalProgress.filter((goal) =>
      `${goal.label} ${goal.team}`.toLowerCase().includes(keyword),
    );
  }, [data.goalProgress, keyword]);

  const filteredTeamPerformance = useMemo(() => {
    if (!keyword) {
      return data.teamPerformance;
    }
    return data.teamPerformance.filter((member) => member.name.toLowerCase().includes(keyword));
  }, [data.teamPerformance, keyword]);

  const filteredActivities = useMemo(() => {
    if (!keyword) {
      return data.recentActivities;
    }
    return data.recentActivities.filter((activity) => activity.message.toLowerCase().includes(keyword));
  }, [data.recentActivities, keyword]);

  const activeStateLabel = data.timeTracker.isRunning ? "Đang hoạt động" : "Chưa check-in";
  const activeStateClassName = data.timeTracker.isRunning
    ? "bg-emerald-50 text-emerald-700"
    : "bg-slate-100 text-slate-600";

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="dashboard" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <input
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="Tìm công việc, mục tiêu hoặc thành viên..."
                  className="h-11 w-full max-w-[520px] rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
                />
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold tracking-[0.06em] uppercase ${activeStateClassName}`}
                >
                  <TinyDot className={data.timeTracker.isRunning ? "bg-emerald-500" : "bg-slate-400"} />
                  {activeStateLabel}
                </span>
                <div className="hidden h-8 w-px bg-slate-200 md:block" />
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-800">
                    {data.profile?.profileName ?? "Đang tải"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {data.profile?.departmentName ?? "Chưa có team"}
                  </p>
                </div>
              </div>
            </div>
          </header>

          <main className="space-y-6 px-4 py-6 lg:px-8 lg:py-7">
            <section>
              <div className="space-y-2.5">
                <h1 className="text-4xl font-semibold tracking-[-0.025em] text-slate-950">
                  Tổng quan
                </h1>
                <p className="text-sm text-slate-500">
                  {data.profile?.profileName
                    ? `Chào mừng trở lại, ${data.profile.profileName}. Đây là những gì đang diễn ra hôm nay.`
                    : "Đang đồng bộ dữ liệu tổng quan cho bạn."}
                </p>
              </div>
            </section>

            {error ? (
              <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </section>
            ) : null}

            <DashboardSummaryCards cards={data.summaryCards} loading={isLoading} />

            <section className="grid gap-4 xl:grid-cols-[2.1fr_1fr]">
              <DashboardTaskTrendChart points={data.taskTrend} loading={isLoading} error={error} />
              <DashboardTimeTracker data={data.timeTracker} loading={isLoading} error={error} />
            </section>

            <section className="grid gap-4 xl:grid-cols-[2.1fr_1fr]">
              <DashboardMyTasks tasks={filteredMyTasks} loading={isLoading} error={error} />
              <DashboardUpcomingDeadlines items={filteredDeadlines} loading={isLoading} error={error} />
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <DashboardGoalProgress items={filteredGoals} loading={isLoading} error={error} />
              <DashboardTeamPerformance items={filteredTeamPerformance} loading={isLoading} error={error} />
              <DashboardRecentActivity items={filteredActivities} loading={isLoading} error={error} />
            </section>

          </main>
        </div>
      </div>
    </div>
  );
}
