"use client";

import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  DashboardSummaryCards,
  DashboardGoalProgress,
  DashboardRecentActivities,
  DashboardUpcomingDeadlines,
} from "@/app/dashboard/_components/dashboard-widgets";
import { useDashboardData } from "@/app/dashboard/use-dashboard-data";

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboardData();

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="dashboard" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <main className="space-y-4 px-4 py-5 lg:px-8 lg:py-6">
            {error ? (
              <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]">
                Không có data
              </section>
            ) : null}

            <DashboardSummaryCards cards={data.summaryCards} loading={isLoading} />

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
              <div className="space-y-4">
                <DashboardUpcomingDeadlines
                  items={data.upcomingDeadlines}
                  loading={isLoading}
                  error={error}
                />
              </div>

              <div className="space-y-4">
                <DashboardGoalProgress
                  title={data.profile?.roleScope === "member" ? "KR của tôi" : "Mục tiêu của tôi"}
                  actionHref="/goals"
                  actionLabel="Xem mục tiêu"
                  items={data.goalProgress}
                  loading={isLoading}
                  error={error}
                />
                <DashboardRecentActivities
                  items={data.recentActivities}
                  loading={isLoading}
                  error={error}
                />
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
