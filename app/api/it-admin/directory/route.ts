import { NextResponse } from "next/server";

import { authorizeITAdmin } from "@/lib/it-admin-access";
import { createServerSupabaseServiceRoleClient } from "@/lib/supabase-server";

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
    const [profilesResult, departmentsResult, rolesResult, membershipsResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,user_id,name,email,is_active,is_timekeeping_enabled")
        .order("name", { ascending: true }),
      supabase.from("departments").select("id,name").order("name", { ascending: true }),
      supabase.from("roles").select("id,name").order("name", { ascending: true }),
      supabase.from("user_role_in_department").select("profile_id,department_id,role_id"),
    ]);

    const error = profilesResult.error || departmentsResult.error || rolesResult.error || membershipsResult.error;
    if (error) {
      throw error;
    }

    return NextResponse.json({
      profiles: profilesResult.data ?? [],
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
