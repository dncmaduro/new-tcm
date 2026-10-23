import "server-only";

import { getTimeRequestReviewStatus } from "@/lib/constants/time-requests";
import { createServerSupabaseServiceRoleClient } from "@/lib/supabase-server";

type PendingTimeRequestRow = {
  id: string;
  time_request_reviewers?: Array<{ is_approved: boolean | null }> | null;
};

export async function syncPendingTimeRequestReviewers(
  supabase: ReturnType<typeof createServerSupabaseServiceRoleClient>,
  requesterProfileId: string,
  reviewerProfileIds: string[],
) {
  if (reviewerProfileIds.length === 0) {
    return 0;
  }

  const { data: requestRows, error: requestError } = await supabase
    .from("time_requests")
    .select("id,time_request_reviewers(is_approved)")
    .eq("profile_id", requesterProfileId);

  if (requestError) {
    throw requestError;
  }

  const pendingRequestIds = ((requestRows ?? []) as PendingTimeRequestRow[])
    .filter((request) => getTimeRequestReviewStatus(request.time_request_reviewers) === "pending")
    .map((request) => String(request.id));

  for (const requestId of pendingRequestIds) {
    const { error: deleteError } = await supabase
      .from("time_request_reviewers")
      .delete()
      .eq("time_request_id", requestId);

    if (deleteError) {
      throw deleteError;
    }

    const { error: insertError } = await supabase
      .from("time_request_reviewers")
      .insert(
        reviewerProfileIds.map((reviewerProfileId) => ({
          time_request_id: requestId,
          profile_id: reviewerProfileId,
        })),
      );

    if (insertError) {
      throw insertError;
    }
  }

  return pendingRequestIds.length;
}
