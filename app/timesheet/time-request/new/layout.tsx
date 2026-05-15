import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Tạo yêu cầu thời gian",
  description:
    "Tạo yêu cầu điều chỉnh chấm công, nghỉ phép hoặc thời gian làm việc trên hệ thống TCM.",
  path: "/timesheet/time-request/new",
  keywords: ["tạo yêu cầu thời gian", "điều chỉnh chấm công", "xin nghỉ"],
});

export default function NewTimeRequestLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
