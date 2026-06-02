import { NextResponse } from "next/server";

import { isAttendanceExportAdminEmail } from "@/lib/attendance-export-access";
import { createServerSupabaseAuthClient } from "@/lib/supabase-server";

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authorization.slice(7).trim();
  return token || null;
}

export async function GET(request: Request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return NextResponse.json({ configured: true, allowed: false }, { status: 200 });
  }

  const authClient = createServerSupabaseAuthClient();
  const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);

  if (authError || !authData.user?.email) {
    return NextResponse.json({ configured: true, allowed: false }, { status: 200 });
  }

  const access = isAttendanceExportAdminEmail(authData.user.email);
  return NextResponse.json(access, { status: 200 });
}
