import PageContent from "./page-content";
import { redirect } from "next/navigation";
import { OKR_FEATURE_ENABLED } from "@/lib/features";

export const dynamic = "force-dynamic";

export default function Page() {
  if (!OKR_FEATURE_ENABLED) redirect("/tasks");
  return <PageContent />;
}
