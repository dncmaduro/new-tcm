"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  formatKeyResultMetric,
  formatKeyResultUnit,
  getKeyResultProgressHint,
} from "@/lib/constants/key-results";
import { TASK_STATUSES, TASK_TYPES } from "@/lib/constants/tasks";
import { buildKeyResultProgressMap, computeWeightedProgress, getComputedTaskProgress } from "@/lib/okr";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";
import {
  formatTimelineRangeVi,
  getTimelineMissingReason,
  getTimelineOutsideParentWarning,
} from "@/lib/timeline";

type GoalRow = {
  id: string;
  name: string;
  department_id: string | null;
  parent_goal_id: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type KeyResultDetailRow = {
  id: string;
  goal_id: string;
  name: string;
  description: string | null;
  start_value: number | null;
  target: number | null;
  current: number | null;
  unit: string | null;
  weight: number | null;
  responsible_department_id: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type GoalBreadcrumbItem = {
  id: string;
  name: string;
};

type GoalAncestorRow = {
  id: string;
  name: string;
  parent_goal_id: string | null;
};

type DepartmentRow = {
  id: string;
  name: string;
};

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type TaskRow = {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  progress: number | null;
  weight: number | null;
  profile_id: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type KeyResultTaskItem = {
  id: string;
  name: string;
  type: string | null;
  typeLabel: string;
  rawStatus: string | null;
  status: string;
  progress: number;
  weight: number;
  profileId: string | null;
  assigneeName: string;
  startDate: string | null;
  endDate: string | null;
};

const taskStatusLabelMap = TASK_STATUSES.reduce<Record<string, string>>((acc, status) => {
  acc[status.value] = status.label;
  return acc;
}, {});

const taskTypeLabelMap = TASK_TYPES.reduce<Record<string, string>>((acc, type) => {
  acc[type.value] = type.label;
  return acc;
}, {});

const taskStatusBadgeClassMap: Record<string, string> = {
  todo: "bg-slate-100 text-slate-700",
  doing: "bg-blue-50 text-blue-700",
  done: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-rose-50 text-rose-700",
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
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const loadGoalAncestors = async (parentGoalId: string | null) => {
  if (!parentGoalId) {
    return [] as GoalBreadcrumbItem[];
  }

  const ancestors: GoalBreadcrumbItem[] = [];
  const visitedGoalIds = new Set<string>();
  let currentGoalId: string | null = parentGoalId;

  while (currentGoalId && !visitedGoalIds.has(currentGoalId)) {
    visitedGoalIds.add(currentGoalId);

    const ancestorResponse = await supabase
      .from("goals")
      .select("id,name,parent_goal_id")
      .eq("id", currentGoalId)
      .maybeSingle();

    const ancestorData = ancestorResponse.data as GoalAncestorRow | null;

    if (ancestorResponse.error || !ancestorData?.id || !ancestorData?.name) {
      break;
    }

    ancestors.unshift({
      id: String(ancestorData.id),
      name: String(ancestorData.name),
    });

    currentGoalId = ancestorData.parent_goal_id ? String(ancestorData.parent_goal_id) : null;
  }

  return ancestors;
};

export default function KeyResultDetailPage() {
  const params = useParams<{ goalId: string; keyResultId: string }>();
  const searchParams = useSearchParams();
  const workspaceAccess = useWorkspaceAccess();
  const goalId = typeof params.goalId === "string" ? params.goalId : "";
  const keyResultId = typeof params.keyResultId === "string" ? params.keyResultId : "";
  const hasValidParams = Boolean(goalId && keyResultId);

  const [goal, setGoal] = useState<GoalRow | null>(null);
  const [keyResult, setKeyResult] = useState<KeyResultDetailRow | null>(null);
  const [goalAncestors, setGoalAncestors] = useState<GoalBreadcrumbItem[]>([]);
  const [goalDepartmentName, setGoalDepartmentName] = useState<string | null>(null);
  const [responsibleDepartmentName, setResponsibleDepartmentName] = useState<string | null>(null);
  const [tasks, setTasks] = useState<KeyResultTaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [taskLoadError, setTaskLoadError] = useState<string | null>(null);
  const [editingTaskWeightId, setEditingTaskWeightId] = useState<string | null>(null);
  const [taskWeightDraft, setTaskWeightDraft] = useState("1");
  const [savingTaskWeightId, setSavingTaskWeightId] = useState<string | null>(null);

  const isCheckingCreatePermission = workspaceAccess.isLoading;
  const canCreateTask = workspaceAccess.canManage && !workspaceAccess.error;
  const createdNotice =
    searchParams.get("created") === "1"
      ? "Đã tạo key result."
      : searchParams.get("taskCreated") === "1"
        ? "Đã tạo công việc và gắn vào key result."
        : null;

  useEffect(() => {
    if (!hasValidParams) {
      return;
    }

    let isActive = true;

    const loadData = async () => {
      setIsLoading(true);
      setLoadError(null);
      setTaskLoadError(null);
      setGoalAncestors([]);

      const [{ data: goalData, error: goalError }, { data: keyResultData, error: keyResultError }] = await Promise.all([
        supabase
          .from("goals")
          .select("id,name,department_id,parent_goal_id,start_date,end_date,created_at,updated_at")
          .eq("id", goalId)
          .maybeSingle(),
        supabase
          .from("key_results")
          .select(
            "id,goal_id,name,description,start_value,target,current,unit,weight,responsible_department_id,start_date,end_date,created_at,updated_at",
          )
          .eq("id", keyResultId)
          .eq("goal_id", goalId)
          .maybeSingle(),
      ]);

      if (!isActive) {
        return;
      }

      if (goalError || !goalData) {
        setGoal(null);
        setKeyResult(null);
        setGoalDepartmentName(null);
        setResponsibleDepartmentName(null);
        setTasks([]);
        setLoadError(goalError?.message || "Không tải được mục tiêu liên kết.");
        setIsLoading(false);
        return;
      }

      if (keyResultError || !keyResultData) {
        setGoal(goalData as GoalRow);
        setKeyResult(null);
        setGoalDepartmentName(null);
        setResponsibleDepartmentName(null);
        setTasks([]);
        setLoadError(keyResultError?.message || "Không tìm thấy key result.");
        setIsLoading(false);
        return;
      }

      const typedGoal = goalData as GoalRow;
      const typedKeyResult = {
        ...(keyResultData as KeyResultDetailRow),
        id: String(keyResultData.id),
        goal_id: String(keyResultData.goal_id),
        responsible_department_id: keyResultData.responsible_department_id
          ? String(keyResultData.responsible_department_id)
          : null,
      } satisfies KeyResultDetailRow;

      setGoal(typedGoal);
      setKeyResult(typedKeyResult);

      const [{ data: tasksData, error: tasksError }, ancestorItems, { data: departmentsData }] = await Promise.all([
        supabase
          .from("tasks")
          .select("id,name,type,status,progress,weight,profile_id,start_date,end_date,created_at,updated_at")
          .eq("key_result_id", typedKeyResult.id)
          .order("created_at", { ascending: false }),
        typedGoal.parent_goal_id
          ? loadGoalAncestors(String(typedGoal.parent_goal_id))
          : Promise.resolve([] as GoalBreadcrumbItem[]),
        Array.from(new Set([typedGoal.department_id, typedKeyResult.responsible_department_id].filter(Boolean))).length > 0
          ? supabase
              .from("departments")
              .select("id,name")
              .in(
                "id",
                Array.from(new Set([typedGoal.department_id, typedKeyResult.responsible_department_id].filter(Boolean))),
              )
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (!isActive) {
        return;
      }

      setGoalAncestors(ancestorItems);

      const departmentNameById = ((departmentsData ?? []) as DepartmentRow[]).reduce<Record<string, string>>(
        (acc, department) => {
          acc[String(department.id)] = String(department.name);
          return acc;
        },
        {},
      );

      setGoalDepartmentName(
        typedGoal.department_id ? departmentNameById[typedGoal.department_id] ?? "Phòng ban" : null,
      );
      setResponsibleDepartmentName(
        typedKeyResult.responsible_department_id
          ? departmentNameById[typedKeyResult.responsible_department_id] ?? "Phòng ban phụ trách"
          : null,
      );

      if (tasksError) {
        setTasks([]);
        setTaskLoadError("Không tải được danh sách công việc của key result.");
        setIsLoading(false);
        return;
      }

      const typedTasks = ((tasksData ?? []) as TaskRow[]).map((task) => ({
        ...task,
        id: String(task.id),
        profile_id: task.profile_id ? String(task.profile_id) : null,
      }));

      const profileIds = [...new Set(typedTasks.map((task) => task.profile_id).filter(Boolean))] as string[];
      let profileNameById: Record<string, string> = {};

      if (profileIds.length > 0) {
        const { data: profilesData } = await supabase.from("profiles").select("id,name,email").in("id", profileIds);

        if (!isActive) {
          return;
        }

        profileNameById = ((profilesData ?? []) as ProfileRow[]).reduce<Record<string, string>>((acc, profile) => {
          acc[String(profile.id)] = profile.name?.trim() || profile.email?.trim() || "Chưa gán";
          return acc;
        }, {});
      }

      setTasks(
        typedTasks.map((task) => ({
          id: task.id,
          name: String(task.name),
          type: task.type ? String(task.type) : null,
          typeLabel: task.type ? taskTypeLabelMap[task.type] ?? task.type : "KPI",
          rawStatus: task.status ? String(task.status) : null,
          status: task.status ? taskStatusLabelMap[task.status] ?? task.status : "Chưa đặt",
          progress: getComputedTaskProgress(task),
          weight: typeof task.weight === "number" ? task.weight : Number(task.weight ?? 1),
          profileId: task.profile_id,
          assigneeName: task.profile_id ? profileNameById[task.profile_id] ?? "Chưa gán" : "Chưa gán",
          startDate: task.start_date ? String(task.start_date) : null,
          endDate: task.end_date ? String(task.end_date) : null,
        })),
      );

      setIsLoading(false);
    };

    void loadData();

    return () => {
      isActive = false;
    };
  }, [goalId, hasValidParams, keyResultId]);

  const keyResultProgressMap = useMemo(() => {
    if (!keyResult) {
      return {};
    }

    return buildKeyResultProgressMap(
      [keyResult],
      tasks.map((task) => ({
        keyResultId: keyResult.id,
        type: task.type,
        status: task.rawStatus,
        progress: task.progress,
        weight: task.weight,
      })),
    );
  }, [keyResult, tasks]);

  const keyResultProgress = useMemo(() => {
    if (!keyResult) {
      return 0;
    }
    return keyResultProgressMap[keyResult.id] ?? 0;
  }, [keyResult, keyResultProgressMap]);

  const averageTaskProgress = useMemo(() => computeWeightedProgress(tasks), [tasks]);
  const totalTaskWeight = useMemo(
    () => Math.round(tasks.reduce((sum, task) => sum + (Number.isFinite(task.weight) ? task.weight : 0), 0)),
    [tasks],
  );
  const isTaskWeightBalanced = totalTaskWeight === 100;
  const taskCompletionRate = useMemo(() => {
    if (!tasks.length) {
      return 0;
    }

    const doneCount = tasks.filter((task) => task.rawStatus === "done").length;
    return Math.round((doneCount / tasks.length) * 100);
  }, [tasks]);

  const tasksByStatus = useMemo(
    () =>
      TASK_STATUSES.map((status) => ({
        value: status.value,
        label: status.label,
        count: tasks.filter((task) => task.rawStatus === status.value).length,
      })),
    [tasks],
  );

  const goalHref = goal ? `/goals/${goal.id}` : "/goals";
  const createTaskHref = useMemo(() => {
    if (!hasValidParams) {
      return "/tasks/new";
    }

    const query = new URLSearchParams({
      goalId,
      keyResultId,
    });

    const departmentId = keyResult?.responsible_department_id ?? goal?.department_id ?? null;
    if (departmentId) {
      query.set("departmentId", departmentId);
    }

    return `/tasks/new?${query.toString()}`;
  }, [goal, goalId, hasValidParams, keyResult, keyResultId]);

  const progressHint = keyResult ? getKeyResultProgressHint(keyResult.unit) : "";

  const openTaskWeightEditor = (task: KeyResultTaskItem) => {
    setEditingTaskWeightId(task.id);
    setTaskWeightDraft(String(Math.round(task.weight)));
    setTaskLoadError(null);
  };

  const cancelTaskWeightEditor = () => {
    setEditingTaskWeightId(null);
    setTaskWeightDraft("1");
  };

  const handleSaveTaskWeight = async (task: KeyResultTaskItem) => {
    if (savingTaskWeightId) {
      return;
    }

    const safeWeight = Number(taskWeightDraft);
    if (!Number.isFinite(safeWeight) || safeWeight <= 0) {
      setTaskLoadError("Trọng số công việc phải lớn hơn 0.");
      return;
    }

    setTaskLoadError(null);
    setSavingTaskWeightId(task.id);

    const updateResult = await supabase
      .from("tasks")
      .update({ weight: Math.round(safeWeight) })
      .eq("id", task.id);

    if (updateResult.error) {
      setTaskLoadError(updateResult.error.message || "Không thể cập nhật trọng số công việc.");
      setSavingTaskWeightId(null);
      return;
    }

    setTasks((prev) =>
      prev.map((item) =>
        item.id === task.id
          ? {
              ...item,
              weight: Math.round(safeWeight),
            }
          : item,
      ),
    );
    setEditingTaskWeightId(null);
    setTaskWeightDraft("1");
    setSavingTaskWeightId(null);
  };

  return (
    <div className="h-screen overflow-hidden bg-[#f3f5fa] text-slate-900">
      <div className="flex h-full w-full">
        <WorkspaceSidebar active="goals" />

        <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden lg:pl-[var(--workspace-sidebar-width)]">
          <header className="border-b border-slate-200 bg-[#f3f5fa] px-4 py-4 lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                <Link href="/goals" className="hover:text-slate-700">
                  Mục tiêu
                </Link>
                {goalAncestors.map((ancestor) => (
                  <Fragment key={ancestor.id}>
                    <span className="px-2">›</span>
                    <Link href={`/goals/${ancestor.id}`} className="hover:text-slate-700">
                      Mục tiêu: {ancestor.name}
                    </Link>
                  </Fragment>
                ))}
                {goal ? (
                  <>
                    <span className="px-2">›</span>
                    <Link href={goalHref} className="hover:text-slate-700">
                      Mục tiêu: {goal.name}
                    </Link>
                  </>
                ) : null}
                <span className="px-2">›</span>
                <span className="font-semibold text-slate-700">
                  KR: {keyResult?.name ?? "Chi tiết key result"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {workspaceAccess.canManage && !workspaceAccess.error && keyResult ? (
                  <Link
                    href={createTaskHref}
                    className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    + Thêm công việc
                  </Link>
                ) : null}
                <Link
                  href={goalHref}
                  className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Quay lại mục tiêu
                </Link>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-7">
            {!hasValidParams ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
                Thiếu mã goal hoặc key result.
              </div>
            ) : null}

            {hasValidParams && isLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">
                Đang tải chi tiết key result...
              </div>
            ) : null}

            {hasValidParams && !isLoading && loadError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
                {loadError}
              </div>
            ) : null}

            {hasValidParams && !isLoading && !loadError && goal && keyResult ? (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="space-y-5">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-slate-500">
                          Thuộc mục tiêu{" "}
                          <Link href={goalHref} className="font-medium text-blue-700 hover:text-blue-800">
                            {goal.name}
                          </Link>
                        </p>
                        <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.02em] text-slate-900">
                          {keyResult.name}
                        </h1>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
                            {formatKeyResultUnit(keyResult.unit)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                            {responsibleDepartmentName ?? "Chưa gán phòng ban"}
                          </span>
                        </div>
                      </div>

                      <div className="grid min-w-[280px] flex-1 gap-3 sm:grid-cols-4">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                            Tiến độ KR
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">{keyResultProgress}%</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                            Hiện tại
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">
                            {formatKeyResultMetric(keyResult.current, keyResult.unit)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                            Mục tiêu
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">
                            {formatKeyResultMetric(keyResult.target, keyResult.unit)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                            Số task
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">{tasks.length}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-700">Tiến độ key result</span>
                        <span className="font-semibold text-slate-900">{keyResultProgress}%</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-blue-600" style={{ width: `${keyResultProgress}%` }} />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">{progressHint}</p>
                    </div>

                    {createdNotice ? (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                        {createdNotice}
                      </div>
                    ) : null}

                    {!isCheckingCreatePermission && !canCreateTask ? (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                        Tài khoản hiện tại chưa có quyền tạo công việc cho key result này.
                      </div>
                    ) : null}
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="text-base font-semibold text-slate-900">Mô tả</h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">
                      {keyResult.description?.trim() || "Chưa có mô tả."}
                    </p>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">Công việc thuộc key result</h2>
                        <p className="mt-1 text-sm text-slate-500">
                          Tất cả task gắn vào KR này được hiển thị và theo dõi tại đây.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {tasks.length} task
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            isTaskWeightBalanced ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          Tổng trọng số {totalTaskWeight}%
                        </span>
                        {canCreateTask ? (
                          <Link
                            href={createTaskHref}
                            className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            + Thêm công việc
                          </Link>
                        ) : null}
                      </div>
                    </div>

                    {taskLoadError ? (
                      <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {taskLoadError}
                      </p>
                    ) : null}

                    {!taskLoadError && tasks.length === 0 ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                        <p className="text-lg font-semibold text-slate-900">KR này chưa có công việc.</p>
                        <p className="mt-2 text-sm text-slate-500">
                          Hãy thêm task để bắt đầu triển khai key result.
                        </p>
                        {canCreateTask ? (
                          <Link
                            href={createTaskHref}
                            className="mt-4 inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                          >
                            + Thêm công việc đầu tiên
                          </Link>
                        ) : null}
                      </div>
                    ) : null}

                    {!taskLoadError && tasks.length > 0 ? (
                      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[1120px] text-left">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-[0.08em] text-slate-400">
                                <th className="px-4 py-3 font-semibold">Công việc</th>
                                <th className="px-4 py-3 font-semibold">Người phụ trách</th>
                                <th className="px-4 py-3 font-semibold">Trạng thái</th>
                                <th className="px-4 py-3 font-semibold">Tiến độ</th>
                                <th className="px-4 py-3 font-semibold">Trọng số (%)</th>
                                <th className="px-4 py-3 font-semibold">Thời gian thực thi</th>
                                <th className="px-4 py-3 font-semibold">Thao tác</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tasks.map((task) => {
                                const isEditingTaskWeight = editingTaskWeightId === task.id;
                                const timelineHint =
                                  getTimelineMissingReason(
                                    task.startDate,
                                    task.endDate,
                                    "Công việc chưa có mốc thời gian",
                                    "Mốc thời gian công việc không hợp lệ",
                                  ) ?? "Trong khung thời gian của KR";
                                const alignmentWarning = getTimelineOutsideParentWarning(
                                  task.startDate,
                                  task.endDate,
                                  keyResult.start_date,
                                  keyResult.end_date,
                                  {
                                    subjectLabel: "Thời gian công việc",
                                    parentLabel: "KR",
                                  },
                                );
                                const taskStatusBadgeClassName =
                                  taskStatusBadgeClassMap[task.rawStatus ?? ""] ?? "bg-slate-100 text-slate-700";

                                return (
                                  <Fragment key={task.id}>
                                    <tr className="border-b border-slate-100 align-top hover:bg-slate-50/70">
                                      <td className="px-4 py-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Link
                                            href={`/tasks/${task.id}`}
                                            className="text-sm font-semibold text-slate-900 hover:text-blue-700"
                                          >
                                            {task.name}
                                          </Link>
                                          <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                            {task.typeLabel}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="px-4 py-4">
                                        <span className={`text-sm ${task.profileId ? "text-slate-700" : "text-slate-400"}`}>
                                          {task.assigneeName}
                                        </span>
                                      </td>
                                      <td className="px-4 py-4">
                                        <span
                                          className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${taskStatusBadgeClassName}`}
                                        >
                                          {task.status}
                                        </span>
                                      </td>
                                      <td className="px-4 py-4">
                                        <div className="w-[140px]">
                                          <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                                            <span className="text-slate-700">{task.progress}%</span>
                                            <span className="text-slate-400">Tiến độ</span>
                                          </div>
                                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                                            <div
                                              className="h-full rounded-full bg-blue-600"
                                              style={{ width: `${task.progress}%` }}
                                            />
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-4 py-4">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-semibold text-slate-900">
                                            {Math.round(task.weight)}%
                                          </span>
                                          {canCreateTask ? (
                                            <button
                                              type="button"
                                              onClick={() => openTaskWeightEditor(task)}
                                              className="inline-flex h-7 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                            >
                                              Sửa
                                            </button>
                                          ) : null}
                                        </div>
                                      </td>
                                      <td className="px-4 py-4 text-sm text-slate-600">
                                        <p className="font-medium text-slate-700">
                                          {formatTimelineRangeVi(task.startDate, task.endDate, {
                                            fallback: "Công việc chưa có mốc thời gian",
                                          })}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-400">{timelineHint}</p>
                                        {alignmentWarning ? (
                                          <p className="mt-1 text-xs text-amber-600">{alignmentWarning}</p>
                                        ) : null}
                                      </td>
                                      <td className="px-4 py-4">
                                        <Link
                                          href={`/tasks/${task.id}`}
                                          className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                        >
                                          Chi tiết
                                        </Link>
                                      </td>
                                    </tr>
                                    {isEditingTaskWeight ? (
                                      <tr className="border-b border-slate-100 bg-slate-50">
                                        <td colSpan={7} className="px-4 py-4">
                                          <div className="flex flex-wrap items-end justify-between gap-3">
                                            <label className="w-full max-w-[220px] space-y-1 text-xs font-medium text-slate-600">
                                              <span>Trọng số công việc (%)</span>
                                              <div className="relative">
                                                <input
                                                  type="number"
                                                  min={1}
                                                  step="1"
                                                  value={taskWeightDraft}
                                                  onChange={(event) => setTaskWeightDraft(event.target.value)}
                                                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                                />
                                                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                                                  %
                                                </span>
                                              </div>
                                            </label>
                                            <div className="flex items-center gap-2">
                                              <button
                                                type="button"
                                                onClick={cancelTaskWeightEditor}
                                                disabled={savingTaskWeightId === task.id}
                                                className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                              >
                                                Hủy
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => void handleSaveTaskWeight(task)}
                                                disabled={savingTaskWeightId === task.id}
                                                className="inline-flex h-8 items-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                                              >
                                                {savingTaskWeightId === task.id ? "Đang lưu..." : "Lưu"}
                                              </button>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    ) : null}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="bg-slate-50 text-sm">
                                <td colSpan={4} className="px-4 py-3 font-semibold text-slate-700">
                                  Tổng trọng số task trong key result
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-flex rounded-lg px-2.5 py-1 text-sm font-semibold ${
                                      isTaskWeightBalanced
                                        ? "bg-emerald-50 text-emerald-700"
                                        : "bg-amber-50 text-amber-700"
                                    }`}
                                  >
                                    {totalTaskWeight}%
                                  </span>
                                </td>
                                <td colSpan={2} className="px-4 py-3 text-xs text-slate-500">
                                  {isTaskWeightBalanced
                                    ? "Tổng trọng số đã cân bằng ở mức 100%."
                                    : "Tổng trọng số hiện chưa bằng 100%, nên điều chỉnh để phản ánh tương quan chuẩn."}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </article>
                </section>

                <aside className="h-fit space-y-5">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="text-base font-semibold text-slate-900">Thông tin key result</h2>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Mục tiêu</span>
                        <Link href={goalHref} className="text-right font-medium text-blue-600 hover:text-blue-700">
                          {goal.name}
                        </Link>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Phòng ban chính</span>
                        <span className="text-right font-medium text-slate-800">
                          {goalDepartmentName ?? "Chưa có phòng ban"}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Phòng ban phụ trách KR</span>
                        <span className="text-right font-medium text-slate-800">
                          {responsibleDepartmentName ?? "Chưa gán"}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Đơn vị</span>
                        <span className="text-right font-medium text-slate-800">
                          {formatKeyResultUnit(keyResult.unit)}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Trọng số KR</span>
                        <span className="text-right font-medium text-slate-800">
                          {Math.round(Number(keyResult.weight ?? 1))}%
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Hiện tại / mục tiêu</span>
                        <span className="text-right font-medium text-slate-800">
                          {formatKeyResultMetric(keyResult.current, keyResult.unit)}
                          {" / "}
                          {formatKeyResultMetric(keyResult.target, keyResult.unit)}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Khung thời gian KR</span>
                        <span className="text-right font-medium text-slate-800">
                          {formatTimelineRangeVi(keyResult.start_date, keyResult.end_date, {
                            fallback: "KR chưa có mốc thời gian",
                          })}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3 border-t border-slate-100 pt-3">
                        <span className="text-slate-500">Thời gian tạo</span>
                        <span className="text-right font-medium text-slate-800">
                          {formatDateTime(keyResult.created_at)}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Cập nhật lần cuối</span>
                        <span className="text-right font-medium text-slate-800">
                          {formatDateTime(keyResult.updated_at)}
                        </span>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="text-base font-semibold text-slate-900">Hiệu suất thực thi</h2>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                          Số task
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{tasks.length}</p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                          TB tiến độ task
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{averageTaskProgress}%</p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                          Tỷ lệ task hoàn thành
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{taskCompletionRate}%</p>
                      </div>

                      <div className="rounded-xl border border-slate-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-800">
                        <p className="font-semibold">Cách tính tiến độ</p>
                        <p className="mt-1">{progressHint}</p>
                      </div>

                      {tasksByStatus.map((item) => {
                        const percent = tasks.length ? Math.round((item.count / tasks.length) * 100) : 0;
                        return (
                          <div key={item.value} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-slate-700">{item.label}</span>
                              <span className="text-slate-500">
                                {item.count} ({percent}%)
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="text-base font-semibold text-slate-900">Mục tiêu liên kết</h2>
                    <div className="mt-4 space-y-3 text-sm">
                      <div>
                        <p className="text-slate-500">Khung thời gian mục tiêu</p>
                        <p className="mt-1 font-medium text-slate-800">
                          {formatTimelineRangeVi(goal.start_date, goal.end_date, {
                            fallback: "Mục tiêu chưa có mốc thời gian",
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Ghi chú timeline</p>
                        <p className="mt-1 text-slate-700">
                          {getTimelineMissingReason(
                            goal.start_date,
                            goal.end_date,
                            "Mục tiêu chưa có mốc thời gian",
                            "Mốc thời gian mục tiêu không hợp lệ",
                          ) ?? "KR nên bám theo khung thời gian của mục tiêu để kế hoạch không bị lệch."}
                        </p>
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
