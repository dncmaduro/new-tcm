import type { Metadata } from "next";
import PageContent from "./page-content";

export const dynamic = "force-dynamic";

type TimeRequestPageProps = {
  params: Promise<{ requestId: string }>;
};

export async function generateMetadata({
  params,
}: TimeRequestPageProps): Promise<Metadata> {
  await params;

  return {
    title: { absolute: "Yêu cầu thời gian" },
    description: null,
    openGraph: {
      title: "Yêu cầu thời gian",
    },
    twitter: {
      title: "Yêu cầu thời gian",
    },
  };
}

export default function SharedTimeRequestEntryPage() {
  return <PageContent />;
}
