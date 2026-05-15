import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

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

  return buildPageMetadata({
    title: "Chi tiết mục tiêu",
    description:
      "Theo dõi thông tin mục tiêu, tiến độ, phòng ban tham gia, key result và task liên quan.",
    path: `/goals/${goalId}`,
    keywords: ["chi tiết mục tiêu", "goal detail", "theo dõi tiến độ"],
  });
}

export default function GoalDetailLayout({ children }: GoalDetailLayoutProps) {
  return children;
}
