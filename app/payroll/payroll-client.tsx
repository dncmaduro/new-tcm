"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Plus, Search, Send, WalletCards } from "lucide-react";
import { AppErrorToast } from "@/components/app-error-toast";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import type { ViewableProfile } from "@/app/attendance-management/page-content";
import { fetchAttendanceExportAccess } from "@/lib/attendance-export-client-access";
import {
  calculatePayroll,
  formatPayrollDuration,
  formatPayrollMoney,
  type PayrollAdjustment,
  type PayrollAdjustmentKind,
  type PayrollCalculation,
  type PayrollCatalogItem,
} from "@/lib/payroll";
import { supabase } from "@/lib/supabase";

type PayrollEmployee = {
  profile: {
    id: string;
    name: string;
    email: string | null;
  };
  baseSalary: number;
  isDemoBaseSalary: boolean;
  adjustments: PayrollAdjustment[];
  calculation: PayrollCalculation;
  lastSentAt: string | null;
};

type PayrollDataResponse = {
  selectedMonth: string;
  formula: string;
  catalog: PayrollCatalogItem[];
  employees: PayrollEmployee[];
};

function buildMonthToken(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonthToken() {
  return buildMonthToken(new Date());
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatSentAt(value: string | null) {
  if (!value) return "Chưa gửi";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Đã gửi";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatPayrollInputNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(Math.max(0, Math.round(Number(value) || 0)));
}

function getAccessToken() {
  return supabase.auth.getSession().then(({ data, error }) => {
    if (error || !data.session?.access_token) {
      throw new Error("Không xác thực được phiên đăng nhập.");
    }
    return data.session.access_token;
  });
}

async function requestPayrollJson<T>(path: string, body: unknown) {
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
    throw new Error(payload.error || "Không thể thao tác với bảng lương.");
  }
  return payload;
}

function createManualAdjustment(employee: PayrollEmployee, kind: PayrollAdjustmentKind) {
  return {
    id: `manual:${employee.profile.id}:${Date.now()}`,
    profileId: employee.profile.id,
    payrollMonth: "",
    typeId: null,
    label: kind === "bonus" ? "Khoản thưởng mới" : "Khoản phạt mới",
    kind,
    amount: 0,
    note: null,
    source: "manual" as const,
    isApplied: true,
  } satisfies PayrollAdjustment;
}

function AccessState({ message, isError = false }: { message: string; isError?: boolean }) {
  return (
    <div className="h-screen overflow-hidden bg-[#f3f5fa] text-slate-900">
      <div className="flex h-full w-full">
        <WorkspaceSidebar active="payroll" />
        <div className="flex h-full min-h-0 w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader title="Gửi bảng lương" items={[{ label: "Gửi bảng lương" }]} />
          <main className="min-h-0 flex-1 overflow-hidden px-4 py-5 lg:px-7">
            {isError ? <AppErrorToast message={message} title="Không thể mở trang bảng lương" /> : null}
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
              {isError ? "Trang bảng lương chưa sẵn sàng." : message}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default function PayrollClient() {
  const [status, setStatus] = useState<"loading" | "allowed" | "denied" | "misconfigured">("loading");
  const [profiles, setProfiles] = useState<ViewableProfile[]>([]);
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [catalog, setCatalog] = useState<PayrollCatalogItem[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthToken);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [isLoadingPayroll, setIsLoadingPayroll] = useState(false);
  const [savingProfileId, setSavingProfileId] = useState<string | null>(null);
  const [sendingProfileId, setSendingProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    const loadAccessAndProfiles = async () => {
      setIsLoadingProfiles(true);
      try {
        const access = await fetchAttendanceExportAccess();
        if (!isActive) return;
        if (!access.configured) {
          setStatus("misconfigured");
          return;
        }
        if (!access.allowed) {
          setStatus("denied");
          return;
        }

        const accessToken = await getAccessToken();
        const response = await fetch("/api/attendance-export/profiles", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });
        const payload = (await response.json()) as { profiles?: ViewableProfile[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Không tải được danh sách nhân sự.");
        if (!isActive) return;
        setProfiles(Array.isArray(payload.profiles) ? payload.profiles : []);
        setStatus("allowed");
      } catch (loadError) {
        if (!isActive) return;
        setStatus("denied");
        setError(loadError instanceof Error ? loadError.message : "Không tải được dữ liệu bảng lương.");
      } finally {
        if (isActive) setIsLoadingProfiles(false);
      }
    };

    void loadAccessAndProfiles();
    return () => {
      isActive = false;
    };
  }, []);

  const loadPayrollData = useCallback(async () => {
    if (status !== "allowed" || profiles.length === 0) {
      setEmployees([]);
      return;
    }

    setIsLoadingPayroll(true);
    setError(null);
    try {
      const payload = await requestPayrollJson<PayrollDataResponse>("/api/payroll/data", {
        selectedMonth,
        profileIds: profiles.map((profile) => profile.id),
      });
      setEmployees(payload.employees ?? []);
      setCatalog(payload.catalog ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không tải được bảng lương.");
      setEmployees([]);
    } finally {
      setIsLoadingPayroll(false);
    }
  }, [profiles, selectedMonth, status]);

  useEffect(() => {
    void loadPayrollData();
  }, [loadPayrollData]);

  const updateEmployee = (profileId: string, updater: (employee: PayrollEmployee) => PayrollEmployee) => {
    setEmployees((current) =>
      current.map((employee) => (employee.profile.id === profileId ? updater(employee) : employee)),
    );
  };

  const updateEmployeeCalculation = (
    employee: PayrollEmployee,
    nextBaseSalary: number,
    nextAdjustments: PayrollAdjustment[],
  ) => ({
    ...employee,
    baseSalary: nextBaseSalary,
    adjustments: nextAdjustments,
    calculation: calculatePayroll({
      baseSalary: nextBaseSalary,
      workedMinutes: employee.calculation.workedMinutes,
      standardWorkingMinutes: employee.calculation.standardWorkingMinutes,
      workDays: employee.calculation.workDays,
      adjustments: nextAdjustments,
    }),
  });

  const updateBaseSalary = (profileId: string, value: number) => {
    updateEmployee(profileId, (employee) => updateEmployeeCalculation(employee, value, employee.adjustments));
  };

  const updateAdjustment = (
    profileId: string,
    adjustmentId: string,
    patch: Partial<PayrollAdjustment>,
  ) => {
    updateEmployee(profileId, (employee) => {
      const nextAdjustments = employee.adjustments.map((adjustment) =>
        adjustment.id === adjustmentId ? { ...adjustment, ...patch } : adjustment,
      );
      return updateEmployeeCalculation(employee, employee.baseSalary, nextAdjustments);
    });
  };

  const addAdjustment = (profileId: string, kind: PayrollAdjustmentKind) => {
    updateEmployee(profileId, (employee) =>
      updateEmployeeCalculation(employee, employee.baseSalary, [
        ...employee.adjustments,
        createManualAdjustment(employee, kind),
      ]),
    );
  };

  const removeAdjustment = (profileId: string, adjustmentId: string) => {
    updateEmployee(profileId, (employee) =>
      updateEmployeeCalculation(
        employee,
        employee.baseSalary,
        employee.adjustments.filter((adjustment) => adjustment.id !== adjustmentId),
      ),
    );
  };

  const selectAdjustmentType = (profileId: string, adjustment: PayrollAdjustment, typeId: string) => {
    const type = catalog.find((item) => item.id === typeId);
    updateAdjustment(profileId, adjustment.id, {
      typeId: typeId || null,
      label: type?.name || (adjustment.kind === "bonus" ? "Khoản thưởng mới" : "Khoản phạt mới"),
      kind: type?.kind || adjustment.kind,
      source: typeId ? "catalog" : "manual",
    });
  };

  const persistEmployee = async (employee: PayrollEmployee) => {
    await requestPayrollJson("/api/payroll/save", {
      selectedMonth,
      profileId: employee.profile.id,
      baseSalary: employee.baseSalary,
      adjustments: employee.adjustments,
    });
  };

  const saveEmployee = async (employee: PayrollEmployee) => {
    setSavingProfileId(employee.profile.id);
    setError(null);
    try {
      await persistEmployee(employee);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không thể lưu bảng lương.");
    } finally {
      setSavingProfileId(null);
    }
  };

  const sendEmployee = async (employee: PayrollEmployee) => {
    setSendingProfileId(employee.profile.id);
    setError(null);
    try {
      await persistEmployee(employee);
      const response = await requestPayrollJson<{ sentAt: string }>("/api/payroll/send", {
        selectedMonth,
        profileId: employee.profile.id,
      });
      updateEmployee(employee.profile.id, (current) => ({
        ...current,
        isDemoBaseSalary: false,
        lastSentAt: response.sentAt,
      }));
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Không thể gửi bảng lương.");
    } finally {
      setSendingProfileId(null);
    }
  };

  const filteredEmployees = useMemo(() => {
    const keyword = normalizeText(searchKeyword);
    if (!keyword) return employees;
    return employees.filter((employee) =>
      [employee.profile.name, employee.profile.email ?? ""]
        .map(normalizeText)
        .some((value) => value.includes(keyword)),
    );
  }, [employees, searchKeyword]);

  if (status === "misconfigured") {
    return <AccessState message="Chưa cấu hình `ADMIN_EMAILS` trong môi trường." isError />;
  }
  if (status === "loading" || isLoadingProfiles) {
    return <AccessState message="Đang tải..." />;
  }
  if (status === "denied") {
    return <AccessState message={error || "Bạn không có quyền truy cập trang bảng lương."} isError />;
  }

  return (
    <div className="h-screen overflow-hidden bg-[#f3f5fa] text-slate-900">
      <div className="flex h-full w-full">
        <WorkspaceSidebar active="payroll" />
        <div className="flex h-full min-h-0 w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader title="Gửi bảng lương" items={[{ label: "Gửi bảng lương" }]} />
          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-7 lg:py-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h2 className="text-2xl font-bold tracking-[-0.03em] text-slate-900">Bảng lương theo tháng</h2>
                  <p className="mt-1 text-xs text-slate-500">Công thức: lương cơ bản × công thực tế / công chuẩn + thưởng - phạt</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Kỳ lương</span>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(event) => setSelectedMonth(event.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <label className="relative block sm:min-w-64">
                    <span className="sr-only">Tìm nhân sự</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={searchKeyword}
                      onChange={(event) => setSearchKeyword(event.target.value)}
                      placeholder="Tìm theo tên hoặc email"
                      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                </div>
              </div>
            </section>

            {error ? <div className="mt-4"><AppErrorToast message={error} title="Không thể thao tác bảng lương" /></div> : null}

            <section className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="font-bold text-slate-900">Danh sách bảng lương</h3>
                  <p className="mt-1 text-xs text-slate-500">{filteredEmployees.length} nhân sự</p>
                </div>
                {isLoadingPayroll ? <span className="text-xs font-semibold text-blue-600">Đang tải...</span> : null}
              </div>

              <div className="max-h-[calc(100vh-330px)] overflow-y-auto overflow-x-hidden">
                <table className="w-full min-w-[1120px] table-fixed border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-30 bg-slate-50 text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
                    <tr>
                      <th className="sticky left-0 z-40 w-[200px] min-w-[200px] border-b border-slate-200 bg-slate-50 px-3 py-3 text-left">Nhân sự</th>
                      <th className="sticky left-[200px] z-40 w-[125px] min-w-[125px] border-b border-slate-200 bg-slate-50 px-2 py-3 text-right">Lương cơ bản</th>
                      <th className="w-[105px] min-w-[105px] border-b border-slate-200 px-2 py-3 text-right">Thời gian</th>
                      <th className="w-[120px] min-w-[120px] border-b border-slate-200 px-2 py-3 text-right">Tạm tính</th>
                      <th className="w-[85px] min-w-[85px] border-b border-slate-200 px-1 py-3 text-center">Trạng thái</th>
                      <th className="w-[100px] min-w-[100px] border-b border-slate-200 px-1 py-3 text-right">Gửi</th>
                      <th className="w-[385px] min-w-[385px] border-b border-slate-200 px-2 py-3 text-left">Thưởng / phạt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((employee) => {
                      const isSaving = savingProfileId === employee.profile.id;
                      const isSending = sendingProfileId === employee.profile.id;
                      return (
                        <tr key={employee.profile.id} className="group">
                          <td className="sticky left-0 z-20 w-[200px] min-w-[200px] border-b border-slate-100 bg-white px-3 py-3 group-hover:bg-slate-50">
                            <div className="flex items-center gap-3">
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-100 text-xs font-bold text-blue-700">{getInitials(employee.profile.name)}</span>
                              <div className="min-w-0">
                                <p className="truncate font-bold text-slate-900">{employee.profile.name}</p>
                                <p className="truncate text-xs text-slate-500">{employee.profile.email || "Chưa có email"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="sticky left-[200px] z-20 w-[125px] min-w-[125px] border-b border-slate-100 bg-white px-2 py-3 group-hover:bg-slate-50">
                            <input
                              type="text"
                              inputMode="numeric"
                              min="0"
                              step="100000"
                              value={formatPayrollInputNumber(employee.baseSalary)}
                              onChange={(event) => updateBaseSalary(employee.profile.id, Number(event.target.value.replace(/\D/g, "")) || 0)}
                              className="w-full min-w-0 rounded-lg border border-transparent bg-transparent px-0.5 py-1.5 text-right text-sm font-semibold text-slate-800 outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                              aria-label={`Lương cơ bản của ${employee.profile.name}`}
                            />
                          </td>
                          <td className="w-[105px] min-w-[105px] border-b border-slate-100 px-2 py-3 text-right">
                            <span className="font-semibold text-slate-800">{formatPayrollDuration(employee.calculation.workedMinutes)}</span>
                            <span className="mt-0.5 block text-xs text-slate-400">/{formatPayrollDuration(employee.calculation.standardWorkingMinutes)}</span>
                          </td>
                          <td className="w-[120px] min-w-[120px] border-b border-slate-100 px-2 py-3 text-right font-bold text-slate-900">{formatPayrollMoney(employee.calculation.totalSalary)}</td>
                          <td className="w-[85px] min-w-[85px] border-b border-slate-100 px-1 py-3 text-center text-xs font-semibold text-slate-500">{employee.lastSentAt ? <span className="inline-flex items-center gap-1 text-emerald-700" title={formatSentAt(employee.lastSentAt)}><Check className="h-4 w-4" />Đã gửi</span> : "Chưa gửi"}</td>
                          <td className="w-[100px] min-w-[100px] border-b border-slate-100 px-1 py-3 group-hover:bg-slate-50">
                            <div className="flex justify-end gap-1">
                              <button type="button" onClick={() => void saveEmployee(employee)} disabled={isSaving || isSending} className="rounded-lg border border-slate-200 px-1.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? "..." : "Lưu"}</button>
                              <button type="button" onClick={() => void sendEmployee(employee)} disabled={isSaving || isSending || !employee.profile.email} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-1.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300" title={!employee.profile.email ? "Nhân sự chưa có email" : "Gửi bảng lương"}><Send className="h-3 w-3" />{isSending ? "..." : "Gửi"}</button>
                            </div>
                          </td>
                          <td className="w-[385px] min-w-[385px] border-b border-slate-100 px-2 py-2 align-middle">
                            <div className="flex max-w-[361px] items-center gap-2">
                              <div className="min-w-0 flex-1 overflow-x-auto py-1">
                                <div className="flex min-w-max items-center gap-3">
                                  {employee.adjustments.map((adjustment) => {
                                    const isCatalogAdjustment = Boolean(adjustment.typeId);
                                    return (
                                      <div key={adjustment.id} className="w-[150px] shrink-0 border-r border-slate-200 pr-2 last:border-r-0">
                                        <div className="flex items-center gap-1">
                                          <select
                                            value={adjustment.typeId ?? ""}
                                            onChange={(event) => selectAdjustmentType(employee.profile.id, adjustment, event.target.value)}
                                            className="min-w-0 flex-1 truncate bg-transparent px-0 py-0.5 text-[11px] font-semibold text-slate-700 outline-none focus:ring-0"
                                            aria-label="Loại khoản thưởng phạt"
                                          >
                                            <option value="">Khoản tuỳ chỉnh</option>
                                            {catalog.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                                          </select>
                                          {!isCatalogAdjustment ? (
                                            <button type="button" onClick={() => removeAdjustment(employee.profile.id, adjustment.id)} className="shrink-0 text-slate-400 hover:text-rose-600" aria-label="Xoá khoản"><span aria-hidden="true">×</span></button>
                                          ) : null}
                                        </div>
                                        {isCatalogAdjustment ? (
                                          <p className={`mt-1 truncate text-[11px] font-semibold ${adjustment.kind === "bonus" ? "text-emerald-700" : "text-rose-700"}`} title={adjustment.label}>{adjustment.kind === "bonus" ? "Thưởng" : "Phạt"}</p>
                                        ) : (
                                          <div className="mt-1 flex gap-1">
                                            <input value={adjustment.label} onChange={(event) => updateAdjustment(employee.profile.id, adjustment.id, { label: event.target.value })} className="min-w-0 flex-1 border-b border-slate-200 bg-transparent px-0 py-1 text-[11px] text-slate-700 outline-none focus:border-blue-400" aria-label="Tên khoản" />
                                            <select value={adjustment.kind} onChange={(event) => updateAdjustment(employee.profile.id, adjustment.id, { kind: event.target.value as PayrollAdjustmentKind })} className="w-[50px] bg-transparent px-0.5 py-1 text-[10px] text-slate-600 outline-none" aria-label="Loại thưởng hoặc phạt">
                                              <option value="bonus">+ Thưởng</option>
                                              <option value="penalty">- Phạt</option>
                                            </select>
                                          </div>
                                        )}
                                        <input type="number" min="0" step="10000" value={adjustment.amount} onChange={(event) => updateAdjustment(employee.profile.id, adjustment.id, { amount: Number(event.target.value) || 0, isApplied: Number(event.target.value) > 0 })} className={`mt-1.5 w-full border-b border-slate-200 bg-transparent px-0 py-1 text-right text-xs font-semibold outline-none focus:border-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${adjustment.kind === "bonus" ? "text-emerald-700" : "text-rose-700"}`} aria-label={`Giá trị ${adjustment.label}`} />
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="flex w-[114px] shrink-0 gap-1">
                                <button type="button" onClick={() => addAdjustment(employee.profile.id, "bonus")} className="flex h-8 min-w-0 flex-1 items-center justify-center gap-0.5 rounded-md border border-emerald-200 px-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50"><Plus className="h-3 w-3" />Thưởng</button>
                                <button type="button" onClick={() => addAdjustment(employee.profile.id, "penalty")} className="flex h-8 min-w-0 flex-1 items-center justify-center gap-0.5 rounded-md border border-rose-200 px-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50"><Plus className="h-3 w-3" />Phạt</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredEmployees.length === 0 ? (
                  <div className="px-5 py-14 text-center">
                    <WalletCards className="mx-auto h-9 w-9 text-slate-300" />
                    <p className="mt-3 font-semibold text-slate-700">{isLoadingPayroll ? "Đang tải..." : "Không có dữ liệu"}</p>
                  </div>
                ) : null}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
