"use client";

import { useEffect, useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { TimesheetOverview } from "@/components/timesheet/timesheet-overview";
import { supabase } from "@/lib/supabase";

export default function TimesheetPage() {
  const [profileId, setProfileId] = useState<string | null>(null);
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
          .select("id")
          .eq("user_id", authData.user.id)
          .maybeSingle();

        if (!profile?.id || profileLookupError) {
          throw profileLookupError ?? new Error("Không tìm thấy hồ sơ người dùng.");
        }

        if (!isActive) {
          return;
        }

        setProfileId(String(profile.id));
      } catch (error) {
        if (!isActive) {
          return;
        }

        setProfileId(null);
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
        <WorkspaceSidebar active="timesheet" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[280px]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-7">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-3xl font-semibold tracking-[-0.02em] text-slate-900">Chấm công</h1>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-7">
            <TimesheetOverview
              profileId={profileId}
              isProfileLoading={isLoadingProfile}
              profileError={profileError}
              createRequestHref="/timesheet/time-request/new"
              showExportButton
            />
          </main>
        </div>
      </div>
    </div>
  );
}
