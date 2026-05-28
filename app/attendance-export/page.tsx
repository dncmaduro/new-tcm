import AttendanceExportClient from "@/app/attendance-export/attendance-export-client";

export const dynamic = "force-dynamic";

function parseAdminEmails(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return [] as string[];
  }

  if (normalized.startsWith("[")) {
    try {
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch {
      return [] as string[];
    }
  }

  return normalized
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function AttendanceExportPage() {
  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);

  return <AttendanceExportClient adminEmails={adminEmails} />;
}
