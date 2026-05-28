import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Xuất chấm công",
  description:
    "Trang nội bộ để xuất dữ liệu chấm công nhân sự ra Excel theo phạm vi quản lý trên hệ thống TCM.",
  path: "/attendance-export",
  keywords: ["xuất chấm công", "attendance export", "excel chấm công"],
});

export default function AttendanceExportLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
