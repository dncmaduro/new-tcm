import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ForgotPasswordPayload = {
  email?: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;

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
  let payload: ForgotPasswordPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON không hợp lệ." }, { status: 400 });
  }

  const email = payload.email?.trim();

  if (!email) {
    return NextResponse.json({ error: "Email là bắt buộc." }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const origin = new URL(request.url).origin;
    const redirectTo = new URL("/reset-password", appUrl ?? origin).toString();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        message: "Đã gửi email đặt lại mật khẩu.",
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lỗi máy chủ nội bộ";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
