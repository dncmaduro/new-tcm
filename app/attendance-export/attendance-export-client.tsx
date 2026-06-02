"use client";

import {
  ManagedAttendancePageContent,
  type ViewableProfile,
} from "@/app/attendance-management/page-content";
import type { AttendanceExportProfile } from "@/lib/attendance-export-workbook";
import { supabase } from "@/lib/supabase";

function buildMonthToken(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function buildDownloadFileName(value: Date) {
  return `Chấm công tháng ${String(value.getMonth() + 1).padStart(2, "0")}-${value.getFullYear()}.xlsx`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

async function requestAttendanceExport(params: {
  profiles: AttendanceExportProfile[];
  selectedMonth: Date;
  fileName: string;
}) {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (error || !accessToken) {
    throw new Error("Không xác thực được phiên đăng nhập để xuất chấm công.");
  }

  const response = await fetch("/api/attendance-export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      selectedMonth: buildMonthToken(params.selectedMonth),
      profiles: params.profiles,
      fileName: params.fileName,
    }),
  });

  if (!response.ok) {
    let message = "Không thể xuất file chấm công.";

    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Ignore JSON parse errors and keep the default message.
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  downloadBlob(blob, params.fileName);
}

async function exportAttendanceWorkbook(params: {
  selectedProfile: ViewableProfile;
  selectedMonth: Date;
}) {
  await requestAttendanceExport({
    profiles: [params.selectedProfile],
    selectedMonth: params.selectedMonth,
    fileName: buildDownloadFileName(params.selectedMonth),
  });
}

async function exportAllAttendanceWorkbook(params: {
  profiles: ViewableProfile[];
  selectedMonth: Date;
}) {
  await requestAttendanceExport({
    profiles: params.profiles,
    selectedMonth: params.selectedMonth,
    fileName: buildDownloadFileName(params.selectedMonth),
  });
}

export default function AttendanceExportClient() {
  return (
    <ManagedAttendancePageContent
      pageTitle="Xuất chấm công"
      breadcrumbLabel="Xuất chấm công"
      activeSidebarKey="attendanceExport"
      permissionErrorMessage="Bạn chưa có quyền xem trang xuất chấm công theo phạm vi quản lý hiện tại."
      showExportButton
      exportButtonLabel="Xuất Excel"
      showExportAllButton
      exportAllButtonLabel="Xuất tất cả nhân viên"
      onTimesheetExportRequest={exportAttendanceWorkbook}
      onExportAllProfiles={exportAllAttendanceWorkbook}
    />
  );
}
