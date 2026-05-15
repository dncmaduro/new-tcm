import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Hiệu suất phòng ban",
  description:
    "Đánh giá tiến độ, rủi ro, đóng góp và hiệu suất thực thi của từng phòng ban trên TCM.",
  path: "/department-performance",
  keywords: ["hiệu suất phòng ban", "department performance", "đánh giá phòng ban"],
});

export default function DepartmentPerformanceLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
