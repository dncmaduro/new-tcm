import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

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

  return buildPageMetadata({
    title: "Chỉnh sửa key result",
    description:
      "Điều chỉnh thông tin, chỉ số và cấu hình thực thi của key result trên hệ thống TCM.",
    path: `/goals/${goalId}/key-results/${keyResultId}/edit`,
    keywords: ["chỉnh sửa key result", "cập nhật kr", "okr"],
  });
}

export default function EditKeyResultLayout({ children }: EditKeyResultLayoutProps) {
  return children;
}
