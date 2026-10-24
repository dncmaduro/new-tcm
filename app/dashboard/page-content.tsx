"use client";

import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { AppErrorToast } from "@/components/app-error-toast";
import {
  DashboardSummaryCards,
  DashboardGoalProgress,
  DashboardRecentActivities,
  DashboardUpcomingDeadlines,
} from "@/app/dashboard/_components/dashboard-widgets";
import { useDashboardData } from "@/app/dashboard/use-dashboard-data";
import { OKR_FEATURE_ENABLED } from "@/lib/features";

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboardData();

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="dashboard" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <main className="space-y-4 px-4 py-5 lg:px-8 lg:py-6">
            {error ? (
              <AppErrorToast message={error} title="Không tải được dashboard" />
            ) : null}

            <DashboardSummaryCards
              cards={
                OKR_FEATURE_ENABLED
                  ? data.summaryCards
                  : data.summaryCards.filter((card) => !card.title.toLowerCase().includes("kr"))
              }
              loading={isLoading}
            />

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
              <div className="space-y-4">
                <DashboardUpcomingDeadlines
                  items={data.upcomingDeadlines}
                  loading={isLoading}
                  error={error}
                />
              </div>

              <div className="space-y-4">
                {OKR_FEATURE_ENABLED ? (
                  <DashboardGoalProgress
                    title={data.profile?.roleScope === "member" ? "KR của tôi" : "Goal của tôi"}
                    actionHref="/goals"
                    actionLabel="Xem goal"
                    items={data.goalProgress}
                    loading={isLoading}
                    error={error}
                  />
                ) : null}
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
