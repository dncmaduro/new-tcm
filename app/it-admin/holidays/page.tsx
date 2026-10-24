import type { Metadata } from "next";
import PageContent from "./page-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quản lý ngày nghỉ",
  description: "Quản lý lịch ngày nghỉ dùng chung cho chấm công và báo cáo.",
};

export default function Page() {
  return <PageContent />;
}
