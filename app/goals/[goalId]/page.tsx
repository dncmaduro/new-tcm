"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { GOAL_STATUSES, GOAL_TYPES } from "@/lib/constants/goals";
import {
  KEY_RESULT_UNITS,
  formatKeyResultMetric,
  formatKeyResultUnit,
  type KeyResultUnitValue,
} from "@/lib/constants/key-results";
import { getTaskProgressHint, TASK_STATUSES, TASK_TYPES } from "@/lib/constants/tasks";
import {
  buildGoalProgressMap,
  buildGoalDepartmentPerformanceMap,
  buildKeyResultProgressMap,
  computeWeightedProgress,
  getComputedTaskProgress,
  normalizeComputedProgress,
  normalizeParticipationWeights,
} from "@/lib/okr";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";

type GoalDetailRow = {
  id: string;
  name: string;
  description: string | null;
  type: string | null;
  department_id: string | null;
  status: string | null;
  quarter: number | null;
  year: number | null;
  note: string | null;
  parent_goal_id: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type TaskRow = {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  progress: number | null;
  weight: number | null;
  profile_id: string | null;
  key_result_id: string | null;
  key_result?: { id: string; goal_id: string | null; goal?: { id: string; name: string } | null } | null;
};

type ChildGoalRow = {
  id: string;
  name: string;
  status: string | null;
  progress: number;
  quarter: number | null;
  year: number | null;
  start_date: string | null;
  end_date: string | null;
};

type KeyResultRow = {
  id: string;
  goal_id: string;
  name: string;
  description: string | null;
  start_value: number;
  target: number;
  current: number;
  unit: string | null;
  weight: number | null;
  responsible_department_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type GoalDepartmentLinkRow = {
  department_id: string | null;
  role: string | null;
  goal_weight: number | null;
  kr_weight: number | null;
};

type DepartmentRow = {
  id: string;
  name: string;
};

type GoalDepartmentItem = {
  goalId: string;
  departmentId: string;
  name: string;
  role: string;
  goalWeight: number;
  krWeight: number;
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
  rawStatus: string | null;
  status: string;
  progress: number;
  weight: number;
  profileId: string | null;
  assigneeName: string;
  keyResultId: string | null;
};

type KeyResultScaleFormState = {
  current: string;
  target: string;
  unit: KeyResultUnitValue;
  weight: string;
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

const formatQuarterYear = (quarter: number | null, year: number | null) => {
  if (quarter && year) {
    return `Q${quarter} ${year}`;
  }
  if (year) {
    return `Năm ${year}`;
  }
  return "Chưa đặt kỳ";
};

const toKeyResultUnitValue = (value: string | null): KeyResultUnitValue =>
  KEY_RESULT_UNITS.find((unit) => unit.value === value)?.value ?? KEY_RESULT_UNITS[0].value;

const createKeyResultScaleForm = (keyResult: KeyResultRow): KeyResultScaleFormState => ({
  current: String(Number.isFinite(keyResult.current) ? Number(keyResult.current) : 0),
  target: String(Number.isFinite(keyResult.target) ? Number(keyResult.target) : 0),
  unit: toKeyResultUnitValue(keyResult.unit),
  weight: String(Math.round(Number(keyResult.weight ?? 1))),
});

const getReadableKeyResultSaveError = (message: string | null | undefined) => {
  const normalizedMessage = String(message ?? "").toLowerCase();

  if (
    normalizedMessage.includes('record "new" has no field "progress"') ||
    normalizedMessage.includes('record "old" has no field "progress"')
  ) {
    return "DB đang còn trigger cũ của key result dùng cột progress không còn tồn tại. Cần chạy migration sửa trigger key_results.";
  }

  return message || "Không thể cập nhật key result.";
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
  const workspaceAccess = useWorkspaceAccess();
  const goalId = params.goalId;
  const hasValidGoalId = Boolean(goalId);

  const [goal, setGoal] = useState<GoalDetailRow | null>(null);
  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const [goalDepartments, setGoalDepartments] = useState<GoalDepartmentItem[]>([]);
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
  const [editingKeyResultId, setEditingKeyResultId] = useState<string | null>(null);
  const [keyResultScaleForm, setKeyResultScaleForm] = useState<KeyResultScaleFormState | null>(null);
  const [keyResultScaleError, setKeyResultScaleError] = useState<string | null>(null);
  const [savingKeyResultId, setSavingKeyResultId] = useState<string | null>(null);
  const [savedKeyResultId, setSavedKeyResultId] = useState<string | null>(null);

  const isCheckingCreatePermission = workspaceAccess.isLoading;
  const canCreateKeyResult = workspaceAccess.canManage && !workspaceAccess.error;

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
      setEditingKeyResultId(null);
      setKeyResultScaleForm(null);
      setKeyResultScaleError(null);
      setSavingKeyResultId(null);

      const { data: goalData, error: goalError } = await supabase
        .from("goals")
        .select(
          "id,name,description,type,department_id,status,quarter,year,note,parent_goal_id,start_date,end_date,created_at,updated_at",
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
        setGoalDepartments([]);
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
        setGoalDepartments([]);
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
          .from("goals")
          .select("id,name,status,quarter,year,start_date,end_date")
          .eq("parent_goal_id", typedGoal.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("key_results")
          .select(
            "id,goal_id,name,description,start_value,target,current,unit,weight,responsible_department_id,created_at,updated_at",
          )
          .eq("goal_id", typedGoal.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("goal_departments")
          .select("department_id,role,goal_weight,kr_weight")
          .eq("goal_id", typedGoal.id),
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

      const mappedKeyResults = ((keyResultsData ?? []) as unknown as KeyResultRow[]).map((keyResult) => ({
        ...keyResult,
        id: String(keyResult.id),
        goal_id: String(keyResult.goal_id),
        start_value:
          typeof keyResult.start_value === "number"
            ? keyResult.start_value
            : Number(keyResult.start_value ?? 0),
        target:
          typeof keyResult.target === "number" ? keyResult.target : Number(keyResult.target ?? 0),
        current:
          typeof keyResult.current === "number" ? keyResult.current : Number(keyResult.current ?? 0),
        unit: keyResult.unit ? String(keyResult.unit) : null,
        weight: typeof keyResult.weight === "number" ? keyResult.weight : Number(keyResult.weight ?? 1),
        responsible_department_id: keyResult.responsible_department_id
          ? String(keyResult.responsible_department_id)
          : null,
      }));
      setKeyResults(mappedKeyResults);

      const keyResultIds = mappedKeyResults.map((item) => item.id);
      const { data: tasksData, error: tasksError } = keyResultIds.length > 0
        ? await supabase
            .from("tasks")
            .select(`
              id,
              name,
              type,
              status,
              progress,
              weight,
              profile_id,
              key_result_id,
              key_result:key_results!tasks_key_result_id_fkey(
                id,
                goal_id,
                goal:goals!key_results_goal_id_fkey(
                  id,
                  name
                )
              )
            `)
            .in("key_result_id", keyResultIds)
            .order("created_at", { ascending: false })
        : { data: [], error: null };

      if (!isActive) {
        return;
      }

      const typedTasks = (tasksData ?? []) as unknown as TaskRow[];
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
          rawStatus: task.status ? String(task.status) : null,
          status: task.status ? taskStatusLabelMap[task.status] ?? task.status : "Chưa đặt",
          progress: getComputedTaskProgress(task),
          weight: typeof task.weight === "number" ? task.weight : Number(task.weight ?? 1),
          profileId: task.profile_id ? String(task.profile_id) : null,
          assigneeName: task.profile_id ? profileNameById[task.profile_id] ?? "Chưa gán" : "Chưa gán",
          keyResultId: task.key_result_id ? String(task.key_result_id) : null,
        })),
      );

      const mappedChildGoals = ((childGoalsData ?? []) as ChildGoalRow[]).map((child) => ({
        id: String(child.id),
        name: String(child.name),
        status: child.status ? String(child.status) : null,
        quarter: typeof child.quarter === "number" ? child.quarter : null,
        year: typeof child.year === "number" ? child.year : null,
        start_date: child.start_date ? String(child.start_date) : null,
        end_date: child.end_date ? String(child.end_date) : null,
      }));

      const childGoalIds = mappedChildGoals.map((child) => child.id);
      const { data: childKeyResultsData, error: childKeyResultsError } = childGoalIds.length > 0
        ? await supabase.from("key_results").select("id,goal_id").in("goal_id", childGoalIds)
        : { data: [], error: null };

      if (!isActive) {
        return;
      }

      const childKeyResults = ((childKeyResultsData ?? []) as Array<{ id: string; goal_id: string | null }>).map(
        (keyResult) => ({
          id: String(keyResult.id),
          goal_id: keyResult.goal_id ? String(keyResult.goal_id) : null,
        }),
      );
      const childKeyResultIds = childKeyResults.map((item) => item.id);
      const { data: childTasksData, error: childTasksError } = childKeyResultIds.length > 0
        ? await supabase
            .from("tasks")
            .select("id,key_result_id,type,status,progress,weight")
            .in("key_result_id", childKeyResultIds)
        : { data: [], error: null };

      if (!isActive) {
        return;
      }

      const childKeyResultProgressMap = buildKeyResultProgressMap(
        childKeyResults,
        ((childTasksData ?? []) as Array<{
          key_result_id: string | null;
          type: string | null;
          status: string | null;
          progress: number | null;
          weight: number | null;
        }>).map((task) => ({
          key_result_id: task.key_result_id ? String(task.key_result_id) : null,
          type: task.type ? String(task.type) : null,
          status: task.status ? String(task.status) : null,
          progress: task.progress,
          weight: task.weight,
        })),
      );
      const childGoalProgressMap = buildGoalProgressMap(
        mappedChildGoals.map((child) => child.id),
        childKeyResults,
        childKeyResultProgressMap,
      );

      setChildGoals(
        mappedChildGoals.map((child) => ({
          ...child,
          progress: childGoalProgressMap[child.id] ?? 0,
        })),
      );

      const relatedDepartmentIds = Array.from(
        new Set([
          typedGoal.department_id,
          ...((goalDepartmentLinks ?? []) as GoalDepartmentLinkRow[]).map((item) => item.department_id),
          ...mappedKeyResults.map((item) => item.responsible_department_id),
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
          setGoalDepartments([]);
          setRelatedDepartmentLoadError("Không tải được danh sách team tham gia.");
        } else {
          const departmentsById = ((relatedDepartmentsData ?? []) as DepartmentRow[]).reduce<Record<string, string>>(
            (acc, department) => {
              acc[String(department.id)] = String(department.name);
              return acc;
            },
            {},
          );

          const rawGoalDepartments = ((goalDepartmentLinks ?? []) as GoalDepartmentLinkRow[]).map((item) => {
            const weights = normalizeParticipationWeights({
              goalWeight: item.goal_weight,
              krWeight: item.kr_weight,
            });
            return {
              goalId: typedGoal.id,
              departmentId: String(item.department_id),
              name: departmentsById[String(item.department_id)] ?? "Phòng ban",
              role: item.role ? String(item.role) : "participant",
              goalWeight: weights.goalWeight,
              krWeight: weights.krWeight,
            } satisfies GoalDepartmentItem;
          });

          const normalizedGoalDepartments =
            rawGoalDepartments.find((item) => item.departmentId === typedGoal.department_id) ||
            !typedGoal.department_id
              ? rawGoalDepartments
              : [
                  {
                    goalId: typedGoal.id,
                    departmentId: String(typedGoal.department_id),
                    name: departmentsById[String(typedGoal.department_id)] ?? departmentData?.name ?? "Phòng ban chính",
                    role: "owner",
                    goalWeight: 0.5,
                    krWeight: 0.5,
                  },
                  ...rawGoalDepartments,
                ];

          setGoalDepartments(normalizedGoalDepartments);
        }
      } else {
        setGoalDepartments([]);
      }

      if (tasksError) {
        setTaskLoadError("Không tải được danh sách công việc của mục tiêu.");
      }
      if (childGoalsError) {
        setChildGoalLoadError("Không tải được danh sách mục tiêu con.");
      }
      if (childKeyResultsError || childTasksError) {
        setChildGoalLoadError("Không tải đủ dữ liệu để tính tiến độ mục tiêu con.");
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

  const keyResultProgressMap = useMemo(
    () =>
      buildKeyResultProgressMap(
        keyResults,
        goalTasks.map((task) => ({
          keyResultId: task.keyResultId,
          type: task.type,
          status: task.rawStatus,
          progress: task.progress,
          weight: task.weight,
        })),
      ),
    [goalTasks, keyResults],
  );
  const goalProgress = useMemo(() => {
    if (!goal?.id) {
      return 0;
    }
    return buildGoalProgressMap([goal.id], keyResults, keyResultProgressMap)[goal.id] ?? 0;
  }, [goal, keyResultProgressMap, keyResults]);
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
    return computeWeightedProgress(goalTasks);
  }, [goalTasks]);

  const taskCompletionRate = useMemo(() => {
    if (!goalTasks.length) {
      return 0;
    }
    const doneCount = goalTasks.filter((task) => task.rawStatus === "done").length;
    return Math.round((doneCount / goalTasks.length) * 100);
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
  const assignedGoalTaskCount = goalTasks.length - unassignedGoalTasks.length;
  const goalDepartmentsById = useMemo(
    () =>
      goalDepartments.reduce<Record<string, GoalDepartmentItem>>((acc, item) => {
        acc[item.departmentId] = item;
        return acc;
      }, {}),
    [goalDepartments],
  );

  const averageKeyResultProgress = useMemo(() => {
    if (!keyResults.length) {
      return 0;
    }
    const total = keyResults.reduce((acc, keyResult) => acc + (keyResultProgressMap[keyResult.id] ?? 0), 0);
    return Math.round(total / keyResults.length);
  }, [keyResultProgressMap, keyResults]);
  const goalProgressHelp =
    "Tiến độ goal = trung bình tiến độ các key result. Tiến độ key result = trung bình có trọng số của task nằm dưới KR.";
  const taskCompletionHelp = "Tỷ lệ hoàn thành task = số task done / tổng số task trong mục tiêu.";
  const departmentPerformanceMap = useMemo(() => {
    if (!goal?.id || goalDepartments.length === 0) {
      return {};
    }

    return buildGoalDepartmentPerformanceMap(goalDepartments, keyResults, keyResultProgressMap, {
      [goal.id]: goalProgress,
    });
  }, [goal, goalDepartments, goalProgress, keyResultProgressMap, keyResults]);
  const departmentPerformanceItems = useMemo(() => {
    return goalDepartments.map((department) => {
      const ownedKeyResults = keyResults.filter(
        (keyResult) => keyResult.responsible_department_id === department.departmentId,
      );
      const ownedTaskCount = ownedKeyResults.reduce(
        (total, keyResult) => total + (tasksByKeyResultId[keyResult.id]?.length ?? 0),
        0,
      );
      const performance = departmentPerformanceMap[`${department.goalId}:${department.departmentId}`];

      return {
        ...department,
        ownedKrCount: ownedKeyResults.length,
        ownedTaskCount,
        goalProgress: performance?.goalProgress ?? goalProgress,
        departmentKrProgress: performance?.departmentKrProgress ?? 0,
        performance: performance?.performance ?? 0,
      };
    });
  }, [departmentPerformanceMap, goalDepartments, goalProgress, keyResults, tasksByKeyResultId]);

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
  const createKeyResultHref = hasValidGoalId ? `/goals/${goalId}/key-results/new` : "/goals";
  const keyResultNotice =
    searchParams.get("krCreated") === "1"
      ? "Đã tạo key result. Bạn có thể gắn task vào KR này ngay."
      : null;

  const startEditingKeyResultScale = (keyResult: KeyResultRow) => {
    setEditingKeyResultId(keyResult.id);
    setKeyResultScaleForm(createKeyResultScaleForm(keyResult));
    setKeyResultScaleError(null);
    setSavedKeyResultId(null);
  };

  const cancelEditingKeyResultScale = () => {
    setEditingKeyResultId(null);
    setKeyResultScaleForm(null);
    setKeyResultScaleError(null);
  };

  const handleSaveKeyResultScale = async (keyResult: KeyResultRow) => {
    if (!keyResultScaleForm || editingKeyResultId !== keyResult.id) {
      return;
    }

    if (!canCreateKeyResult) {
      setKeyResultScaleError("Bạn không có quyền cập nhật key result ở mục tiêu này.");
      return;
    }

    const safeCurrent = Number(keyResultScaleForm.current);
    const safeTarget = Number(keyResultScaleForm.target);
    const safeWeight = Number(keyResultScaleForm.weight);

    if (!Number.isFinite(safeCurrent) || safeCurrent < 0) {
      setKeyResultScaleError("Hiện tại không được nhỏ hơn 0.");
      return;
    }
    if (!Number.isFinite(safeTarget) || safeTarget <= 0) {
      setKeyResultScaleError("Target phải lớn hơn 0.");
      return;
    }
    if (!Number.isFinite(safeWeight) || safeWeight <= 0) {
      setKeyResultScaleError("Trọng số KR phải lớn hơn 0.");
      return;
    }

    setKeyResultScaleError(null);
    setSavingKeyResultId(keyResult.id);

    try {
      const payload = {
        current: safeCurrent,
        target: safeTarget,
        unit: keyResultScaleForm.unit,
        weight: Math.round(safeWeight),
      };

      const { error: updateError } = await supabase
        .from("key_results")
        .update(payload)
        .eq("id", keyResult.id);

      if (updateError) {
        if (updateError.code === "42501") {
          setKeyResultScaleError(
            "DB đang chặn UPDATE vào key_results (RLS). Cần chạy migration sửa policy bảng key_results.",
          );
        } else {
          setKeyResultScaleError(getReadableKeyResultSaveError(updateError.message));
        }
        return;
      }

      setKeyResults((prev) =>
        prev.map((item) =>
          item.id === keyResult.id
            ? {
                ...item,
                current: safeCurrent,
                target: safeTarget,
                unit: keyResultScaleForm.unit,
                weight: Math.round(safeWeight),
                updated_at: new Date().toISOString(),
              }
            : item,
        ),
      );
      setSavedKeyResultId(keyResult.id);
      setEditingKeyResultId(null);
      setKeyResultScaleForm(null);
    } catch {
      setKeyResultScaleError("Có lỗi xảy ra khi cập nhật key result.");
    } finally {
      setSavingKeyResultId(null);
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-[#f3f5fa] text-slate-900">
      <div className="flex h-full w-full">
        <WorkspaceSidebar active="goals" />

        <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden lg:pl-[280px]">
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
                {workspaceAccess.canManage && !workspaceAccess.error && hasValidGoalId ? (
                  <Link
                    href={`/goals/new?editGoalId=${goalId}`}
                    className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Sửa mục tiêu
                  </Link>
                ) : null}
                <Link
                  href={createKeyResultHref}
                  className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  + Thêm key result
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
                            {goalDepartments.length || 1}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5">
                      {keyResults.length > 0 ? (
                        <>
                          <div className="mb-2 flex items-center justify-between text-sm">
                            <span className="font-semibold text-slate-700" title={goalProgressHelp}>
                              Tiến độ mục tiêu
                            </span>
                            <span className="font-semibold text-slate-900">{goalProgress}%</span>
                          </div>
                          <ProgressBar value={goalProgress} />
                          <p className="mt-2 text-xs text-slate-500" title={goalProgressHelp}>
                            Dựa trên tiến độ trung bình của các key result.
                          </p>
                        </>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                          Goal chưa có key result nên chưa có đủ dữ liệu để tính tiến độ.
                        </div>
                      )}
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
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">Phòng ban tham gia & hiệu suất</h2>
                        <p className="mt-1 text-sm text-slate-500">
                          Hiệu suất phòng ban = tiến độ mục tiêu x tỷ trọng mục tiêu + tiến độ KR sở hữu x tỷ trọng KR.
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {goalDepartments.length} phòng ban
                      </span>
                    </div>

                    {relatedDepartmentLoadError ? (
                      <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {relatedDepartmentLoadError}
                      </p>
                    ) : null}

                    {departmentPerformanceItems.length > 0 ? (
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {departmentPerformanceItems.map((department) => (
                          <div key={department.departmentId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{department.name}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Vai trò {department.role} · {department.ownedKrCount} KR sở hữu · {department.ownedTaskCount} công việc
                                </p>
                              </div>
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                                {department.performance}%
                              </span>
                            </div>
                            <div className="mt-3">
                              <ProgressBar value={department.performance} />
                            </div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm text-slate-600">
                              <div className="rounded-xl bg-white px-3 py-2">
                                <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Tỷ trọng mục tiêu</p>
                                <p className="mt-1 font-semibold text-slate-900">{department.goalWeight.toFixed(2)}</p>
                              </div>
                              <div className="rounded-xl bg-white px-3 py-2">
                                <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Tỷ trọng KR</p>
                                <p className="mt-1 font-semibold text-slate-900">{department.krWeight.toFixed(2)}</p>
                              </div>
                              <div className="rounded-xl bg-white px-3 py-2">
                                <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Tiến độ KR sở hữu</p>
                                <p className="mt-1 font-semibold text-slate-900">{department.departmentKrProgress}%</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-slate-500">Chưa có cấu hình phòng ban tham gia cho mục tiêu này.</p>
                    )}
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">Key result</h2>
                        <p className="mt-1 text-sm text-slate-500">
                          Hiển thị nhanh tiến độ, hiện tại so với mục tiêu và số task của từng KR.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {keyResults.length} KR
                        </span>
                        <Link
                          href={createKeyResultHref}
                          className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          + Thêm key result
                        </Link>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                          Tiến độ KR trung bình
                        </p>
                        <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
                          {averageKeyResultProgress}%
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                          Số key result
                        </p>
                        <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
                          {keyResults.length}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                          Task đã gắn KR
                        </p>
                        <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
                          {assignedGoalTaskCount}
                        </p>
                        {keyResults.length > 0 ? (
                          <Link
                            href={addTaskHref}
                            className="mt-3 inline-flex text-xs font-semibold text-blue-700 hover:text-blue-800"
                          >
                            + Thêm công việc
                          </Link>
                        ) : (
                          <p className="mt-3 text-xs text-slate-500">Tạo KR trước khi thêm công việc.</p>
                        )}
                      </div>
                    </div>

                    {!isCheckingCreatePermission && !canCreateKeyResult ? (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                        Quyền tạo KR đang dùng cùng logic với quyền tạo goal. Tài khoản hiện tại chưa có quyền này.
                      </div>
                    ) : null}

                    {keyResultNotice ? (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                        {keyResultNotice}
                      </div>
                    ) : null}

                    {keyResultLoadError ? (
                      <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {keyResultLoadError}
                      </p>
                    ) : null}
                    {!keyResultLoadError && keyResults.length === 0 ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                        <p className="text-lg font-semibold text-slate-900">Chưa có Key Result.</p>
                        <p className="mt-2 text-sm text-slate-500">
                          Hãy tạo KR để bắt đầu theo dõi mục tiêu.
                        </p>
                        <Link
                          href={createKeyResultHref}
                          className="mt-4 inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                        >
                          + Thêm Key Result
                        </Link>
                      </div>
                    ) : null}

                    {!keyResultLoadError && keyResults.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {keyResults.map((keyResult) => {
                          const taskItems = tasksByKeyResultId[keyResult.id] ?? [];
                          const keyResultProgress = keyResultProgressMap[keyResult.id] ?? 0;
                          const keyResultTaskHref = `/tasks/new?goalId=${goal.id}&keyResultId=${keyResult.id}`;
                          const responsibleDepartmentName =
                            goalDepartmentsById[keyResult.responsible_department_id ?? ""]?.name ?? "Chưa gán phòng ban";
                          const isEditingKeyResult = editingKeyResultId === keyResult.id && keyResultScaleForm !== null;
                          const isSavingKeyResult = savingKeyResultId === keyResult.id;

                          return (
                            <article
                              key={keyResult.id}
                              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-base font-semibold text-slate-900">{keyResult.name}</p>
                                  <p className="mt-1 text-sm text-slate-500">
                                    {responsibleDepartmentName}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">
                                    {keyResultProgress}%
                                  </span>
                                  {canCreateKeyResult ? (
                                    isEditingKeyResult ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={cancelEditingKeyResultScale}
                                          disabled={isSavingKeyResult}
                                          className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          Hủy
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void handleSaveKeyResultScale(keyResult)}
                                          disabled={isSavingKeyResult}
                                          className="inline-flex h-9 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                                        >
                                          {isSavingKeyResult ? "Đang lưu..." : "Lưu scale"}
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => startEditingKeyResultScale(keyResult)}
                                        className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                                      >
                                        Sửa scale
                                      </button>
                                    )
                                  ) : null}
                                  <Link
                                    href={keyResultTaskHref}
                                    className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                                  >
                                    + Thêm công việc
                                  </Link>
                                </div>
                              </div>

                              {savedKeyResultId === keyResult.id ? (
                                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                                  Đã lưu scale key result.
                                </div>
                              ) : null}

                              {isEditingKeyResult ? (
                                <div className="mt-4 grid gap-3 md:grid-cols-4">
                                  <label className="space-y-1.5">
                                    <span className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                                      Đơn vị
                                    </span>
                                    <select
                                      value={keyResultScaleForm.unit}
                                      onChange={(event) =>
                                        setKeyResultScaleForm((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                unit: toKeyResultUnitValue(event.target.value),
                                              }
                                            : prev,
                                        )
                                      }
                                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    >
                                      {KEY_RESULT_UNITS.map((unit) => (
                                        <option key={unit.value} value={unit.value}>
                                          {unit.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>

                                  <label className="space-y-1.5">
                                    <span className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                                      Hiện tại
                                    </span>
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      value={keyResultScaleForm.current}
                                      onChange={(event) =>
                                        setKeyResultScaleForm((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                current: event.target.value,
                                              }
                                            : prev,
                                        )
                                      }
                                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    />
                                  </label>

                                  <label className="space-y-1.5">
                                    <span className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                                      Target
                                    </span>
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      value={keyResultScaleForm.target}
                                      onChange={(event) =>
                                        setKeyResultScaleForm((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                target: event.target.value,
                                              }
                                            : prev,
                                        )
                                      }
                                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    />
                                  </label>

                                  <label className="space-y-1.5">
                                    <span className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                                      Trọng số KR (%)
                                    </span>
                                    <input
                                      type="number"
                                      min={1}
                                      step="1"
                                      value={keyResultScaleForm.weight}
                                      onChange={(event) =>
                                        setKeyResultScaleForm((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                weight: event.target.value,
                                              }
                                            : prev,
                                        )
                                      }
                                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    />
                                  </label>
                                </div>
                              ) : null}

                              {isEditingKeyResult && keyResultScaleError ? (
                                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                  {keyResultScaleError}
                                </div>
                              ) : null}

                              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.6fr)_140px_200px]">
                                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                  <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                                    Hiện tại / mục tiêu
                                  </p>
                                  <p className="mt-2 text-lg font-semibold text-slate-900">
                                    {formatKeyResultMetric(keyResult.current, keyResult.unit)}
                                    {" / "}
                                    {formatKeyResultMetric(keyResult.target, keyResult.unit)}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {formatKeyResultUnit(keyResult.unit)}
                                  </p>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                  <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                                    Số task
                                  </p>
                                  <p className="mt-2 text-lg font-semibold text-slate-900">{taskItems.length}</p>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                  <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                                    Trọng số KR
                                  </p>
                                  <p className="mt-2 text-lg font-semibold text-slate-900">
                                    {Math.round(Number(keyResult.weight ?? 1))}%
                                  </p>
                                </div>
                              </div>

                              <div className="mt-4">
                                <div className="mb-2 flex items-center justify-between text-sm">
                                  <span className="font-medium text-slate-600">Tiến độ KR</span>
                                  <span className="font-semibold text-slate-900">{keyResultProgress}%</span>
                                </div>
                                <ProgressBar value={keyResultProgress} />
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
                          const childProgress = normalizeComputedProgress(child.progress);
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
                          {goalDepartments.length > 0 ? goalDepartments.length : 1}
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
                        <span className="text-slate-500">Bắt đầu</span>
                        <span className="text-right font-medium text-slate-800">
                          {goal.start_date || "Chưa đặt"}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Kết thúc</span>
                        <span className="text-right font-medium text-slate-800">
                          {goal.end_date || "Chưa đặt"}
                        </span>
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
                        <p
                          className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase"
                          title={goalProgressHelp}
                        >
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

                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p
                          className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase"
                          title={taskCompletionHelp}
                        >
                          Tỷ lệ task hoàn thành
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{taskCompletionRate}%</p>
                      </div>

                      <div className="rounded-xl border border-slate-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-800">
                        <p className="font-semibold">Cách tính tiến độ</p>
                        <p className="mt-1">{goalProgressHelp}</p>
                        <p className="mt-2">{taskCompletionHelp}</p>
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
                    <div className="mt-3 space-y-3">
                      {goalDepartments.length > 0 ? (
                        goalDepartments.map((department) => (
                          <div key={department.departmentId} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-900">{department.name}</p>
                              <span
                                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                  department.departmentId === goal.department_id
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-white text-slate-600"
                                }`}
                              >
                                {department.role}
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-slate-500">
                              Tỷ trọng mục tiêu {department.goalWeight.toFixed(2)} · Tỷ trọng KR {department.krWeight.toFixed(2)}
                            </p>
                          </div>
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
