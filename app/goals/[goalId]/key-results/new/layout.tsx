import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata, createMetadataSupabaseClient, joinTitleSegments } from "@/lib/seo";

type NewKeyResultLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{
    goalId: string;
  }>;
}>;

export async function generateMetadata({
  params,
}: NewKeyResultLayoutProps): Promise<Metadata> {
  const { goalId } = await params;
  const supabase = createMetadataSupabaseClient();
  let goalName: string | null = null;

  if (supabase) {
    const { data } = await supabase.from("goals").select("name").eq("id", goalId).maybeSingle();
    goalName = data?.name ? String(data.name) : null;
  }

  return buildPageMetadata({
    title: joinTitleSegments("Tạo key result", goalName) || "Tạo key result",
    description:
      "Tạo key result mới cho mục tiêu, khai báo chỉ số, đơn vị đo và trách nhiệm thực thi.",
    path: `/goals/${goalId}/key-results/new`,
    keywords: ["tạo key result", "kr mới", "quản lý okr"],
  });
}

export default function NewKeyResultLayout({ children }: NewKeyResultLayoutProps) {
  return children;
}
