import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Báo cáo hiệu suất",
  description:
    "Xem danh sách báo cáo hiệu suất theo kỳ, trạng thái và phạm vi người dùng trong hệ thống.",
  path: "/reports",
  keywords: ["báo cáo hiệu suất", "performance report", "đánh giá hiệu suất"],
});

export default function ReportsLayout() {
  redirect("/timesheet");
}
