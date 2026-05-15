import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

type ReportDetailLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{
    reportId: string;
  }>;
}>;

export async function generateMetadata({
  params,
}: ReportDetailLayoutProps): Promise<Metadata> {
  const { reportId } = await params;

  return buildPageMetadata({
    title: "Chi tiết báo cáo hiệu suất",
    description:
      "Xem nội dung, chỉ số, trạng thái duyệt và phản hồi của báo cáo hiệu suất.",
    path: `/reports/${reportId}`,
    keywords: ["chi tiết báo cáo", "report detail", "đánh giá hiệu suất"],
  });
}

export default function ReportDetailLayout({ children }: ReportDetailLayoutProps) {
  return children;
}
