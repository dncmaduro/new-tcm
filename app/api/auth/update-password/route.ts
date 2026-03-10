import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type UpdatePasswordPayload = {
  password?: string;
  accessToken?: string;
  refreshToken?: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function createServerSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Thiếu biến môi trường Supabase: NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(request: Request) {
  let payload: UpdatePasswordPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON không hợp lệ." }, { status: 400 });
  }

  const password = payload.password;
  const accessToken = payload.accessToken;
  const refreshToken = payload.refreshToken;

  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "Mật khẩu phải có ít nhất 8 ký tự." },
      { status: 400 },
    );
  }

  if (!accessToken || !refreshToken) {
    return NextResponse.json(
      { error: "Thiếu token khôi phục." },
      { status: 400 },
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 401 });
    }

    const { data, error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        user: data.user,
        message: "Đã cập nhật mật khẩu.",
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lỗi máy chủ nội bộ";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
