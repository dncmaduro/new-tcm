import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Tạo task",
  description:
    "Tạo task mới, gắn với key result, timeline, mức ưu tiên và người phụ trách phù hợp.",
  path: "/tasks/new",
  keywords: ["tạo task", "task mới", "quản lý task"],
});

export default function NewTaskLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
