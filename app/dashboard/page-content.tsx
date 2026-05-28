"use client";

import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  DashboardAttendanceToday,
  DashboardGoalProgress,
  DashboardRecentActivities,
  DashboardUpcomingDeadlines,
  DashboardWeeklyPerformance,
} from "@/app/dashboard/_components/dashboard-widgets";
import { useDashboardData } from "@/app/dashboard/use-dashboard-data";

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboardData();

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="dashboard" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <main className="space-y-6 px-4 py-6 lg:px-8 lg:py-7">
            {error ? (
              <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]">
                Không có data
              </section>
            ) : null}

            <section className="grid gap-4 xl:grid-cols-2">
              <DashboardAttendanceToday data={data.timeTracker} loading={isLoading} error={error} />
              <DashboardWeeklyPerformance
                data={data.weeklyPerformance}
                loading={isLoading}
                error={error}
              />
              <DashboardGoalProgress
                title={data.profile?.roleScope === "member" ? "KR của tôi" : "Mục tiêu"}
                actionHref="/goals"
                actionLabel="Xem mục tiêu"
                items={data.goalProgress}
                loading={isLoading}
                error={error}
              />
              <DashboardUpcomingDeadlines
                items={data.upcomingDeadlines}
                loading={isLoading}
                error={error}
              />
            </section>

            <section className="xl:w-1/2">
              <DashboardRecentActivities
                items={data.recentActivities}
                loading={isLoading}
                error={error}
              />
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
