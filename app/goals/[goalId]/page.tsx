"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { GOAL_STATUSES, GOAL_TYPES } from "@/lib/constants/goals";
import {
  formatKeyResultMetric,
  formatKeyResultUnit,
  getKeyResultProgressHint,
  KEY_RESULT_UNITS,
  type KeyResultUnitValue,
} from "@/lib/constants/key-results";
import { getTaskProgressByType, getTaskProgressHint, TASK_STATUSES, TASK_TYPES } from "@/lib/constants/tasks";
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
  type: string | null;
  status: string | null;
  progress: number | null;
  profile_id: string | null;
  key_result_id: string | null;
};

type ChildGoalRow = {
  id: string;
  name: string;
  status: string | null;
  progress: number | null;
  quarter: number | null;
  year: number | null;
};

type KeyResultRow = {
  id: string;
  goal_id: string;
  name: string;
  description: string | null;
  target: number;
  current: number;
  unit: string | null;
  progress: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type GoalDepartmentLinkRow = {
  department_id: string | null;
};

type DepartmentRow = {
  id: string;
  name: string;
};

type DepartmentOption = {
  id: string;
  name: string;
  parentDepartmentId: string | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type GoalTaskItem = {
  id: string;
  name: string;
  type: string | null;
  status: string;
  progress: number;
  profileId: string | null;
  assigneeName: string;
  keyResultId: string | null;
};

type KeyResultFormState = {
  name: string;
  description: string;
  unit: KeyResultUnitValue;
  target: number;
  current: number;
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

const defaultKeyResultForm: KeyResultFormState = {
  name: "",
  description: "",
  unit: "count",
  target: 100,
  current: 0,
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

const computeKeyResultProgress = (current: number, target: number, unit?: string | null) => {
  const safeCurrent = unit === "percent" ? Math.min(100, current) : current;
  const safeTarget = unit === "percent" ? Math.min(100, target) : target;
  if (!Number.isFinite(safeTarget) || safeTarget <= 0) {
    return 0;
  }
  return normalizeProgress((safeCurrent / safeTarget) * 100);
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
  const searchParams = useSearchParams();
  const goalId = params.goalId;
  const hasValidGoalId = Boolean(goalId);

  const [goal, setGoal] = useState<GoalDetailRow | null>(null);
  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const [relatedDepartments, setRelatedDepartments] = useState<DepartmentRow[]>([]);
  const [parentGoal, setParentGoal] = useState<{ id: string; name: string } | null>(null);
  const [goalTasks, setGoalTasks] = useState<GoalTaskItem[]>([]);
  const [keyResults, setKeyResults] = useState<KeyResultRow[]>([]);
  const [childGoals, setChildGoals] = useState<ChildGoalRow[]>([]);
  const [taskLoadError, setTaskLoadError] = useState<string | null>(null);
  const [childGoalLoadError, setChildGoalLoadError] = useState<string | null>(null);
  const [keyResultLoadError, setKeyResultLoadError] = useState<string | null>(null);
  const [relatedDepartmentLoadError, setRelatedDepartmentLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingCreatePermission, setIsCheckingCreatePermission] = useState(true);
  const [canCreateKeyResult, setCanCreateKeyResult] = useState(false);

  const [showCreateKeyResult, setShowCreateKeyResult] = useState(false);
  const [isCreatingKeyResult, setIsCreatingKeyResult] = useState(false);
  const [keyResultSubmitError, setKeyResultSubmitError] = useState<string | null>(null);
  const [keyResultNotice, setKeyResultNotice] = useState<string | null>(null);
  const [keyResultForm, setKeyResultForm] = useState<KeyResultFormState>(defaultKeyResultForm);

  useEffect(() => {
    if (searchParams.get("createKr") === "1") {
      setShowCreateKeyResult(true);
    }
  }, [searchParams]);

  useEffect(() => {
    let isActive = true;

    const loadCreatePermission = async () => {
      setIsCheckingCreatePermission(true);
      setCanCreateKeyResult(false);

      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
          if (isActive) {
            setCanCreateKeyResult(false);
          }
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", authData.user.id)
          .maybeSingle();

        if (profileError || !profile?.id) {
          if (isActive) {
            setCanCreateKeyResult(false);
          }
          return;
        }

        const { data: rolesData, error: roleError } = await supabase.from("roles").select("id,name");
        const leaderRoleIds = (rolesData ?? [])
          .filter((role) => {
            const roleName = typeof role.name === "string" ? role.name.trim().toLowerCase() : "";
            return roleName === "leader" || roleName.includes("leader");
          })
          .map((role) => role.id)
          .filter(Boolean) as string[];

        if (roleError || leaderRoleIds.length === 0) {
          if (isActive) {
            setCanCreateKeyResult(false);
          }
          return;
        }

        const { data: userRolesData, error: userRolesError } = await supabase
          .from("user_role_in_department")
          .select("department_id,role_id")
          .eq("profile_id", profile.id)
          .in("role_id", leaderRoleIds);

        const departmentIds = [
          ...new Set((userRolesData ?? []).map((item) => item.department_id).filter(Boolean)),
        ];

        if (userRolesError || departmentIds.length === 0) {
          if (isActive) {
            setCanCreateKeyResult(false);
          }
          return;
        }

        const { data: departmentsData, error: departmentsError } = await supabase
          .from("departments")
          .select("id,name,parent_department_id")
          .in("id", departmentIds);

        if (departmentsError || !departmentsData?.length) {
          if (isActive) {
            setCanCreateKeyResult(false);
          }
          return;
        }

        const roots: DepartmentOption[] = departmentsData
          .filter((department) => !department.parent_department_id)
          .map((department) => ({
            id: String(department.id),
            name: String(department.name),
            parentDepartmentId: null,
          }));

        if (isActive) {
          setCanCreateKeyResult(roots.length > 0);
        }
      } catch {
        if (isActive) {
          setCanCreateKeyResult(false);
        }
      } finally {
        if (isActive) {
          setIsCheckingCreatePermission(false);
        }
      }
    };

    void loadCreatePermission();

    return () => {
      isActive = false;
    };
  }, []);

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
      setKeyResultLoadError(null);
      setRelatedDepartmentLoadError(null);

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
        setRelatedDepartments([]);
        setParentGoal(null);
        setGoalTasks([]);
        setKeyResults([]);
        setChildGoals([]);
        setIsLoading(false);
        return;
      }

      if (!goalData) {
        setError("Không tìm thấy mục tiêu.");
        setGoal(null);
        setDepartmentName(null);
        setRelatedDepartments([]);
        setParentGoal(null);
        setGoalTasks([]);
        setKeyResults([]);
        setChildGoals([]);
        setIsLoading(false);
        return;
      }

      const typedGoal = goalData as GoalDetailRow;
      setGoal(typedGoal);

      const [
        { data: departmentData },
        { data: parentData },
        { data: tasksData, error: tasksError },
        { data: childGoalsData, error: childGoalsError },
        { data: keyResultsData, error: keyResultsError },
        { data: goalDepartmentLinks, error: goalDepartmentsError },
      ] = await Promise.all([
        typedGoal.department_id
          ? supabase.from("departments").select("id,name").eq("id", typedGoal.department_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        typedGoal.parent_goal_id
          ? supabase.from("goals").select("id,name").eq("id", typedGoal.parent_goal_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("tasks")
          .select("id,name,type,status,progress,profile_id,key_result_id")
          .eq("goal_id", typedGoal.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("goals")
          .select("id,name,status,progress,quarter,year")
          .eq("parent_goal_id", typedGoal.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("key_results")
          .select("id,goal_id,name,description,target,current,unit,progress,created_at,updated_at")
          .eq("goal_id", typedGoal.id)
          .order("created_at", { ascending: true }),
        supabase.from("goal_departments").select("department_id").eq("goal_id", typedGoal.id),
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

      const typedTasks = (tasksData ?? []) as TaskRow[];
      const profileIds = [...new Set(typedTasks.map((task) => task.profile_id).filter(Boolean))] as string[];
      let profileNameById: Record<string, string> = {};

      if (profileIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id,name,email")
          .in("id", profileIds);

        if (!isActive) {
          return;
        }

        profileNameById = ((profilesData ?? []) as ProfileRow[]).reduce<Record<string, string>>(
          (acc, profile) => {
            acc[String(profile.id)] = profile.name?.trim() || profile.email?.trim() || "Chưa gán";
            return acc;
          },
          {},
        );
      }

      setGoalTasks(
        typedTasks.map((task) => ({
          id: String(task.id),
          name: String(task.name),
          type: task.type ? String(task.type) : null,
          status: task.status ? taskStatusLabelMap[task.status] ?? task.status : "Chưa đặt",
          progress: getTaskProgressByType(
            task.type ? String(task.type) : null,
            task.status === "doing" || task.status === "done" || task.status === "cancelled"
              ? task.status
              : "todo",
            task.progress,
          ),
          profileId: task.profile_id ? String(task.profile_id) : null,
          assigneeName: task.profile_id ? profileNameById[task.profile_id] ?? "Chưa gán" : "Chưa gán",
          keyResultId: task.key_result_id ? String(task.key_result_id) : null,
        })),
      );

      setKeyResults(
        ((keyResultsData ?? []) as KeyResultRow[]).map((keyResult) => ({
          ...keyResult,
          id: String(keyResult.id),
          goal_id: String(keyResult.goal_id),
          target:
            typeof keyResult.target === "number" ? keyResult.target : Number(keyResult.target ?? 0),
          current:
            typeof keyResult.current === "number" ? keyResult.current : Number(keyResult.current ?? 0),
          unit: keyResult.unit ? String(keyResult.unit) : null,
          progress:
            typeof keyResult.progress === "number"
              ? keyResult.progress
              : computeKeyResultProgress(
                  typeof keyResult.current === "number"
                    ? keyResult.current
                    : Number(keyResult.current ?? 0),
                  typeof keyResult.target === "number"
                    ? keyResult.target
                    : Number(keyResult.target ?? 0),
                  keyResult.unit,
                ),
        })),
      );

      setChildGoals(
        ((childGoalsData ?? []) as ChildGoalRow[]).map((child) => ({
          id: String(child.id),
          name: String(child.name),
          status: child.status ? String(child.status) : null,
          progress: typeof child.progress === "number" ? child.progress : null,
          quarter: typeof child.quarter === "number" ? child.quarter : null,
          year: typeof child.year === "number" ? child.year : null,
        })),
      );

      const relatedDepartmentIds = Array.from(
        new Set([
          typedGoal.department_id,
          ...((goalDepartmentLinks ?? []) as GoalDepartmentLinkRow[]).map((item) => item.department_id),
        ].filter(Boolean)),
      ) as string[];

      if (relatedDepartmentIds.length > 0) {
        const { data: relatedDepartmentsData, error: relatedDepartmentsError } = await supabase
          .from("departments")
          .select("id,name")
          .in("id", relatedDepartmentIds)
          .order("name", { ascending: true });

        if (!isActive) {
          return;
        }

        if (relatedDepartmentsError) {
          setRelatedDepartments([]);
          setRelatedDepartmentLoadError("Không tải được danh sách team tham gia.");
        } else {
          setRelatedDepartments(
            ((relatedDepartmentsData ?? []) as DepartmentRow[]).map((department) => ({
              id: String(department.id),
              name: String(department.name),
            })),
          );
        }
      } else {
        setRelatedDepartments([]);
      }

      if (tasksError) {
        setTaskLoadError("Không tải được danh sách công việc của mục tiêu.");
      }
      if (childGoalsError) {
        setChildGoalLoadError("Không tải được danh sách mục tiêu con.");
      }
      if (keyResultsError) {
        setKeyResultLoadError("Không tải được danh sách key result.");
      }
      if (goalDepartmentsError) {
        setRelatedDepartmentLoadError("Không tải được cấu trúc team tham gia.");
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
      const count = goalTasks.filter((task) => task.status === status.label).length;
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

  const tasksByKeyResultId = useMemo(() => {
    return goalTasks.reduce<Record<string, GoalTaskItem[]>>((acc, task) => {
      if (!task.keyResultId) {
        return acc;
      }
      if (!acc[task.keyResultId]) {
        acc[task.keyResultId] = [];
      }
      acc[task.keyResultId].push(task);
      return acc;
    }, {});
  }, [goalTasks]);

  const unassignedGoalTasks = useMemo(
    () => goalTasks.filter((task) => !task.keyResultId),
    [goalTasks],
  );

  const averageKeyResultProgress = useMemo(() => {
    if (!keyResults.length) {
      return 0;
    }
    const total = keyResults.reduce(
      (acc, keyResult) => acc + normalizeProgress(keyResult.progress),
      0,
    );
    return Math.round(total / keyResults.length);
  }, [keyResults]);

  const addTaskParams = new URLSearchParams();
  if (hasValidGoalId && goalId) {
    addTaskParams.set("goalId", goalId);
  }
  if (goal?.department_id) {
    addTaskParams.set("departmentId", goal.department_id);
  }
  if (keyResults.length === 1) {
    addTaskParams.set("keyResultId", keyResults[0].id);
  }
  const addTaskQuery = addTaskParams.toString();
  const addTaskHref = addTaskQuery ? `/tasks/new?${addTaskQuery}` : "/tasks/new";

  const handleCreateKeyResult = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!goal?.id) {
      setKeyResultSubmitError("Không xác định được mục tiêu để tạo key result.");
      return;
    }

    if (!canCreateKeyResult) {
      setKeyResultSubmitError("Bạn không có quyền tạo key result cho mục tiêu này.");
      return;
    }

    const safeTarget = Number(keyResultForm.target);
    const safeCurrent = Number(keyResultForm.current);
    if (!keyResultForm.name.trim()) {
      setKeyResultSubmitError("Vui lòng nhập tên key result.");
      return;
    }
    if (!Number.isFinite(safeTarget) || safeTarget <= 0) {
      setKeyResultSubmitError("Target phải lớn hơn 0.");
      return;
    }
    if (!Number.isFinite(safeCurrent) || safeCurrent < 0) {
      setKeyResultSubmitError("Current không được nhỏ hơn 0.");
      return;
    }

    setIsCreatingKeyResult(true);
    setKeyResultSubmitError(null);
    setKeyResultNotice(null);

    try {
      const payload = {
        goal_id: goal.id,
        name: keyResultForm.name.trim(),
        description: keyResultForm.description.trim() || null,
        unit: keyResultForm.unit,
        target: safeTarget,
        current: safeCurrent,
        progress: computeKeyResultProgress(safeCurrent, safeTarget, keyResultForm.unit),
      };

      const { data, error: createError } = await supabase
        .from("key_results")
        .insert(payload)
        .select("id,goal_id,name,description,target,current,unit,progress,created_at,updated_at")
        .maybeSingle();

      if (createError || !data) {
        if (createError?.code === "42501") {
          throw new Error("Bạn không có quyền tạo key result cho mục tiêu này.");
        }
        throw new Error(createError?.message || "Không thể tạo key result.");
      }

      const createdKeyResult = data as KeyResultRow;
      setKeyResults((prev) => [
        ...prev,
        {
          ...createdKeyResult,
          id: String(createdKeyResult.id),
          goal_id: String(createdKeyResult.goal_id),
          target:
            typeof createdKeyResult.target === "number"
              ? createdKeyResult.target
              : Number(createdKeyResult.target ?? 0),
          current:
            typeof createdKeyResult.current === "number"
              ? createdKeyResult.current
              : Number(createdKeyResult.current ?? 0),
          unit: createdKeyResult.unit ? String(createdKeyResult.unit) : null,
          progress: normalizeProgress(createdKeyResult.progress),
        },
      ]);
      setKeyResultForm(defaultKeyResultForm);
      setShowCreateKeyResult(false);
      setKeyResultNotice("Đã tạo key result. Bạn có thể gắn task vào KR này ngay.");
    } catch (createError) {
      setKeyResultSubmitError(
        createError instanceof Error ? createError.message : "Không thể tạo key result.",
      );
    } finally {
      setIsCreatingKeyResult(false);
    }
  };

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
                <button
                  type="button"
                  onClick={() => {
                    if (!canCreateKeyResult) {
                      setShowCreateKeyResult(true);
                      setKeyResultSubmitError("Bạn không có quyền tạo key result cho mục tiêu này.");
                      return;
                    }
                    setShowCreateKeyResult((prev) => !prev);
                    setKeyResultSubmitError(null);
                    setKeyResultNotice(null);
                  }}
                  disabled={isCheckingCreatePermission}
                  className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  + Thêm key result
                </button>
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
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
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
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
                            {formatQuarterYear(goal.quarter, goal.year)}
                          </span>
                        </div>
                      </div>

                      <div className="grid min-w-[280px] flex-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                            Key result
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">{keyResults.length}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                            Công việc
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">{goalTasks.length}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                            Team tham gia
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">
                            {relatedDepartments.length || 1}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-700">Tiến độ mục tiêu</span>
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

                  <article className="relative overflow-hidden rounded-[28px] border border-blue-200 bg-[linear-gradient(180deg,#eef6ff_0%,#f8fbff_46%,#ffffff_100%)] p-5 shadow-[0_24px_60px_-42px_rgba(37,99,235,0.55)]">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.22),transparent_58%)]" />
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold tracking-[0.1em] text-blue-700 uppercase">
                          Trọng tâm thực thi
                        </p>
                        <h2 className="mt-1 text-[28px] font-semibold tracking-[-0.03em] text-slate-950">
                          Key results
                        </h2>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm">
                        {keyResults.length} KR
                      </span>
                    </div>

                    <div className="mb-5 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-white/90 bg-white/90 px-4 py-4 backdrop-blur">
                        <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                          Tiến độ KR trung bình
                        </p>
                        <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
                          {averageKeyResultProgress}%
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/90 bg-white/90 px-4 py-4 backdrop-blur">
                        <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                          Số key result
                        </p>
                        <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
                          {keyResults.length}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/90 bg-white/90 px-4 py-4 backdrop-blur">
                        <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                          Công việc theo KR
                        </p>
                        <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
                          {goalTasks.length - unassignedGoalTasks.length}
                        </p>
                      </div>
                    </div>

                    {showCreateKeyResult ? (
                      <form
                        onSubmit={handleCreateKeyResult}
                        className="mb-5 space-y-4 rounded-[24px] border border-blue-200 bg-white/90 p-4 shadow-[0_20px_40px_-36px_rgba(37,99,235,0.55)]"
                      >
                        {!isCheckingCreatePermission && !canCreateKeyResult ? (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                            Quyền tạo KR đang dùng cùng logic với quyền tạo goal. Tài khoản hiện tại chưa có quyền này.
                          </div>
                        ) : null}

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700">Tên key result *</label>
                            <input
                              value={keyResultForm.name}
                              onChange={(event) =>
                                setKeyResultForm((prev) => ({ ...prev, name: event.target.value }))
                              }
                              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                              placeholder="Ví dụ: Tăng MRR thêm 20%"
                            />
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                              <label className="text-sm font-semibold text-slate-700">Unit</label>
                              <select
                                value={keyResultForm.unit}
                                onChange={(event) =>
                                  setKeyResultForm((prev) => ({
                                    ...prev,
                                    unit: event.target.value as KeyResultUnitValue,
                                  }))
                                }
                                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                              >
                                {KEY_RESULT_UNITS.map((unit) => (
                                  <option key={unit.value} value={unit.value}>
                                    {unit.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-sm font-semibold text-slate-700">Target *</label>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={keyResultForm.target}
                                onChange={(event) =>
                                  setKeyResultForm((prev) => ({
                                    ...prev,
                                    target: Number(event.target.value) || 0,
                                  }))
                                }
                                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-sm font-semibold text-slate-700">Current</label>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={keyResultForm.current}
                                onChange={(event) =>
                                  setKeyResultForm((prev) => ({
                                    ...prev,
                                    current: Number(event.target.value) || 0,
                                  }))
                                }
                                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-sm font-semibold text-slate-700">Mô tả</label>
                          <textarea
                            rows={3}
                            value={keyResultForm.description}
                            onChange={(event) =>
                              setKeyResultForm((prev) => ({ ...prev, description: event.target.value }))
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            placeholder="Mô tả phạm vi và cách đo kết quả"
                          />
                        </div>

                        <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-800">
                          {getKeyResultProgressHint(keyResultForm.unit)}
                        </div>

                        {keyResultSubmitError ? (
                          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                            {keyResultSubmitError}
                          </div>
                        ) : null}

                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowCreateKeyResult(false);
                              setKeyResultForm(defaultKeyResultForm);
                              setKeyResultSubmitError(null);
                            }}
                            className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Hủy
                          </button>
                          <button
                            type="submit"
                            disabled={isCreatingKeyResult || isCheckingCreatePermission || !canCreateKeyResult}
                            className="inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                          >
                            {isCreatingKeyResult ? "Đang tạo..." : "Tạo key result"}
                          </button>
                        </div>
                      </form>
                    ) : null}

                    {keyResultNotice ? (
                      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                        {keyResultNotice}
                      </div>
                    ) : null}

                    {keyResultLoadError ? (
                      <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {keyResultLoadError}
                      </p>
                    ) : null}

                    {!keyResultLoadError && keyResults.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Goal này chưa có key result. Hãy tạo KR trước khi phân bổ task để bám đúng cấu trúc mới.
                      </p>
                    ) : null}

                    {!keyResultLoadError && keyResults.length > 0 ? (
                      <div className="space-y-4">
                        {keyResults.map((keyResult) => {
                          const taskItems = tasksByKeyResultId[keyResult.id] ?? [];
                          const keyResultProgress = normalizeProgress(keyResult.progress);
                          const keyResultTaskHref = `/tasks/new?goalId=${goal.id}&keyResultId=${keyResult.id}`;

                          return (
                            <article
                              key={keyResult.id}
                              className="overflow-hidden rounded-[24px] border border-blue-100 bg-white shadow-[0_18px_36px_-34px_rgba(37,99,235,0.5)]"
                            >
                              <div className="border-b border-blue-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-4 py-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                                        KEY RESULT
                                      </span>
                                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                        {taskItems.length} task
                                      </span>
                                    </div>
                                    <p className="mt-3 text-xl font-semibold tracking-[-0.02em] text-slate-900">
                                      {keyResult.name}
                                    </p>
                                    <p className="mt-1 text-sm text-slate-500">
                                      {keyResult.description?.trim() || "Chưa có mô tả cho key result."}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">
                                      {keyResultProgress}%
                                    </span>
                                    <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                                      {formatKeyResultUnit(keyResult.unit)}
                                    </span>
                                    <Link
                                      href={keyResultTaskHref}
                                      className="inline-flex h-9 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                                    >
                                      + Thêm việc
                                    </Link>
                                  </div>
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-4">
                                  <div className="rounded-2xl border border-blue-100 bg-blue-50/45 px-4 py-3">
                                    <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                                      Hiện tại
                                    </p>
                                    <p className="mt-2 text-lg font-semibold text-slate-900">
                                      {formatKeyResultMetric(keyResult.current, keyResult.unit)}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-blue-100 bg-blue-50/45 px-4 py-3">
                                    <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                                      Target
                                    </p>
                                    <p className="mt-2 text-lg font-semibold text-slate-900">
                                      {formatKeyResultMetric(keyResult.target, keyResult.unit)}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-blue-100 bg-blue-50/45 px-4 py-3">
                                    <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                                      Đơn vị
                                    </p>
                                    <p className="mt-2 text-lg font-semibold text-slate-900">
                                      {formatKeyResultUnit(keyResult.unit)}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-blue-100 bg-blue-50/45 px-4 py-3">
                                    <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                                      Task
                                    </p>
                                    <p className="mt-2 text-lg font-semibold text-slate-900">{taskItems.length}</p>
                                  </div>
                                </div>

                                <div className="mt-4">
                                  <div className="mb-2 flex items-center justify-between text-sm">
                                    <span className="font-semibold text-slate-700">Tiến độ KR</span>
                                    <span className="font-semibold text-slate-900">{keyResultProgress}%</span>
                                  </div>
                                  <ProgressBar value={keyResultProgress} />
                                  <p className="mt-2 text-xs text-slate-500">
                                    {getKeyResultProgressHint(keyResult.unit)}
                                  </p>
                                </div>
                              </div>

                              <div className="divide-y divide-blue-100 bg-white">
                                {taskItems.length > 0 ? (
                                  taskItems.map((task) => (
                                    <Link
                                      key={task.id}
                                      href={`/tasks/${task.id}`}
                                      className="block px-4 py-3 transition hover:bg-blue-50/55"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <p className="text-sm font-semibold text-slate-800">{task.name}</p>
                                          <p className="mt-1 text-xs text-slate-500">
                                            {(TASK_TYPES.find((item) => item.value === task.type)?.label ?? "KPI")}
                                            {" · "}
                                            {task.status}
                                            {" · "}
                                            {task.assigneeName}
                                          </p>
                                          <p className="mt-1 text-[11px] text-slate-400">
                                            {getTaskProgressHint(task.type)}
                                          </p>
                                        </div>
                                        <span className="text-xs font-semibold text-slate-600">
                                          {task.progress}%
                                        </span>
                                      </div>
                                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                                        <div
                                          className="h-full rounded-full bg-blue-600"
                                          style={{ width: `${task.progress}%` }}
                                        />
                                      </div>
                                    </Link>
                                  ))
                                ) : (
                                  <p className="px-4 py-4 text-sm text-slate-500">
                                    Chưa có task nào nằm dưới key result này.
                                  </p>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : null}
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-base font-semibold text-slate-900">Task chưa gắn key result</h2>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {unassignedGoalTasks.length} việc
                      </span>
                    </div>

                    {taskLoadError ? (
                      <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {taskLoadError}
                      </p>
                    ) : null}

                    {!taskLoadError && unassignedGoalTasks.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Không có task nào đang treo trực tiếp dưới goal.
                      </p>
                    ) : null}

                    {!taskLoadError && unassignedGoalTasks.length > 0 ? (
                      <div className="space-y-3">
                        {unassignedGoalTasks.map((task) => (
                          <Link
                            key={task.id}
                            href={`/tasks/${task.id}`}
                            className="block rounded-xl border border-slate-200 bg-slate-50 p-3 hover:border-blue-300 hover:bg-blue-50/40"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-800">{task.name}</p>
                              <span className="text-xs font-semibold text-slate-600">{task.progress}%</span>
                            </div>
                            <div className="mt-1 text-xs font-medium text-slate-600">
                              {(TASK_TYPES.find((item) => item.value === task.type)?.label ?? "KPI")}
                              {" · "}
                              {task.status}
                              {" · "}
                              {task.assigneeName}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-400">
                              {getTaskProgressHint(task.type)}
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full rounded-full bg-blue-600"
                                style={{ width: `${task.progress}%` }}
                              />
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : null}
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
                </section>

                <aside className="h-fit space-y-5">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="text-base font-semibold text-slate-900">Thông tin chi tiết</h2>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Phòng ban chính</span>
                        <span className="text-right font-medium text-slate-800">
                          {departmentName ?? "Chưa có phòng ban"}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Team tham gia</span>
                        <span className="text-right font-medium text-slate-800">
                          {relatedDepartments.length > 0 ? relatedDepartments.length : 1}
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
                      <h2 className="text-base font-semibold text-slate-900">Hiệu suất thực thi</h2>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {goalTasks.length} task
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                          TB tiến độ key result
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">
                          {averageKeyResultProgress}%
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                          TB tiến độ task
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">
                          {averageTaskProgress}%
                        </p>
                      </div>

                      {tasksByStatus.map((item) => {
                        const percent = goalTasks.length ? Math.round((item.count / goalTasks.length) * 100) : 0;
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
                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="text-base font-semibold text-slate-900">Team tham gia</h2>
                    {relatedDepartmentLoadError ? (
                      <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {relatedDepartmentLoadError}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {relatedDepartments.length > 0 ? (
                        relatedDepartments.map((department) => (
                          <span
                            key={department.id}
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              department.id === goal.department_id
                                ? "bg-blue-50 text-blue-700"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {department.name}
                            {department.id === goal.department_id ? " · chính" : ""}
                          </span>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">Chưa có dữ liệu team tham gia.</p>
                      )}
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
