import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Quản lý chấm công",
  description:
    "Theo dõi dữ liệu chấm công nhân sự trong phạm vi được phân quyền quản lý trên hệ thống TCM.",
  path: "/attendance-management",
  keywords: ["quản lý chấm công", "attendance management", "theo dõi nhân sự"],
});

export default function AttendanceManagementLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
