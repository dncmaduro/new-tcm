import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Quỹ phép",
  description: "Theo dõi quỹ phép còn lại, số phép đã dùng và lịch sử thay đổi phép cá nhân.",
  path: "/leave-balance",
  keywords: ["quỹ phép", "nghỉ có phép", "lịch sử phép"],
});

export default function LeaveBalanceLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
