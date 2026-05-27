import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata, createMetadataSupabaseClient, joinTitleSegments } from "@/lib/seo";

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
  const supabase = createMetadataSupabaseClient();
  let reportOwnerName: string | null = null;

  if (supabase) {
    const { data: reportData } = await supabase
      .from("performance_reports")
      .select("profile_id")
      .eq("id", reportId)
      .maybeSingle();

    const profileId = reportData?.profile_id ? String(reportData.profile_id) : null;
    if (profileId) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("name,email")
        .eq("id", profileId)
        .maybeSingle();

      reportOwnerName = profileData?.name
        ? String(profileData.name)
        : profileData?.email
          ? String(profileData.email)
          : null;
    }
  }

  return buildPageMetadata({
    title:
      joinTitleSegments(reportOwnerName, "Chi tiết báo cáo hiệu suất") ||
      "Chi tiết báo cáo hiệu suất",
    description:
      "Xem nội dung, chỉ số, trạng thái duyệt và phản hồi của báo cáo hiệu suất.",
    path: `/reports/${reportId}`,
    keywords: ["chi tiết báo cáo", "report detail", "đánh giá hiệu suất"],
  });
}

export default function ReportDetailLayout({ children }: ReportDetailLayoutProps) {
  return children;
}
