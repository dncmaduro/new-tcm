import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Backlog",
  description: "Quản lý các task chưa được giao và chưa có deadline.",
  path: "/backlog",
  keywords: ["backlog", "task", "phân công"],
});

export default function BacklogLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}

