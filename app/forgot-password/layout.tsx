import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Quên mật khẩu",
  description: "Gửi yêu cầu khôi phục mật khẩu để lấy lại quyền truy cập vào hệ thống TCM.",
  path: "/forgot-password",
  keywords: ["quên mật khẩu", "khôi phục mật khẩu", "đăng nhập TCM"],
});

export default function ForgotPasswordLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
