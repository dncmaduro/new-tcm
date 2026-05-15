import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Công việc",
  description:
    "Quản lý task theo danh sách hoặc timeline, lọc theo mục tiêu, key result và người phụ trách.",
  path: "/tasks",
  keywords: ["công việc", "task", "timeline", "gantt"],
});

export default function TasksLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
