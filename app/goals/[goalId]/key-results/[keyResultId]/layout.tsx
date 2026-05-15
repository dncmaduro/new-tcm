import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

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

  return buildPageMetadata({
    title: "Chi tiết key result",
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
