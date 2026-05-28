"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  canManageTimeRequestProfile,
  resolveCurrentViewerProfileId,
  resolveTimeRequestManagementScope,
} from "@/lib/time-request-access";
import { supabase } from "@/lib/supabase";
import { canReadTimekeepingData } from "@/lib/timekeeping-access";

type TimeRequestLookupRow = {
  id: string;
  profile_id: string | null;
};

export default function SharedTimeRequestEntryPage() {
  const params = useParams<{ requestId: string }>();
  const router = useRouter();
  const [message, setMessage] = useState("Đang mở yêu cầu...");

  useEffect(() => {
    let isActive = true;

    const resolveRoute = async () => {
      try {
        const requestId = typeof params?.requestId === "string" ? params.requestId : "";
        if (!requestId) {
          throw new Error("Link yêu cầu không hợp lệ.");
        }

        const viewerProfileId = await resolveCurrentViewerProfileId();
        const { data: requestData, error: requestError } = await supabase
          .from("time_requests")
          .select("id,profile_id")
          .eq("id", requestId)
          .maybeSingle();

        if (requestError || !requestData?.id) {
          throw new Error(requestError?.message ?? "Không tìm thấy yêu cầu thời gian.");
        }

        const request = requestData as TimeRequestLookupRow;
        if (request.profile_id) {
          const { data: profileData, error: profileError } = await supabase
            .from("profiles")
            .select("id,is_timekeeping_enabled")
            .eq("id", request.profile_id)
            .maybeSingle();

          if (profileError) {
            throw new Error(profileError.message || "Không tải được hồ sơ nhân sự.");
          }

          if (!profileData || !canReadTimekeepingData(profileData)) {
            throw new Error("Không tìm thấy yêu cầu thời gian.");
          }
        }

        if (request.profile_id && String(request.profile_id) === viewerProfileId) {
          router.replace(`/timesheet/requests?request=${encodeURIComponent(requestId)}`);
          return;
        }

        const managementScope = await resolveTimeRequestManagementScope(viewerProfileId);
        if (canManageTimeRequestProfile(viewerProfileId, request.profile_id, managementScope)) {
          router.replace(`/time-request-management?request=${encodeURIComponent(requestId)}`);
          return;
        }

        throw new Error("Bạn không có quyền xem yêu cầu thời gian này.");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setMessage(error instanceof Error ? error.message : "Không thể mở yêu cầu thời gian.");
      }
    };

    void resolveRoute();

    return () => {
      isActive = false;
    };
  }, [params, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f5fa] px-4 text-slate-900">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Yêu cầu thời gian</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">{message}</p>
      </div>
    </div>
  );
}
