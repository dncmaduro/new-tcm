import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Yêu cầu thời gian",
  description:
    "Xem và theo dõi các yêu cầu điều chỉnh thời gian làm việc hoặc nghỉ phép của cá nhân.",
  path: "/timesheet/requests",
  keywords: ["yêu cầu thời gian", "điều chỉnh công", "nghỉ phép"],
});

export default function TimesheetRequestsLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
