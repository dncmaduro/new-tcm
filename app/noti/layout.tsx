import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Thông báo",
  description: "Theo dõi toàn bộ thông báo công việc, chấm công và báo cáo trong hệ thống TCM.",
  path: "/notifications",
  keywords: ["thông báo", "notifications", "trung tâm thông báo TCM"],
});

export default function NotificationsLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
