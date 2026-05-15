import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Mục tiêu",
  description: "Xem toàn bộ goal, key result và tiến độ thực thi theo phòng ban, quý và năm.",
  path: "/goals",
  keywords: ["mục tiêu", "goal", "key result", "okr"],
});

export default function GoalsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
