import { notFound, redirect } from "next/navigation";

import { createServerSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type ShortFormPageProps = {
  params: Promise<{ shortCode: string }>;
};

export default async function ShortFormPage({ params }: ShortFormPageProps) {
  const { shortCode } = await params;
  const normalizedShortCode = shortCode.trim().toLowerCase();

  if (!/^[a-f0-9]{10}$/.test(normalizedShortCode)) {
    notFound();
  }

  const supabase = createServerSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("time_requests")
    .select("id")
    .eq("short_code", normalizedShortCode)
    .maybeSingle();

  if (error || !data?.id) {
    notFound();
  }

  redirect(`/time-requests/${encodeURIComponent(String(data.id))}`);
}
