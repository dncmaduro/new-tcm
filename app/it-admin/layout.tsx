import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Quản trị IT",
  description: "Tạo tài khoản và quản lý phòng ban nhân sự.",
  path: "/it-admin",
});

export default function ITAdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
