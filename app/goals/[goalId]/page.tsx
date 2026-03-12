"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { GOAL_STATUSES, GOAL_TYPES } from "@/lib/constants/goals";
import { TASK_STATUSES } from "@/lib/constants/tasks";
import { supabase } from "@/lib/supabase";

type GoalDetailRow = {
  id: string;
  name: string;
  description: string | null;
  type: string | null;
  department_id: string | null;
  progress: number | null;
  status: string | null;
  quarter: number | null;
  year: number | null;
  note: string | null;
  parent_goal_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type TaskRow = {
  id: string;
  name: string;
  status: string | null;
  progress: number | null;
};

type ChildGoalRow = {
  id: string;
  name: string;
  status: string | null;
  progress: number | null;
  quarter: number | null;
  year: number | null;
};

const typeLabelMap = GOAL_TYPES.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const statusLabelMap = GOAL_STATUSES.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const taskStatusLabelMap = TASK_STATUSES.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

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

const normalizeProgress = (value: number | null) => {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return Math.max(0, Math.min(100, Math.round(safe)));
};

const formatQuarterYear = (quarter: number | null, year: number | null) => {
  if (quarter && year) {
    return `Q${quarter} ${year}`;
  }
  if (year) {
    return `Năm ${year}`;
  }
  return "Chưa đặt kỳ";
};

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-blue-600" style={{ width: `${value}%` }} />
    </div>
  );
}

export default function GoalDetailPage() {
  const params = useParams<{ goalId: string }>();
  const goalId = params.goalId;
  const hasValidGoalId = Boolean(goalId);

  const [goal, setGoal] = useState<GoalDetailRow | null>(null);
  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const [parentGoal, setParentGoal] = useState<{ id: string; name: string } | null>(null);
  const [goalTasks, setGoalTasks] = useState<TaskRow[]>([]);
  const [childGoals, setChildGoals] = useState<ChildGoalRow[]>([]);
  const [taskLoadError, setTaskLoadError] = useState<string | null>(null);
  const [childGoalLoadError, setChildGoalLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasValidGoalId) {
      return;
    }

    let isActive = true;

    const loadGoalDetail = async () => {
      setIsLoading(true);
      setError(null);
      setTaskLoadError(null);
      setChildGoalLoadError(null);

      const { data: goalData, error: goalError } = await supabase
        .from("goals")
        .select(
          "id,name,description,type,department_id,progress,status,quarter,year,note,parent_goal_id,created_at,updated_at",
        )
        .eq("id", goalId)
        .maybeSingle();

      if (!isActive) {
        return;
      }

      if (goalError) {
        setError(goalError.message || "Không tải được chi tiết mục tiêu.");
        setGoal(null);
        setDepartmentName(null);
        setParentGoal(null);
        setGoalTasks([]);
        setChildGoals([]);
        setIsLoading(false);
        return;
      }

      if (!goalData) {
        setError("Không tìm thấy mục tiêu.");
        setGoal(null);
        setDepartmentName(null);
        setParentGoal(null);
        setGoalTasks([]);
        setChildGoals([]);
        setIsLoading(false);
        return;
      }

      const typedGoal = goalData as GoalDetailRow;
      setGoal(typedGoal);

      const departmentQuery = typedGoal.department_id
        ? supabase.from("departments").select("id,name").eq("id", typedGoal.department_id).maybeSingle()
        : Promise.resolve({ data: null, error: null });

      const parentGoalQuery = typedGoal.parent_goal_id
        ? supabase.from("goals").select("id,name").eq("id", typedGoal.parent_goal_id).maybeSingle()
        : Promise.resolve({ data: null, error: null });

      const tasksQuery = supabase
        .from("tasks")
        .select("id,name,status,progress")
        .eq("goal_id", typedGoal.id)
        .order("created_at", { ascending: false });

      const childGoalsQuery = supabase
        .from("goals")
        .select("id,name,status,progress,quarter,year")
        .eq("parent_goal_id", typedGoal.id)
        .order("created_at", { ascending: false });

      const [
        { data: departmentData },
        { data: parentData },
        { data: tasksData, error: tasksError },
        { data: childGoalsData, error: childGoalsError },
      ] = await Promise.all([
        departmentQuery,
        parentGoalQuery,
        tasksQuery,
        childGoalsQuery,
      ]);

      if (!isActive) {
        return;
      }

      setDepartmentName(departmentData?.name ? String(departmentData.name) : null);
      setParentGoal(
        parentData?.id && parentData?.name
          ? { id: String(parentData.id), name: String(parentData.name) }
          : null,
      );
      setGoalTasks(
        (tasksData ?? []).map((task) => ({
          id: String(task.id),
          name: String(task.name),
          status: task.status ? String(task.status) : null,
          progress: typeof task.progress === "number" ? task.progress : null,
        })),
      );
      setChildGoals(
        (childGoalsData ?? []).map((child) => ({
          id: String(child.id),
          name: String(child.name),
          status: child.status ? String(child.status) : null,
          progress: typeof child.progress === "number" ? child.progress : null,
          quarter: typeof child.quarter === "number" ? child.quarter : null,
          year: typeof child.year === "number" ? child.year : null,
        })),
      );
      if (tasksError) {
        setTaskLoadError("Không tải được danh sách công việc của mục tiêu.");
      }
      if (childGoalsError) {
        setChildGoalLoadError("Không tải được danh sách mục tiêu con.");
      }
      setIsLoading(false);
    };

    void loadGoalDetail();

    return () => {
      isActive = false;
    };
  }, [goalId, hasValidGoalId]);

  const goalProgress = useMemo(() => normalizeProgress(goal?.progress ?? 0), [goal?.progress]);
  const goalTypeLabel = goal?.type ? typeLabelMap[goal.type] ?? goal.type : "Chưa đặt";
  const goalStatusLabel = goal?.status ? statusLabelMap[goal.status] ?? goal.status : "Chưa đặt";
  const quarterLabel = goal?.quarter ? `Q${goal.quarter}` : "Chưa đặt";
  const yearLabel = goal?.year ? String(goal.year) : "Chưa đặt";
  const tasksByStatus = useMemo(() => {
    return TASK_STATUSES.map((status) => {
      const count = goalTasks.filter((task) => task.status === status.value).length;
      return {
        value: status.value,
        label: status.label,
        count,
      };
    });
  }, [goalTasks]);
  const averageTaskProgress = useMemo(() => {
    if (!goalTasks.length) {
      return 0;
    }
    const total = goalTasks.reduce((acc, task) => acc + normalizeProgress(task.progress), 0);
    return Math.round(total / goalTasks.length);
  }, [goalTasks]);
  const addTaskParams = new URLSearchParams();
  if (hasValidGoalId && goalId) {
    addTaskParams.set("goalId", goalId);
  }
  if (goal?.department_id) {
    addTaskParams.set("departmentId", goal.department_id);
  }
  const addTaskQuery = addTaskParams.toString();
  const addTaskHref = addTaskQuery ? `/tasks/new?${addTaskQuery}` : "/tasks/new";

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="goals" />

        <div className="flex h-screen w-full flex-1 flex-col overflow-hidden lg:pl-[280px]">
          <header className="border-b border-slate-200 bg-[#f3f5fa] px-4 py-4 lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                <Link href="/goals" className="hover:text-slate-700">
                  Mục tiêu
                </Link>
                <span className="px-2">›</span>
                <span className="font-semibold text-slate-700">
                  {goal?.name ?? "Chi tiết mục tiêu"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={addTaskHref}
                  className="inline-flex h-9 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  + Thêm việc
                </Link>
                <Link
                  href="/goals"
                  className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Quay lại
                </Link>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-7">
            {!hasValidGoalId ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
                Thiếu mã mục tiêu.
              </div>
            ) : null}

            {hasValidGoalId && isLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">
                Đang tải chi tiết mục tiêu...
              </div>
            ) : null}

            {hasValidGoalId && !isLoading && error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {hasValidGoalId && !isLoading && !error && goal ? (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="space-y-5">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-slate-900">
                      {goal.name}
                    </h1>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
                        {goalTypeLabel}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                        {goalStatusLabel}
                      </span>
                    </div>

                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-700">Tiến độ</span>
                        <span className="font-semibold text-slate-900">{goalProgress}%</span>
                      </div>
                      <ProgressBar value={goalProgress} />
                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="text-base font-semibold text-slate-900">Mô tả</h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">
                      {goal.description?.trim() || "Chưa có mô tả."}
                    </p>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="text-base font-semibold text-slate-900">Ghi chú nội bộ</h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">
                      {goal.note?.trim() || "Chưa có ghi chú."}
                    </p>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-base font-semibold text-slate-900">Mục tiêu con</h2>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {childGoals.length} mục tiêu
                      </span>
                    </div>

                    {childGoalLoadError ? (
                      <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {childGoalLoadError}
                      </p>
                    ) : null}

                    {!childGoalLoadError && childGoals.length === 0 ? (
                      <p className="text-sm text-slate-500">Mục tiêu này chưa có mục tiêu con.</p>
                    ) : null}

                    {!childGoalLoadError && childGoals.length > 0 ? (
                      <div className="space-y-3">
                        {childGoals.map((child) => {
                          const childProgress = normalizeProgress(child.progress);
                          const childStatus =
                            child.status ? statusLabelMap[child.status] ?? child.status : "Chưa đặt";
                          return (
                            <Link
                              key={child.id}
                              href={`/goals/${child.id}`}
                              className="block rounded-xl border border-slate-200 bg-slate-50 p-3 hover:border-blue-300 hover:bg-blue-50/40"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold text-slate-800">{child.name}</p>
                                <span className="text-xs font-medium text-slate-500">
                                  {formatQuarterYear(child.quarter, child.year)}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                                <span className="rounded-full bg-slate-200 px-2 py-0.5 font-medium text-slate-700">
                                  {childStatus}
                                </span>
                                <span className="font-semibold text-slate-600">{childProgress}%</span>
                              </div>
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className="h-full rounded-full bg-blue-600"
                                  style={{ width: `${childProgress}%` }}
                                />
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-base font-semibold text-slate-900">Công việc thuộc mục tiêu</h2>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {goalTasks.length} việc
                      </span>
                    </div>

                    {taskLoadError ? (
                      <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {taskLoadError}
                      </p>
                    ) : null}

                    {!taskLoadError && goalTasks.length === 0 ? (
                      <p className="text-sm text-slate-500">Chưa có công việc nào thuộc mục tiêu này.</p>
                    ) : null}

                    {!taskLoadError && goalTasks.length > 0 ? (
                      <div className="space-y-3">
                        {goalTasks.map((task) => {
                          const taskProgress = normalizeProgress(task.progress);
                          const taskStatus =
                            task.status ? taskStatusLabelMap[task.status] ?? task.status : "Chưa đặt";
                          return (
                            <Link
                              key={task.id}
                              href={`/tasks/${task.id}`}
                              className="block rounded-xl border border-slate-200 bg-slate-50 p-3 hover:border-blue-300 hover:bg-blue-50/40"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold text-slate-800">{task.name}</p>
                                <span className="text-xs font-semibold text-slate-600">{taskProgress}%</span>
                              </div>
                              <div className="mt-1 text-xs font-medium text-slate-600">{taskStatus}</div>
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className="h-full rounded-full bg-blue-600"
                                  style={{ width: `${taskProgress}%` }}
                                />
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </article>
                </section>

                <aside className="h-fit space-y-5">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="text-base font-semibold text-slate-900">Thông tin chi tiết</h2>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Phòng ban</span>
                        <span className="text-right font-medium text-slate-800">
                          {departmentName ?? "Chưa có phòng ban"}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Mục tiêu cha</span>
                        {parentGoal ? (
                          <Link
                            href={`/goals/${parentGoal.id}`}
                            className="text-right font-medium text-blue-600 hover:text-blue-700"
                          >
                            {parentGoal.name}
                          </Link>
                        ) : (
                          <span className="text-right font-medium text-slate-800">Không có</span>
                        )}
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Loại mục tiêu</span>
                        <span className="text-right font-medium text-slate-800">{goalTypeLabel}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Trạng thái</span>
                        <span className="text-right font-medium text-slate-800">{goalStatusLabel}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Quý</span>
                        <span className="text-right font-medium text-slate-800">{quarterLabel}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Năm</span>
                        <span className="text-right font-medium text-slate-800">{yearLabel}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Tiến độ</span>
                        <span className="text-right font-medium text-slate-800">{goalProgress}%</span>
                      </div>
                      <div className="flex items-start justify-between gap-3 border-t border-slate-100 pt-3">
                        <span className="text-slate-500">Thời gian tạo</span>
                        <span className="text-right font-medium text-slate-800">
                          {formatDateTime(goal.created_at)}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Cập nhật lần cuối</span>
                        <span className="text-right font-medium text-slate-800">
                          {formatDateTime(goal.updated_at)}
                        </span>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-base font-semibold text-slate-900">Phân bổ công việc</h2>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {goalTasks.length} việc
                      </span>
                    </div>

                    {taskLoadError ? (
                      <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {taskLoadError}
                      </p>
                    ) : null}

                    {!taskLoadError && goalTasks.length === 0 ? (
                      <p className="text-sm text-slate-500">Chưa có công việc nào cho mục tiêu này.</p>
                    ) : null}

                    {!taskLoadError && goalTasks.length > 0 ? (
                      <div className="space-y-3">
                        {tasksByStatus.map((item) => {
                          const percent = Math.round((item.count / goalTasks.length) * 100);
                          return (
                            <div key={item.value} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-slate-700">{item.label}</span>
                                <span className="text-slate-500">
                                  {item.count} ({percent}%)
                                </span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-blue-600"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}

                        <div className="border-t border-slate-100 pt-3 text-xs text-slate-600">
                          Tiến độ trung bình công việc:{" "}
                          <span className="font-semibold text-slate-900">{averageTaskProgress}%</span>
                        </div>
                      </div>
                    ) : null}
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
