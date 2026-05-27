"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TaskMetaSidebar } from "@/components/tasks/task-detail/task-meta-sidebar";
import { TaskEvidenceSection } from "@/components/tasks/task-detail/task-evidence-section";
import { TaskOverviewCard } from "@/components/tasks/task-detail/task-overview-card";
import { CommentSection } from "@/components/comments/comment-section";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import type {
  GoalLiteRow,
  KeyResultLiteRow,
  ProfileLiteRow,
  TaskFormState,
  TaskRow,
  TaskDetailBreadcrumb,
} from "@/components/tasks/task-detail/types";
import {
  buildTaskFormState,
  clampProgress,
  formatDateTime,
} from "@/components/tasks/task-detail/utils";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  getTaskProgressByType,
  getTaskStatusByProgress,
} from "@/lib/constants/tasks";
import { normalizeKeyResultUnitForType } from "@/lib/constants/key-results";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";
import { formatTimelineRangeVi } from "@/lib/timeline";

const DEFAULT_FORM: TaskFormState = {
  name: "",
  assigneeId: "",
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
  const router = useRouter();
  const workspaceAccess = useWorkspaceAccess();
  const taskId = typeof params.taskId === "string" ? params.taskId : "";
  const canViewTaskPoints = workspaceAccess.canViewTaskPoints;
  const canManageTask = workspaceAccess.canManage && !workspaceAccess.error;

  const [task, setTask] = useState<TaskRow | null>(null);
  const [keyResult, setKeyResult] = useState<KeyResultLiteRow | null>(null);
  const [creatorName, setCreatorName] = useState("Chưa rõ");
  const [assigneeName, setAssigneeName] = useState("Chưa gán");
  const [assigneeOptions, setAssigneeOptions] = useState<ProfileLiteRow[]>([]);
  const [form, setForm] = useState<TaskFormState>(DEFAULT_FORM);
  const [progressInput, setProgressInput] = useState("0");

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [isEditingTaskInfo, setIsEditingTaskInfo] = useState(false);
  const [isEditingTaskProgress, setIsEditingTaskProgress] = useState(false);
  const [isSavingTaskInfo, setIsSavingTaskInfo] = useState(false);
  const [isSavingTaskProgress, setIsSavingTaskProgress] = useState(false);
  const [isDeletingTask, setIsDeletingTask] = useState(false);

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      setKeyResult(null);
      setForm(DEFAULT_FORM);
      setProgressInput("0");
      setCreatorName("Chưa rõ");
      setAssigneeName("Chưa gán");
      setAssigneeOptions([]);
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
      setIsEditingTaskProgress(false);
      setIsDeletingTask(false);

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

        const assigneeOptionsResult = await supabase
          .from("profiles")
          .select("id,name,email")
          .order("name", { ascending: true });

        if (!isActive) {
          return;
        }

        if (assigneeOptionsResult.error) {
          throw new Error(
            assigneeOptionsResult.error.message || "Không tải được danh sách nhân sự phụ trách.",
          );
        }

        setTask(normalizedTask);
        setKeyResult(nextKeyResult);
        setForm(nextForm);
        setProgressInput(String(nextForm.progress));
        setAssigneeOptions((assigneeOptionsResult.data ?? []) as ProfileLiteRow[]);

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
        setProgressInput("0");
        setCreatorName("Chưa rõ");
        setAssigneeName("Chưa gán");
        setAssigneeOptions([]);
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

  const hasTaskInfoChanges = useMemo(() => {
    if (!task) {
      return false;
    }

    return (
      form.name.trim() !== task.name ||
      form.assigneeId !== (task.assignee_id ?? task.profile_id ?? "") ||
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

  const hasTaskProgressChanges = useMemo(() => {
    if (!task) {
      return false;
    }

    return form.progress !== buildTaskFormState(task).progress;
  }, [form.progress, task]);

  const taskTimelineLabel = task
    ? formatTimelineRangeVi(task.start_date, task.end_date, {
        fallback: "Chưa đặt thời gian thực thi",
      })
    : "Chưa đặt thời gian thực thi";
  const effectiveAssigneeId = task?.assignee_id ?? task?.profile_id ?? null;
  const canCreateTaskEvidence =
    Boolean(workspaceAccess.profileId) &&
    (workspaceAccess.profileId === effectiveAssigneeId || workspaceAccess.hasRootLeaderAccess);

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

  const startTaskInfoEdit = () => {
    if (!task) {
      return;
    }

    resetTaskInfoDraft();
    setIsEditingTaskProgress(false);
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

  const startTaskProgressEdit = () => {
    if (!task) {
      return;
    }

    resetTaskInfoDraft();
    setIsEditingTaskInfo(false);
    setIsEditingTaskProgress(true);
    setActionError(null);
    setNotice(null);
  };

  const cancelTaskProgressEdit = () => {
    resetTaskInfoDraft();
    setIsEditingTaskProgress(false);
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
      const nextAssigneeId = form.assigneeId.trim();
      if (!nextAssigneeId) {
        throw new Error("Vui lòng chọn người phụ trách.");
      }

      const nextTarget = Number(form.target);
      const nextCurrent = getTaskCurrentFromProgress(form.progress, nextTarget);
      const { data: updatedTask, error } = await supabase
        .from("tasks")
        .update({
          assignee_id: nextAssigneeId,
          profile_id: nextAssigneeId,
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
      setAssigneeName(
        assigneeOptions.find((profile) => profile.id === nextAssigneeId)?.name?.trim() ||
          assigneeOptions.find((profile) => profile.id === nextAssigneeId)?.email?.trim() ||
          "Chưa gán",
      );
      setIsEditingTaskInfo(false);
      setNotice("Đã lưu thông tin công việc.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể lưu thông tin công việc.");
    } finally {
      setIsSavingTaskInfo(false);
    }
  };

  const handleSaveTaskProgress = async () => {
    if (!task || !hasTaskProgressChanges) {
      return;
    }

    setIsSavingTaskProgress(true);
    setActionError(null);
    setNotice(null);

    try {
      const persistedForm = buildTaskFormState(task);
      const nextTarget = Number(persistedForm.target);
      const nextCurrent = getTaskCurrentFromProgress(form.progress, nextTarget);

      const { data: updatedTask, error } = await supabase
        .from("tasks")
        .update({
          current: nextCurrent,
        })
        .eq("id", task.id)
        .select("*")
        .maybeSingle();

      if (error || !updatedTask) {
        if (error?.code === "42501") {
          throw new Error("Bạn không có quyền cập nhật tiến độ công việc.");
        }

        throw new Error(error?.message || "Không thể cập nhật tiến độ công việc.");
      }

      const nextTask = normalizeTaskRecord(updatedTask as TaskRow, {
        creatorProfileId: task.creator_profile_id ?? null,
        keyResult,
      });
      const nextForm = buildTaskFormState(nextTask);

      setTask(nextTask);
      setForm(nextForm);
      setProgressInput(String(nextForm.progress));
      setIsEditingTaskProgress(false);
      setNotice("Đã cập nhật tiến độ công việc.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể cập nhật tiến độ công việc.");
    } finally {
      setIsSavingTaskProgress(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!task || isDeletingTask) {
      return;
    }

    const confirmed = window.confirm(`Xóa công việc "${task.name}"?`);
    if (!confirmed) {
      return;
    }

    setIsDeletingTask(true);
    setActionError(null);
    setNotice(null);

    try {
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);

      if (error) {
        if (error.code === "42501") {
          throw new Error("Bạn không có quyền xóa công việc này.");
        }

        throw new Error(error.message || "Không thể xóa công việc.");
      }

      router.push("/tasks");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể xóa công việc.");
      setIsDeletingTask(false);
    }
  };

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
                    taskId={task.id}
                    progress={form.progress}
                    keyResultName={keyResult?.name ?? null}
                    keyResultHref={keyResultHref}
                    form={form}
                    assigneeOptions={assigneeOptions}
                    isEditing={isEditingTaskInfo}
                    isEditingProgress={isEditingTaskProgress}
                    canManage={canManageTask}
                    isSavingTaskInfo={isSavingTaskInfo}
                    isSavingTaskProgress={isSavingTaskProgress}
                    isDeletingTask={isDeletingTask}
                    canSaveEdit={hasTaskInfoChanges}
                    canSaveProgress={hasTaskProgressChanges}
                    progressInput={progressInput}
                    onStartEdit={startTaskInfoEdit}
                    onCancelEdit={cancelTaskInfoEdit}
                    onSaveEdit={() => void handleSaveTaskInfo()}
                    onStartProgressEdit={startTaskProgressEdit}
                    onCancelProgressEdit={cancelTaskProgressEdit}
                    onSaveProgress={() => void handleSaveTaskProgress()}
                    onDelete={() => void handleDeleteTask()}
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
                    onNameChange={(value) => setForm((current) => ({ ...current, name: value }))}
                    onAssigneeChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        assigneeId: value,
                      }))
                    }
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
                  />

                  <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
                    <h2 className="text-base font-semibold text-slate-900">Mô tả</h2>
                    {isEditingTaskInfo ? (
                      <textarea
                        rows={5}
                        value={form.description}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, description: event.target.value }))
                        }
                        className="mt-4 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        placeholder="Mô tả ngắn những gì cần làm"
                      />
                    ) : (
                      <p className="mt-3 text-sm leading-relaxed text-slate-700">
                        {form.description.trim() || "Chưa có mô tả."}
                      </p>
                    )}
                  </article>

                  <TaskEvidenceSection
                    taskId={task.id}
                    currentProfileId={workspaceAccess.profileId}
                    canCreateEvidence={canCreateTaskEvidence}
                  />

                  <CommentSection
                    entityType="task"
                    entityId={task.id}
                    currentProfileId={workspaceAccess.profileId}
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
