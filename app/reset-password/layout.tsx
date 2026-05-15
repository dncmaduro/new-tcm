import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Đặt lại mật khẩu",
  description: "Thiết lập mật khẩu mới cho tài khoản TCM sau khi xác minh yêu cầu khôi phục.",
  path: "/reset-password",
  keywords: ["đặt lại mật khẩu", "khôi phục tài khoản", "bảo mật TCM"],
});

export default function ResetPasswordLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
