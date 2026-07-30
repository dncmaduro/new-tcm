import { NextResponse } from "next/server";

import { authorizeITAdmin } from "@/lib/it-admin-access";
import { createServerSupabaseServiceRoleClient } from "@/lib/supabase-server";

async function getAuthEmailByUserId(supabase: ReturnType<typeof createServerSupabaseServiceRoleClient>) {
  const emails = new Map<string, string>();
  const perPage = 1_000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const user of data.users) {
      if (user.email) emails.set(user.id, user.email);
    }
    if (data.users.length < perPage) break;
  }

  return emails;
}

export async function GET(request: Request) {
  const access = await authorizeITAdmin(request);
  if (!access.configured) {
    return NextResponse.json({ error: "Chưa cấu hình `IT_EMAIL` trên server." }, { status: 500 });
  }
  if (!access.allowed) {
    return NextResponse.json({ error: "Bạn không có quyền quản trị IT." }, { status: 403 });
  }

  try {
    const supabase = createServerSupabaseServiceRoleClient();
    const [profilesResult, departmentsResult, rolesResult, membershipsResult, authEmailByUserId] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,user_id,name,email,is_active,is_timekeeping_enabled,is_parttime")
        .order("name", { ascending: true }),
      supabase.from("departments").select("id,name").order("name", { ascending: true }),
      supabase.from("roles").select("id,name").order("name", { ascending: true }),
      supabase.from("user_role_in_department").select("profile_id,department_id,role_id"),
      getAuthEmailByUserId(supabase),
    ]);

    const error = profilesResult.error || departmentsResult.error || rolesResult.error || membershipsResult.error;
    if (error) {
      throw error;
    }

    return NextResponse.json({
      profiles: (profilesResult.data ?? []).map((profile) => ({
        ...profile,
        email: profile.user_id ? authEmailByUserId.get(profile.user_id) ?? profile.email : profile.email,
      })),
      departments: departmentsResult.data ?? [],
      roles: rolesResult.data ?? [],
      memberships: membershipsResult.data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được dữ liệu nhân sự." },
      { status: 500 },
    );
  }
}
