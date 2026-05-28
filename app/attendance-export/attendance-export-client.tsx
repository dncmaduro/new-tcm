"use client";

import { useEffect, useState } from "react";

import { ManagedAttendancePageContent, type ViewableProfile } from "@/app/attendance-management/page";
import type { AttendanceExportProfile } from "@/lib/attendance-export-workbook";
import { supabase } from "@/lib/supabase";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

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

function ExportAccessState({ message }: { message: string }) {
  return (
    <div className="h-screen overflow-hidden bg-[#f3f5fa] text-slate-900">
      <div className="flex h-full w-full">
        <WorkspaceSidebar active="attendanceManagement" />
        <div className="flex h-full min-h-0 w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader title="Xuất chấm công" items={[{ label: "Xuất chấm công" }]} />
          <main className="min-h-0 flex-1 overflow-hidden px-4 py-5 lg:px-7">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
              {message}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default function AttendanceExportClient({ adminEmails }: { adminEmails: string[] }) {
  const [status, setStatus] = useState<"loading" | "allowed" | "denied" | "misconfigured">(
    adminEmails.length > 0 ? "loading" : "misconfigured",
  );

  useEffect(() => {
    if (adminEmails.length <= 0) {
      return;
    }

    let isActive = true;

    const checkAccess = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!isActive) {
        return;
      }

      if (error || !data.user?.email) {
        setStatus("denied");
        return;
      }

      const normalizedEmail = normalizeText(data.user.email);
      setStatus(
        adminEmails.some((item) => normalizeText(item) === normalizedEmail) ? "allowed" : "denied",
      );
    };

    void checkAccess();

    return () => {
      isActive = false;
    };
  }, [adminEmails]);

  if (status === "misconfigured") {
    return <ExportAccessState message="Chưa cấu hình `ADMIN_EMAILS` trong môi trường." />;
  }

  if (status === "loading") {
    return <ExportAccessState message="Đang kiểm tra quyền truy cập trang xuất chấm công..." />;
  }

  if (status === "denied") {
    return <ExportAccessState message="Bạn không có quyền truy cập trang xuất chấm công." />;
  }

  return (
    <ManagedAttendancePageContent
      pageTitle="Xuất chấm công"
      breadcrumbLabel="Xuất chấm công"
      showExportButton
      exportButtonLabel="Xuất Excel"
      showExportAllButton
      exportAllButtonLabel="Xuất tất cả nhân viên"
      forceAdminAccess
      onTimesheetExportRequest={exportAttendanceWorkbook}
      onExportAllProfiles={exportAllAttendanceWorkbook}
    />
  );
}
