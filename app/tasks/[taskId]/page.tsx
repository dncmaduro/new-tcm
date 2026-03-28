"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { ClearableNumberInput } from "@/components/ui/clearable-number-input";
import {
  formatKeyResultMetric,
  formatKeyResultUnit,
  getKeyResultProgressHint,
} from "@/lib/constants/key-results";
import {
  getTaskProgressByType,
  getTaskProgressHint,
  normalizeTaskStatus,
  TASK_STATUSES,
  TASK_TYPES,
  type TaskStatusValue,
  type TaskTypeValue,
} from "@/lib/constants/tasks";
import { buildKeyResultProgressMap, getComputedTaskProgress } from "@/lib/okr";
import { supabase } from "@/lib/supabase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  formatTimelineRangeVi,
  getTimelineMissingReason,
  getTimelineOutsideParentWarning,
  isDateRangeOrdered,
} from "@/lib/timeline";

type TaskRow = {
  id: string;
  key_result_id: string | null;
  profile_id: string | null;
  creator_profile_id: string | null;
  type: string | null;
  name: string;
  description: string | null;
  progress: number | null;
  weight: number | null;
  status: string | null;
  note: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  key_result?: KeyResultLiteRow | null;
};

type GoalLiteRow = {
  id: string;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
};

type KeyResultLiteRow = {
  id: string;
  goal_id: string | null;
  name: string;
  current: number | null;
  start_value: number | null;
  target: number | null;
  unit: string | null;
  weight: number | null;
  start_date: string | null;
  end_date: string | null;
  goal?: GoalLiteRow | null;
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
  weight: number;
};

type TaskTimelineFormState = {
  startDate: string;
  endDate: string;
};

const statusLabelMap = TASK_STATUSES.reduce<Record<string, string>>((acc, status) => {
  acc[status.value] = status.label;
  return acc;
}, {});

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

const normalizeGoalLite = (value: unknown): GoalLiteRow | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    id: String(record.id),
    name: String(record.name),
    start_date: record.start_date ? String(record.start_date) : null,
    end_date: record.end_date ? String(record.end_date) : null,
  };
};

export default function TaskDetailPage() {
  const params = useParams<{ taskId: string }>();
  const taskId = typeof params.taskId === "string" ? params.taskId : "";

  const [task, setTask] = useState<TaskRow | null>(null);
  const [goalName, setGoalName] = useState<string>("Chưa có mục tiêu");
  const [keyResult, setKeyResult] = useState<KeyResultLiteRow | null>(null);
  const [keyResultProgress, setKeyResultProgress] = useState(0);
  const [creatorName, setCreatorName] = useState<string>("Chưa rõ");
  const [assigneeName, setAssigneeName] = useState<string>("Chưa gán");
  const [form, setForm] = useState<TaskFormState>({
    name: "",
    description: "",
    note: "",
    type: "kpi",
    status: "todo",
    progress: 0,
    weight: 1,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [isEditingTaskInfo, setIsEditingTaskInfo] = useState(false);
  const [isEditingExecution, setIsEditingExecution] = useState(false);
  const [isEditingTaskTimeline, setIsEditingTaskTimeline] = useState(false);
  const [progressInput, setProgressInput] = useState("0");
  const [isSavingTaskInfo, setIsSavingTaskInfo] = useState(false);
  const [isSavingExecution, setIsSavingExecution] = useState(false);
  const [isSavingTaskTimeline, setIsSavingTaskTimeline] = useState(false);
  const [taskTimelineForm, setTaskTimelineForm] = useState<TaskTimelineFormState>({
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      setKeyResult(null);
      setKeyResultProgress(0);
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
      setIsEditingTaskTimeline(false);

      try {
        const { data: taskData, error: taskError } = await supabase
          .from("tasks")
          .select(`
            id,
            key_result_id,
            profile_id,
            creator_profile_id,
            type,
            name,
            description,
            progress,
            weight,
            status,
            note,
            start_date,
            end_date,
            created_at,
            updated_at,
            key_result:key_results!tasks_key_result_id_fkey(
              id,
              goal_id,
              name,
              current,
              start_value,
              target,
              unit,
              weight,
              start_date,
              end_date,
              goal:goals!key_results_goal_id_fkey(
                id,
                name,
                start_date,
                end_date
              )
            )
          `)
          .eq("id", taskId)
          .maybeSingle();

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
        const rawKeyResult = Array.isArray((normalizedTask as unknown as { key_result?: unknown }).key_result)
          ? ((normalizedTask as unknown as { key_result?: Array<Record<string, unknown>> }).key_result?.[0] ?? null)
          : (((normalizedTask as unknown as { key_result?: Record<string, unknown> | null }).key_result) ?? null);
        const normalizedKeyResult = rawKeyResult
          ? {
              id: String(rawKeyResult.id),
              goal_id: rawKeyResult.goal_id ? String(rawKeyResult.goal_id) : null,
              name: String(rawKeyResult.name),
              current:
                typeof rawKeyResult.current === "number"
                  ? rawKeyResult.current
                  : Number(rawKeyResult.current ?? 0),
              start_value:
                typeof rawKeyResult.start_value === "number"
                  ? rawKeyResult.start_value
                  : Number(rawKeyResult.start_value ?? 0),
              target:
                typeof rawKeyResult.target === "number"
                  ? rawKeyResult.target
                  : Number(rawKeyResult.target ?? 0),
              unit: rawKeyResult.unit ? String(rawKeyResult.unit) : null,
              weight:
                typeof rawKeyResult.weight === "number"
                  ? rawKeyResult.weight
                  : Number(rawKeyResult.weight ?? 1),
              start_date: rawKeyResult.start_date ? String(rawKeyResult.start_date) : null,
              end_date: rawKeyResult.end_date ? String(rawKeyResult.end_date) : null,
              goal: Array.isArray(rawKeyResult.goal)
                ? normalizeGoalLite(rawKeyResult.goal[0] ?? null)
                : normalizeGoalLite(rawKeyResult.goal),
            }
          : null;
        normalizedTask.key_result = normalizedKeyResult;

        setTask(normalizedTask);
        setForm({
          name: normalizedTask.name,
          description: normalizedTask.description ?? "",
          note: normalizedTask.note ?? "",
          type: normalizedTask.type === "okr" ? "okr" : "kpi",
          status: normalizeTaskStatus(normalizedTask.status),
          progress: getComputedTaskProgress(normalizedTask),
          weight: typeof normalizedTask.weight === "number" ? normalizedTask.weight : Number(normalizedTask.weight ?? 1),
        });
        setProgressInput(String(getComputedTaskProgress(normalizedTask)));

        const creatorProfileId = explicitCreatorProfileId ?? normalizedTask.profile_id;
        const profileIds = [normalizedTask.profile_id, creatorProfileId].filter(Boolean) as string[];
        const uniqueProfileIds = [...new Set(profileIds)];

        const [profilesResult, relatedTasksResult] = await Promise.all([
          uniqueProfileIds.length > 0
            ? supabase.from("profiles").select("id,name,email").in("id", uniqueProfileIds)
            : Promise.resolve({ data: [], error: null }),
          normalizedTask.key_result_id
            ? supabase
                .from("tasks")
                .select("id,key_result_id,type,status,progress,weight")
                .eq("key_result_id", normalizedTask.key_result_id)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (!isActive) {
          return;
        }

        if (relatedTasksResult.error) {
          throw new Error(relatedTasksResult.error.message || "Không tải được tiến độ key result của công việc.");
        }

        const nestedKeyResult = normalizedKeyResult;
        setGoalName(nestedKeyResult?.goal?.name ? String(nestedKeyResult.goal.name) : "Chưa có mục tiêu");
        setKeyResult(nestedKeyResult);
        setTaskTimelineForm({
          startDate: normalizedTask.start_date ?? nestedKeyResult?.start_date ?? "",
          endDate: normalizedTask.end_date ?? nestedKeyResult?.end_date ?? "",
        });
        const computedKeyResultProgress = nestedKeyResult
          ? buildKeyResultProgressMap(
              [{ id: String(nestedKeyResult.id), goal_id: nestedKeyResult.goal_id ? String(nestedKeyResult.goal_id) : null }],
              ((relatedTasksResult.data ?? []) as Array<{
                key_result_id: string | null;
                type: string | null;
                status: string | null;
                progress: number | null;
                weight: number | null;
              }>).map((item) => ({
                key_result_id: item.key_result_id ? String(item.key_result_id) : null,
                type: item.type ? String(item.type) : null,
                status: item.status ? String(item.status) : null,
                progress: item.progress,
                weight: item.weight,
              })),
            )[String(nestedKeyResult.id)] ?? 0
          : 0;
        setKeyResultProgress(computedKeyResultProgress);

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
        setKeyResultProgress(0);
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
  const canEditTaskTimeline = true;
  const goalHref = keyResult?.goal_id ? `/goals/${keyResult.goal_id}` : null;
  const keyResultHref =
    keyResult?.id && keyResult.goal_id ? `/goals/${keyResult.goal_id}/key-results/${keyResult.id}` : null;

  const hasTaskInfoChanges = useMemo(() => {
    if (!task) {
      return false;
    }
    return (
      form.name.trim() !== task.name ||
      form.description.trim() !== (task.description ?? "") ||
      form.note.trim() !== (task.note ?? "") ||
      form.type !== (task.type === "okr" ? "okr" : "kpi") ||
      Math.round(form.weight) !== Math.round(Number(task.weight ?? 1))
    );
  }, [form.description, form.name, form.note, form.type, form.weight, task]);

  const hasExecutionChanges = useMemo(() => {
    if (!task) {
      return false;
    }
    return (
      form.status !== normalizeTaskStatus(task.status) ||
      form.progress !== getComputedTaskProgress(task)
    );
  }, [form.progress, form.status, task]);

  const refreshLinkedKeyResultProgress = async (targetKeyResultId: string | null | undefined) => {
    if (!targetKeyResultId || !keyResult) {
      return;
    }

    const { data, error } = await supabase
      .from("tasks")
      .select("id,key_result_id,type,status,progress,weight")
      .eq("key_result_id", targetKeyResultId);

    if (error) {
      return;
    }

    const nextProgress = buildKeyResultProgressMap(
      [{ id: String(keyResult.id), goal_id: keyResult.goal_id ? String(keyResult.goal_id) : null }],
      ((data ?? []) as Array<{
        key_result_id: string | null;
        type: string | null;
        status: string | null;
        progress: number | null;
        weight: number | null;
      }>).map((item) => ({
        key_result_id: item.key_result_id ? String(item.key_result_id) : null,
        type: item.type ? String(item.type) : null,
        status: item.status ? String(item.status) : null,
        progress: item.progress,
        weight: item.weight,
      })),
    )[String(keyResult.id)] ?? 0;

    setKeyResultProgress(nextProgress);
  };

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
        weight: Math.round(form.weight),
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
        progress: getComputedTaskProgress(normalizedTask),
        weight: typeof normalizedTask.weight === "number" ? normalizedTask.weight : Number(normalizedTask.weight ?? 1),
      }));
      setProgressInput(String(getComputedTaskProgress(normalizedTask)));
      await refreshLinkedKeyResultProgress(normalizedTask.key_result_id);
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

      setTask(normalizedTask);
      setForm((prev) => ({
        ...prev,
        status: normalizeTaskStatus(normalizedTask.status),
        progress: getComputedTaskProgress(normalizedTask),
      }));
      setProgressInput(String(getComputedTaskProgress(normalizedTask)));
      await refreshLinkedKeyResultProgress(normalizedTask.key_result_id);
      setIsEditingExecution(false);
      setNotice("Đã cập nhật trạng thái và tiến độ.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể cập nhật trạng thái hoặc tiến độ.");
    } finally {
      setIsSavingExecution(false);
    }
  };

  const taskTimelineInputError = useMemo(() => {
    if ((taskTimelineForm.startDate && !taskTimelineForm.endDate) || (!taskTimelineForm.startDate && taskTimelineForm.endDate)) {
      return "Vui lòng nhập đủ ngày bắt đầu và ngày kết thúc hoặc để trống cả hai.";
    }
    if (!isDateRangeOrdered(taskTimelineForm.startDate || null, taskTimelineForm.endDate || null)) {
      return "Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.";
    }
    return null;
  }, [taskTimelineForm.endDate, taskTimelineForm.startDate]);

  const taskTimelineAlignmentWarning = useMemo(
    () =>
      getTimelineOutsideParentWarning(
        isEditingTaskTimeline ? taskTimelineForm.startDate || null : task?.start_date ?? null,
        isEditingTaskTimeline ? taskTimelineForm.endDate || null : task?.end_date ?? null,
        keyResult?.start_date ?? null,
        keyResult?.end_date ?? null,
        {
          subjectLabel: "Thời gian công việc",
          parentLabel: "KR",
        },
      ),
    [
      isEditingTaskTimeline,
      keyResult?.end_date,
      keyResult?.start_date,
      task?.end_date,
      task?.start_date,
      taskTimelineForm.endDate,
      taskTimelineForm.startDate,
    ],
  );

  const handleSaveTaskTimeline = async () => {
    if (!task) {
      return;
    }

    if (taskTimelineInputError) {
      setActionError(taskTimelineInputError);
      setNotice(null);
      return;
    }

    setIsSavingTaskTimeline(true);
    setActionError(null);
    setNotice(null);

    try {
      const { data: updatedTask, error } = await supabase
        .from("tasks")
        .update({
          start_date: taskTimelineForm.startDate.trim() || null,
          end_date: taskTimelineForm.endDate.trim() || null,
        })
        .eq("id", task.id)
        .select("*")
        .maybeSingle();

      if (error) {
        if (error.code === "42501") {
          throw new Error("Bạn không có quyền cập nhật thời gian thực thi công việc.");
        }
        throw new Error(error.message || "Không thể cập nhật thời gian thực thi công việc.");
      }

      if (!updatedTask) {
        throw new Error("Không nhận được dữ liệu công việc sau khi lưu.");
      }

      const typedUpdated = updatedTask as TaskRow;
      const nextTask: TaskRow = {
        ...task,
        ...typedUpdated,
        creator_profile_id: task.creator_profile_id ?? null,
        key_result: keyResult,
      };

      setTask(nextTask);
      setTaskTimelineForm({
        startDate: nextTask.start_date ?? "",
        endDate: nextTask.end_date ?? "",
      });
      setIsEditingTaskTimeline(false);
      setNotice("Đã cập nhật thời gian thực thi công việc.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể cập nhật thời gian thực thi công việc.");
    } finally {
      setIsSavingTaskTimeline(false);
    }
  };

  const statusLabel = statusLabelMap[form.status] ?? form.status;

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="tasks" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">
                  <Link href="/tasks" className="hover:text-slate-700">
                    Công việc
                  </Link>
                  {goalHref ? (
                    <>
                      <span className="px-2">›</span>
                      <Link href={goalHref} className="hover:text-slate-700">
                        Mục tiêu: {goalName}
                      </Link>
                    </>
                  ) : null}
                  {keyResultHref && keyResult ? (
                    <>
                      <span className="px-2">›</span>
                      <Link href={keyResultHref} className="hover:text-slate-700">
                        KR: {keyResult.name}
                      </Link>
                    </>
                  ) : null}
                  <span className="px-2">›</span>
                  <span className="font-semibold text-slate-700">Task: {task?.name ?? "Chi tiết công việc"}</span>
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
                            type: task.type === "okr" ? "okr" : "kpi",
                            weight: typeof task.weight === "number" ? task.weight : Number(task.weight ?? 1),
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

                        <div className="space-y-1.5">
                          <label className="text-sm font-semibold text-slate-700">Trọng số task</label>
                          <ClearableNumberInput
                            min={1}
                            value={form.weight}
                            onValueChange={(value) =>
                              setForm((prev) => ({
                                ...prev,
                                weight: value,
                              }))
                            }
                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          />
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
                        <p className="mt-3 text-sm text-slate-500">Trọng số task</p>
                        <p className="mt-1 text-base font-semibold text-slate-800">{Math.round(form.weight)}</p>
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
                          {keyResultHref ? (
                            <Link
                              href={keyResultHref}
                              className="mt-1 inline-flex text-xl font-semibold tracking-[-0.02em] text-slate-900 hover:text-blue-700"
                            >
                              {keyResult.name}
                            </Link>
                          ) : (
                            <p className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-900">
                              {keyResult.name}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-slate-500">
                            Khung thời gian của KR:{" "}
                            {formatTimelineRangeVi(keyResult.start_date, keyResult.end_date, {
                              fallback: "KR chưa có mốc thời gian",
                            })}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            KR vẫn là khung thời gian cha để đối chiếu kế hoạch của công việc.
                          </p>
                          <p className="mt-2 text-xs text-slate-600">
                            Thời gian thực thi của công việc:{" "}
                            {formatTimelineRangeVi(task.start_date, task.end_date, {
                              fallback: "Công việc chưa có mốc thời gian",
                            })}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {getTimelineMissingReason(
                              task.start_date,
                              task.end_date,
                              "Công việc chưa có mốc thời gian",
                              "Mốc thời gian công việc không hợp lệ",
                            ) ?? "Nguồn timeline chính của task đến từ ngày bắt đầu và ngày kết thúc của chính công việc."}
                          </p>
                          {taskTimelineAlignmentWarning ? (
                            <p className="mt-1 text-[11px] text-amber-600">{taskTimelineAlignmentWarning}</p>
                          ) : null}
                          <p className="mt-2 text-xs text-slate-500">
                            {keyResult.goal?.start_date || keyResult.goal?.end_date
                              ? `Khung mục tiêu: ${formatTimelineRangeVi(keyResult.goal?.start_date ?? null, keyResult.goal?.end_date ?? null, {
                                  fallback: "Chưa đặt khung thời gian mục tiêu",
                                })}`
                              : "Mục tiêu chưa có ngày bắt đầu/kết thúc."}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {canEditTaskTimeline ? (
                            isEditingTaskTimeline ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTaskTimelineForm({
                                      startDate: task.start_date ?? keyResult.start_date ?? "",
                                      endDate: task.end_date ?? keyResult.end_date ?? "",
                                    });
                                    setIsEditingTaskTimeline(false);
                                    setActionError(null);
                                    setNotice(null);
                                  }}
                                  disabled={isSavingTaskTimeline}
                                  className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                >
                                  Hủy
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleSaveTaskTimeline()}
                                  disabled={isSavingTaskTimeline}
                                  className="inline-flex h-9 items-center rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
                                >
                                  {isSavingTaskTimeline ? "Đang lưu..." : "Lưu thời gian task"}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setTaskTimelineForm({
                                    startDate: task.start_date ?? keyResult.start_date ?? "",
                                    endDate: task.end_date ?? keyResult.end_date ?? "",
                                  });
                                  setIsEditingTaskTimeline(true);
                                  setActionError(null);
                                  setNotice(null);
                                }}
                                className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                Sửa thời gian task
                              </button>
                            )
                          ) : null}
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-blue-700">
                            {keyResultProgress}%
                          </span>
                        </div>
                      </div>

                      {isEditingTaskTimeline ? (
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <label className="space-y-1.5">
                            <span className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                              Ngày bắt đầu
                            </span>
                            <input
                              type="date"
                              value={taskTimelineForm.startDate}
                              onChange={(event) =>
                                setTaskTimelineForm((prev) => ({
                                  ...prev,
                                  startDate: event.target.value,
                                }))
                              }
                              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            />
                          </label>
                          <label className="space-y-1.5">
                            <span className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                              Ngày kết thúc
                            </span>
                            <input
                              type="date"
                              min={taskTimelineForm.startDate || undefined}
                              value={taskTimelineForm.endDate}
                              onChange={(event) =>
                                setTaskTimelineForm((prev) => ({
                                  ...prev,
                                  endDate: event.target.value,
                                }))
                              }
                              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            />
                          </label>
                          <p className="md:col-span-2 text-[11px] text-slate-500">
                            Giá trị ban đầu ưu tiên lấy từ task hiện tại. Nếu task chưa có ngày, form sẽ autofill từ khung thời gian của KR.
                          </p>
                          {taskTimelineInputError ? (
                            <p className="md:col-span-2 text-[11px] text-rose-600">{taskTimelineInputError}</p>
                          ) : null}
                          {!taskTimelineInputError && taskTimelineAlignmentWarning ? (
                            <p className="md:col-span-2 text-[11px] text-amber-600">{taskTimelineAlignmentWarning}</p>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        <div className="rounded-xl bg-white px-4 py-3">
                          <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                            Bắt đầu
                          </p>
                          <p className="mt-2 text-lg font-semibold text-slate-900">
                            {formatKeyResultMetric(keyResult.start_value, keyResult.unit)}
                          </p>
                        </div>
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
                        <div className="rounded-xl bg-white px-4 py-3">
                          <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                            Khung thời gian KR
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {formatTimelineRangeVi(keyResult.start_date, keyResult.end_date, {
                              fallback: "KR chưa có mốc thời gian",
                            })}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            {getTimelineMissingReason(
                              keyResult.start_date,
                              keyResult.end_date,
                              "KR chưa có mốc thời gian",
                              "Mốc thời gian KR không hợp lệ",
                            ) ?? "Dùng để đối chiếu với lịch thực thi riêng của task."}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white px-4 py-3">
                          <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                            Trọng số KR (%)
                          </p>
                          <p className="mt-2 text-lg font-semibold text-slate-900">
                            {Math.round(Number(keyResult.weight ?? 1))}%
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
                        <p className="text-slate-500">Trọng số</p>
                        {isEditingTaskInfo ? null : (
                          <p className="font-semibold text-slate-700">{Math.round(form.weight)}</p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <p className="text-slate-500">Thời gian thực thi của công việc</p>
                        <p className="font-semibold text-slate-700">
                          {formatTimelineRangeVi(task.start_date, task.end_date, {
                            fallback: "Công việc chưa có mốc thời gian",
                          })}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {getTimelineMissingReason(
                            task.start_date,
                            task.end_date,
                            "Công việc chưa có mốc thời gian",
                            "Mốc thời gian công việc không hợp lệ",
                          ) ?? "Timeline/Gantt dùng ngày bắt đầu và ngày kết thúc của chính công việc."}
                        </p>
                        {taskTimelineAlignmentWarning ? (
                          <p className="text-[11px] text-amber-600">{taskTimelineAlignmentWarning}</p>
                        ) : null}
                      </div>

                      <div className="space-y-1">
                        <p className="text-slate-500">Khung thời gian của KR</p>
                        <p className="font-semibold text-slate-700">
                          {formatTimelineRangeVi(keyResult?.start_date ?? null, keyResult?.end_date ?? null, {
                            fallback: "KR chưa có mốc thời gian",
                          })}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-slate-500">Khung mục tiêu</p>
                        <p className="font-semibold text-slate-700">
                          {formatTimelineRangeVi(keyResult?.goal?.start_date ?? null, keyResult?.goal?.end_date ?? null, {
                            fallback: "Mục tiêu chưa có khung thời gian",
                          })}
                        </p>
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
                                  progress: getComputedTaskProgress(task),
                                }));
                                setProgressInput(String(getComputedTaskProgress(task)));
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
                        {keyResult?.name && keyResultHref ? (
                          <Link href={keyResultHref} className="text-right font-medium text-blue-700 hover:text-blue-800">
                            {keyResult.name}
                          </Link>
                        ) : (
                          <span className="text-right font-medium text-slate-700">
                            {keyResult?.name ?? "Chưa gắn"}
                          </span>
                        )}
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
