import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Tạo báo cáo hiệu suất",
  description:
    "Khởi tạo báo cáo hiệu suất mới theo tuần, tháng hoặc kỳ làm việc phù hợp trên TCM.",
  path: "/reports/new",
  keywords: ["tạo báo cáo", "performance report", "báo cáo tuần"],
});

export default function NewReportLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
