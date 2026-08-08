import { NextResponse } from "next/server";

import { authorizeITAdmin } from "@/lib/it-admin-access";
import { createServerSupabaseServiceRoleClient } from "@/lib/supabase-server";

type CreateUserPayload = {
  name?: string;
  email?: string;
  password?: string;
  departmentId?: string | null;
  roleId?: string | null;
};

type UpdateUserPayload = {
  profileId?: string;
  name?: string;
  isActive?: boolean;
  isTimekeepingEnabled?: boolean;
  isParttime?: boolean;
};

const normalizeString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function POST(request: Request) {
  const access = await authorizeITAdmin(request);
  if (!access.configured) {
    return NextResponse.json({ error: "Chưa cấu hình `IT_EMAIL` trên server." }, { status: 500 });
  }
  if (!access.allowed) {
    return NextResponse.json({ error: "Bạn không có quyền tạo tài khoản." }, { status: 403 });
  }

  let payload: CreateUserPayload;
  let createdUserId: string | null = null;

  try {
    payload = (await request.json()) as CreateUserPayload;
  } catch {
    return NextResponse.json({ error: "Body JSON không hợp lệ." }, { status: 400 });
  }

  const name = normalizeString(payload.name);
  const email = normalizeString(payload.email).toLowerCase();
  const password = typeof payload.password === "string" ? payload.password : "";
  const departmentId = normalizeString(payload.departmentId) || null;
  const roleId = normalizeString(payload.roleId) || null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email không hợp lệ." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Mật khẩu cần có ít nhất 8 ký tự." }, { status: 400 });
  }
  if (Boolean(departmentId) !== Boolean(roleId)) {
    return NextResponse.json({ error: "Hãy chọn cả phòng ban và vai trò, hoặc bỏ trống cả hai." }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseServiceRoleClient();
    if (departmentId && roleId) {
      const [departmentResult, roleResult] = await Promise.all([
        supabase.from("departments").select("id").eq("id", departmentId).maybeSingle(),
        supabase.from("roles").select("id").eq("id", roleId).maybeSingle(),
      ]);
      if (departmentResult.error || !departmentResult.data || roleResult.error || !roleResult.data) {
        return NextResponse.json({ error: "Phòng ban hoặc vai trò không còn hợp lệ." }, { status: 400 });
      }
    }

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: name ? { name } : undefined,
    });
    if (createError || !created.user) {
      return NextResponse.json(
        { error: createError?.message || "Không thể tạo tài khoản." },
        { status: 400 },
      );
    }
    createdUserId = created.user.id;

    const displayName = name || email.split("@")[0] || email;
    const { data: existingProfile, error: existingProfileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", created.user.id)
      .maybeSingle();
    if (existingProfileError) {
      throw existingProfileError;
    }

    let profileId = existingProfile?.id ? String(existingProfile.id) : null;
    if (profileId) {
      const { error } = await supabase
        .from("profiles")
        .update({ name: displayName, email })
        .eq("id", profileId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("profiles")
        .insert({ user_id: created.user.id, name: displayName, email })
        .select("id")
        .single();
      if (error) throw error;
      profileId = String(data.id);
    }

    if (profileId && departmentId && roleId) {
      const { error: removeMembershipError } = await supabase
        .from("user_role_in_department")
        .delete()
        .eq("profile_id", profileId)
        .eq("department_id", departmentId);
      if (removeMembershipError) throw removeMembershipError;

      const { error: membershipError } = await supabase
        .from("user_role_in_department")
        .insert({ profile_id: profileId, department_id: departmentId, role_id: roleId });
      if (membershipError) throw membershipError;
    }

    return NextResponse.json({ id: profileId, email, emailConfirmed: true }, { status: 201 });
  } catch (error) {
    // Keep account creation all-or-nothing when the corresponding profile or assignment cannot be saved.
    if (createdUserId) {
      try {
        const supabase = createServerSupabaseServiceRoleClient();
        await supabase.auth.admin.deleteUser(createdUserId);
      } catch {
        // The original failure is more useful to the administrator than a cleanup failure.
      }
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Không thể hoàn tất việc tạo tài khoản.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const access = await authorizeITAdmin(request);
  if (!access.configured) {
    return NextResponse.json({ error: "Chưa cấu hình `IT_EMAIL` trên server." }, { status: 500 });
  }
  if (!access.allowed) {
    return NextResponse.json({ error: "Bạn không có quyền cập nhật nhân sự." }, { status: 403 });
  }

  let payload: UpdateUserPayload;
  try {
    payload = (await request.json()) as UpdateUserPayload;
  } catch {
    return NextResponse.json({ error: "Body JSON không hợp lệ." }, { status: 400 });
  }

  const profileId = normalizeString(payload.profileId);
  if (!profileId) {
    return NextResponse.json({ error: "Nhân sự là bắt buộc." }, { status: 400 });
  }

  const update: Record<string, string | boolean | null> = {};
  if (typeof payload.name === "string") {
    const name = normalizeString(payload.name);
    if (!name) {
      return NextResponse.json({ error: "Họ và tên không được để trống." }, { status: 400 });
    }
    update.name = name;
  }
  const shouldUnlinkAttendance =
    payload.isActive === false || payload.isTimekeepingEnabled === false;

  if (typeof payload.isActive === "boolean") {
    update.is_active = payload.isActive;
  }
  if (typeof payload.isTimekeepingEnabled === "boolean") {
    update.is_timekeeping_enabled = payload.isTimekeepingEnabled;
  }
  if (shouldUnlinkAttendance) {
    update.attendance_id = null;
  }
  if (typeof payload.isParttime === "boolean") {
    update.is_parttime = payload.isParttime;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Không có thay đổi nào để lưu." }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseServiceRoleClient();

    if (shouldUnlinkAttendance) {
      const { error: unlinkAttendanceError } = await supabase
        .from("times_profiles")
        .update({ profile_id: null })
        .eq("profile_id", profileId);
      if (unlinkAttendanceError) {
        throw unlinkAttendanceError;
      }
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(update)
      .eq("id", profileId)
      .select("id,user_id,name,email,attendance_id,is_active,is_timekeeping_enabled,is_parttime")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Không tìm thấy nhân sự." }, { status: 404 });
    }

    return NextResponse.json({ profile: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể cập nhật nhân sự." },
      { status: 500 },
    );
  }
}
