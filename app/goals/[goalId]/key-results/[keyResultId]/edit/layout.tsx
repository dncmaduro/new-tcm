import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata, createMetadataSupabaseClient, joinTitleSegments } from "@/lib/seo";

type EditKeyResultLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{
    goalId: string;
    keyResultId: string;
  }>;
}>;

export async function generateMetadata({
  params,
}: EditKeyResultLayoutProps): Promise<Metadata> {
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
    title:
      joinTitleSegments("Chỉnh sửa key result", keyResultName) || "Chỉnh sửa key result",
    description:
      "Điều chỉnh thông tin, chỉ số và cấu hình thực thi của key result trên hệ thống TCM.",
    path: `/goals/${goalId}/key-results/${keyResultId}/edit`,
    keywords: ["chỉnh sửa key result", "cập nhật kr", "okr"],
  });
}

export default function EditKeyResultLayout({ children }: EditKeyResultLayoutProps) {
  return children;
}
