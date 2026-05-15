import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Phòng ban",
  description:
    "Xem sơ đồ tổ chức, cấu trúc phòng ban, thành viên và vai trò trong hệ thống TCM.",
  path: "/departments",
  keywords: ["phòng ban", "sơ đồ tổ chức", "cơ cấu nhân sự"],
});

export default function DepartmentsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
