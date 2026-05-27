import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata, createMetadataSupabaseClient, joinTitleSegments } from "@/lib/seo";

type RealtimeProfileLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{
    profileId: string;
  }>;
}>;

export async function generateMetadata({
  params,
}: RealtimeProfileLayoutProps): Promise<Metadata> {
  const { profileId } = await params;
  const supabase = createMetadataSupabaseClient();
  let profileName: string | null = null;

  if (supabase) {
    const { data } = await supabase
      .from("profiles")
      .select("name,email")
      .eq("id", profileId)
      .maybeSingle();
    profileName = data?.name ? String(data.name) : data?.email ? String(data.email) : null;
  }

  return buildPageMetadata({
    title:
      joinTitleSegments(profileName, "Báo cáo realtime cá nhân") || "Báo cáo realtime cá nhân",
    description:
      "Xem chỉ số realtime, task và tiến độ key result của từng thành viên trong hệ thống TCM.",
    path: `/reports/realtime/${profileId}`,
    keywords: ["báo cáo realtime cá nhân", "tiến độ thành viên", "hiệu suất cá nhân"],
  });
}

export default function RealtimeProfileLayout({
  children,
}: RealtimeProfileLayoutProps) {
  return children;
}
