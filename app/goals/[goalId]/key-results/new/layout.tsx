import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

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

  return buildPageMetadata({
    title: "Tạo key result",
    description:
      "Tạo key result mới cho mục tiêu, khai báo chỉ số, đơn vị đo và trách nhiệm thực thi.",
    path: `/goals/${goalId}/key-results/new`,
    keywords: ["tạo key result", "kr mới", "quản lý okr"],
  });
}

export default function NewKeyResultLayout({ children }: NewKeyResultLayoutProps) {
  return children;
}
