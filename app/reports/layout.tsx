import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Báo cáo hiệu suất",
  description:
    "Xem danh sách báo cáo hiệu suất theo kỳ, trạng thái và phạm vi người dùng trong hệ thống.",
  path: "/reports",
  keywords: ["báo cáo hiệu suất", "performance report", "đánh giá hiệu suất"],
});

export default function ReportsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
