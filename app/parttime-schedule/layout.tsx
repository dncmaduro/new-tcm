import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({ title: "Lịch part-time", description: "Đăng ký và quản lý lịch làm việc part-time.", path: "/parttime-schedule" });
export default function Layout({ children }: Readonly<{ children: ReactNode }>) { return children; }
