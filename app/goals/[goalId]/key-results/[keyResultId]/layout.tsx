import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata, createMetadataSupabaseClient, joinTitleSegments } from "@/lib/seo";

type KeyResultDetailLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{
    goalId: string;
    keyResultId: string;
  }>;
}>;

export async function generateMetadata({
  params,
}: KeyResultDetailLayoutProps): Promise<Metadata> {
  const { goalId, keyResultId } = await params;
  const supabase = createMetadataSupabaseClient();
  let keyResultName: string | null = null;

  if (supabase) {
    const { data } = await supabase
      .from("key_results")
      .select("name")
      .eq("id", keyResultId)
      .eq("goal_id", goalId)
      .maybeSingle();
    keyResultName = data?.name ? String(data.name) : null;
  }

  return buildPageMetadata({
    title: joinTitleSegments(keyResultName, "Chi tiết key result") || "Chi tiết key result",
    description:
      "Theo dõi tiến độ key result, công thức đo lường, task liên kết và lịch sử cập nhật.",
    path: `/goals/${goalId}/key-results/${keyResultId}`,
    keywords: ["chi tiết key result", "kr detail", "theo dõi key result"],
  });
}

export default function KeyResultDetailLayout({
  children,
}: KeyResultDetailLayoutProps) {
  return children;
}
