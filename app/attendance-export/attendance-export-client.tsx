"use client";

import { useEffect, useState } from "react";
import {
  ManagedAttendancePageContent,
  type ViewableProfile,
} from "@/app/attendance-management/page-content";
import { AppErrorToast } from "@/components/app-error-toast";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { fetchAttendanceExportAccess } from "@/lib/attendance-export-client-access";
import type { AttendanceExportProfile } from "@/lib/attendance-export-workbook";
import { supabase } from "@/lib/supabase";

function buildMonthToken(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

type PreparedAttendanceFile = {
  profileId: string;
  name: string;
  email: string | null;
  fileName: string;
  sizeBytes?: number;
  status: "ready" | "missing_email" | "failed";
  error?: string | null;
};

type PreparedAttendanceBatch = {
  selectedMonth: string;
  preparedAt: string;
  files: PreparedAttendanceFile[];
  profiles: AttendanceExportProfile[];
};

type AttendanceSendResult = {
  profileId: string;
  name: string;
  email: string | null;
  status: "sent" | "failed";
  error?: string | null;
};

type AttendanceSendResponse = {
  sentCount: number;
  failedCount: number;
  results: AttendanceSendResult[];
};

type AttendanceExportChoice = {
  selectedProfile: ViewableProfile;
  profiles: ViewableProfile[];
  selectedMonth: Date;
};

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) {
    throw new Error("Không xác thực được phiên đăng nhập để thao tác bảng công.");
  }

  return accessToken;
}

async function requestAttendanceJson<T>(path: string, body: unknown) {
  const accessToken = await getAccessToken();
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Không thể thao tác với bảng công.");
  }

  return payload;
}

async function prepareAttendanceExport(params: {
  profiles: AttendanceExportProfile[];
  selectedMonth: Date;
}) {
  const prepared = await requestAttendanceJson<{
    selectedMonth: string;
    preparedAt: string;
    files: PreparedAttendanceFile[];
  }>("/api/attendance-export/prepare", {
    selectedMonth: buildMonthToken(params.selectedMonth),
    profiles: params.profiles,
  });

  return { ...prepared, profiles: params.profiles } satisfies PreparedAttendanceBatch;
}

async function sendPreparedAttendanceExport(batch: PreparedAttendanceBatch) {
  return requestAttendanceJson<AttendanceSendResponse>("/api/attendance-export/send", {
    selectedMonth: batch.selectedMonth,
    profiles: batch.profiles,
  });
}

function buildMonthDate(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function formatPreparedTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "vừa xong";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function AttendanceExportChoiceContent({
  choice,
  isPreparing,
  error,
  onSelect,
  onClose,
}: {
  choice: AttendanceExportChoice;
  isPreparing: boolean;
  error: string | null;
  onSelect: (profiles: ViewableProfile[], selectedMonth: Date) => void;
  onClose: () => void;
}) {
  return (
    <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
      <h2 className="text-2xl font-semibold text-slate-900">Chọn phạm vi xuất file</h2>
      <p className="mt-2 text-sm text-slate-500">
        Tháng {String(choice.selectedMonth.getMonth() + 1).padStart(2, "0")}/
        {choice.selectedMonth.getFullYear()}
      </p>

      <div className="mt-6 grid gap-3">
        <button
          type="button"
          onClick={() => onSelect([choice.selectedProfile], choice.selectedMonth)}
          disabled={isPreparing}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="block text-sm font-semibold text-slate-900">
            Gửi file chấm công cho {choice.selectedProfile.name}
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            Chỉ xuất file của nhân viên đang xem.
          </span>
        </button>
        <button
          type="button"
          onClick={() => onSelect(choice.profiles, choice.selectedMonth)}
          disabled={isPreparing}
          className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-left hover:border-blue-400 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="block text-sm font-semibold text-blue-800">
            Gửi file chấm công cho tất cả nhân viên
          </span>
          <span className="mt-1 block text-xs text-blue-700/75">
            Xuất riêng từng file cho {choice.profiles.length} nhân viên.
          </span>
        </button>
      </div>

      {error ? (
        <AppErrorToast message={error} title="Không thể tạo file chấm công" />
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={isPreparing}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Hủy
        </button>
      </div>
    </section>
  );
}

function PreparingAttendanceContent({ profileCount }: { profileCount: number }) {
  return (
    <section
      className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
      aria-live="polite"
    >
      <div className="flex items-start gap-4">
        <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <svg
            className="h-5 w-5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
            <path
              className="opacity-90"
              d="M21 12a9 9 0 0 0-9-9"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Đang tạo file chấm công</h2>
          <p className="mt-2 text-sm text-slate-500">
            Đang tạo {profileCount} file riêng cho nhân viên. Vui lòng chờ một chút.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-3" aria-hidden="true">
        <div className="h-12 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-12 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    </section>
  );
}

function PreparedAttendanceContent({
  batch,
  isSending,
  sendResults,
  error,
  onSend,
  onReprepare,
  onClose,
}: {
  batch: PreparedAttendanceBatch;
  isSending: boolean;
  sendResults: AttendanceSendResult[] | null;
  error: string | null;
  onSend: () => void;
  onReprepare: () => void;
  onClose: () => void;
}) {
  const readyCount = batch.files.filter((file) => file.status === "ready").length;
  const sentCount = sendResults?.filter((item) => item.status === "sent").length ?? 0;
  const sendButtonLabel =
    batch.profiles.length > 1
      ? `Gửi file chấm công cho tất cả nhân viên (${readyCount})`
      : `Gửi file chấm công (${readyCount})`;

  return (
      <section className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-6 py-5">
          <h2 className="text-2xl font-semibold text-slate-900">
            Tháng {batch.selectedMonth.slice(5, 7)}/{batch.selectedMonth.slice(0, 4)}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Đã tạo {batch.files.length} file lúc {formatPreparedTime(batch.preparedAt)}.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-6 py-4">
          {batch.files.map((file) => {
            const sendResult = sendResults?.find((item) => item.profileId === file.profileId);
            const status = sendResult
              ? sendResult.status === "sent"
                ? "Đã gửi"
                : sendResult.error || "Gửi thất bại"
              : file.status === "ready"
                ? `Sẵn sàng${file.email ? ` · ${file.email}` : ""}`
                : file.error || "Không thể tạo file";

            return (
              <div
                key={file.profileId}
                className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{file.name}</p>
                  <p className="truncate text-xs text-slate-500">{file.fileName}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    sendResult?.status === "sent" || (!sendResult && file.status === "ready")
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {status}
                </span>
              </div>
            );
          })}

          {error ? (
            <AppErrorToast message={error} title="Không thể gửi file chấm công" />
          ) : null}

          {sendResults ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Đã gửi thành công {sentCount}/{sendResults.length} file.
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={onReprepare}
            disabled={isSending}
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Tạo lại file
          </button>
          {!sendResults ? (
            <button
              type="button"
              onClick={onSend}
              disabled={isSending || readyCount === 0}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {isSending ? "Đang gửi..." : sendButtonLabel}
            </button>
          ) : null}
        </div>
      </section>
  );
}

function AttendanceExportModal({
  choice,
  preparedBatch,
  preparingProfileCount,
  isPreparing,
  isSending,
  sendResults,
  error,
  onSelect,
  onSend,
  onReprepare,
  onClose,
}: {
  choice: AttendanceExportChoice;
  preparedBatch: PreparedAttendanceBatch | null;
  preparingProfileCount: number;
  isPreparing: boolean;
  isSending: boolean;
  sendResults: AttendanceSendResult[] | null;
  error: string | null;
  onSelect: (profiles: ViewableProfile[], selectedMonth: Date) => void;
  onSend: () => void;
  onReprepare: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      {isPreparing ? (
        <PreparingAttendanceContent profileCount={preparingProfileCount} />
      ) : preparedBatch ? (
        <PreparedAttendanceContent
          batch={preparedBatch}
          isSending={isSending}
          sendResults={sendResults}
          error={error}
          onSend={onSend}
          onReprepare={onReprepare}
          onClose={onClose}
        />
      ) : (
        <AttendanceExportChoiceContent
          choice={choice}
          isPreparing={isPreparing}
          error={error}
          onSelect={onSelect}
          onClose={onClose}
        />
      )}
    </div>
  );
}

function ExportAccessState({ message, isError = false }: { message: string; isError?: boolean }) {
  return (
    <div className="h-screen overflow-hidden bg-[#f3f5fa] text-slate-900">
      <div className="flex h-full w-full">
        <WorkspaceSidebar active="attendanceExport" />
        <div className="flex h-full min-h-0 w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader title="Xuất chấm công" items={[{ label: "Xuất chấm công" }]} />
          <main className="min-h-0 flex-1 overflow-hidden px-4 py-5 lg:px-7">
            {isError ? (
              <AppErrorToast message={message} title="Không thể mở trang xuất chấm công" />
            ) : null}
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
              {isError ? "Trang xuất chấm công chưa sẵn sàng." : message}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default function AttendanceExportClient() {
  const [status, setStatus] = useState<"loading" | "allowed" | "denied" | "misconfigured">(
    "loading",
  );
  const [preparedBatch, setPreparedBatch] = useState<PreparedAttendanceBatch | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResults, setSendResults] = useState<AttendanceSendResult[] | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportChoice, setExportChoice] = useState<AttendanceExportChoice | null>(null);
  const [preparingProfileCount, setPreparingProfileCount] = useState(0);

  useEffect(() => {
    let isActive = true;

    const loadAccess = async () => {
      const access = await fetchAttendanceExportAccess();
      if (!isActive) {
        return;
      }

      if (!access.configured) {
        setStatus("misconfigured");
        return;
      }

      setStatus(access.allowed ? "allowed" : "denied");
    };

    void loadAccess();

    return () => {
      isActive = false;
    };
  }, []);

  const prepareBatch = async (params: {
    profiles: AttendanceExportProfile[];
    selectedMonth: Date;
  }) => {
    if (isPreparing) {
      return;
    }

    setPreparingProfileCount(params.profiles.length);
    setIsPreparing(true);
    setExportError(null);
    setSendResults(null);

    try {
      const batch = await prepareAttendanceExport(params);
      setPreparedBatch(batch);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Không thể tạo file chấm công.");
    } finally {
      setIsPreparing(false);
    }
  };

  const sendBatch = async () => {
    if (!preparedBatch || isSending) {
      return;
    }

    setIsSending(true);
    setExportError(null);
    try {
      const response = await sendPreparedAttendanceExport(preparedBatch);
      setSendResults(response.results);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Không thể gửi bảng công.");
    } finally {
      setIsSending(false);
    }
  };

  const reprepareBatch = () => {
    if (!preparedBatch) {
      return;
    }

    void prepareBatch({
      profiles: preparedBatch.profiles,
      selectedMonth: buildMonthDate(preparedBatch.selectedMonth),
    });
  };

  const handleExportChoice = (profiles: ViewableProfile[], selectedMonth: Date) => {
    void prepareBatch({ profiles, selectedMonth });
  };

  const closeExportModal = () => {
    if (isPreparing) {
      return;
    }

    setExportChoice(null);
    setPreparedBatch(null);
    setSendResults(null);
    setExportError(null);
  };

  if (status === "misconfigured") {
    return <ExportAccessState message="Chưa cấu hình `ADMIN_EMAILS` trong môi trường." isError />;
  }

  if (status === "loading") {
    return <ExportAccessState message="Đang kiểm tra quyền truy cập trang xuất chấm công..." />;
  }

  if (status === "denied") {
    return <ExportAccessState message="Bạn không có quyền truy cập trang xuất chấm công." isError />;
  }

  return (
    <>
      <ManagedAttendancePageContent
        pageTitle="Xuất chấm công"
        breadcrumbLabel="Xuất chấm công"
        activeSidebarKey="attendanceExport"
        showExportChoiceButton
        exportChoiceButtonLabel="Xuất file"
        forceAdminAccess
        onExportChoiceRequest={setExportChoice}
      />
      {exportChoice ? (
        <AttendanceExportModal
          choice={exportChoice}
          preparedBatch={preparedBatch}
          preparingProfileCount={preparingProfileCount}
          isPreparing={isPreparing}
          isSending={isSending}
          sendResults={sendResults}
          error={exportError}
          onSelect={handleExportChoice}
          onSend={() => void sendBatch()}
          onReprepare={reprepareBatch}
          onClose={closeExportModal}
        />
      ) : null}
    </>
  );
}
