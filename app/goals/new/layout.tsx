import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Tạo mục tiêu",
  description:
    "Khởi tạo goal mới, cấu hình phạm vi thời gian, phòng ban tham gia và thông tin thực thi trên TCM.",
  path: "/goals/new",
  keywords: ["tạo mục tiêu", "goal mới", "quản lý mục tiêu"],
});

export default function NewGoalLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
