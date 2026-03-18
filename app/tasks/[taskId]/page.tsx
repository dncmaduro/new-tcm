"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  formatKeyResultMetric,
  formatKeyResultUnit,
  getKeyResultProgressHint,
} from "@/lib/constants/key-results";
import {
  getTaskProgressByType,
  getTaskProgressHint,
  TASK_STATUSES,
  TASK_TYPES,
  type TaskStatusValue,
  type TaskTypeValue,
} from "@/lib/constants/tasks";
import { supabase } from "@/lib/supabase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TaskRow = {
  id: string;
  goal_id: string | null;
  key_result_id: string | null;
  profile_id: string | null;
  creator_profile_id: string | null;
  type: string | null;
  name: string;
  description: string | null;
  progress: number | null;
  status: string | null;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type GoalLiteRow = {
  id: string;
  name: string;
};

type KeyResultLiteRow = {
  id: string;
  goal_id: string;
  name: string;
  progress: number | null;
  current: number | null;
  target: number | null;
  unit: string | null;
};

type ProfileLiteRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type TaskFormState = {
  name: string;
  description: string;
  note: string;
  type: TaskTypeValue;
  status: TaskStatusValue;
  progress: number;
};

const statusLabelMap = TASK_STATUSES.reduce<Record<string, string>>((acc, status) => {
  acc[status.value] = status.label;
  return acc;
}, {});

const normalizeTaskStatus = (value: string | null): TaskStatusValue => {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "done" || raw === "completed") {
    return "done";
  }
  if (raw === "doing" || raw === "inprogress" || raw === "review") {
    return "doing";
  }
  if (raw === "cancelled" || raw === "canceled") {
    return "cancelled";
  }
  return "todo";
};

const clampProgress = (value: number | null) => {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return Math.min(100, Math.max(0, Math.round(safe)));
};

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "Chưa có";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Không hợp lệ";
  }
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

export default function TaskDetailPage() {
  const params = useParams<{ taskId: string }>();
  const taskId = typeof params.taskId === "string" ? params.taskId : "";

  const [task, setTask] = useState<TaskRow | null>(null);
  const [goalName, setGoalName] = useState<string>("Chưa có mục tiêu");
  const [keyResult, setKeyResult] = useState<KeyResultLiteRow | null>(null);
  const [creatorName, setCreatorName] = useState<string>("Chưa rõ");
  const [assigneeName, setAssigneeName] = useState<string>("Chưa gán");
  const [form, setForm] = useState<TaskFormState>({
    name: "",
    description: "",
    note: "",
    type: "kpi",
    status: "todo",
    progress: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [isEditingTaskInfo, setIsEditingTaskInfo] = useState(false);
  const [isEditingExecution, setIsEditingExecution] = useState(false);
  const [progressInput, setProgressInput] = useState("0");
  const [isSavingTaskInfo, setIsSavingTaskInfo] = useState(false);
  const [isSavingExecution, setIsSavingExecution] = useState(false);

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      setKeyResult(null);
      setLoadError("Liên kết công việc không hợp lệ.");
      setIsLoading(false);
      return;
    }

    let isActive = true;

    const loadTaskDetail = async () => {
      setIsLoading(true);
      setLoadError(null);
      setActionError(null);
      setNotice(null);
      setIsEditingTaskInfo(false);
      setIsEditingExecution(false);

      try {
        const { data: taskData, error: taskError } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();

        if (!isActive) {
          return;
        }

        if (taskError) {
          if (taskError.code === "42501") {
            throw new Error("Bạn không có quyền xem công việc này.");
          }
          throw new Error(taskError.message || "Không tải được chi tiết công việc.");
        }

        const typedTask = (taskData ?? null) as TaskRow | null;
        if (!typedTask) {
          throw new Error("Không tìm thấy công việc.");
        }

        const hasCreatorField = Object.prototype.hasOwnProperty.call(taskData ?? {}, "creator_profile_id");
        const explicitCreatorProfileId = hasCreatorField ? (typedTask.creator_profile_id ?? null) : null;

        const normalizedTask: TaskRow = {
          ...typedTask,
          creator_profile_id: explicitCreatorProfileId,
        };

        setTask(normalizedTask);
        setForm({
          name: normalizedTask.name,
          description: normalizedTask.description ?? "",
          note: normalizedTask.note ?? "",
          type: normalizedTask.type === "okr" ? "okr" : "kpi",
          status: normalizeTaskStatus(normalizedTask.status),
          progress: getTaskProgressByType(
            normalizedTask.type,
            normalizeTaskStatus(normalizedTask.status),
            normalizedTask.progress,
          ),
        });
        setProgressInput(
          String(
            getTaskProgressByType(
              normalizedTask.type,
              normalizeTaskStatus(normalizedTask.status),
              normalizedTask.progress,
            ),
          ),
        );

        const creatorProfileId = explicitCreatorProfileId ?? normalizedTask.profile_id;
        const profileIds = [normalizedTask.profile_id, creatorProfileId].filter(Boolean) as string[];
        const uniqueProfileIds = [...new Set(profileIds)];

        const [goalResult, keyResultResult, profilesResult] = await Promise.all([
          normalizedTask.goal_id
            ? supabase.from("goals").select("id,name").eq("id", normalizedTask.goal_id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          normalizedTask.key_result_id
            ? supabase
                .from("key_results")
                .select("id,goal_id,name,progress,current,target,unit")
                .eq("id", normalizedTask.key_result_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          uniqueProfileIds.length > 0
            ? supabase.from("profiles").select("id,name,email").in("id", uniqueProfileIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (!isActive) {
          return;
        }

        if (goalResult.error) {
          throw new Error(goalResult.error.message || "Không tải được mục tiêu của công việc.");
        }
        if (keyResultResult.error) {
          throw new Error(keyResultResult.error.message || "Không tải được key result của công việc.");
        }

        const goalData = (goalResult.data ?? null) as GoalLiteRow | null;
        setGoalName(goalData?.name ? String(goalData.name) : "Chưa có mục tiêu");
        setKeyResult((keyResultResult.data ?? null) as KeyResultLiteRow | null);

        const profilesData = (profilesResult.data ?? []) as ProfileLiteRow[];
        const profileNameById = profilesData.reduce<Record<string, string>>((acc, profile) => {
          const label = profile.name?.trim() || profile.email?.trim() || "Chưa rõ";
          acc[String(profile.id)] = label;
          return acc;
        }, {});

        setCreatorName(creatorProfileId ? profileNameById[creatorProfileId] ?? "Chưa rõ" : "Chưa rõ");
        setAssigneeName(normalizedTask.profile_id ? profileNameById[normalizedTask.profile_id] ?? "Chưa gán" : "Chưa gán");

      } catch (error) {
        if (!isActive) {
          return;
        }
        setTask(null);
        setGoalName("Chưa có mục tiêu");
        setKeyResult(null);
        setCreatorName("Chưa rõ");
        setAssigneeName("Chưa gán");
        setLoadError(error instanceof Error ? error.message : "Không tải được chi tiết công việc.");
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadTaskDetail();

    return () => {
      isActive = false;
    };
  }, [taskId]);

  const canEditTaskInfo = true;
  const canEditExecution = true;

  const hasTaskInfoChanges = useMemo(() => {
    if (!task) {
      return false;
    }
    return (
      form.name.trim() !== task.name ||
      form.description.trim() !== (task.description ?? "") ||
      form.note.trim() !== (task.note ?? "") ||
      form.type !== (task.type === "okr" ? "okr" : "kpi")
    );
  }, [form.description, form.name, form.note, form.type, task]);

  const hasExecutionChanges = useMemo(() => {
    if (!task) {
      return false;
    }
    return (
      form.status !== normalizeTaskStatus(task.status) ||
      form.progress !==
        getTaskProgressByType(task.type, normalizeTaskStatus(task.status), task.progress)
    );
  }, [form.progress, form.status, task]);

  const handleSaveTaskInfo = async () => {
    if (!task || !canEditTaskInfo || !hasTaskInfoChanges) {
      return;
    }

    setIsSavingTaskInfo(true);
    setActionError(null);
    setNotice(null);

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        note: form.note.trim() || null,
        type: form.type,
      };

      const { data: updatedTask, error } = await supabase
        .from("tasks")
        .update(payload)
        .eq("id", task.id)
        .select("*")
        .maybeSingle();

      if (error || !updatedTask) {
        if (error?.code === "42501") {
          throw new Error("Bạn không có quyền chỉnh sửa công việc này.");
        }
        throw new Error(error?.message || "Không thể lưu thay đổi công việc.");
      }

      const typedUpdated = (updatedTask as TaskRow) ?? null;
      if (!typedUpdated) {
        throw new Error("Không nhận được dữ liệu sau khi lưu.");
      }

      const normalizedTask: TaskRow = {
        ...typedUpdated,
        creator_profile_id: task.creator_profile_id ?? null,
      };

      setTask(normalizedTask);
      setForm((prev) => ({
        ...prev,
        name: normalizedTask.name,
        description: normalizedTask.description ?? "",
        note: normalizedTask.note ?? "",
        type: normalizedTask.type === "okr" ? "okr" : "kpi",
      }));
      setIsEditingTaskInfo(false);
      setNotice("Đã lưu thông tin công việc.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể lưu thông tin công việc.");
    } finally {
      setIsSavingTaskInfo(false);
    }
  };

  const handleSaveExecution = async () => {
    if (!task || !canEditExecution || !isEditingExecution || !hasExecutionChanges) {
      return;
    }

    setIsSavingExecution(true);
    setActionError(null);
    setNotice(null);

    try {
      const payload = {
        status: form.status,
        progress: getTaskProgressByType(task.type, form.status, form.progress),
      };

      const { data: updatedTask, error } = await supabase
        .from("tasks")
        .update(payload)
        .eq("id", task.id)
        .select("*")
        .maybeSingle();

      if (error) {
        if (error.code === "42501") {
          throw new Error("Bạn không có quyền cập nhật trạng thái hoặc tiến độ (RLS).");
        }
        throw new Error(error.message || "Không thể cập nhật trạng thái hoặc tiến độ.");
      }

      if (!updatedTask) {
        throw new Error("Bạn không có quyền cập nhật trạng thái hoặc tiến độ (RLS).");
      }

      const typedUpdated = (updatedTask as TaskRow) ?? null;
      if (!typedUpdated) {
        throw new Error("Không nhận được dữ liệu sau khi lưu.");
      }

      const normalizedTask: TaskRow = {
        ...typedUpdated,
        creator_profile_id: task.creator_profile_id ?? null,
      };

      let goalSyncError: string | null = null;
      if (normalizedTask.goal_id) {
        const { error: recalculateError } = await supabase.rpc("recalculate_goal_progress", {
          target_goal_id: normalizedTask.goal_id,
        });
        if (recalculateError) {
          goalSyncError = recalculateError.message || "Không thể đồng bộ tiến độ mục tiêu.";
        }
      }

      setTask(normalizedTask);
      setForm((prev) => ({
        ...prev,
        status: normalizeTaskStatus(normalizedTask.status),
        progress: getTaskProgressByType(
          normalizedTask.type,
          normalizeTaskStatus(normalizedTask.status),
          normalizedTask.progress,
        ),
      }));
      setProgressInput(
        String(
          getTaskProgressByType(
            normalizedTask.type,
            normalizeTaskStatus(normalizedTask.status),
            normalizedTask.progress,
          ),
        ),
      );
      setIsEditingExecution(false);
      setNotice(
        goalSyncError
          ? "Đã cập nhật task nhưng chưa đồng bộ tiến độ mục tiêu. Hãy chạy migration trigger mới."
          : "Đã cập nhật trạng thái và tiến độ.",
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể cập nhật trạng thái hoặc tiến độ.");
    } finally {
      setIsSavingExecution(false);
    }
  };

  const statusLabel = statusLabelMap[form.status] ?? form.status;

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="tasks" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[280px]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">
                  <Link href="/dashboard" className="hover:text-slate-700">
                    Bảng điều khiển
                  </Link>
                  <span className="px-2">›</span>
                  <Link href="/tasks" className="hover:text-slate-700">
                    Công việc
                  </Link>
                  <span className="px-2">›</span>
                  <span className="font-semibold text-slate-700">Chi tiết</span>
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em] text-slate-900">Chi tiết công việc</h1>
              </div>

              <div className="flex items-center gap-2">
                {canEditTaskInfo ? (
                  isEditingTaskInfo ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (!task) {
                            return;
                          }
                          setForm((prev) => ({
                            ...prev,
                            name: task.name,
                            description: task.description ?? "",
                            note: task.note ?? "",
                          }));
                          setIsEditingTaskInfo(false);
                          setActionError(null);
                          setNotice(null);
                        }}
                        disabled={isSavingTaskInfo}
                        className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveTaskInfo()}
                        disabled={!hasTaskInfoChanges || isSavingTaskInfo}
                        className="inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                      >
                        {isSavingTaskInfo ? "Đang lưu..." : "Lưu chỉnh sửa"}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingTaskInfo(true);
                        setActionError(null);
                        setNotice(null);
                      }}
                      className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Chỉnh sửa
                    </button>
                  )
                ) : null}

                <Link
                  href="/tasks"
                  className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Quay lại
                </Link>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-7">
            {isLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">
                Đang tải chi tiết công việc...
              </div>
            ) : null}

            {!isLoading && loadError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {loadError}
              </div>
            ) : null}

            {!isLoading && actionError ? (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {actionError}
              </div>
            ) : null}

            {!isLoading && notice ? (
              <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {notice}
              </div>
            ) : null}

            {!isLoading && !loadError && task ? (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="space-y-5">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    {isEditingTaskInfo ? (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-sm font-semibold text-slate-700">Tên công việc</label>
                          <input
                            value={form.name}
                            onChange={(event) =>
                              setForm((prev) => ({
                                ...prev,
                                name: event.target.value,
                              }))
                            }
                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-sm font-semibold text-slate-700">Mô tả</label>
                          <textarea
                            rows={4}
                            value={form.description}
                            onChange={(event) =>
                              setForm((prev) => ({
                                ...prev,
                                description: event.target.value,
                              }))
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            placeholder="Chưa có mô tả"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-sm font-semibold text-slate-700">Loại task</label>
                          <Select
                            value={form.type}
                            onValueChange={(value) =>
                              setForm((prev) => ({
                                ...prev,
                                type: value as TaskTypeValue,
                                progress: getTaskProgressByType(
                                  value,
                                  prev.status,
                                  prev.progress,
                                ),
                              }))
                            }
                          >
                            <SelectTrigger className="h-10">
                              <SelectValue placeholder="Chọn loại task" />
                            </SelectTrigger>
                            <SelectContent>
                              {TASK_TYPES.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">{task.name}</h2>
                        <p className="mt-3 text-sm text-slate-500">Loại task</p>
                        <p className="mt-1 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-700">
                          {TASK_TYPES.find((item) => item.value === form.type)?.label ?? "KPI"}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">{getTaskProgressHint(form.type)}</p>
                        <p className="mt-3 text-sm text-slate-500">Mô tả</p>
                        <p className="mt-1 whitespace-pre-wrap text-base text-slate-700">
                          {task.description?.trim() || "Chưa có mô tả."}
                        </p>
                      </>
                    )}
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="text-lg font-semibold text-slate-900">Ghi chú</h3>
                    {isEditingTaskInfo ? (
                      <textarea
                        rows={4}
                        value={form.note}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            note: event.target.value,
                          }))
                        }
                        className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        placeholder="Chưa có ghi chú"
                      />
                    ) : (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                        {task.note?.trim() || "Chưa có ghi chú."}
                      </p>
                    )}
                  </article>

                  {keyResult ? (
                    <article className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-blue-700">Key result liên kết</p>
                          <p className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-900">
                            {keyResult.name}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-blue-700">
                          {clampProgress(keyResult.progress)}%
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl bg-white px-4 py-3">
                          <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                            Hiện tại
                          </p>
                          <p className="mt-2 text-lg font-semibold text-slate-900">
                            {formatKeyResultMetric(keyResult.current, keyResult.unit)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white px-4 py-3">
                          <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                            Mục tiêu
                          </p>
                          <p className="mt-2 text-lg font-semibold text-slate-900">
                            {formatKeyResultMetric(keyResult.target, keyResult.unit)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white px-4 py-3">
                          <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                            Đơn vị
                          </p>
                          <p className="mt-2 text-lg font-semibold text-slate-900">
                            {formatKeyResultUnit(keyResult.unit)}
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-slate-500">{getKeyResultProgressHint(keyResult.unit)}</p>
                    </article>
                  ) : null}
                </section>

                <aside className="space-y-4">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="text-lg font-semibold text-slate-900">Thông tin công việc</h3>

                    <div className="mt-4 space-y-3 text-sm">
                      <div className="space-y-1">
                        <p className="text-slate-500">Loại task</p>
                        {isEditingTaskInfo ? null : (
                          <p className="inline-block rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                            {TASK_TYPES.find((item) => item.value === form.type)?.label ?? "KPI"}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <p className="text-slate-500">Trạng thái</p>
                        {canEditExecution && isEditingExecution ? (
                          <Select
                            value={form.status}
                            onValueChange={(value) =>
                              setForm((prev) => ({
                                ...prev,
                                status: value as TaskStatusValue,
                                progress: getTaskProgressByType(
                                  prev.type,
                                  value as TaskStatusValue,
                                  prev.progress,
                                ),
                              }))
                            }
                          >
                            <SelectTrigger className="h-10">
                              <SelectValue placeholder="Chọn trạng thái" />
                            </SelectTrigger>
                            <SelectContent>
                              {TASK_STATUSES.map((status) => (
                                <SelectItem key={status.value} value={status.value}>
                                  {status.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="inline-block rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-700">{statusLabel}</p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-slate-500">Tiến độ</p>
                          <p className="font-semibold text-slate-700">{form.progress}%</p>
                        </div>
                        <p className="text-[11px] text-slate-400">{getTaskProgressHint(form.type)}</p>

                        {canEditExecution && isEditingExecution ? (
                          <div className="space-y-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={progressInput}
                              disabled={form.type === "okr"}
                              onChange={(event) => {
                                const raw = event.target.value;
                                setProgressInput(raw);
                                if (raw === "") {
                                  return;
                                }
                                const parsed = Number(raw);
                                if (!Number.isFinite(parsed)) {
                                  return;
                                }
                                setForm((prev) => ({
                                  ...prev,
                                  progress: clampProgress(parsed),
                                }));
                              }}
                              onBlur={() => {
                                if (progressInput.trim() === "") {
                                  setProgressInput(String(form.progress));
                                  return;
                                }
                                const parsed = Number(progressInput);
                                if (!Number.isFinite(parsed)) {
                                  setProgressInput(String(form.progress));
                                  return;
                                }
                                const normalized = clampProgress(parsed);
                                setForm((prev) => ({ ...prev, progress: normalized }));
                                setProgressInput(String(normalized));
                              }}
                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                            />
                          </div>
                        ) : (
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-blue-600" style={{ width: `${form.progress}%` }} />
                          </div>
                        )}
                      </div>

                      {canEditExecution ? (
                        isEditingExecution ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (!task) {
                                  return;
                                }
                                setForm((prev) => ({
                                  ...prev,
                                  status: normalizeTaskStatus(task.status),
                                  progress: getTaskProgressByType(
                                    task.type,
                                    normalizeTaskStatus(task.status),
                                    task.progress,
                                  ),
                                }));
                                setProgressInput(
                                  String(
                                    getTaskProgressByType(
                                      task.type,
                                      normalizeTaskStatus(task.status),
                                      task.progress,
                                    ),
                                  ),
                                );
                                setIsEditingExecution(false);
                                setActionError(null);
                                setNotice(null);
                              }}
                              disabled={isSavingExecution}
                              className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              Hủy
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSaveExecution()}
                              disabled={!hasExecutionChanges || isSavingExecution}
                              className="inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                            >
                              {isSavingExecution ? "Đang lưu..." : "Lưu trạng thái & tiến độ"}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setProgressInput(String(form.progress));
                              setIsEditingExecution(true);
                              setActionError(null);
                              setNotice(null);
                            }}
                            className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Chỉnh sửa tiến độ
                          </button>
                        )
                      ) : null}

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Mục tiêu</span>
                        <span className="text-right font-medium text-slate-700">{goalName}</span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Key result</span>
                        <span className="text-right font-medium text-slate-700">
                          {keyResult?.name ?? "Chưa gắn"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Người tạo</span>
                        <span className="text-right font-medium text-slate-700">{creatorName}</span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Người phụ trách</span>
                        <span className="text-right font-medium text-slate-700">{assigneeName}</span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Ngày tạo</span>
                        <span className="text-right font-medium text-slate-700">{formatDateTime(task.created_at)}</span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Cập nhật</span>
                        <span className="text-right font-medium text-slate-700">{formatDateTime(task.updated_at)}</span>
                      </div>
                    </div>
                  </article>
                </aside>
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
