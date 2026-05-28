import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import PageContent from "./page-content";

export const dynamic = "force-dynamic";

type TimeRequestPageProps = {
  params: Promise<{ requestId: string }>;
};

export async function generateMetadata({
  params,
}: TimeRequestPageProps): Promise<Metadata> {
  const { requestId } = await params;

  return buildPageMetadata({
    title: "Chi tiết yêu cầu thời gian",
    description:
      "Mở nhanh yêu cầu thời gian và điều hướng đến đúng màn hình xử lý theo quyền của người dùng.",
    path: `/time-requests/${requestId}`,
    keywords: ["yêu cầu thời gian", "time request", "điều hướng yêu cầu"],
  });
}

export default function SharedTimeRequestEntryPage() {
  return <PageContent />;
}
