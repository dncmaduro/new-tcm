import { NextResponse } from "next/server";

import { authorizeITAdmin } from "@/lib/it-admin-access";
import { createServerSupabaseServiceRoleClient } from "@/lib/supabase-server";

type OverridePayload = {
  requesterProfileId?: string;
  reviewerProfileIds?: unknown;
};

const value = (input: unknown) => (typeof input === "string" ? input.trim() : "");

function uniqueProfileIds(input: unknown) {
  if (!Array.isArray(input)) return null;

  const ids = input.map(value).filter(Boolean);
  return [...new Set(ids)];
}

async function authorize(request: Request) {
  const access = await authorizeITAdmin(request);
  if (!access.configured) {
    return { access, response: NextResponse.json({ error: "Chưa cấu hình `IT_EMAIL` trên server." }, { status: 500 }) };
  }
  if (!access.allowed) {
    return { access, response: NextResponse.json({ error: "Bạn không có quyền cấu hình người duyệt form." }, { status: 403 }) };
  }
  return { access, response: null };
}

export async function PUT(request: Request) {
  const authorization = await authorize(request);
  if (authorization.response) return authorization.response;

  let payload: OverridePayload;
  try {
    payload = (await request.json()) as OverridePayload;
  } catch {
    return NextResponse.json({ error: "Body JSON không hợp lệ." }, { status: 400 });
  }

  const requesterProfileId = value(payload.requesterProfileId);
  const reviewerProfileIds = uniqueProfileIds(payload.reviewerProfileIds);
  if (!requesterProfileId || reviewerProfileIds === null) {
    return NextResponse.json({ error: "Nhân sự và danh sách người duyệt là bắt buộc." }, { status: 400 });
  }
  if (reviewerProfileIds.includes(requesterProfileId)) {
    return NextResponse.json({ error: "Một người không thể tự duyệt form của mình." }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseServiceRoleClient();
    const requiredProfileIds = [requesterProfileId, ...reviewerProfileIds];
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id,is_active")
      .in("id", requiredProfileIds);
    if (profilesError) throw profilesError;

    const profileById = new Map((profiles ?? []).map((profile) => [String(profile.id), profile]));
    if (!profileById.has(requesterProfileId)) {
      return NextResponse.json({ error: "Không tìm thấy nhân sự cần cấu hình." }, { status: 404 });
    }
    if (reviewerProfileIds.some((profileId) => profileById.get(profileId)?.is_active !== true)) {
      return NextResponse.json({ error: "Người duyệt phải là nhân sự đang hoạt động." }, { status: 400 });
    }

    const { error: deleteError } = await supabase
      .from("time_request_reviewer_overrides")
      .delete()
      .eq("requester_profile_id", requesterProfileId);
    if (deleteError) throw deleteError;

    if (reviewerProfileIds.length > 0) {
      const { error: insertError } = await supabase
        .from("time_request_reviewer_overrides")
        .insert(reviewerProfileIds.map((reviewerProfileId) => ({ requester_profile_id: requesterProfileId, reviewer_profile_id: reviewerProfileId })));
      if (insertError) throw insertError;
    }

    return NextResponse.json({ requesterProfileId, reviewerProfileIds });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể lưu cấu hình người duyệt form." },
      { status: 500 },
    );
  }
}
