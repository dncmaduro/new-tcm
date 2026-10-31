import "server-only";

import { isAttendanceExportAdminEmail } from "@/lib/attendance-export-access";
import {
  createServerSupabaseAuthClient,
  createServerSupabaseServiceRoleClient,
} from "@/lib/supabase-server";

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authorization.slice(7).trim();
  return token || null;
}

export function parsePayrollMonth(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearToken, monthToken] = value.split("-");
  const year = Number(yearToken);
  const month = Number(monthToken);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return {
    date: new Date(year, month - 1, 1),
    token: `${yearToken}-${monthToken}`,
    databaseToken: `${yearToken}-${monthToken}-01`,
  };
}

export async function authorizePayrollRequest(request: Request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    throw new Error("Thiếu access token.");
  }

  const authClient = createServerSupabaseAuthClient();
  const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !authData.user?.email) {
    throw new Error("Phiên đăng nhập không hợp lệ.");
  }

  const access = isAttendanceExportAdminEmail(authData.user.email);
  if (!access.configured) {
    throw new Error("Chưa cấu hình `ADMIN_EMAILS` trên server.");
  }
  if (!access.allowed) {
    throw new Error("Bạn không có quyền gửi bảng lương.");
  }

  return {
    user: authData.user,
    serviceRoleClient: createServerSupabaseServiceRoleClient(),
  };
}

export function getPayrollErrorStatus(message: string) {
  if (message.includes("access token") || message.includes("Phiên đăng nhập")) {
    return 401;
  }
  if (message.includes("không có quyền")) {
    return 403;
  }
  if (message.includes("ADMIN_EMAILS")) {
    return 500;
  }
  return 500;
}
