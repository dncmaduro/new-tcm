"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Edit3, Plus, Search, Trash2 } from "lucide-react";
import { AppErrorToast } from "@/components/app-error-toast";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { pushAppErrorToast, useAppToastStore } from "@/lib/app-toast-store";
import { supabase } from "@/lib/supabase";
import type { Holiday } from "@/lib/holidays";

type HolidayForm = {
  date: string;
  name: string;
  note: string;
};

const emptyForm: HolidayForm = { date: "", name: "", note: "" };

function getTodayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatHolidayDate(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function formatUpdatedAt(value?: string) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(parsed);
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }

  return data.session.access_token;
}

async function holidayRequest<T>(path: string, init?: RequestInit) {
  const accessToken = await getAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;

  if (!response.ok) {
    throw new Error(payload?.error || "Không thể thao tác với ngày nghỉ.");
  }

  return payload as T;
}

export default function HolidayManagementPageContent() {
  const pushToast = useAppToastStore((state) => state.pushToast);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [form, setForm] = useState<HolidayForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadHolidays = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await holidayRequest<{ holidays?: Holiday[] }>("/api/it-admin/holidays");
      setHolidays(Array.isArray(data.holidays) ? data.holidays : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Không tải được danh sách ngày nghỉ.");
      setHolidays([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHolidays();
  }, [loadHolidays]);

  const years = useMemo(() => {
    const values = new Set(holidays.map((holiday) => holiday.date.slice(0, 4)));
    values.add(String(new Date().getFullYear()));
    return [...values].sort((a, b) => Number(b) - Number(a));
  }, [holidays]);

  const filteredHolidays = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return holidays.filter((holiday) => {
      const matchesYear = yearFilter === "all" || holiday.date.startsWith(yearFilter);
      const matchesKeyword =
        !normalizedKeyword ||
        holiday.name.toLowerCase().includes(normalizedKeyword) ||
        holiday.note?.toLowerCase().includes(normalizedKeyword);
      return matchesYear && matchesKeyword;
    });
  }, [holidays, keyword, yearFilter]);

  const openCreate = () => {
    setEditingHoliday(null);
    setForm({ ...emptyForm, date: getTodayDate() });
    setFormOpen(true);
  };

  const openEdit = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    setForm({ date: holiday.date, name: holiday.name, note: holiday.note ?? "" });
    setFormOpen(true);
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const date = form.date.trim();
    const name = form.name.trim();
    const note = form.note.trim();

    if (!date || !name) {
      pushAppErrorToast("Vui lòng nhập ngày và tên ngày nghỉ.", "Thiếu thông tin ngày nghỉ");
      return;
    }

    setIsSaving(true);
    try {
      await holidayRequest<{ holiday: Holiday }>(
        "/api/it-admin/holidays",
        editingHoliday
          ? {
              method: "PATCH",
              body: JSON.stringify({ id: editingHoliday.id, date, name, note }),
            }
          : {
              method: "POST",
              body: JSON.stringify({ date, name, note }),
            },
      );
      setFormOpen(false);
      pushToast({
        title: editingHoliday ? "Đã cập nhật ngày nghỉ" : "Đã thêm ngày nghỉ",
        body: `${name} · ${formatHolidayDate(date)}`,
        href: null,
        tone: "success",
      });
      await loadHolidays();
    } catch (error) {
      pushAppErrorToast(
        error instanceof Error ? error.message : "Không thể lưu ngày nghỉ.",
        editingHoliday ? "Không thể cập nhật ngày nghỉ" : "Không thể thêm ngày nghỉ",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (holiday: Holiday) => {
    if (!window.confirm(`Xóa ngày nghỉ “${holiday.name}” ngày ${formatHolidayDate(holiday.date)}?`)) {
      return;
    }

    setDeletingId(holiday.id);
    try {
      await holidayRequest<{ ok: true }>(`/api/it-admin/holidays?id=${encodeURIComponent(holiday.id)}`, {
        method: "DELETE",
      });
      pushToast({
        title: "Đã xóa ngày nghỉ",
        body: `${holiday.name} · ${formatHolidayDate(holiday.date)}`,
        href: null,
        tone: "success",
      });
      await loadHolidays();
    } catch (error) {
      pushAppErrorToast(
        error instanceof Error ? error.message : "Không thể xóa ngày nghỉ.",
        "Không thể xóa ngày nghỉ",
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="holidayManagement" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader
            title="Quản lý ngày nghỉ"
            items={[{ label: "Quản trị IT", href: "/it-admin" }, { label: "Quản lý ngày nghỉ" }]}
            actions={
              <Link
                href="/it-admin"
                className="hidden h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 sm:inline-flex"
              >
                Quản trị nhân sự
              </Link>
            }
          />

          <main className="space-y-5 px-4 py-5 lg:px-7">
            {loadError ? <AppErrorToast message={loadError} title="Không tải được ngày nghỉ" /> : null}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
                      <CalendarDays className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900">Lịch ngày nghỉ dùng chung</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Ngày nghỉ được dùng cho chấm công, bảng công và các báo cáo liên quan.
                      </p>
                    </div>
                  </div>
                </div>
                <Button type="button" onClick={openCreate} className="h-10 gap-2 rounded-xl px-4">
                  <Plus className="h-4 w-4" />
                  Thêm ngày nghỉ
                </Button>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
                <div>
                  <h2 className="font-semibold text-slate-900">Danh sách ngày nghỉ</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {filteredHolidays.length} ngày nghỉ trong phạm vi đang chọn.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="relative block min-w-0 sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={keyword}
                      onChange={(event) => setKeyword(event.target.value)}
                      placeholder="Tìm ngày nghỉ..."
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <select
                    value={yearFilter}
                    onChange={(event) => setYearFilter(event.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-500"
                  >
                    <option value="all">Tất cả năm</option>
                    {years.map((year) => (
                      <option key={year} value={year}>
                        Năm {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-5 py-3.5 font-semibold lg:px-6">Ngày</th>
                      <th className="px-5 py-3.5 font-semibold">Tên ngày nghỉ</th>
                      <th className="px-5 py-3.5 font-semibold">Ghi chú</th>
                      <th className="px-5 py-3.5 font-semibold">Cập nhật gần nhất</th>
                      <th className="w-28 px-5 py-3.5 text-right font-semibold lg:px-6">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoading ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center text-slate-500">
                          Đang tải danh sách ngày nghỉ...
                        </td>
                      </tr>
                    ) : filteredHolidays.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-14 text-center">
                          <CalendarDays className="mx-auto h-8 w-8 text-slate-300" />
                          <p className="mt-3 font-semibold text-slate-700">Chưa có ngày nghỉ phù hợp</p>
                          <p className="mt-1 text-slate-500">Thử thay đổi bộ lọc hoặc thêm ngày nghỉ mới.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredHolidays.map((holiday) => (
                        <tr key={holiday.id} className="transition hover:bg-slate-50/80">
                          <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-800 lg:px-6">
                            {formatHolidayDate(holiday.date)}
                          </td>
                          <td className="px-5 py-4 font-medium text-slate-800">{holiday.name}</td>
                          <td className="max-w-[360px] px-5 py-4 text-slate-600">
                            <span className="line-clamp-2">{holiday.note || "—"}</span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                            {formatUpdatedAt(holiday.updated_at ?? holiday.created_at)}
                          </td>
                          <td className="px-5 py-4 lg:px-6">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => openEdit(holiday)}
                                aria-label={`Sửa ${holiday.name}`}
                                className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-blue-50 hover:text-blue-700"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDelete(holiday)}
                                disabled={deletingId === holiday.id}
                                aria-label={`Xóa ${holiday.name}`}
                                className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-wait disabled:opacity-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        </div>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingHoliday ? "Chỉnh sửa ngày nghỉ" : "Thêm ngày nghỉ"}</DialogTitle>
            <DialogDescription>
              Thông tin này sẽ được dùng chung trong các màn hình chấm công và xuất bảng công.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
              <label className="text-sm font-semibold text-slate-700">
                Ngày nghỉ
                <input
                  required
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Tên ngày nghỉ
                <input
                  required
                  maxLength={160}
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Ví dụ: Quốc khánh"
                />
              </label>
            </div>
            <label className="block text-sm font-semibold text-slate-700">
              Ghi chú <span className="font-normal text-slate-400">(tuỳ chọn)</span>
              <textarea
                maxLength={500}
                value={form.note}
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Thông tin thêm về ngày nghỉ..."
              />
            </label>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:bg-blue-300"
              >
                {isSaving ? "Đang lưu..." : editingHoliday ? "Lưu thay đổi" : "Thêm ngày nghỉ"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
