import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Chấm công",
  description:
    "Theo dõi lịch công cá nhân, số giờ làm việc, tăng ca và các thống kê chấm công trên TCM.",
  path: "/timesheet",
  keywords: ["chấm công", "timesheet", "giờ làm việc"],
});

export default function TimesheetLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
