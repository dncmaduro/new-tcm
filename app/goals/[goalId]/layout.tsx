import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata, createMetadataSupabaseClient, joinTitleSegments } from "@/lib/seo";

type GoalDetailLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{
    goalId: string;
  }>;
}>;

export async function generateMetadata({
  params,
}: GoalDetailLayoutProps): Promise<Metadata> {
  const { goalId } = await params;
  const supabase = createMetadataSupabaseClient();
  let goalName: string | null = null;

  if (supabase) {
    const { data } = await supabase.from("goals").select("name").eq("id", goalId).maybeSingle();
    goalName = data?.name ? String(data.name) : null;
  }

  return buildPageMetadata({
    title: joinTitleSegments(goalName, "Chi tiết mục tiêu") || "Chi tiết mục tiêu",
    description:
      "Theo dõi thông tin mục tiêu, tiến độ, phòng ban tham gia, key result và task liên quan.",
    path: `/goals/${goalId}`,
    keywords: ["chi tiết mục tiêu", "goal detail", "theo dõi tiến độ"],
  });
}

export default function GoalDetailLayout({ children }: GoalDetailLayoutProps) {
  return children;
}
