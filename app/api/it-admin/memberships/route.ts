import { NextResponse } from "next/server";

import { authorizeITAdmin } from "@/lib/it-admin-access";
import { createServerSupabaseServiceRoleClient } from "@/lib/supabase-server";

type MembershipPayload = { profileId?: string; departmentId?: string; roleId?: string };
const value = (input: unknown) => (typeof input === "string" ? input.trim() : "");

export async function POST(request: Request) {
  const access = await authorizeITAdmin(request);
  if (!access.configured) {
    return NextResponse.json({ error: "Chưa cấu hình `IT_EMAIL` trên server." }, { status: 500 });
  }
  if (!access.allowed) {
    return NextResponse.json({ error: "Bạn không có quyền cập nhật phòng ban." }, { status: 403 });
  }

  let payload: MembershipPayload;
  try {
    payload = (await request.json()) as MembershipPayload;
  } catch {
    return NextResponse.json({ error: "Body JSON không hợp lệ." }, { status: 400 });
  }

  const profileId = value(payload.profileId);
  const departmentId = value(payload.departmentId);
  const roleId = value(payload.roleId);
  if (!profileId || !departmentId || !roleId) {
    return NextResponse.json({ error: "Nhân sự, phòng ban và vai trò là bắt buộc." }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseServiceRoleClient();
    const [profileResult, departmentResult, roleResult] = await Promise.all([
      supabase.from("profiles").select("id").eq("id", profileId).maybeSingle(),
      supabase.from("departments").select("id").eq("id", departmentId).maybeSingle(),
      supabase.from("roles").select("id").eq("id", roleId).maybeSingle(),
    ]);
    if (
      profileResult.error || !profileResult.data ||
      departmentResult.error || !departmentResult.data ||
      roleResult.error || !roleResult.data
    ) {
      return NextResponse.json({ error: "Dữ liệu nhân sự, phòng ban hoặc vai trò không hợp lệ." }, { status: 400 });
    }

    const { error: removeError } = await supabase
      .from("user_role_in_department")
      .delete()
      .eq("profile_id", profileId)
      .eq("department_id", departmentId);
    if (removeError) throw removeError;

    const { error: insertError } = await supabase
      .from("user_role_in_department")
      .insert({ profile_id: profileId, department_id: departmentId, role_id: roleId });
    if (insertError) throw insertError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể cập nhật phòng ban." },
      { status: 500 },
    );
  }
}
