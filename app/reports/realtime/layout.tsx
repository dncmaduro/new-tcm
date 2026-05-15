import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Báo cáo realtime",
  description:
    "Theo dõi tiến độ thực thi và các chỉ số hiệu suất realtime theo phạm vi hiện tại.",
  path: "/reports/realtime",
  keywords: ["báo cáo realtime", "theo dõi realtime", "hiệu suất realtime"],
});

export default function RealtimeReportsLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
