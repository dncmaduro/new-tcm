import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Hồ sơ cá nhân",
  description:
    "Cập nhật thông tin cá nhân, ảnh đại diện và dữ liệu tài khoản trên hệ thống TCM.",
  path: "/profile",
  keywords: ["hồ sơ cá nhân", "profile", "tài khoản TCM"],
});

export default function ProfileLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
