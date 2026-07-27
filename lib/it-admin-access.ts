import "server-only";

import { createServerSupabaseAuthClient } from "@/lib/supabase-server";

export type ITAdminAccess = {
  configured: boolean;
  allowed: boolean;
};

export type ITAdminAuthorization = ITAdminAccess & {
  userId: string | null;
  email: string | null;
};

const normalizeEmail = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

export function getITAdminAccess(email: string | null | undefined): ITAdminAccess {
  const adminEmail = normalizeEmail(process.env.IT_EMAIL);

  if (!adminEmail) {
    return { configured: false, allowed: false };
  }

  return {
    configured: true,
    allowed: normalizeEmail(email) === adminEmail,
  };
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authorization.slice(7).trim();
  return token || null;
}

export async function authorizeITAdmin(request: Request): Promise<ITAdminAuthorization> {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return { configured: Boolean(normalizeEmail(process.env.IT_EMAIL)), allowed: false, userId: null, email: null };
  }

  const authClient = createServerSupabaseAuthClient();
  const { data, error } = await authClient.auth.getUser(accessToken);
  const email = error ? null : data.user?.email ?? null;
  const access = getITAdminAccess(email);

  return {
    ...access,
    userId: error ? null : data.user?.id ?? null,
    email,
  };
}
