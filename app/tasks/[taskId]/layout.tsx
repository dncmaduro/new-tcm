import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

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

  return buildPageMetadata({
    title: "Chi tiết công việc",
    description:
      "Xem tiến độ, bằng chứng, bình luận, timeline và trạng thái thực thi của task.",
    path: `/tasks/${taskId}`,
    keywords: ["chi tiết công việc", "task detail", "theo dõi task"],
  });
}

export default function TaskDetailLayout({ children }: TaskDetailLayoutProps) {
  return children;
}
