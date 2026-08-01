"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarIcon, Plus, RefreshCw, Search } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getTaskPriorityLabel,
  normalizeTaskPriority,
  type TaskPriority,
} from "@/lib/constants/tasks";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { useAppToastStore } from "@/lib/app-toast-store";
import { supabase } from "@/lib/supabase";
import { formatDateOnlyVi } from "@/lib/timeline";

type ProfileOption = { id: string; name: string; email: string | null };

type BacklogTask = {
  id: string;
  name: string;
  priority: string | null;
  assigneeId: string | null;
  endDate: string | null;
  createdAt: string | null;
};

const PAGE_SIZE = 10;
const inputClassName =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50";

const toProfileLabel = (profile: ProfileOption) => profile.name || profile.email || "Chưa có tên";

const toIsoDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const fromIsoDate = (value: string | null) => {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
};

function DeadlinePicker({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled: boolean;
  onChange: (nextValue: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = fromIsoDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className="h-10 min-w-40 justify-start px-3 text-left text-sm font-normal"
        >
          <CalendarIcon className="mr-2 h-4 w-4 text-slate-500" />
          {selectedDate ? format(selectedDate, "dd/MM/yyyy", { locale: vi }) : "Chọn deadline"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (!date) return;
            onChange(toIsoDate(date));
            setOpen(false);
          }}
          locale={vi}
          initialFocus
        />
        {selectedDate ? (
          <div className="border-t border-slate-100 p-2">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="h-8 w-full rounded-lg text-sm font-semibold text-rose-700 hover:bg-rose-50"
            >
              Xóa deadline
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export default function BacklogPageContent() {
  const access = useWorkspaceAccess();
  const pushToast = useAppToastStore((state) => state.pushToast);
  const canManageBacklog = !access.error && (access.hasDirectorRole || access.hasLeaderRole);
  const [tasks, setTasks] = useState<BacklogTask[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [name, setName] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);

  const loadBacklog = useCallback(async () => {
    if (!canManageBacklog) return;

    setIsLoading(true);
    try {
      const [tasksResult, profilesResult] = await Promise.all([
        supabase
          .from("tasks")
          .select("id,name,priority,assignee_id,profile_id,end_date,created_at,is_backlog")
          .eq("is_backlog", true)
          .order("created_at", { ascending: false }),
        supabase.from("profiles").select("id,name,email").order("name", { ascending: true }),
      ]);
      if (tasksResult.error)
        throw new Error(tasksResult.error.message || "Không tải được backlog.");
      if (profilesResult.error)
        throw new Error(profilesResult.error.message || "Không tải được danh sách nhân sự.");

      setTasks(
        (tasksResult.data ?? []).map((task) => ({
          id: String(task.id),
          name: String(task.name),
          priority: task.priority ? String(task.priority) : null,
          assigneeId: task.assignee_id
            ? String(task.assignee_id)
            : task.profile_id
              ? String(task.profile_id)
              : null,
          endDate: task.end_date ? String(task.end_date) : null,
          createdAt: task.created_at ? String(task.created_at) : null,
        })),
      );
      setProfiles(
        (profilesResult.data ?? []).map((profile) => ({
          id: String(profile.id),
          name: String(profile.name ?? ""),
          email: profile.email ? String(profile.email) : null,
        })),
      );
    } catch (loadError) {
      pushToast({
        title: "Không thể tải backlog",
        body: loadError instanceof Error ? loadError.message : "Vui lòng thử lại.",
        href: null,
      });
    } finally {
      setIsLoading(false);
    }
  }, [canManageBacklog, pushToast]);

  useEffect(() => {
    if (!access.isLoading) void loadBacklog();
  }, [access.isLoading, loadBacklog]);

  const filteredTasks = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    return tasks.filter((task) => {
      if (keyword && !task.name.toLowerCase().includes(keyword)) return false;
      if (assigneeFilter === "unassigned" && task.assigneeId) return false;
      if (
        assigneeFilter !== "all" &&
        assigneeFilter !== "unassigned" &&
        task.assigneeId !== assigneeFilter
      )
        return false;
      return priorityFilter === "all" || normalizeTaskPriority(task.priority) === priorityFilter;
    });
  }, [assigneeFilter, priorityFilter, searchKeyword, tasks]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  const paginatedTasks = useMemo(
    () => filteredTasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredTasks, page],
  );

  useEffect(() => {
    setPage(1);
  }, [assigneeFilter, priorityFilter, searchKeyword]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const createBacklogTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      pushToast({
        title: "Thiếu tên task",
        body: "Nhập tên task trước khi tạo backlog.",
        href: null,
      });
      return;
    }
    setIsCreating(true);
    try {
      const { error: createError } = await supabase.rpc("create_backlog_task", {
        p_name: name.trim(),
        p_description: null,
        p_priority: priority,
      });
      if (createError) throw new Error(createError.message || "Không thể tạo backlog item.");
      setName("");
      setPriority("medium");
      setIsCreateOpen(false);
      pushToast({ title: "Đã tạo task", body: "Task đã được thêm vào backlog.", href: null });
      await loadBacklog();
    } catch (createError) {
      pushToast({
        title: "Không thể tạo task",
        body: createError instanceof Error ? createError.message : "Vui lòng thử lại.",
        href: null,
      });
    } finally {
      setIsCreating(false);
    }
  };

  const scheduleTask = async (
    task: BacklogTask,
    nextAssigneeId: string | null,
    nextEndDate: string | null,
  ) => {
    setSavingTaskId(task.id);
    try {
      const { error: scheduleError } = await supabase.rpc("schedule_backlog_task", {
        p_task_id: task.id,
        p_assignee_id: nextAssigneeId,
        p_end_date: nextEndDate,
      });
      if (scheduleError)
        throw new Error(scheduleError.message || "Không thể cập nhật backlog item.");
      pushToast({
        title: nextAssigneeId && nextEndDate ? "Đã lên lịch task" : "Đã cập nhật backlog",
        body:
          nextAssigneeId && nextEndDate
            ? "Task đã rời backlog."
            : "Task sẽ rời backlog khi có đủ người phụ trách và deadline.",
        href: null,
      });
      await loadBacklog();
    } catch (scheduleError) {
      pushToast({
        title: "Không thể cập nhật backlog",
        body: scheduleError instanceof Error ? scheduleError.message : "Vui lòng thử lại.",
        href: null,
      });
    } finally {
      setSavingTaskId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="backlog" />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader title="Backlog" items={[{ label: "Backlog" }]} compact />
          <main className="flex-1 space-y-4 px-4 py-4 lg:px-7">
            {access.isLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                Đang kiểm tra quyền truy cập...
              </div>
            ) : null}
            {!access.isLoading && !canManageBacklog ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                Chỉ Director hoặc Leader mới có quyền quản lý backlog.
              </div>
            ) : null}
            {!access.isLoading && canManageBacklog ? (
              <>
                <section className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h1 className="text-lg font-semibold">Backlog</h1>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void loadBacklog()}
                        disabled={isLoading}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                      >
                        <RefreshCw className="h-4 w-4" /> Làm mới
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCreateOpen(true)}
                        className="inline-flex h-9 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        <Plus className="h-4 w-4" /> Tạo task
                      </button>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-2 md:grid-cols-[minmax(0,1fr)_200px_220px]">
                    <label className="relative block">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={searchKeyword}
                        onChange={(event) => setSearchKeyword(event.target.value)}
                        className={`${inputClassName} pl-9`}
                        placeholder="Tìm task"
                      />
                    </label>
                    <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Ưu tiên" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Mọi mức ưu tiên</SelectItem>
                        {(["low", "medium", "high", "urgent"] as TaskPriority[]).map((value) => (
                          <SelectItem key={value} value={value}>
                            {getTaskPriorityLabel(value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Người phụ trách" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả người phụ trách</SelectItem>
                        <SelectItem value="unassigned">Chưa giao</SelectItem>
                        {profiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {toProfileLabel(profile)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </section>

                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  {isLoading ? (
                    <div className="p-5 text-sm text-slate-600">Đang tải backlog...</div>
                  ) : null}
                  {!isLoading && filteredTasks.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">
                      Không có task phù hợp.
                    </div>
                  ) : null}
                  {!isLoading && filteredTasks.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-[900px] w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-4 py-3 font-semibold">Task</th>
                            <th className="px-4 py-3 font-semibold">Ưu tiên</th>
                            <th className="px-4 py-3 font-semibold">Người phụ trách</th>
                            <th className="px-4 py-3 font-semibold">Deadline</th>
                            <th className="px-4 py-3 font-semibold">Tạo lúc</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {paginatedTasks.map((task) => {
                            const isSaving = savingTaskId === task.id;
                            return (
                              <tr key={task.id} className="align-middle">
                                <td className="max-w-md px-4 py-4 font-semibold text-slate-900">
                                  {task.name}
                                </td>
                                <td className="px-4 py-4 text-slate-600">
                                  {getTaskPriorityLabel(normalizeTaskPriority(task.priority))}
                                </td>
                                <td className="px-4 py-3">
                                  <Select
                                    disabled={isSaving}
                                    value={task.assigneeId ?? "unassigned"}
                                    onValueChange={(value) =>
                                      void scheduleTask(
                                        task,
                                        value === "unassigned" ? null : value,
                                        task.endDate,
                                      )
                                    }
                                  >
                                    <SelectTrigger className="min-w-48">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="unassigned">Chưa giao</SelectItem>
                                      {profiles.map((profile) => (
                                        <SelectItem key={profile.id} value={profile.id}>
                                          {toProfileLabel(profile)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="px-4 py-3">
                                  <DeadlinePicker
                                    value={task.endDate}
                                    disabled={isSaving}
                                    onChange={(value) =>
                                      void scheduleTask(task, task.assigneeId, value)
                                    }
                                  />
                                </td>
                                <td className="px-4 py-4 text-slate-500">
                                  {formatDateOnlyVi(task.createdAt, "—")}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  {!isLoading && filteredTasks.length > 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
                      <p className="text-sm text-slate-500">
                        Hiển thị {(page - 1) * PAGE_SIZE + 1}-
                        {Math.min(page * PAGE_SIZE, filteredTasks.length)} / {filteredTasks.length}{" "}
                        task
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={page === 1}
                          onClick={() => setPage((value) => value - 1)}
                          className="h-8 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Trước
                        </button>
                        <span className="text-sm text-slate-600">
                          Trang {page}/{totalPages}
                        </span>
                        <button
                          type="button"
                          disabled={page === totalPages}
                          onClick={() => setPage((value) => value + 1)}
                          className="h-8 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Sau
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}
          </main>
        </div>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tạo task trong backlog</DialogTitle>
            <DialogDescription>Task mới chưa được giao và chưa có deadline.</DialogDescription>
          </DialogHeader>
          <form onSubmit={createBacklogTask} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="backlog-task-name" className="text-sm font-semibold text-slate-700">
                Tên task *
              </label>
              <input
                id="backlog-task-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={inputClassName}
                placeholder="Nhập tên task"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Ưu tiên</label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as TaskPriority)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["low", "medium", "high", "urgent"] as TaskPriority[]).map((value) => (
                    <SelectItem key={value} value={value}>
                      {getTaskPriorityLabel(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                disabled={isCreating}
                className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:bg-blue-300"
              >
                {isCreating ? "Đang tạo..." : "Tạo task"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
