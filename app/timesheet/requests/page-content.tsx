"use client";

import { Suspense, useEffect, useState } from "react";
import { TimeRequestManagementOverview } from "@/components/timesheet/time-request-management-overview";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { supabase } from "@/lib/supabase";
import {
  canCreateTimeRequest,
  canReadTimekeepingData,
  type TimekeepingCreateProfile,
} from "@/lib/timekeeping-access";

export default function TimeRequestManagementPage() {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileAccess, setProfileAccess] = useState<TimekeepingCreateProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadProfileId = async () => {
      setIsLoadingProfile(true);
      setProfileError(null);

      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
          throw authError ?? new Error("Không xác thực được người dùng.");
        }

        const { data: profile, error: profileLookupError } = await supabase
          .from("profiles")
          .select("id,is_active,is_timekeeping_enabled")
          .eq("user_id", authData.user.id)
          .maybeSingle();

        if (!profile?.id || profileLookupError) {
          throw profileLookupError ?? new Error("Không tìm thấy hồ sơ người dùng.");
        }

        if (!isActive) {
          return;
        }

        setProfileId(String(profile.id));
        setProfileAccess({
          is_active: profile.is_active,
          is_timekeeping_enabled: profile.is_timekeeping_enabled,
        });
      } catch (error) {
        if (!isActive) {
          return;
        }

        setProfileId(null);
        setProfileAccess(null);
        setProfileError(error instanceof Error ? error.message : "Không thể tải hồ sơ người dùng.");
      } finally {
        if (isActive) {
          setIsLoadingProfile(false);
        }
      }
    };

    void loadProfileId();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="timeRequestForms" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader
            title="Quản lý form điều chỉnh công"
            items={[{ label: "Chấm công", href: "/timesheet" }, { label: "Quản lý form điều chỉnh công" }]}
          />

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-7">
            <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">Đang tải danh sách yêu cầu...</div>}>
              <TimeRequestManagementOverview
                profileId={profileId}
                isProfileLoading={isLoadingProfile}
                profileError={profileError}
                canReadTimekeepingData={canReadTimekeepingData(profileAccess)}
                createRequestHref={
                  canCreateTimeRequest(profileAccess)
                    ? "/timesheet/time-request/new?returnTo=%2Ftimesheet%2Frequests"
                    : null
                }
              />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
