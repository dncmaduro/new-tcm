"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LinkedKRCard } from "@/components/tasks/task-detail/linked-kr-card";
import { TaskExecutionSection } from "@/components/tasks/task-detail/task-execution-section";
import { TaskMetaSidebar } from "@/components/tasks/task-detail/task-meta-sidebar";
import { TaskNotesCard } from "@/components/tasks/task-detail/task-notes-card";
import { TaskOverviewCard } from "@/components/tasks/task-detail/task-overview-card";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import type {
  GoalLiteRow,
  KeyResultLiteRow,
  ProfileLiteRow,
  TaskFormState,
  TaskRow,
  TaskTimelineFormState,
  TaskDetailBreadcrumb,
} from "@/components/tasks/task-detail/types";
import {
  buildTaskFormState,
  buildTaskTimelineForm,
  clampProgress,
  formatDateTime,
} from "@/components/tasks/task-detail/utils";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  getTaskProgressByType,
  getTaskStatusByProgress,
} from "@/lib/constants/tasks";
import { normalizeKeyResultUnitForType } from "@/lib/constants/key-results";
import { buildKeyResultProgressMap } from "@/lib/okr";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";
import {
  formatTimelineRangeVi,
  getTimelineOutsideParentWarning,
  isDateRangeOrdered,
} from "@/lib/timeline";

const DEFAULT_FORM: TaskFormState = {
  name: "",
  description: "",
  note: "",
  isRecurring: false,
  hypothesis: "",
  result: "",
  type: "kpi",
  priority: "medium",
  status: "todo",
  unit: "count",
  target: "",
  progress: 0,
  weight: 1,
};

const DEFAULT_TIMELINE_FORM: TaskTimelineFormState = {
  startDate: "",
  endDate: "",
};

const toNumber = (value: unknown, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getTaskCurrentFromProgress = (
  progress: number | null | undefined,
  target: number | null | undefined,
) => {
  const safeTarget = Number.isFinite(target) ? Number(target) : 0;
  if (safeTarget <= 0) {
    return 0;
  }

  const safeProgress = clampProgress(progress);
  return Math.round(((safeProgress * safeTarget) / 100) * 100) / 100;
};

const normalizeGoalLite = (value: unknown): GoalLiteRow | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (!record.id || !record.name) {
    return null;
  }

  return {
    id: String(record.id),
    name: String(record.name),
    type: record.type ? String(record.type) : null,
    start_date: record.start_date ? String(record.start_date) : null,
    end_date: record.end_date ? String(record.end_date) : null,
  };
};

const normalizeKeyResultLite = (value: unknown): KeyResultLiteRow | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (!record.id || !record.name) {
    return null;
  }

  const rawGoal = Array.isArray(record.goal) ? (record.goal[0] ?? null) : (record.goal ?? null);

  return {
    id: String(record.id),
    goal_id: record.goal_id ? String(record.goal_id) : null,
    name: String(record.name),
    type: record.type ? String(record.type) : null,
    contribution_type: record.contribution_type ? String(record.contribution_type) : null,
    current: toNumber(record.current, 0),
    start_value: toNumber(record.start_value, 0),
    target: toNumber(record.target, 0),
    unit: record.unit ? String(record.unit) : null,
    weight: toNumber(record.weight, 1),
    start_date: record.start_date ? String(record.start_date) : null,
    end_date: record.end_date ? String(record.end_date) : null,
    goal: normalizeGoalLite(rawGoal),
  };
};

const normalizeTaskRecord = (
  value: TaskRow,
  options?: {
    creatorProfileId?: string | null;
    keyResult?: KeyResultLiteRow | null;
  },
): TaskRow => {
  const rawKeyResult = Array.isArray((value as TaskRow & { key_result?: unknown }).key_result)
    ? ((value as TaskRow & { key_result?: Array<Record<string, unknown>> }).key_result?.[0] ?? null)
    : ((value as TaskRow & { key_result?: Record<string, unknown> | null }).key_result ?? null);

  return {
    ...value,
    assignee_id: value.assignee_id ? String(value.assignee_id) : null,
    profile_id: value.profile_id ? String(value.profile_id) : null,
    creator_profile_id: value.creator_profile_id
      ? String(value.creator_profile_id)
      : (options?.creatorProfileId ?? null),
    unit: value.unit ? String(value.unit) : null,
    current:
      value.current === null || value.current === undefined
        ? null
        : typeof value.current === "number"
          ? value.current
          : Number(value.current),
    target:
      value.target === null || value.target === undefined
        ? null
        : typeof value.target === "number"
          ? value.target
          : Number(value.target),
    key_result: normalizeKeyResultLite(rawKeyResult) ?? options?.keyResult ?? null,
  };
};

export default function TaskDetailPage() {
  const params = useParams<{ taskId: string }>();
  const workspaceAccess = useWorkspaceAccess();
  const taskId = typeof params.taskId === "string" ? params.taskId : "";
  const canViewTaskPoints = workspaceAccess.canViewTaskPoints;

  const [task, setTask] = useState<TaskRow | null>(null);
  const [keyResult, setKeyResult] = useState<KeyResultLiteRow | null>(null);
  const [creatorName, setCreatorName] = useState("Chưa rõ");
  const [assigneeName, setAssigneeName] = useState("Chưa gán");
  const [form, setForm] = useState<TaskFormState>(DEFAULT_FORM);
  const [taskTimelineForm, setTaskTimelineForm] =
    useState<TaskTimelineFormState>(DEFAULT_TIMELINE_FORM);
  const [progressInput, setProgressInput] = useState("0");

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [isEditingTaskInfo, setIsEditingTaskInfo] = useState(false);
  const [isEditingTaskTimeline, setIsEditingTaskTimeline] = useState(false);
  const [isSavingTaskInfo, setIsSavingTaskInfo] = useState(false);
  const [isSavingTaskTimeline, setIsSavingTaskTimeline] = useState(false);

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      setKeyResult(null);
      setForm(DEFAULT_FORM);
      setTaskTimelineForm(DEFAULT_TIMELINE_FORM);
      setProgressInput("0");
      setCreatorName("Chưa rõ");
      setAssigneeName("Chưa gán");
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
      setIsEditingTaskTimeline(false);

      try {
        const { data: taskData, error: taskError } = await supabase
          .from("tasks")
          .select(
            `
            id,
            key_result_id,
            assignee_id,
            profile_id,
            creator_profile_id,
            type,
            name,
            description,
            current,
            priority,
            weight,
            unit,
            target,
            note,
            is_recurring,
            hypothesis,
            result,
            start_date,
            end_date,
            created_at,
            updated_at,
            key_result:key_results!tasks_key_result_id_fkey(
              id,
              goal_id,
              name,
              type,
              contribution_type,
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
                type,
                start_date,
                end_date
              )
            )
          `,
          )
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

        if (!taskData) {
          throw new Error("Không tìm thấy công việc.");
        }

        const normalizedTask = normalizeTaskRecord(taskData as unknown as TaskRow);
        const nextKeyResult = normalizedTask.key_result ?? null;
        const nextForm = buildTaskFormState(normalizedTask);

        setTask(normalizedTask);
        setKeyResult(nextKeyResult);
        setForm(nextForm);
        setProgressInput(String(nextForm.progress));
        setTaskTimelineForm(buildTaskTimelineForm(normalizedTask, nextKeyResult));

        const creatorProfileId = normalizedTask.creator_profile_id ?? null;
        const effectiveAssigneeId = normalizedTask.assignee_id ?? normalizedTask.profile_id;
        const uniqueProfileIds = [
          ...new Set([effectiveAssigneeId, creatorProfileId].filter(Boolean)),
        ] as string[];

        const profilesResult =
          uniqueProfileIds.length > 0
            ? await supabase.from("profiles").select("id,name,email").in("id", uniqueProfileIds)
            : { data: [], error: null };

        if (!isActive) {
          return;
        }

        const profileNameById = ((profilesResult.data ?? []) as ProfileLiteRow[]).reduce<
          Record<string, string>
        >((acc, profile) => {
          const label = profile.name?.trim() || profile.email?.trim() || "Chưa rõ";
          acc[String(profile.id)] = label;
          return acc;
        }, {});

        setCreatorName(
          creatorProfileId ? (profileNameById[creatorProfileId] ?? "Chưa rõ") : "Chưa rõ",
        );
        setAssigneeName(
          effectiveAssigneeId ? (profileNameById[effectiveAssigneeId] ?? "Chưa gán") : "Chưa gán",
        );
      } catch (error) {
        if (!isActive) {
          return;
        }

        setTask(null);
        setKeyResult(null);
        setForm(DEFAULT_FORM);
        setTaskTimelineForm(DEFAULT_TIMELINE_FORM);
        setProgressInput("0");
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

  const goalName = keyResult?.goal?.name ?? "Chưa có mục tiêu";
  const goalHref = keyResult?.goal_id ? `/goals/${keyResult.goal_id}` : null;
  const keyResultHref =
    keyResult?.id && keyResult.goal_id
      ? `/goals/${keyResult.goal_id}/key-results/${keyResult.id}`
      : null;

  const keyResultProgress = useMemo(() => {
    if (!keyResult) {
      return 0;
    }

    return (
      buildKeyResultProgressMap([
        {
          id: keyResult.id,
          goal_id: keyResult.goal_id,
          start_value: keyResult.start_value,
          current: keyResult.current,
          target: keyResult.target,
        },
      ])[keyResult.id] ?? 0
    );
  }, [keyResult]);

  const hasTaskInfoChanges = useMemo(() => {
    if (!task) {
      return false;
    }

    return (
      form.name.trim() !== task.name ||
      form.description.trim() !== (task.description ?? "") ||
      form.note.trim() !== (task.note ?? "") ||
      form.isRecurring !== Boolean(task.is_recurring) ||
      form.hypothesis.trim() !== (task.hypothesis ?? "") ||
      form.result.trim() !== (task.result ?? "") ||
      form.type !== (task.type === "okr" ? "okr" : "kpi") ||
      form.priority !== (task.priority ?? "medium") ||
      form.unit !== normalizeKeyResultUnitForType(task.type, task.unit) ||
      form.target !==
        ((task.type === "okr"
          ? "100"
          : Number.isFinite(task.target)
            ? String(Number(task.target))
            : "") as string)
    );
  }, [form, task]);

  const taskTimelineInputError = useMemo(() => {
    if (
      (taskTimelineForm.startDate && !taskTimelineForm.endDate) ||
      (!taskTimelineForm.startDate && taskTimelineForm.endDate)
    ) {
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
        isEditingTaskTimeline ? taskTimelineForm.startDate || null : (task?.start_date ?? null),
        isEditingTaskTimeline ? taskTimelineForm.endDate || null : (task?.end_date ?? null),
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

  const taskTimelineLabel = task
    ? formatTimelineRangeVi(task.start_date, task.end_date, {
        fallback: "Chưa đặt thời gian thực thi",
      })
    : "Chưa đặt thời gian thực thi";

  const breadcrumbs: TaskDetailBreadcrumb[] = [
    { label: "Công việc", href: "/tasks" },
    ...(goalHref ? [{ label: goalName, href: goalHref }] : []),
    ...(keyResultHref && keyResult ? [{ label: keyResult.name, href: keyResultHref }] : []),
    { label: task?.name ?? "Chi tiết công việc" },
  ];

  const resetTaskInfoDraft = () => {
    if (!task) {
      return;
    }

    const nextForm = buildTaskFormState(task);
    setForm(nextForm);
    setProgressInput(String(nextForm.progress));
  };

  const resetTimelineDraft = () => {
    setTaskTimelineForm(buildTaskTimelineForm(task, keyResult));
  };

  const startTaskInfoEdit = () => {
    if (!task) {
      return;
    }

    resetTaskInfoDraft();
    setIsEditingTaskInfo(true);
    setActionError(null);
    setNotice(null);
  };

  const cancelTaskInfoEdit = () => {
    resetTaskInfoDraft();
    setIsEditingTaskInfo(false);
    setActionError(null);
    setNotice(null);
  };

  const startTimelineEdit = () => {
    resetTimelineDraft();
    setIsEditingTaskTimeline(true);
    setActionError(null);
    setNotice(null);
  };

  const cancelTimelineEdit = () => {
    resetTimelineDraft();
    setIsEditingTaskTimeline(false);
    setActionError(null);
    setNotice(null);
  };

  const handleSaveTaskInfo = async () => {
    if (!task || !hasTaskInfoChanges) {
      return;
    }

    if (!form.name.trim()) {
      setActionError("Tên công việc không được để trống.");
      setNotice(null);
      return;
    }
    if (!Number.isFinite(Number(form.target)) || Number(form.target) <= 0) {
      setActionError("Chỉ tiêu cần đạt phải lớn hơn 0.");
      setNotice(null);
      return;
    }

    setIsSavingTaskInfo(true);
    setActionError(null);
    setNotice(null);

    try {
      const nextTarget = Number(form.target);
      const nextCurrent = getTaskCurrentFromProgress(form.progress, nextTarget);
      const { data: updatedTask, error } = await supabase
        .from("tasks")
        .update({
          name: form.name.trim(),
          description: form.description.trim() || null,
          note: form.note.trim() || null,
          is_recurring: form.isRecurring,
          hypothesis: form.hypothesis.trim() || null,
          result: form.result.trim() || null,
          type: form.type,
          priority: form.priority,
          current: nextCurrent,
          unit: form.unit,
          target: nextTarget,
        })
        .eq("id", task.id)
        .select("*")
        .maybeSingle();

      if (error || !updatedTask) {
        if (error?.code === "42501") {
          throw new Error("Bạn không có quyền chỉnh sửa công việc này.");
        }

        throw new Error(error?.message || "Không thể lưu thay đổi công việc.");
      }

      const nextTask = normalizeTaskRecord(updatedTask as TaskRow, {
        creatorProfileId: task.creator_profile_id ?? null,
        keyResult,
      });
      const nextForm = buildTaskFormState(nextTask);

      setTask(nextTask);
      setForm(nextForm);
      setProgressInput(String(nextForm.progress));
      setIsEditingTaskInfo(false);
      setNotice("Đã lưu thông tin công việc.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể lưu thông tin công việc.");
    } finally {
      setIsSavingTaskInfo(false);
    }
  };

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

      if (error || !updatedTask) {
        if (error?.code === "42501") {
          throw new Error("Bạn không có quyền cập nhật thời gian thực thi công việc.");
        }

        throw new Error(error?.message || "Không thể cập nhật thời gian thực thi công việc.");
      }

      const nextTask = normalizeTaskRecord(updatedTask as TaskRow, {
        creatorProfileId: task.creator_profile_id ?? null,
        keyResult,
      });

      setTask(nextTask);
      setTaskTimelineForm(buildTaskTimelineForm(nextTask, keyResult));
      setIsEditingTaskTimeline(false);
      setNotice("Đã cập nhật thời gian thực thi công việc.");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Không thể cập nhật thời gian thực thi công việc.",
      );
    } finally {
      setIsSavingTaskTimeline(false);
    }
  };

  const primaryAction = task
    ? isEditingTaskInfo
      ? {
          label: isSavingTaskInfo ? "Đang lưu..." : "Lưu thay đổi",
          onClick: () => void handleSaveTaskInfo(),
          disabled: !hasTaskInfoChanges || isSavingTaskInfo,
        }
      : {
          label: "Chỉnh sửa",
          onClick: startTaskInfoEdit,
        }
    : undefined;

  const secondaryAction = task
    ? isEditingTaskInfo
      ? {
          label: "Hủy",
          onClick: cancelTaskInfoEdit,
          disabled: isSavingTaskInfo,
          variant: "outline" as const,
        }
      : undefined
    : undefined;

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="tasks" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader
            title={task?.name ?? "Chi tiết công việc"}
            items={breadcrumbs.map((item) => ({ label: item.label, href: item.href }))}
          />

          <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-5 lg:px-7">
            {(secondaryAction || primaryAction) ? (
              <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
                {secondaryAction ? (
                  <button
                    type="button"
                    onClick={secondaryAction.onClick}
                    disabled={secondaryAction.disabled}
                    className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {secondaryAction.label}
                  </button>
                ) : null}
                {primaryAction ? (
                  <button
                    type="button"
                    onClick={primaryAction.onClick}
                    disabled={primaryAction.disabled}
                    className="inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                  >
                    {primaryAction.label}
                  </button>
                ) : null}
              </div>
            ) : null}

            {isLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
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
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-6">
                  <TaskOverviewCard
                    form={form}
                    assigneeName={assigneeName}
                    creatorName={creatorName}
                    timelineLabel={taskTimelineLabel}
                    isEditing={isEditingTaskInfo}
                    showTaskPoints={canViewTaskPoints}
                    onNameChange={(value) => setForm((current) => ({ ...current, name: value }))}
                    onTypeChange={(value) => {
                      const nextProgress = getTaskProgressByType(value, form.status, form.progress);
                      setForm((current) => ({
                        ...current,
                        type: value,
                        unit: normalizeKeyResultUnitForType(value, current.unit),
                        target: value === "okr" ? "100" : current.target,
                        status: getTaskStatusByProgress(nextProgress),
                        progress: nextProgress,
                      }));
                      setProgressInput(String(nextProgress));
                    }}
                    onPriorityChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        priority: value,
                      }))
                    }
                    onUnitChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        unit: value,
                      }))
                    }
                    onTargetChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        target: value,
                      }))
                    }
                    onRecurringChange={(value) =>
                      setForm((current) => ({ ...current, isRecurring: value }))
                    }
                  />

                  <TaskExecutionSection
                    task={task}
                    keyResult={keyResult}
                    form={form}
                    progressInput={progressInput}
                    showTaskPoints={canViewTaskPoints}
                    taskTimelineForm={taskTimelineForm}
                    isEditingTaskInfo={isEditingTaskInfo}
                    isEditingExecution={false}
                    isEditingTaskTimeline={isEditingTaskTimeline}
                    isSavingTaskTimeline={isSavingTaskTimeline}
                    taskTimelineInputError={taskTimelineInputError}
                    taskTimelineAlignmentWarning={taskTimelineAlignmentWarning}
                    onDescriptionChange={(value) =>
                      setForm((current) => ({ ...current, description: value }))
                    }
                    onHypothesisChange={(value) =>
                      setForm((current) => ({ ...current, hypothesis: value }))
                    }
                    onResultChange={(value) =>
                      setForm((current) => ({ ...current, result: value }))
                    }
                    onProgressInputChange={(value) => {
                      setProgressInput(value);

                      if (value === "") {
                        return;
                      }

                      const parsed = Number(value);
                      if (!Number.isFinite(parsed)) {
                        return;
                      }

                      setForm((current) => ({
                        ...current,
                        progress: clampProgress(parsed),
                      }));
                    }}
                    onProgressInputBlur={() => {
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
                      setForm((current) => ({
                        ...current,
                        progress: normalized,
                      }));
                      setProgressInput(String(normalized));
                    }}
                    onStartTimelineEdit={startTimelineEdit}
                    onCancelTimelineEdit={cancelTimelineEdit}
                    onSaveTimeline={() => void handleSaveTaskTimeline()}
                    onTimelineStartChange={(value) =>
                      setTaskTimelineForm((current) => ({
                        ...current,
                        startDate: value,
                      }))
                    }
                    onTimelineEndChange={(value) =>
                      setTaskTimelineForm((current) => ({
                        ...current,
                        endDate: value,
                      }))
                    }
                  />

                  {!form.description.trim() ? (
                    <TaskNotesCard
                      note={form.note}
                      isEditing={isEditingTaskInfo}
                      onChange={(value) => setForm((current) => ({ ...current, note: value }))}
                    />
                  ) : null}

                  <LinkedKRCard
                    keyResult={keyResult}
                    keyResultHref={keyResultHref}
                    goalHref={goalHref}
                    goalName={goalName}
                    keyResultProgress={keyResultProgress}
                  />
                </div>

                <TaskMetaSidebar
                  progress={form.progress}
                  priority={form.priority}
                  showTaskPoints={canViewTaskPoints}
                  assigneeName={assigneeName}
                  timelineLabel={taskTimelineLabel}
                  goalName={goalName}
                  goalHref={goalHref}
                  keyResultName={keyResult?.name ?? null}
                  keyResultHref={keyResultHref}
                  creatorName={creatorName}
                  createdAtLabel={formatDateTime(task.created_at)}
                  updatedAtLabel={formatDateTime(task.updated_at)}
                />
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
