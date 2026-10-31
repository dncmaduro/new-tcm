import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Gửi bảng lương",
  description: "Tính và gửi bảng lương theo tháng cho nhân sự trong phạm vi được phân quyền.",
  path: "/payroll",
  keywords: ["bảng lương", "tính lương", "gửi bảng lương"],
});

export default function PayrollLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
