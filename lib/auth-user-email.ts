import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function getAuthEmailsByUserIds(
  supabaseClient: SupabaseClient,
  userIds: Array<string | null | undefined>,
) {
  const uniqueUserIds = [...new Set(userIds.filter((userId): userId is string => Boolean(userId)))];
  const entries = await Promise.all(
    uniqueUserIds.map(async (userId) => {
      const { data, error } = await supabaseClient.auth.admin.getUserById(userId);
      if (error) {
        throw error;
      }

      return [userId, data.user?.email?.trim() || null] as const;
    }),
  );

  return new Map(entries);
}
