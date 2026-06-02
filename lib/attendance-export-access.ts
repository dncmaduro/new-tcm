import "server-only";

function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function parseAttendanceExportAdminEmails(value: string | undefined) {
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
          .map((item) => normalizeEmail(item))
          .filter(Boolean);
      }
    } catch {
      return [] as string[];
    }
  }

  return normalized
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
}

export function isAttendanceExportAdminEmail(email: string | null | undefined) {
  const adminEmails = parseAttendanceExportAdminEmails(process.env.ADMIN_EMAILS);
  if (adminEmails.length <= 0) {
    return {
      configured: false,
      allowed: false,
    };
  }

  return {
    configured: true,
    allowed: adminEmails.includes(normalizeEmail(email)),
  };
}
