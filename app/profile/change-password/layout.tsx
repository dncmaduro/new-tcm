import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Đổi mật khẩu",
  description: "Thay đổi mật khẩu tài khoản TCM để tăng cường bảo mật truy cập hệ thống.",
  path: "/profile/change-password",
  keywords: ["đổi mật khẩu", "bảo mật tài khoản", "tài khoản TCM"],
});

export default function ChangePasswordLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
