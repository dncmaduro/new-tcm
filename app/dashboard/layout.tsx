import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Bảng điều khiển",
  description: "Theo dõi nhanh công việc, mục tiêu, chấm công, deadline và hoạt động gần đây trên TCM.",
  path: "/dashboard",
  keywords: ["bảng điều khiển", "dashboard", "tổng quan nội bộ"],
});

export default function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
