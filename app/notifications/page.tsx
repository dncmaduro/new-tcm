"use client";

import { useRouter } from "next/navigation";
import { NotificationList } from "@/components/notification-list";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import type { AppNotification } from "@/lib/notifications";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { useNotifications } from "@/lib/use-notifications";

export default function NotificationsPage() {
  const router = useRouter();
  const workspaceAccess = useWorkspaceAccess();
  const {
    unreadItems,
    readItems,
    unreadCount,
    isLoading,
    error,
    markingReadId,
    isMarkingAllRead,
    openNotification,
    markAllRead,
  } = useNotifications({
    profileId: workspaceAccess.profileId,
    limit: 100,
  });

  const handleOpen = async (item: AppNotification) => {
    await openNotification(item);
    if (item.href) {
      router.push(item.href);
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="notifications" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader title="Thông báo" items={[{ label: "Thông báo" }]} />

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-7">
            <section className="mx-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_50px_-40px_rgba(15,23,42,0.4)]">
              <NotificationList
                unreadCount={unreadCount}
                unreadItems={unreadItems}
                readItems={readItems}
                isLoading={isLoading}
                error={error}
                markingReadId={markingReadId}
                isMarkingAllRead={isMarkingAllRead}
                onOpen={handleOpen}
                onMarkAllRead={markAllRead}
                className="min-h-[70vh]"
                emptyText="Bạn chưa có thông báo nào trong hệ thống."
              />
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
