import { NextResponse } from "next/server";

import { authorizeITAdmin } from "@/lib/it-admin-access";
import { createServerSupabaseServiceRoleClient } from "@/lib/supabase-server";

type HolidayPayload = {
  id?: unknown;
  date?: unknown;
  name?: unknown;
  note?: unknown;
};

const normalizeString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function authorize(request: Request) {
  const access = await authorizeITAdmin(request);
  if (!access.configured) {
    return NextResponse.json({ error: "Chưa cấu hình `IT_EMAIL` trên server." }, { status: 500 });
  }
  if (!access.allowed) {
    return NextResponse.json({ error: "Bạn không có quyền quản lý ngày nghỉ." }, { status: 403 });
  }

  return null;
}

async function parseHolidayPayload(request: Request) {
  let payload: HolidayPayload;

  try {
    payload = (await request.json()) as HolidayPayload;
  } catch {
    throw new Error("Body JSON không hợp lệ.");
  }

  const date = normalizeString(payload.date);
  const name = normalizeString(payload.name);
  const note = normalizeString(payload.note) || null;

  if (!isValidDate(date)) {
    throw new Error("Ngày nghỉ không hợp lệ.");
  }
  if (!name) {
    throw new Error("Tên ngày nghỉ là bắt buộc.");
  }
  if (name.length > 160) {
    throw new Error("Tên ngày nghỉ không được vượt quá 160 ký tự.");
  }
  if (note && note.length > 500) {
    throw new Error("Ghi chú ngày nghỉ không được vượt quá 500 ký tự.");
  }

  return { date, name, note };
}

export async function GET(request: Request) {
  const authorizationResponse = await authorize(request);
  if (authorizationResponse) {
    return authorizationResponse;
  }

  try {
    const supabase = createServerSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("holidays")
      .select("id,date,name,note,created_at,updated_at")
      .order("date", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ holidays: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được danh sách ngày nghỉ." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const authorizationResponse = await authorize(request);
  if (authorizationResponse) {
    return authorizationResponse;
  }

  try {
    const { date, name, note } = await parseHolidayPayload(request);
    const supabase = createServerSupabaseServiceRoleClient();
    const { data: existing, error: existingError } = await supabase
      .from("holidays")
      .select("id")
      .eq("date", date)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }
    if (existing) {
      return NextResponse.json({ error: "Ngày nghỉ này đã tồn tại." }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("holidays")
      .insert({ date, name, note })
      .select("id,date,name,note,created_at,updated_at")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ holiday: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể tạo ngày nghỉ." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const authorizationResponse = await authorize(request);
  if (authorizationResponse) {
    return authorizationResponse;
  }

  try {
    const payload = (await request.clone().json()) as HolidayPayload;
    const id = normalizeString(payload.id);
    if (!id) {
      return NextResponse.json({ error: "Thiếu mã ngày nghỉ." }, { status: 400 });
    }

    const { date, name, note } = await parseHolidayPayload(request);
    const supabase = createServerSupabaseServiceRoleClient();
    const { data: existing, error: existingError } = await supabase
      .from("holidays")
      .select("id")
      .eq("date", date)
      .neq("id", id)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }
    if (existing) {
      return NextResponse.json({ error: "Ngày nghỉ này đã tồn tại." }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("holidays")
      .update({ date, name, note })
      .eq("id", id)
      .select("id,date,name,note,created_at,updated_at")
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      return NextResponse.json({ error: "Không tìm thấy ngày nghỉ cần cập nhật." }, { status: 404 });
    }

    return NextResponse.json({ holiday: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể cập nhật ngày nghỉ." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const authorizationResponse = await authorize(request);
  if (authorizationResponse) {
    return authorizationResponse;
  }

  const id = normalizeString(new URL(request.url).searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "Thiếu mã ngày nghỉ." }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("holidays")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      return NextResponse.json({ error: "Không tìm thấy ngày nghỉ cần xóa." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể xóa ngày nghỉ." },
      { status: 400 },
    );
  }
}
