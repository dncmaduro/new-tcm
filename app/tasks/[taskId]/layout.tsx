import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata, createMetadataSupabaseClient, joinTitleSegments } from "@/lib/seo";

type TaskDetailLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{
    taskId: string;
  }>;
}>;

export async function generateMetadata({
  params,
}: TaskDetailLayoutProps): Promise<Metadata> {
  const { taskId } = await params;
  const supabase = createMetadataSupabaseClient();
  let taskName: string | null = null;

  if (supabase) {
    const { data } = await supabase.from("tasks").select("name").eq("id", taskId).maybeSingle();
    taskName = data?.name ? String(data.name) : null;
  }

  return buildPageMetadata({
    title: joinTitleSegments(taskName, "Chi tiết task") || "Chi tiết task",
    description:
      "Xem tiến độ, bằng chứng, bình luận, timeline và trạng thái thực thi của task.",
    path: `/tasks/${taskId}`,
    keywords: ["chi tiết task", "task detail", "theo dõi task"],
  });
}

export default function TaskDetailLayout({ children }: TaskDetailLayoutProps) {
  return children;
}
