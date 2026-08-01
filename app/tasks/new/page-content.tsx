"use client";

import { InfoCircledIcon } from "@radix-ui/react-icons";
import { useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { FormEvent, Suspense, type ReactNode, useEffect, useMemo, useState } from "react";
import { useLeaveFormConfirm } from "@/components/use-leave-form-confirm";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/lib/supabase";
import {
  getTaskPriorityOptionLabel,
  TASK_PRIORITIES,
  type TaskPriority,
  TASK_TYPES,
  TaskTypeValue,
} from "@/lib/constants/tasks";
import {
  getAllowedKeyResultUnitsByType,
  normalizeKeyResultTypeValue,
  normalizeKeyResultUnitForType,
  type KeyResultUnitValue,
} from "@/lib/constants/key-results";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getTimelineOutsideParentWarning,
  isDateRangeOrdered,
} from "@/lib/timeline";
import { cn } from "@/lib/utils";
import { OKR_FEATURE_ENABLED } from "@/lib/features";

type GoalOption = {
  id: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  startDate: string | null;
  endDate: string | null;
};

type ProfileOption = {
  id: string;
  name: string;
  email: string | null;
};

type DepartmentOption = {
  id: string;
  name: string;
};

type KeyResultOption = {
  id: string;
  goalId: string | null;
  goalName: string;
  goalType: string | null;
  name: string;
  type: string | null;
  contributionType: string | null;
  startValue: number;
  target: number;
  current: number;
  unit: string | null;
  weight: number;
  startDate: string | null;
  endDate: string | null;
};

type PrefillResolution = {
  resolvedGoalId: string | null;
  resolvedKeyResultId: string | null;
  resolvedKeyResult: KeyResultOption | null;
  warning: string | null;
};

type TaskFormState = {
  goalId: string;
  keyResultId: string;
  profileId: string;
  type: TaskTypeValue;
  priority: TaskPriority;
  unit: KeyResultUnitValue;
  target: string;
  current: string;
  name: string;
  description: string;
  note: string;
  isRecurring: boolean;
  hypothesis: string;
  result: string;
  startDate: string;
  endDate: string;
};

type FormToggleSwitchProps = {
  id: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
};

const defaultForm: TaskFormState = {
  goalId: "",
  keyResultId: "",
  profileId: "",
  type: "kpi",
  priority: "medium",
  unit: "count",
  target: "",
  current: "0",
  name: "",
  description: "",
  note: "",
  isRecurring: false,
  hypothesis: "",
  result: "",
  startDate: "",
  endDate: "",
};

const MAX_BULK_TASK_CREATE_COUNT = 200;

const inputClassName =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

const textareaClassName =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

function FormSection({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4", className)}>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-700">
      {children}
    </label>
  );
}

const getSearchParamValue = (searchParams: ReturnType<typeof useSearchParams>, key: string) => {
  const value = searchParams.get(key)?.trim();
  return value ? value : null;
};

const FormToggleSwitch = ({
  id,
  checked,
  onCheckedChange,
  disabled = false,
}: FormToggleSwitchProps) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    aria-disabled={disabled}
    disabled={disabled}
    onClick={() => onCheckedChange(!checked)}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
      checked ? "bg-blue-600" : "bg-slate-300"
    } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
  >
    <span
      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
        checked ? "translate-x-5" : "translate-x-1"
      }`}
    />
  </button>
);

const resolveTaskPrefill = ({
  queryGoalId,
  queryKeyResultId,
  queryDepartmentId,
  goals,
  keyResults,
  keyResultFromQuery,
}: {
  queryGoalId: string | null;
  queryKeyResultId: string | null;
  queryDepartmentId: string | null;
  goals: GoalOption[];
  keyResults: KeyResultOption[];
  keyResultFromQuery: KeyResultOption | null;
}): PrefillResolution => {
  if (queryKeyResultId) {
    const resolvedKeyResult =
      keyResultFromQuery ?? keyResults.find((item) => item.id === queryKeyResultId) ?? null;
    if (!resolvedKeyResult) {
      return {
        resolvedGoalId: queryGoalId ?? null,
        resolvedKeyResultId: null,
        resolvedKeyResult: null,
        warning:
          "Không tìm thấy Key Result từ URL. Có thể Key Result không tồn tại hoặc bạn không có quyền SELECT.",
      };
    }

    const resolvedGoalId = resolvedKeyResult?.goalId ?? queryGoalId ?? null;
    const warning =
      queryGoalId && resolvedKeyResult?.goalId && queryGoalId !== resolvedKeyResult.goalId
        ? "Key Result không thuộc goal trên URL. Hệ thống đã ưu tiên goal thật của Key Result."
        : null;
    return {
      resolvedGoalId,
      resolvedKeyResultId: resolvedKeyResult.id,
      resolvedKeyResult,
      warning,
    };
  }

  if (queryGoalId) {
    const resolvedGoal = goals.find((goal) => goal.id === queryGoalId) ?? null;
    const resolvedGoalId = resolvedGoal?.id ?? queryGoalId;
    const resolvedKeyResult = keyResults.find((item) => item.goalId === resolvedGoalId) ?? null;
    return {
      resolvedGoalId,
      resolvedKeyResultId: resolvedKeyResult?.id ?? null,
      resolvedKeyResult,
      warning: null,
    };
  }

  if (queryDepartmentId) {
    const resolvedGoal = goals.find((goal) => goal.departmentId === queryDepartmentId) ?? null;
    const resolvedKeyResult = resolvedGoal
      ? (keyResults.find((item) => item.goalId === resolvedGoal.id) ?? null)
      : null;
    return {
      resolvedGoalId: resolvedGoal?.id ?? null,
      resolvedKeyResultId: resolvedKeyResult?.id ?? null,
      resolvedKeyResult,
      warning: null,
    };
  }

  return {
    resolvedGoalId: null,
    resolvedKeyResultId: null,
    resolvedKeyResult: null,
    warning: null,
  };
};

function NewTaskPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceAccess = useWorkspaceAccess();

  const [form, setForm] = useState<TaskFormState>(defaultForm);
  const [goalOptions, setGoalOptions] = useState<GoalOption[]>([]);
  const [keyResultOptions, setKeyResultOptions] = useState<KeyResultOption[]>([]);
  const [profileOptions, setProfileOptions] = useState<ProfileOption[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<DepartmentOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingFormData, setIsLoadingFormData] = useState(false);
  const [isContinuousCreate, setIsContinuousCreate] = useState(false);
  const [isBulkCreateEnabled, setIsBulkCreateEnabled] = useState(false);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);
  const [prefillWarning, setPrefillWarning] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [profileSearchKeyword, setProfileSearchKeyword] = useState("");
  const [isProfileSelectOpen, setIsProfileSelectOpen] = useState(false);
  const { leaveConfirmDialog, runWithoutConfirm } = useLeaveFormConfirm({
    enabled: !isSubmitting,
  });

  const handleCancel = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/tasks");
  };

  const buildTaskMetricDraft = (
    taskType: TaskTypeValue,
    keyResult?: Pick<KeyResultOption, "type" | "unit" | "target"> | null,
  ) => {
    const normalizedType = keyResult ? normalizeKeyResultTypeValue(keyResult.type) : taskType;
    const effectiveType = taskType || normalizedType;
    const unit = normalizeKeyResultUnitForType(effectiveType, keyResult?.unit ?? null);

    return {
      type: effectiveType,
      unit,
      target:
        effectiveType === "okr"
          ? "100"
          : keyResult && Number.isFinite(keyResult.target) && Number(keyResult.target) > 0
            ? String(Number(keyResult.target))
            : "",
      current: "0",
    };
  };

  const queryGoalId = getSearchParamValue(searchParams, "goalId");
  const queryKeyResultId = getSearchParamValue(searchParams, "keyResultId");
  const queryDepartmentId = getSearchParamValue(searchParams, "departmentId");
  const isCheckingPermission = workspaceAccess.isLoading;
  const creatorProfileId = workspaceAccess.profileId;
  const canCreateTask = workspaceAccess.canManage && !workspaceAccess.error;
  const permissionError =
    workspaceAccess.error ??
    (!isCheckingPermission && !workspaceAccess.canManage
      ? "Bạn chưa có quyền tạo task ở phòng ban gốc."
      : null);

  useEffect(() => {
    if (isCheckingPermission) {
      return;
    }

    if (!canCreateTask) {
      setGoalOptions([]);
      setKeyResultOptions([]);
      setProfileOptions([]);
      setDepartmentOptions([]);
      setDataLoadError(null);
      setIsLoadingFormData(false);
      return;
    }

    let isActive = true;

    const loadFormData = async () => {
      try {
        setIsLoadingFormData(true);
        setDataLoadError(null);

        const [
          { data: goalsData, error: goalsError },
          { data: keyResultsData, error: keyResultsError },
          { data: allDepartmentsData },
          { data: profilesData, error: profilesError },
        ] = await Promise.all([
          supabase
            .from("goals")
            .select("id,name,department_id,start_date,end_date,created_at")
            .order("created_at", { ascending: false }),
          supabase
            .from("key_results")
            .select(
              `
                id,
                goal_id,
                name,
                type,
                contribution_type,
                start_value,
                target,
                current,
                unit,
                weight,
                start_date,
                end_date,
                created_at,
                goal:goals!key_results_goal_id_fkey(
                  id,
                  name,
                  type,
                  department_id,
                  start_date,
                  end_date
                )
              `,
            )
            .order("created_at", { ascending: false }),
          supabase.from("departments").select("id,name"),
          supabase.from("profiles").select("id,name,email").order("name", { ascending: true }),
        ]);
        if (!isActive) {
          return;
        }

        const departmentsById = (allDepartmentsData ?? []).reduce<Record<string, string>>(
          (acc, department) => {
            acc[String(department.id)] = String(department.name);
            return acc;
          },
          {},
        );
        setDepartmentOptions(
          (allDepartmentsData ?? []).map((department) => ({
            id: String(department.id),
            name: String(department.name),
          })),
        );

        let mappedGoals: GoalOption[] = (goalsData ?? []).map((goal) => {
          const departmentId = goal.department_id ? String(goal.department_id) : null;
          return {
            id: String(goal.id),
            name: String(goal.name),
            departmentId,
            departmentName: departmentId ? (departmentsById[departmentId] ?? null) : null,
            startDate: goal.start_date ? String(goal.start_date) : null,
            endDate: goal.end_date ? String(goal.end_date) : null,
          };
        });
        let baseKeyResults = ((keyResultsData ?? []) as Array<Record<string, unknown>>).map(
          (keyResult) => {
            const goalRow = Array.isArray(keyResult.goal)
              ? (keyResult.goal[0] ?? null)
              : (keyResult.goal ?? null);
            return {
              id: String(keyResult.id),
              goalId: keyResult.goal_id ? String(keyResult.goal_id) : null,
              goalName: goalRow?.name ? String(goalRow.name) : "Chưa có goal",
              goalType: goalRow?.type ? String(goalRow.type) : null,
              name: String(keyResult.name),
              type: keyResult.type ? String(keyResult.type) : null,
              contributionType: keyResult.contribution_type
                ? String(keyResult.contribution_type)
                : null,
              startValue:
                typeof keyResult.start_value === "number"
                  ? keyResult.start_value
                  : Number(keyResult.start_value ?? 0),
              target:
                typeof keyResult.target === "number"
                  ? keyResult.target
                  : Number(keyResult.target ?? 0),
              current:
                typeof keyResult.current === "number"
                  ? keyResult.current
                  : Number(keyResult.current ?? 0),
              unit: keyResult.unit ? String(keyResult.unit) : null,
              weight:
                typeof keyResult.weight === "number"
                  ? keyResult.weight
                  : Number(keyResult.weight ?? 1),
              startDate: keyResult.start_date ? String(keyResult.start_date) : null,
              endDate: keyResult.end_date ? String(keyResult.end_date) : null,
            };
          },
        );

        const upsertGoalOption = (nextGoal: GoalOption) => {
          if (mappedGoals.some((goal) => goal.id === nextGoal.id)) {
            mappedGoals = mappedGoals.map((goal) => (goal.id === nextGoal.id ? nextGoal : goal));
            return;
          }
          mappedGoals = [...mappedGoals, nextGoal];
        };

        const upsertKeyResultOption = (nextKeyResult: KeyResultOption) => {
          if (baseKeyResults.some((item) => item.id === nextKeyResult.id)) {
            baseKeyResults = baseKeyResults.map((item) =>
              item.id === nextKeyResult.id ? nextKeyResult : item,
            );
            return;
          }
          baseKeyResults = [...baseKeyResults, nextKeyResult];
        };

        let keyResultFromQuery: KeyResultOption | null = null;

        if (queryKeyResultId) {
          const { data: directKeyResultRow } = await supabase
            .from("key_results")
            .select(
              `
                id,
                goal_id,
                name,
                type,
                contribution_type,
                start_value,
                target,
                current,
                unit,
                weight,
                start_date,
                end_date,
                goal:goals!key_results_goal_id_fkey(
                  id,
                  name,
                  type,
                  department_id,
                  start_date,
                  end_date
                )
              `,
            )
            .eq("id", queryKeyResultId)
            .maybeSingle();

          if (directKeyResultRow?.id) {
            const directGoal = Array.isArray(directKeyResultRow.goal)
              ? (directKeyResultRow.goal[0] ?? null)
              : (directKeyResultRow.goal ?? null);

            keyResultFromQuery = {
              id: String(directKeyResultRow.id),
              goalId: directKeyResultRow.goal_id ? String(directKeyResultRow.goal_id) : null,
              goalName: directGoal?.name ? String(directGoal.name) : "Chưa có goal",
              goalType: directGoal?.type ? String(directGoal.type) : null,
              name: String(directKeyResultRow.name),
              type: directKeyResultRow.type ? String(directKeyResultRow.type) : null,
              contributionType: directKeyResultRow.contribution_type
                ? String(directKeyResultRow.contribution_type)
                : null,
              startValue:
                typeof directKeyResultRow.start_value === "number"
                  ? directKeyResultRow.start_value
                  : Number(directKeyResultRow.start_value ?? 0),
              target:
                typeof directKeyResultRow.target === "number"
                  ? directKeyResultRow.target
                  : Number(directKeyResultRow.target ?? 0),
              current:
                typeof directKeyResultRow.current === "number"
                  ? directKeyResultRow.current
                  : Number(directKeyResultRow.current ?? 0),
              unit: directKeyResultRow.unit ? String(directKeyResultRow.unit) : null,
              weight:
                typeof directKeyResultRow.weight === "number"
                  ? directKeyResultRow.weight
                  : Number(directKeyResultRow.weight ?? 1),
              startDate: directKeyResultRow.start_date
                ? String(directKeyResultRow.start_date)
                : null,
              endDate: directKeyResultRow.end_date ? String(directKeyResultRow.end_date) : null,
            };
            upsertKeyResultOption(keyResultFromQuery);

            if (directGoal?.id) {
              const departmentId = directGoal.department_id
                ? String(directGoal.department_id)
                : null;
              upsertGoalOption({
                id: String(directGoal.id),
                name: String(directGoal.name),
                departmentId,
                departmentName: departmentId ? (departmentsById[departmentId] ?? null) : null,
                startDate: directGoal.start_date ? String(directGoal.start_date) : null,
                endDate: directGoal.end_date ? String(directGoal.end_date) : null,
              });
            }
          }
        }

        if (queryGoalId && !mappedGoals.some((goal) => goal.id === queryGoalId)) {
          const { data: extraGoalRow } = await supabase
            .from("goals")
            .select("id,name,department_id,start_date,end_date")
            .eq("id", queryGoalId)
            .maybeSingle();

          if (extraGoalRow?.id) {
            const departmentId = extraGoalRow.department_id
              ? String(extraGoalRow.department_id)
              : null;
            upsertGoalOption({
              id: String(extraGoalRow.id),
              name: String(extraGoalRow.name),
              departmentId,
              departmentName: departmentId ? (departmentsById[departmentId] ?? null) : null,
              startDate: extraGoalRow.start_date ? String(extraGoalRow.start_date) : null,
              endDate: extraGoalRow.end_date ? String(extraGoalRow.end_date) : null,
            });
          }
        }

        if (
          queryKeyResultId &&
          !keyResultFromQuery &&
          !baseKeyResults.some((item) => item.id === queryKeyResultId)
        ) {
          const { data: extraKeyResultRow } = await supabase
            .from("key_results")
            .select(
              `
                id,
                goal_id,
                name,
                type,
                contribution_type,
                start_value,
                target,
                current,
                unit,
                weight,
                start_date,
                end_date,
                goal:goals!key_results_goal_id_fkey(
                  id,
                  name,
                  type,
                  department_id,
                  start_date,
                  end_date
                )
              `,
            )
            .eq("id", queryKeyResultId)
            .maybeSingle();

          if (extraKeyResultRow?.id) {
            const extraGoal = Array.isArray(extraKeyResultRow.goal)
              ? (extraKeyResultRow.goal[0] ?? null)
              : (extraKeyResultRow.goal ?? null);

            const extraKeyResultOption: KeyResultOption = {
              id: String(extraKeyResultRow.id),
              goalId: extraKeyResultRow.goal_id ? String(extraKeyResultRow.goal_id) : null,
              goalName: extraGoal?.name ? String(extraGoal.name) : "Chưa có goal",
              goalType: extraGoal?.type ? String(extraGoal.type) : null,
              name: String(extraKeyResultRow.name),
              type: extraKeyResultRow.type ? String(extraKeyResultRow.type) : null,
              contributionType: extraKeyResultRow.contribution_type
                ? String(extraKeyResultRow.contribution_type)
                : null,
              startValue:
                typeof extraKeyResultRow.start_value === "number"
                  ? extraKeyResultRow.start_value
                  : Number(extraKeyResultRow.start_value ?? 0),
              target:
                typeof extraKeyResultRow.target === "number"
                  ? extraKeyResultRow.target
                  : Number(extraKeyResultRow.target ?? 0),
              current:
                typeof extraKeyResultRow.current === "number"
                  ? extraKeyResultRow.current
                  : Number(extraKeyResultRow.current ?? 0),
              unit: extraKeyResultRow.unit ? String(extraKeyResultRow.unit) : null,
              weight:
                typeof extraKeyResultRow.weight === "number"
                  ? extraKeyResultRow.weight
                  : Number(extraKeyResultRow.weight ?? 1),
              startDate: extraKeyResultRow.start_date ? String(extraKeyResultRow.start_date) : null,
              endDate: extraKeyResultRow.end_date ? String(extraKeyResultRow.end_date) : null,
            };

            upsertKeyResultOption(extraKeyResultOption);

            const extraGoalId = extraKeyResultRow.goal_id
              ? String(extraKeyResultRow.goal_id)
              : null;
            if (extraGoalId && !mappedGoals.some((goal) => goal.id === extraGoalId)) {
              const departmentId = extraGoal?.department_id
                ? String(extraGoal.department_id)
                : null;
              upsertGoalOption({
                id: extraGoalId,
                name: extraGoal?.name ? String(extraGoal.name) : "Chưa có goal",
                departmentId,
                departmentName: departmentId ? (departmentsById[departmentId] ?? null) : null,
                startDate: extraGoal?.start_date ? String(extraGoal.start_date) : null,
                endDate: extraGoal?.end_date ? String(extraGoal.end_date) : null,
              });
            }
          }
        }

        setKeyResultOptions(baseKeyResults);

        setGoalOptions(mappedGoals);

        let mappedProfiles: ProfileOption[] = [];
        if (!profilesError) {
          mappedProfiles = (profilesData ?? []).map((item) => ({
            id: String(item.id),
            name: String(item.name ?? "Chưa có tên"),
            email: item.email ? String(item.email) : null,
          }));
        }
        setProfileOptions(mappedProfiles);

        const loadErrorMessages: string[] = [];
        if (goalsError) {
          loadErrorMessages.push("Không tải được danh sách goal.");
        }
        if (keyResultsError) {
          loadErrorMessages.push("Không tải được danh sách key result.");
        }
        if (profilesError) {
          loadErrorMessages.push(
            "Không tải được toàn bộ người phụ trách. Kiểm tra policy SELECT của bảng profiles.",
          );
        }
        if (loadErrorMessages.length > 0) {
          setDataLoadError(loadErrorMessages.join(" "));
        }

        const { resolvedGoalId, resolvedKeyResultId, resolvedKeyResult, warning } =
          resolveTaskPrefill({
            queryGoalId,
            queryKeyResultId,
            queryDepartmentId,
            goals: mappedGoals,
            keyResults: baseKeyResults,
            keyResultFromQuery,
          });
        setPrefillWarning(warning);

        setForm((prev) => ({
          ...prev,
          goalId: resolvedGoalId ?? "",
          keyResultId: resolvedKeyResultId ?? "",
          profileId: mappedProfiles[0]?.id ?? "",
          startDate: resolvedKeyResult?.startDate ?? "",
          endDate: resolvedKeyResult?.endDate ?? "",
          isRecurring: false,
          hypothesis: "",
          result: "",
          ...buildTaskMetricDraft(
            resolvedKeyResult ? normalizeKeyResultTypeValue(resolvedKeyResult.type) : prev.type,
            resolvedKeyResult,
          ),
        }));
      } catch {
        if (isActive) {
          setGoalOptions([]);
          setKeyResultOptions([]);
          setProfileOptions([]);
          setDepartmentOptions([]);
          setPrefillWarning(null);
          setDataLoadError("Có lỗi khi tải dữ liệu tạo task.");
        }
      } finally {
        if (isActive) {
          setIsLoadingFormData(false);
        }
      }
    };

    void loadFormData();

    return () => {
      isActive = false;
    };
  }, [canCreateTask, isCheckingPermission, queryGoalId, queryKeyResultId, queryDepartmentId]);

  const isFormValid = useMemo(
    () =>
      form.name.trim().length > 0 &&
      form.profileId.trim().length > 0 &&
      form.unit.trim().length > 0 &&
      Number.isFinite(Number(form.target)) &&
      Number(form.target) > 0 &&
      Number.isFinite(Number(form.current)) &&
      Number(form.current) >= 0,
    [form],
  );
  const canBulkCreateByQuantity = form.type === "kpi" && form.unit === "count";
  const parsedTargetForBulk = Number(form.target);
  const isBulkTargetValid =
    !isBulkCreateEnabled ||
    (Number.isInteger(parsedTargetForBulk) &&
      parsedTargetForBulk >= 1 &&
      parsedTargetForBulk <= MAX_BULK_TASK_CREATE_COUNT);

  const filteredProfileOptions = useMemo(() => {
    const keyword = profileSearchKeyword.trim().toLowerCase();
    if (!keyword) {
      return profileOptions;
    }
    return profileOptions.filter((profile) =>
      `${profile.name} ${profile.email ?? ""}`.toLowerCase().includes(keyword),
    );
  }, [profileOptions, profileSearchKeyword]);

  const availableKeyResults = useMemo(
    () =>
      form.goalId
        ? keyResultOptions.filter((keyResult) => keyResult.goalId === form.goalId)
        : keyResultOptions,
    [form.goalId, keyResultOptions],
  );

  const displayGoalOptions = useMemo(() => {
    if (!form.goalId || goalOptions.some((goal) => goal.id === form.goalId)) {
      return goalOptions;
    }

    return [
      {
        id: form.goalId,
        name: "Goal đã chọn",
        departmentId: null,
        departmentName: null,
        startDate: null,
        endDate: null,
      },
      ...goalOptions,
    ];
  }, [form.goalId, goalOptions]);

  const displayKeyResultOptions = useMemo(() => {
    if (
      !form.keyResultId ||
      availableKeyResults.some((keyResult) => keyResult.id === form.keyResultId)
    ) {
      return availableKeyResults;
    }

    return [
      {
        id: form.keyResultId,
        goalId: form.goalId || null,
        goalName: form.goalId ? "Goal đã chọn" : "Chưa có goal",
        goalType: null,
        name: "Key Result đã chọn",
        type: null,
        contributionType: null,
        startValue: 0,
        target: 0,
        current: 0,
        unit: null,
        weight: 1,
        startDate: null,
        endDate: null,
      },
      ...availableKeyResults,
    ];
  }, [availableKeyResults, form.goalId, form.keyResultId]);

  const selectedGoal = useMemo(
    () => goalOptions.find((goal) => goal.id === form.goalId) ?? null,
    [form.goalId, goalOptions],
  );
  const selectedGoalForDisplay = useMemo(
    () => displayGoalOptions.find((goal) => goal.id === form.goalId) ?? null,
    [displayGoalOptions, form.goalId],
  );
  const selectedKeyResultForDisplay = useMemo(
    () => displayKeyResultOptions.find((keyResult) => keyResult.id === form.keyResultId) ?? null,
    [displayKeyResultOptions, form.keyResultId],
  );
  const selectedKeyResult = useMemo(
    () => keyResultOptions.find((keyResult) => keyResult.id === form.keyResultId) ?? null,
    [form.keyResultId, keyResultOptions],
  );
  const taskTimelineInputError = useMemo(() => {
    if ((form.startDate && !form.endDate) || (!form.startDate && form.endDate)) {
      return "Vui lòng nhập đủ ngày bắt đầu và ngày kết thúc hoặc để trống cả hai.";
    }
    if (!isDateRangeOrdered(form.startDate || null, form.endDate || null)) {
      return "Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.";
    }
    return null;
  }, [form.endDate, form.startDate]);
  const taskTimelineAlignmentWarning = useMemo(
    () =>
      getTimelineOutsideParentWarning(
        form.startDate || null,
        form.endDate || null,
        selectedKeyResult?.startDate ?? null,
        selectedKeyResult?.endDate ?? null,
        {
          subjectLabel: "Thời gian task",
          parentLabel: "KR",
        },
      ),
    [form.endDate, form.startDate, selectedKeyResult?.endDate, selectedKeyResult?.startDate],
  );

  useEffect(() => {
    if (canBulkCreateByQuantity) {
      return;
    }
    setIsBulkCreateEnabled(false);
  }, [canBulkCreateByQuantity]);

  const selectedDepartmentName =
    selectedGoal?.departmentName ??
    (queryDepartmentId
      ? (departmentOptions.find((department) => department.id === queryDepartmentId)?.name ?? null)
      : null);

  const hasMissingGoalContext = Boolean(queryGoalId && !goalOptions.some((goal) => goal.id === queryGoalId));
  const hasMissingKeyResultContext = Boolean(
    queryKeyResultId && !keyResultOptions.some((keyResult) => keyResult.id === queryKeyResultId),
  );
  const hasMissingDepartmentContext = Boolean(
    queryDepartmentId &&
      !departmentOptions.some((department) => department.id === queryDepartmentId) &&
      !selectedDepartmentName,
  );
  const hasContextLookupError =
    hasMissingGoalContext || hasMissingKeyResultContext || hasMissingDepartmentContext;
  const goalContextValue = selectedGoal
    ? selectedGoal.name
    : hasMissingGoalContext
      ? "Không tìm thấy dữ liệu đã chọn"
      : form.goalId
        ? "Đang đồng bộ dữ liệu..."
        : "Chưa chọn";
  const keyResultContextValue = selectedKeyResult
    ? selectedKeyResult.name
    : hasMissingKeyResultContext
      ? "Không tìm thấy dữ liệu đã chọn"
      : form.keyResultId
        ? "Đang đồng bộ dữ liệu..."
        : "Chưa chọn";
  const departmentContextValue = selectedDepartmentName
    ? selectedDepartmentName
    : hasMissingDepartmentContext
      ? "Không tìm thấy dữ liệu đã chọn"
      : queryDepartmentId
        ? "Đang đồng bộ dữ liệu..."
        : "Chưa chọn";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitSuccess(null);

    if (!canCreateTask) {
      setSubmitError("Bạn không có quyền tạo task.");
      return;
    }

    if (!isFormValid) {
      setSubmitError("Vui lòng điền đầy đủ thông tin hợp lệ.");
      return;
    }
    if (!creatorProfileId) {
      setSubmitError("Không xác định được người tạo task hiện tại.");
      return;
    }
    if (taskTimelineInputError) {
      setSubmitError(taskTimelineInputError);
      return;
    }

    const safeTarget = Number(form.target);
    if (!Number.isFinite(safeTarget) || safeTarget <= 0) {
      setSubmitError("Chỉ tiêu cần đạt phải lớn hơn 0.");
      return;
    }
    const safeCurrent = Number(form.current);
    if (!Number.isFinite(safeCurrent) || safeCurrent < 0) {
      setSubmitError("Giá trị hiện tại phải lớn hơn hoặc bằng 0.");
      return;
    }
    if (!isBulkTargetValid) {
      setSubmitError(
        `Khi bật tạo hàng loạt, "Chỉ tiêu cần đạt" phải là số nguyên từ 1 đến ${MAX_BULK_TASK_CREATE_COUNT}.`,
      );
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const baseTaskName = form.name.trim();
      const shouldBulkCreateByTarget = canBulkCreateByQuantity && isBulkCreateEnabled;
      const effectiveCreateCount = shouldBulkCreateByTarget ? Number(form.target) : 1;
      const targetPerTask = shouldBulkCreateByTarget ? 1 : safeTarget;
      const currentPerTask = shouldBulkCreateByTarget ? 0 : safeCurrent;

      const payload = {
        key_result_id: OKR_FEATURE_ENABLED ? form.keyResultId.trim() || null : null,
        assignee_id: form.profileId,
        profile_id: form.profileId,
        creator_profile_id: creatorProfileId,
        type: form.type,
        priority: form.priority,
        unit: form.unit,
        target: targetPerTask,
        current: currentPerTask,
        name: baseTaskName,
        description: form.description.trim() || null,
        note: form.note.trim() || null,
        is_recurring: form.isRecurring,
        hypothesis: form.hypothesis.trim() || null,
        result: form.result.trim() || null,
        weight: 1,
        start_date: form.startDate.trim() || null,
        end_date: form.endDate.trim() || null,
      };

      const payloads = Array.from({ length: effectiveCreateCount }, (_, index) => ({
        ...payload,
        name:
          effectiveCreateCount > 1
            ? `${baseTaskName} (${index + 1}/${effectiveCreateCount})`
            : payload.name,
      }));

      let insertedTaskIds: string[] = [];
      let { data: insertedTasks, error } = await supabase.from("tasks").insert(payloads).select("id");
      if (
        error &&
        typeof error.message === "string" &&
        (error.message.includes("column") || error.message.includes("schema")) &&
        error.message.includes("current")
      ) {
        const payloadsWithoutCurrent = payloads.map((item) => {
          const { current, ...rest } = item;
          void current;
          return rest;
        });
        const retry = await supabase.from("tasks").insert(payloadsWithoutCurrent).select("id");
        insertedTasks = retry.data;
        error = retry.error;
      }
      if (error) {
        if (error.code === "42501") {
          setSubmitError(
            "Bạn không có quyền tạo task (RLS). Vui lòng kiểm tra lại policy INSERT bảng tasks.",
          );
        } else {
          setSubmitError(error.message || "Không thể tạo task.");
        }
        return;
      }
      insertedTaskIds = (insertedTasks ?? [])
        .map((task) => ("id" in task && task.id ? String(task.id) : ""))
        .filter(Boolean);

      if (isContinuousCreate) {
        setForm(defaultForm);
        setIsBulkCreateEnabled(false);
        setProfileSearchKeyword("");
        setIsProfileSelectOpen(false);
        setSubmitError(null);
        setSubmitSuccess(
          effectiveCreateCount > 1
            ? `Đã tạo ${effectiveCreateCount} task thành công. Biểu mẫu đã được làm mới để tạo tiếp.`
            : "Đã tạo task thành công. Biểu mẫu đã được làm mới để tạo tiếp.",
        );
        return;
      }

      runWithoutConfirm(() => {
        if (effectiveCreateCount === 1 && insertedTaskIds[0]) {
          router.push(`/tasks/${insertedTaskIds[0]}?created=1`);
          router.refresh();
          return;
        }

        router.push(
          queryGoalId && queryKeyResultId
            ? `/goals/${queryGoalId}/key-results/${queryKeyResultId}?taskCreated=1`
            : "/tasks",
        );
        router.refresh();
      });
    } catch {
      setSubmitError("Có lỗi xảy ra khi tạo task.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="tasks" />

        <div className="flex h-screen w-full flex-1 flex-col overflow-hidden lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader
            title="Tạo task mới"
            items={[{ label: "Quản lý task", href: "/tasks" }, { label: "Tạo task mới" }]}
          />

          <main className="min-h-0 flex-1 overflow-y-auto bg-[#f3f5fa] px-4 py-5 lg:px-7">
            <section className="mx-auto w-full max-w-[980px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_50px_-40px_rgba(15,23,42,0.4)] lg:p-5">
              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex flex-col gap-2 text-sm text-slate-500 md:flex-row md:flex-wrap md:items-center md:gap-4">
                  <span className="min-w-0 md:max-w-[32%]">
                    Goal:{" "}
                    <span className="font-semibold text-slate-800" title={goalContextValue}>
                      <span className="inline-block max-w-full truncate align-bottom">
                        {goalContextValue}
                      </span>
                    </span>
                  </span>
                  <span className="min-w-0 md:max-w-[32%]">
                    KR:{" "}
                    <span className="font-semibold text-slate-800" title={keyResultContextValue}>
                      <span className="inline-block max-w-full truncate align-bottom">
                        {keyResultContextValue}
                      </span>
                    </span>
                  </span>
                  <span className="min-w-0 md:max-w-[32%]">
                    Phòng ban:{" "}
                    <span className="font-semibold text-slate-800" title={departmentContextValue}>
                      <span className="inline-block max-w-full truncate align-bottom">
                        {departmentContextValue}
                      </span>
                    </span>
                  </span>
                </div>
              </div>

              {isLoadingFormData ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Đang tải dữ liệu task...
                </div>
              ) : null}

              {!isLoadingFormData && hasContextLookupError ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  Không tìm thấy dữ liệu đã chọn.
                </div>
              ) : null}

              {isCheckingPermission ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Đang kiểm tra quyền tạo task...
                </div>
              ) : null}

              {!isCheckingPermission && permissionError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {permissionError}
                </div>
              ) : null}

              {!isCheckingPermission && canCreateTask ? (
                <form className="space-y-5" onSubmit={handleSubmit}>
                  {dataLoadError ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      {dataLoadError}
                    </div>
                  ) : null}

                  {prefillWarning ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      {prefillWarning}
                    </div>
                  ) : null}

                  {submitError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {submitError}
                    </div>
                  ) : null}

                  {submitSuccess ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      {submitSuccess}
                    </div>
                  ) : null}

                  <FormSection title="Thông tin cơ bản">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5 md:col-span-2">
                        <FieldLabel htmlFor="task-name">Tên task *</FieldLabel>
                        <input
                          id="task-name"
                          value={form.name}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, name: event.target.value }))
                          }
                          className={inputClassName}
                          placeholder="Nhập tên task"
                        />
                      </div>

                      {OKR_FEATURE_ENABLED ? <div className="space-y-1.5">
                        <FieldLabel>Goal</FieldLabel>
                        <Select
                          disabled={isLoadingFormData}
                          value={form.goalId || undefined}
                          onValueChange={(value) => {
                            if (!value) return;

                            const nextGoalId = value;
                            const nextGoalKeyResults = keyResultOptions.filter(
                              (keyResult) => keyResult.goalId === nextGoalId,
                            );

                            const resolvedKeyResult =
                              nextGoalId && form.keyResultId
                                ? (keyResultOptions.find(
                                    (keyResult) =>
                                      keyResult.id === form.keyResultId &&
                                      keyResult.goalId === nextGoalId,
                                  ) ??
                                  nextGoalKeyResults[0] ??
                                  null)
                                : (nextGoalKeyResults[0] ?? null);

                            setForm((prev) => ({
                              ...prev,
                              goalId: nextGoalId,
                              keyResultId: resolvedKeyResult?.id ?? "",
                              startDate: resolvedKeyResult?.startDate ?? "",
                              endDate: resolvedKeyResult?.endDate ?? "",
                              ...buildTaskMetricDraft(
                                resolvedKeyResult
                                  ? normalizeKeyResultTypeValue(resolvedKeyResult.type)
                                  : prev.type,
                                resolvedKeyResult,
                              ),
                            }));
                          }}
                        >
                          <SelectTrigger>
                            {selectedGoalForDisplay ? (
                              <span className="truncate">
                                {selectedGoalForDisplay.name}
                                {selectedGoalForDisplay.departmentName
                                  ? ` · ${selectedGoalForDisplay.departmentName}`
                                  : ""}
                              </span>
                            ) : (
                              <SelectValue
                                placeholder={
                                  isLoadingFormData ? "Đang tải goal..." : "Chọn goal"
                                }
                              />
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            {displayGoalOptions.map((goal) => (
                              <SelectItem key={goal.id} value={goal.id}>
                                {goal.name}
                                {goal.departmentName ? ` · ${goal.departmentName}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div> : null}

                      {OKR_FEATURE_ENABLED ? <div className="space-y-1.5">
                        <FieldLabel>Key Result</FieldLabel>
                        <Select
                          disabled={isLoadingFormData}
                          value={form.keyResultId || undefined}
                          onValueChange={(value) => {
                            if (!value) return;

                            const matchedKeyResult =
                              keyResultOptions.find((keyResult) => keyResult.id === value) ?? null;

                            setForm((prev) => ({
                              ...prev,
                              goalId: matchedKeyResult?.goalId ?? prev.goalId,
                              keyResultId: value,
                              startDate: matchedKeyResult?.startDate ?? "",
                              endDate: matchedKeyResult?.endDate ?? "",
                              ...buildTaskMetricDraft(
                                matchedKeyResult
                                  ? normalizeKeyResultTypeValue(matchedKeyResult.type)
                                  : prev.type,
                                matchedKeyResult,
                              ),
                            }));
                          }}
                        >
                          <SelectTrigger>
                            {selectedKeyResultForDisplay ? (
                              <span className="truncate">{selectedKeyResultForDisplay.name}</span>
                            ) : (
                              <SelectValue
                                placeholder={
                                  isLoadingFormData ? "Đang tải Key Result..." : "Chọn Key Result"
                                }
                              />
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            {displayKeyResultOptions.map((keyResult) => (
                              <SelectItem key={keyResult.id} value={keyResult.id}>
                                {keyResult.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div> : null}

                      <div className="space-y-1.5 md:col-span-2">
                        <FieldLabel>Người phụ trách *</FieldLabel>
                        <Select
                          disabled={isLoadingFormData}
                          open={isProfileSelectOpen}
                          onOpenChange={(open) => {
                            setIsProfileSelectOpen(open);
                            if (!open) {
                              setProfileSearchKeyword("");
                            }
                          }}
                          value={form.profileId || undefined}
                          onValueChange={(value) => {
                            if (!value) return;

                            setForm((prev) => ({ ...prev, profileId: value }));
                            setProfileSearchKeyword("");
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                isLoadingFormData
                                  ? "Đang tải người phụ trách..."
                                  : "Chọn người phụ trách"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <div className="relative sticky top-0 z-30 -mx-1 mb-2 border-b border-slate-100 bg-white px-2 pb-2 pt-2 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                              <input
                                autoFocus
                                value={profileSearchKeyword}
                                onChange={(event) => setProfileSearchKeyword(event.target.value)}
                                onKeyDown={(event) => {
                                  event.stopPropagation();
                                  if (event.key === "Escape") {
                                    setIsProfileSelectOpen(false);
                                  }
                                }}
                                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                placeholder="Tìm theo tên hoặc email"
                              />
                              <div className="pointer-events-none absolute inset-x-0 -bottom-2 h-2 bg-white" />
                            </div>
                            {filteredProfileOptions.map((profile) => (
                              <SelectItem key={profile.id} value={profile.id}>
                                {profile.name}
                                {profile.email ? ` · ${profile.email}` : ""}
                              </SelectItem>
                            ))}
                            {filteredProfileOptions.length === 0 ? (
                              <div className="px-2 py-2 text-xs text-slate-500">
                                Không tìm thấy người phù hợp.
                              </div>
                            ) : null}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </FormSection>

                  <FormSection title="Kế hoạch & chỉ tiêu">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <FieldLabel>Ngày bắt đầu</FieldLabel>
                        <input
                          type="date"
                          value={form.startDate}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              startDate: event.target.value,
                            }))
                          }
                          className={inputClassName}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <FieldLabel>Ngày kết thúc</FieldLabel>
                        <input
                          type="date"
                          min={form.startDate || undefined}
                          value={form.endDate}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              endDate: event.target.value,
                            }))
                          }
                          className={inputClassName}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <FieldLabel>Loại task</FieldLabel>
                        <Select
                          value={form.type}
                          onValueChange={(value: TaskTypeValue) =>
                            setForm((prev) => ({
                              ...prev,
                              type: value,
                              unit: normalizeKeyResultUnitForType(value, prev.unit),
                              target: value === "okr" ? "100" : prev.target,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn loại task" />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_TYPES.filter((type) => OKR_FEATURE_ENABLED || type.value !== "okr").map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <FieldLabel>Độ ưu tiên *</FieldLabel>
                        <Select
                          value={form.priority}
                          onValueChange={(value: TaskPriority) =>
                            setForm((prev) => ({
                              ...prev,
                              priority: value,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn độ ưu tiên" />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_PRIORITIES.map((priority) => (
                              <SelectItem key={priority.value} value={priority.value}>
                                {getTaskPriorityOptionLabel(priority.value)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <FieldLabel>Phân loại chỉ tiêu</FieldLabel>
                        <Select
                          value={form.unit}
                          disabled={form.type === "okr"}
                          onValueChange={(value: KeyResultUnitValue) =>
                            setForm((prev) => ({
                              ...prev,
                              unit: normalizeKeyResultUnitForType(prev.type, value),
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                form.type === "okr"
                                  ? "Task OKR dùng phần trăm"
                                  : "Chọn loại chỉ tiêu"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {getAllowedKeyResultUnitsByType(form.type).map((unit) => (
                              <SelectItem key={unit.value} value={unit.value}>
                                {unit.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <FieldLabel>Chỉ tiêu cần đạt *</FieldLabel>
                        <FormattedNumberInput
                          value={form.target}
                          disabled={form.type === "okr"}
                          onValueChange={(value) =>
                            setForm((prev) => ({
                              ...prev,
                              target: value,
                            }))
                          }
                          className={cn(
                            inputClassName,
                            form.type === "okr"
                              ? "cursor-not-allowed bg-slate-50 text-slate-500"
                              : "",
                          )}
                          placeholder={
                            form.type === "okr"
                              ? "Task OKR luôn là 100%"
                              : form.unit === "currency"
                                ? "Ví dụ: 2.000.000.000 đ"
                                : "Ví dụ: 40"
                          }
                        />
                      </div>
                    </div>

                    {taskTimelineInputError ? (
                      <p className="-mt-1 text-xs text-rose-600">{taskTimelineInputError}</p>
                    ) : null}

                    {!taskTimelineInputError && taskTimelineAlignmentWarning ? (
                      <p className="-mt-1 text-xs text-amber-600">{taskTimelineAlignmentWarning}</p>
                    ) : null}
                  </FormSection>

                  <FormSection title="Mô tả & tuỳ chọn">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block space-y-1.5 md:col-span-2">
                        <span className="text-sm font-semibold text-slate-700">Mô tả</span>
                        <textarea
                          id="task-description"
                          rows={3}
                          value={form.description}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, description: event.target.value }))
                          }
                          className={textareaClassName}
                          placeholder="Mô tả goal hoặc phạm vi task"
                        />
                      </label>

                      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 md:col-span-2">
                        <label
                          htmlFor="bulk-create-enabled"
                          className={`flex min-w-0 items-center gap-3 ${
                            canBulkCreateByQuantity ? "cursor-pointer" : "cursor-not-allowed"
                          }`}
                        >
                          <input
                            id="bulk-create-enabled"
                            type="checkbox"
                            checked={isBulkCreateEnabled}
                            onChange={(event) => setIsBulkCreateEnabled(event.target.checked)}
                            disabled={!canBulkCreateByQuantity}
                            className="sr-only"
                          />
                          <span
                            aria-hidden="true"
                            className={cn(
                              "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                              isBulkCreateEnabled
                                ? "border-blue-600 bg-blue-600 text-white"
                                : "border-slate-300 bg-white text-transparent",
                              !canBulkCreateByQuantity ? "opacity-50" : "",
                            )}
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                          </span>
                          <span className="text-sm font-semibold text-slate-700">
                            Tạo hàng loạt
                          </span>
                        </label>

                        <div className="flex items-center gap-2">
                          {!canBulkCreateByQuantity ? (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                              Chưa khả dụng
                            </span>
                          ) : null}
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                aria-label="Giải thích tạo hàng loạt"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
                              >
                                <InfoCircledIcon className="h-4 w-4" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[320px] space-y-2 p-3 text-xs text-slate-600" align="end">
                              <div>
                                <p className="font-semibold text-slate-800">Khi nào dùng được</p>
                                <p className="mt-1">
                                  Chỉ khả dụng khi loại task là <strong>KPI</strong> và phân
                                  loại chỉ tiêu là <strong>Số lượng</strong>.
                                </p>
                              </div>
                              <div>
                                <p className="font-semibold text-slate-800">Khi nào không dùng được</p>
                                <p className="mt-1">
                                  Nếu task là <strong>OKR</strong> hoặc chỉ tiêu là{" "}
                                  <strong>Doanh thu</strong>, tuỳ chọn này sẽ bị tắt.
                                </p>
                              </div>
                              <div>
                                <p className="font-semibold text-slate-800">Cách hoạt động</p>
                                <p className="mt-1">
                                  Khi bật, trường <strong>Chỉ tiêu cần đạt</strong> sẽ được hiểu là
                                  số lượng task cần tạo, từ 1 đến{" "}
                                  <strong>{MAX_BULK_TASK_CREATE_COUNT}</strong>.
                                </p>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 md:col-span-2">
                        <span className="text-sm font-semibold text-slate-700">Tạo liên tục</span>
                        <FormToggleSwitch
                          id="continuous-create"
                          checked={isContinuousCreate}
                          onCheckedChange={setIsContinuousCreate}
                        />
                      </div>
                    </div>
                  </FormSection>

                  <div className="border-t border-slate-200 pt-4">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleCancel}
                        className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting || !isFormValid}
                        className="h-10 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                      >
                        {isSubmitting ? "Đang tạo..." : "Tạo task"}
                      </button>
                    </div>
                  </div>
                </form>
              ) : null}
            </section>
          </main>
        </div>
      </div>
      {leaveConfirmDialog}
    </div>
  );
}

export default function NewTaskPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f3f5fa]" />}>
      <NewTaskPageContent />
    </Suspense>
  );
}
