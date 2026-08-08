import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Task",
  description:
    "Quản lý task theo danh sách hoặc timeline, lọc theo goal, key result và người phụ trách.",
  path: "/tasks",
  keywords: ["task", "task", "timeline", "gantt"],
});

export default function TasksLayout() {
  redirect("/timesheet");
}
