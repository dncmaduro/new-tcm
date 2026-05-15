import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Quản lý yêu cầu thời gian",
  description:
    "Duyệt và theo dõi yêu cầu thời gian trong phạm vi quản lý, theo loại và trạng thái xử lý.",
  path: "/time-request-management",
  keywords: ["quản lý yêu cầu thời gian", "duyệt nghỉ phép", "quản lý chấm công"],
});

export default function TimeRequestManagementLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
