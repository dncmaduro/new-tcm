"use client";

import { InfoCircledIcon } from "@radix-ui/react-icons";
import { Check } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  CreateFormPage,
  CreateFormShell,
  FormContextBar,
  FormFieldGrid,
  FormFooterActions,
  FormSection,
} from "@/components/create-form";
import { ClearableNumberInput } from "@/components/ui/clearable-number-input";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLeaveFormConfirm } from "@/components/use-leave-form-confirm";
import {
  GOAL_STATUSES,
  GOAL_TYPES,
  GoalStatusValue,
  GoalTypeValue,
  normalizeGoalTypeValue,
} from "@/lib/constants/goals";
import {
  getAllowedKeyResultUnitsByType,
  KEY_RESULT_UNITS,
  KeyResultUnitValue,
  normalizeKeyResultUnitForType,
} from "@/lib/constants/key-results";
import { syncGoalOwners } from "@/lib/goal-owners";
import { buildWorkspaceAccessDebug, useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DepartmentOption = {
  id: string;
  name: string;
  parentDepartmentId: string | null;
};

type ProfileOption = {
  id: string;
  name: string;
  email: string | null;
};

type GoalDepartmentRole = "owner" | "participant" | "supporter";

type DepartmentParticipationFormState = {
  departmentId: string;
  role: GoalDepartmentRole;
  goalWeight: number;
  krWeight: number;
};

type GoalCreatePermissionDebug = {
  checkedAt: string;
  step: string;
  authUserId: string | null;
  profileId: string | null;
  profileName: string | null;
  leaderRoleIds: string[];
  leaderRolesRaw: Array<{ id: string; name: string | null }>;
  userRoleRows: Array<{ department_id: string | null; role_id: string | null }>;
  departments: Array<{
    id: string;
    name: string;
    parent_department_id: string | null;
  }>;
  rootDepartments: Array<{ id: string; name: string }>;
  canCreateGoal: boolean;
  error: string | null;
};

type SavedGoalSnapshot = {
  id: string;
  name: string;
  target: number | null;
  unit: string | null;
};

type GoalFormState = {
  name: string;
  description: string;
  type: GoalTypeValue;
  departmentId: string;
  ownerIds: string[];
  status: GoalStatusValue;
  quarter: number;
  year: number;
  note: string;
  startDate: string;
  endDate: string;
  target: string;
  unit: KeyResultUnitValue;
};

const now = new Date();
const initialQuarter = Math.floor(now.getMonth() / 3) + 1;
const toDateInputValue = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

const getQuarterDateRange = (year: number, quarter: number) => {
  const safeQuarter = Math.min(4, Math.max(1, Math.round(quarter || 1)));
  const safeYear = Number.isFinite(year) ? Math.round(year) : now.getFullYear();
  const startDate = new Date(safeYear, (safeQuarter - 1) * 3, 1);
  const endDate = new Date(safeYear, safeQuarter * 3, 0);

  return {
    startDate: toDateInputValue(startDate),
    endDate: toDateInputValue(endDate),
  };
};

const { startDate: defaultStartDate, endDate: defaultEndDate } = getQuarterDateRange(
  now.getFullYear(),
  initialQuarter,
);

const defaultForm: GoalFormState = {
  name: "",
  description: "",
  type: GOAL_TYPES[0].value,
  departmentId: "",
  ownerIds: [],
  status: GOAL_STATUSES[0].value,
  quarter: initialQuarter,
  year: now.getFullYear(),
  note: "",
  startDate: defaultStartDate,
  endDate: defaultEndDate,
  target: "",
  unit: KEY_RESULT_UNITS[0].value,
};

const inputClassName =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

const textareaClassName =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

const isSameGoalTargetValue = (left: number | null, right: number | null) => {
  if (left === null && right === null) {
    return true;
  }

  return Number(left ?? NaN) === Number(right ?? NaN);
};

const isSameGoalNameValue = (left: string, right: string) => left.trim() === right.trim();

const DEFAULT_GOAL_WEIGHT = 50;
const DEFAULT_KR_WEIGHT = 50;

const normalizeParticipationWeightPair = (goalWeight: number) => {
  const safeGoalWeight = Number.isFinite(goalWeight)
    ? Math.min(100, Math.max(0, Number(goalWeight)))
    : DEFAULT_GOAL_WEIGHT;
  const roundedGoalWeight = Number(safeGoalWeight.toFixed(1));
  const roundedKrWeight = Number((100 - roundedGoalWeight).toFixed(1));

  return {
    goalWeight: roundedGoalWeight,
    krWeight: roundedKrWeight,
  };
};

const createDepartmentParticipation = (
  departmentId: string,
  role: GoalDepartmentRole,
): DepartmentParticipationFormState => ({
  departmentId,
  role,
  ...normalizeParticipationWeightPair(DEFAULT_GOAL_WEIGHT),
});

const normalizeDepartmentParticipations = (
  rows: DepartmentParticipationFormState[],
  ownerDepartmentId: string,
) => {
  const uniqueRows = rows.reduce<DepartmentParticipationFormState[]>((acc, row) => {
    if (!row.departmentId || acc.some((item) => item.departmentId === row.departmentId)) {
      return acc;
    }
    acc.push(row);
    return acc;
  }, []);

  const withOwner =
    uniqueRows.find((row) => row.departmentId === ownerDepartmentId) ??
    createDepartmentParticipation(ownerDepartmentId, "owner");

  return uniqueRows
    .filter((row) => row.departmentId !== ownerDepartmentId)
    .map((row) => ({
      ...row,
      role: "participant" as GoalDepartmentRole,
    }))
    .concat({
      ...withOwner,
      departmentId: ownerDepartmentId,
      role: "owner",
    });
};

const getUniqueDepartmentLinks = (goalId: string, rows: DepartmentParticipationFormState[]) =>
  rows.reduce<
    Array<{
      goal_id: string;
      department_id: string;
      role: GoalDepartmentRole;
      goal_weight: number;
      kr_weight: number;
    }>
  >((acc, item) => {
    if (!item.departmentId || acc.some((row) => row.department_id === item.departmentId)) {
      return acc;
    }

    acc.push({
      goal_id: goalId,
      department_id: item.departmentId,
      role: item.role,
      goal_weight: DEFAULT_GOAL_WEIGHT / 100,
      kr_weight: DEFAULT_KR_WEIGHT / 100,
    });
    return acc;
  }, []);

const sortDepartmentsByName = (rows: DepartmentOption[]) =>
  [...rows].sort((a, b) => a.name.localeCompare(b.name, "vi"));

const findMarketingDepartmentId = (rows: DepartmentOption[]) => {
  const exactMatch = rows.find(
    (department) => department.name.trim().toLowerCase() === "marketing",
  );
  if (exactMatch) {
    return exactMatch.id;
  }

  return (
    rows.find((department) => department.name.trim().toLowerCase().includes("marketing"))?.id ??
    null
  );
};

const buildDepartmentMap = (rows: DepartmentOption[]) =>
  rows.reduce<Record<string, DepartmentOption>>((acc, department) => {
    acc[department.id] = department;
    return acc;
  }, {});

const getTopLevelDepartmentId = (
  departmentId: string | null | undefined,
  departmentsById: Record<string, DepartmentOption>,
) => {
  if (!departmentId) {
    return null;
  }

  let currentDepartmentId: string | null = departmentId;
  const visitedDepartmentIds = new Set<string>();

  while (currentDepartmentId) {
    if (visitedDepartmentIds.has(currentDepartmentId)) {
      break;
    }

    visitedDepartmentIds.add(currentDepartmentId);
    const currentDepartment: DepartmentOption | undefined = departmentsById[currentDepartmentId];

    if (!currentDepartment) {
      return departmentId;
    }

    if (!currentDepartment.parentDepartmentId) {
      return currentDepartment.id;
    }

    currentDepartmentId = currentDepartment.parentDepartmentId;
  }

  return departmentId;
};

const isDepartmentInBranch = (
  departmentId: string,
  rootDepartmentId: string,
  departmentsById: Record<string, DepartmentOption>,
  options?: { includeRoot?: boolean },
) => {
  let currentDepartmentId: string | null = departmentId;
  const visitedDepartmentIds = new Set<string>();

  while (currentDepartmentId) {
    if (visitedDepartmentIds.has(currentDepartmentId)) {
      break;
    }

    visitedDepartmentIds.add(currentDepartmentId);
    if (currentDepartmentId === rootDepartmentId) {
      return (options?.includeRoot ?? false) ? true : departmentId !== rootDepartmentId;
    }

    currentDepartmentId = departmentsById[currentDepartmentId]?.parentDepartmentId ?? null;
  }

  return false;
};

const resolvePrimaryDepartmentId = ({
  departments,
  managedRootDepartmentIds,
  preferredDepartmentId,
}: {
  departments: DepartmentOption[];
  managedRootDepartmentIds: string[];
  preferredDepartmentId?: string | null;
}) => {
  const departmentsById = buildDepartmentMap(departments);
  const availableRootDepartments =
    managedRootDepartmentIds.length > 0
      ? departments.filter((department) => managedRootDepartmentIds.includes(department.id))
      : departments.filter((department) => !department.parentDepartmentId);

  const normalizedPreferredDepartmentId = getTopLevelDepartmentId(
    preferredDepartmentId,
    departmentsById,
  );

  if (
    normalizedPreferredDepartmentId &&
    availableRootDepartments.some((department) => department.id === normalizedPreferredDepartmentId)
  ) {
    return normalizedPreferredDepartmentId;
  }

  return (
    findMarketingDepartmentId(availableRootDepartments) ??
    sortDepartmentsByName(availableRootDepartments)[0]?.id ??
    ""
  );
};

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

function QuarterDateInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Giải thích cách tính ngày theo quý"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white hover:text-slate-600"
        >
          <InfoCircledIcon className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3 text-xs text-slate-600">
        Ngày được tự động tính theo quý và năm đã chọn.
      </PopoverContent>
    </Popover>
  );
}

function NewGoalPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceAccess = useWorkspaceAccess();

  const [form, setForm] = useState<GoalFormState>(defaultForm);
  const [allDepartments, setAllDepartments] = useState<DepartmentOption[]>([]);
  const [, setProfileOptions] = useState<ProfileOption[]>([]);
  const [departmentParticipations, setDepartmentParticipations] = useState<
    DepartmentParticipationFormState[]
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { leaveConfirmDialog, runWithoutConfirm } = useLeaveFormConfirm({
    enabled: !isSubmitting,
  });

  const handleCancel = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/goals");
  };

  const showPermissionDebug = searchParams.get("debugPermission") === "1";
  const queryDepartmentId = searchParams.get("departmentId");
  const editGoalId = searchParams.get("editGoalId");
  const isEditMode = Boolean(editGoalId?.trim());
  const rootDepartments = workspaceAccess.managedDepartments;
  const isCheckingPermission = workspaceAccess.isLoading;
  const canCreateGoal = workspaceAccess.canManage && !workspaceAccess.error;
  const permissionError =
    workspaceAccess.error ??
    (!isCheckingPermission && !workspaceAccess.canManage
      ? "Bạn không có quyền tạo goal ở phòng ban cấp gốc."
      : null);
  const permissionDebug: GoalCreatePermissionDebug = useMemo(
    () => ({
      ...buildWorkspaceAccessDebug({
        authUserId: workspaceAccess.authUserId,
        profileId: workspaceAccess.profileId,
        profileName: workspaceAccess.profileName,
        leaderRoleIds: workspaceAccess.leaderRoleIds,
        roles: workspaceAccess.roles,
        memberships: workspaceAccess.memberships,
        departments: workspaceAccess.departments,
        managedDepartments: workspaceAccess.managedDepartments,
        canManage: workspaceAccess.canManage,
        error: workspaceAccess.error,
        lastLoadedAt: workspaceAccess.lastLoadedAt,
      }),
      canCreateGoal: workspaceAccess.canManage,
    }),
    [workspaceAccess],
  );
  const managedRootDepartmentIds = useMemo(
    () => rootDepartments.map((department) => department.id),
    [rootDepartments],
  );

  useEffect(() => {
    if (isCheckingPermission) {
      return;
    }

    if (!canCreateGoal) {
      setAllDepartments([]);
      setProfileOptions([]);
      setDepartmentParticipations([]);
      return;
    }

    let isActive = true;

    const loadFormData = async () => {
      const [
        { data: allDepartmentsData, error: allDepartmentsError },
        { data: profilesData, error: profilesError },
      ] = await Promise.all([
        supabase
          .from("departments")
          .select("id,name,parent_department_id")
          .order("name", { ascending: true }),
        supabase.from("profiles").select("id,name,email").order("name", { ascending: true }),
      ]);

      if (!isActive) {
        return;
      }

      const departmentOptions =
        !allDepartmentsError && (allDepartmentsData?.length ?? 0) > 0
          ? allDepartmentsData.map((department) => ({
              id: String(department.id),
              name: String(department.name),
              parentDepartmentId: department.parent_department_id
                ? String(department.parent_department_id)
                : null,
            }))
          : rootDepartments.map((department) => ({ ...department }));
      setAllDepartments(departmentOptions);
      setProfileOptions(
        !profilesError && (profilesData?.length ?? 0) > 0
          ? profilesData.map((profile) => ({
              id: String(profile.id),
              name: profile.name?.trim() || profile.email?.trim() || "Chưa có tên",
              email: profile.email ? String(profile.email) : null,
            }))
          : [],
      );

      if (editGoalId) {
        const [
          { data: goalData, error: goalError },
          { data: goalDepartmentData, error: goalDepartmentError },
          { data: goalOwnerRows, error: goalOwnersError },
        ] = await Promise.all([
          supabase
            .from("goals")
            .select(
              "id,name,description,type,department_id,status,quarter,year,note,start_date,end_date,target,unit",
            )
            .eq("id", editGoalId)
            .maybeSingle(),
          supabase
            .from("goal_departments")
            .select("department_id,role,goal_weight,kr_weight")
            .eq("goal_id", editGoalId),
          supabase.from("goal_owners").select("profile_id").eq("goal_id", editGoalId),
        ]);

        if (!isActive) {
          return;
        }

        if (goalError || !goalData) {
          setSubmitError(goalError?.message || "Không tải được dữ liệu goal để chỉnh sửa.");
          return;
        }

        const goalDepartmentRows =
          !goalDepartmentError && (goalDepartmentData?.length ?? 0) > 0
            ? goalDepartmentData
            : [
                {
                  department_id: goalData.department_id,
                  role: "owner",
                  goal_weight: DEFAULT_GOAL_WEIGHT / 100,
                  kr_weight: DEFAULT_KR_WEIGHT / 100,
                },
              ];

        const nextQuarter =
          typeof goalData.quarter === "number" ? goalData.quarter : initialQuarter;
        const nextYear = typeof goalData.year === "number" ? goalData.year : now.getFullYear();
        const normalizedGoalType = normalizeGoalTypeValue(
          goalData.type ? String(goalData.type) : GOAL_TYPES[0].value,
        );
        const nextDateRange = getQuarterDateRange(nextYear, nextQuarter);
        const primaryDepartmentId = resolvePrimaryDepartmentId({
          departments: departmentOptions,
          managedRootDepartmentIds,
          preferredDepartmentId: goalData.department_id ? String(goalData.department_id) : null,
        });
        const departmentsById = buildDepartmentMap(departmentOptions);

        setForm({
          name: String(goalData.name ?? ""),
          description: String(goalData.description ?? ""),
          type: normalizedGoalType,
          departmentId: primaryDepartmentId,
          ownerIds:
            !goalOwnersError && (goalOwnerRows?.length ?? 0) > 0
              ? [
                  ...new Set(
                    goalOwnerRows
                      .map((item) => (item.profile_id ? String(item.profile_id) : null))
                      .filter((value): value is string => Boolean(value)),
                  ),
                ]
              : [],
          status: String(goalData.status ?? GOAL_STATUSES[0].value) as GoalStatusValue,
          quarter: nextQuarter,
          year: nextYear,
          note: String(goalData.note ?? ""),
          startDate: nextDateRange.startDate,
          endDate: nextDateRange.endDate,
          target:
            normalizedGoalType === "okr"
              ? "100"
              : goalData.target === null || goalData.target === undefined
                ? ""
                : String(goalData.target),
          unit: normalizeKeyResultUnitForType(
            normalizedGoalType,
            goalData.unit ? String(goalData.unit) : null,
          ),
        });
        setDepartmentParticipations(
          normalizeDepartmentParticipations(
            goalDepartmentRows
              .filter((item) => item.department_id)
              .filter((item) =>
                isDepartmentInBranch(
                  String(item.department_id),
                  primaryDepartmentId,
                  departmentsById,
                  { includeRoot: true },
                ),
              )
              .map((item) => ({
                ...createDepartmentParticipation(
                  String(item.department_id),
                  (item.role === "owner" ? "owner" : "participant") as GoalDepartmentRole,
                ),
              })),
            primaryDepartmentId,
          ),
        );
        return;
      }

      const nextDepartmentId = resolvePrimaryDepartmentId({
        departments: departmentOptions,
        managedRootDepartmentIds,
        preferredDepartmentId: queryDepartmentId,
      });
      const nextDepartmentsById = buildDepartmentMap(departmentOptions);
      const initialParticipations =
        queryDepartmentId &&
        nextDepartmentId &&
        queryDepartmentId !== nextDepartmentId &&
        isDepartmentInBranch(queryDepartmentId, nextDepartmentId, nextDepartmentsById)
          ? normalizeDepartmentParticipations(
              [
                createDepartmentParticipation(nextDepartmentId, "owner"),
                createDepartmentParticipation(queryDepartmentId, "participant"),
              ],
              nextDepartmentId,
            )
          : nextDepartmentId
            ? [createDepartmentParticipation(nextDepartmentId, "owner")]
            : [];
      setDepartmentParticipations(initialParticipations);
      setForm((prev) => ({
        ...prev,
        departmentId: nextDepartmentId,
        ownerIds:
          prev.ownerIds.length > 0
            ? prev.ownerIds
            : workspaceAccess.profileId
              ? [workspaceAccess.profileId]
              : profilesData?.[0]?.id
                ? [String(profilesData[0].id)]
                : [],
      }));
    };

    void loadFormData();

    return () => {
      isActive = false;
    };
  }, [
    canCreateGoal,
    editGoalId,
    isCheckingPermission,
    managedRootDepartmentIds,
    queryDepartmentId,
    rootDepartments,
    workspaceAccess.profileId,
  ]);

  const departmentsById = useMemo(() => buildDepartmentMap(allDepartments), [allDepartments]);
  const participantDepartments = useMemo(
    () => {
      if (!form.departmentId) {
        return [];
      }

      return sortDepartmentsByName(
        allDepartments.filter((department) =>
          isDepartmentInBranch(department.id, form.departmentId, departmentsById),
        ),
      );
    },
    [allDepartments, departmentsById, form.departmentId],
  );
  const selectedDepartmentIds = useMemo(
    () =>
      new Set(
        departmentParticipations
          .filter((item) => item.departmentId !== form.departmentId)
          .map((item) => item.departmentId),
      ),
    [departmentParticipations, form.departmentId],
  );

  const participantDepartmentCount = useMemo(
    () => departmentParticipations.filter((item) => item.departmentId !== form.departmentId).length,
    [departmentParticipations, form.departmentId],
  );
  const isKpiGoal = form.type === "kpi";
  const isOkrGoal = form.type === "okr";
  const defaultDepartmentName = useMemo(() => {
    if (!queryDepartmentId) {
      return null;
    }

    return (
      departmentsById[queryDepartmentId]?.name ?? departmentsById[form.departmentId]?.name ?? null
    );
  }, [departmentsById, form.departmentId, queryDepartmentId]);

  useEffect(() => {
    const normalizedQuarter = Math.min(4, Math.max(1, Math.round(form.quarter || 1)));
    const normalizedYear =
      Number.isFinite(form.year) && form.year >= 2000 ? Math.round(form.year) : now.getFullYear();
    const nextDateRange = getQuarterDateRange(normalizedYear, normalizedQuarter);

    setForm((prev) => {
      if (
        prev.quarter === normalizedQuarter &&
        prev.year === normalizedYear &&
        prev.startDate === nextDateRange.startDate &&
        prev.endDate === nextDateRange.endDate
      ) {
        return prev;
      }

      return {
        ...prev,
        quarter: normalizedQuarter,
        year: normalizedYear,
        startDate: nextDateRange.startDate,
        endDate: nextDateRange.endDate,
      };
    });
  }, [form.quarter, form.year]);

  useEffect(() => {
    setForm((prev) => {
      const nextUnit = normalizeKeyResultUnitForType(prev.type, prev.unit);
      const nextTarget = prev.type === "okr" ? "100" : prev.target;

      if (prev.unit === nextUnit && prev.target === nextTarget) {
        return prev;
      }

      return {
        ...prev,
        unit: nextUnit,
        target: nextTarget,
      };
    });
  }, [form.type]);

  const isFormValid = useMemo(() => {
    const hasValidGoalTarget = Number.isFinite(Number(form.target)) && Number(form.target) > 0;
    const hasValidDepartmentParticipations =
      departmentParticipations.length > 0 &&
      departmentParticipations.every((item) => item.departmentId.trim().length > 0);

    return (
      form.name.trim().length > 0 &&
      form.departmentId.trim().length > 0 &&
      form.type.trim().length > 0 &&
      form.status.trim().length > 0 &&
      Number.isFinite(form.quarter) &&
      form.quarter >= 1 &&
      form.quarter <= 4 &&
      Number.isFinite(form.year) &&
      form.year >= 2000 &&
      form.startDate.trim().length > 0 &&
      form.endDate.trim().length > 0 &&
      new Date(form.startDate).getTime() <= new Date(form.endDate).getTime() &&
      hasValidGoalTarget &&
      hasValidDepartmentParticipations
    );
  }, [departmentParticipations, form]);

  const toggleRelatedDepartment = (departmentId: string) => {
    setDepartmentParticipations((prev) => {
      if (!form.departmentId) {
        return prev;
      }

      if (
        departmentId === form.departmentId ||
        !isDepartmentInBranch(departmentId, form.departmentId, departmentsById)
      ) {
        return normalizeDepartmentParticipations(prev, form.departmentId);
      }

      if (prev.some((item) => item.departmentId === departmentId)) {
        return prev.filter((item) => item.departmentId !== departmentId);
      }

      return normalizeDepartmentParticipations(
        [...prev, createDepartmentParticipation(departmentId, "participant")],
        form.departmentId,
      );
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canCreateGoal) {
      setSubmitError("Bạn không có quyền tạo goal.");
      return;
    }

    if (!isFormValid) {
      setSubmitError("Vui lòng điền đầy đủ thông tin hợp lệ.");
      return;
    }

    const safeGoalTarget = Number(form.target);
    if (!Number.isFinite(safeGoalTarget) || safeGoalTarget <= 0) {
      setSubmitError("Chỉ tiêu của goal phải lớn hơn 0.");
      return;
    }
    if (form.type === "okr" && safeGoalTarget !== 100) {
      setSubmitError("Goal kiểu OKR luôn có chỉ tiêu cố định là 100%.");
      return;
    }

    const normalizedParticipations = normalizeDepartmentParticipations(
      departmentParticipations,
      form.departmentId,
    );
    const invalidParticipation = normalizedParticipations.find((item) => !item.departmentId);

    if (invalidParticipation) {
      setSubmitError("Mỗi phòng ban tham gia phải có phòng ban hợp lệ.");
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        type: form.type,
        department_id: form.departmentId,
        status: form.status,
        quarter: Math.round(form.quarter),
        year: Math.round(form.year),
        note: form.note.trim() || null,
        start_date: form.startDate || null,
        end_date: form.endDate || null,
        target: safeGoalTarget,
        unit: form.unit || null,
      };

      let savedGoalId = editGoalId ? String(editGoalId) : null;

      let savedGoalSnapshot: SavedGoalSnapshot | null = null;

      if (isEditMode && savedGoalId) {
        const { data, error } = await supabase
          .from("goals")
          .update(payload)
          .eq("id", savedGoalId)
          .select("id,name,target,unit")
          .maybeSingle();

        if (error) {
          if (error.code === "42501") {
            setSubmitError(
              "Bạn không có quyền cập nhật goal (RLS). Vui lòng kiểm tra lại policy UPDATE bảng goals.",
            );
          } else {
            setSubmitError(error.message || "Không thể cập nhật goal.");
          }
          return;
        }

        if (!data) {
          setSubmitError(
            "Không cập nhật được goal. DB trả về 0 dòng, nhiều khả năng do RLS hoặc policy UPDATE của bảng goals.",
          );
          return;
        }

        savedGoalSnapshot =
          typeof data === "object"
            ? {
                id: String(data.id),
                name: data.name ? String(data.name) : "",
                target:
                  data.target === null || data.target === undefined
                    ? null
                    : typeof data.target === "number"
                      ? data.target
                      : Number(data.target),
                unit: data.unit ? String(data.unit) : null,
              }
            : null;
      } else {
        const { data: createdGoal, error } = await supabase
          .from("goals")
          .insert(payload)
          .select("id,name,target,unit")
          .maybeSingle();

        if (error || !createdGoal) {
          if (error?.code === "42501") {
            setSubmitError(
              "Bạn không có quyền tạo goal (RLS). Vui lòng kiểm tra lại policy INSERT bảng goals.",
            );
          } else {
            setSubmitError(error?.message || "Không thể tạo goal.");
          }
          return;
        }

        savedGoalId = String(createdGoal.id);
        savedGoalSnapshot = {
          id: String(createdGoal.id),
          name: createdGoal.name ? String(createdGoal.name) : "",
          target:
            createdGoal.target === null || createdGoal.target === undefined
              ? null
              : typeof createdGoal.target === "number"
                ? createdGoal.target
                : Number(createdGoal.target),
          unit: createdGoal.unit ? String(createdGoal.unit) : null,
        };
      }

      if (!savedGoalId) {
        setSubmitError("Không xác định được goal cần lưu.");
        return;
      }

      if (
        savedGoalSnapshot &&
        (!isSameGoalNameValue(savedGoalSnapshot.name, payload.name) ||
          savedGoalSnapshot.unit !== (payload.unit ?? null) ||
          !isSameGoalTargetValue(savedGoalSnapshot.target, payload.target))
      ) {
        setSubmitError(
          `DB không lưu đúng dữ liệu goal. Name hiện tại trong DB là "${
            savedGoalSnapshot.name || "null"
          }", unit là "${savedGoalSnapshot.unit ?? "null"}", target là "${
            savedGoalSnapshot.target ?? "null"
          }". Payload vừa gửi là name "${payload.name}", unit "${
            payload.unit ?? "null"
          }", target "${payload.target ?? "null"}".`,
        );
        return;
      }

      try {
        await syncGoalOwners(savedGoalId, form.ownerIds);
      } catch (ownerSyncError) {
        setSubmitError(
          ownerSyncError instanceof Error
            ? `${isEditMode ? "Đã lưu goal" : "Đã tạo goal"} nhưng chưa đồng bộ được Owners: ${ownerSyncError.message}`
            : `${isEditMode ? "Đã lưu goal" : "Đã tạo goal"} nhưng chưa đồng bộ được Owners.`,
        );
        return;
      }

      const departmentLinks = getUniqueDepartmentLinks(savedGoalId, normalizedParticipations);

      if (departmentLinks.length > 0) {
        const { error: goalDepartmentsError } = await supabase
          .from("goal_departments")
          .upsert(departmentLinks, {
            onConflict: "goal_id,department_id",
          });

        if (goalDepartmentsError) {
          setSubmitError(
            goalDepartmentsError.message
              ? `${isEditMode ? "Goal đã được cập nhật" : "Goal đã được tạo"} nhưng chưa lưu được danh sách team phối hợp: ${goalDepartmentsError.message}`
              : `${isEditMode ? "Goal đã được cập nhật" : "Goal đã được tạo"} nhưng chưa lưu được danh sách team phối hợp. Mở chi tiết goal để kiểm tra lại.`,
          );
          return;
        }
      }

      const { data: currentGoalDepartments, error: currentGoalDepartmentsError } = await supabase
        .from("goal_departments")
        .select("department_id")
        .eq("goal_id", savedGoalId);

      if (currentGoalDepartmentsError) {
        setSubmitError(
          currentGoalDepartmentsError.message
            ? `Đã lưu goal nhưng chưa kiểm tra lại được danh sách team phối hợp: ${currentGoalDepartmentsError.message}`
            : "Đã lưu goal nhưng chưa kiểm tra lại được danh sách team phối hợp.",
        );
        return;
      }

      const desiredDepartmentIds = departmentLinks.map((item) => item.department_id);
      const staleDepartmentIds = (
        (currentGoalDepartments ?? []) as Array<{
          department_id: string | null;
        }>
      )
        .map((item) => (item.department_id ? String(item.department_id) : ""))
        .filter((departmentId) => departmentId && !desiredDepartmentIds.includes(departmentId));

      if (staleDepartmentIds.length > 0) {
        const { error: deleteStaleGoalDepartmentsError } = await supabase
          .from("goal_departments")
          .delete()
          .eq("goal_id", savedGoalId)
          .in("department_id", staleDepartmentIds);

        if (deleteStaleGoalDepartmentsError) {
          setSubmitError(
            deleteStaleGoalDepartmentsError.message
              ? `Đã lưu goal nhưng chưa xóa được team phối hợp cũ: ${deleteStaleGoalDepartmentsError.message}`
              : "Đã lưu goal nhưng chưa xóa được team phối hợp cũ.",
          );
          return;
        }
      }

      const { data: finalGoalDepartments, error: finalGoalDepartmentsError } = await supabase
        .from("goal_departments")
        .select("department_id")
        .eq("goal_id", savedGoalId);

      if (finalGoalDepartmentsError) {
        setSubmitError(
          finalGoalDepartmentsError.message
            ? `Đã lưu goal nhưng chưa xác nhận được danh sách team phối hợp cuối cùng: ${finalGoalDepartmentsError.message}`
            : "Đã lưu goal nhưng chưa xác nhận được danh sách team phối hợp cuối cùng.",
        );
        return;
      }

      const finalDepartmentIds = (
        (finalGoalDepartments ?? []) as Array<{ department_id: string | null }>
      )
        .map((item) => (item.department_id ? String(item.department_id) : ""))
        .filter(Boolean)
        .sort();
      const expectedDepartmentIds = [...desiredDepartmentIds].sort();

      if (JSON.stringify(finalDepartmentIds) !== JSON.stringify(expectedDepartmentIds)) {
        setSubmitError(
          "Goal đã được cập nhật nhưng danh sách team phối hợp chưa đồng bộ hoàn toàn. DB có thể đang thiếu quyền DELETE cho bảng goal_departments.",
        );
        return;
      }

      runWithoutConfirm(() => {
        router.push(`/goals/${savedGoalId}`);
        router.refresh();
      });
    } catch {
      setSubmitError(`Có lỗi xảy ra khi ${isEditMode ? "cập nhật" : "tạo"} goal.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <CreateFormPage
        sidebarActive="goals"
        title={isEditMode ? "Chỉnh sửa goal" : "Tạo goal mới"}
        items={[
          { label: "Goal", href: "/goals" },
          { label: isEditMode ? "Chỉnh sửa goal" : "Tạo goal mới" },
        ]}
        topSlot={
          showPermissionDebug && permissionDebug ? (
            <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-xs text-slate-100">
              <p className="mb-2 font-semibold text-sky-300">
                Debug quyền tạo goal (debugPermission=1)
              </p>
              <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                {JSON.stringify(permissionDebug, null, 2)}
              </pre>
            </div>
          ) : null
        }
      >
        <CreateFormShell
          title={isEditMode ? "Chỉnh sửa goal" : "Thêm goal mới"}
          contextBar={
            !isEditMode && defaultDepartmentName ? (
              <FormContextBar>
                Phòng ban mặc định:{" "}
                <span className="font-semibold text-slate-800">{defaultDepartmentName}</span>
              </FormContextBar>
            ) : null
          }
        >
          {isCheckingPermission ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Đang kiểm tra quyền tạo goal...
            </div>
          ) : null}

          {!isCheckingPermission && permissionError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {permissionError}
            </div>
          ) : null}

          {!isCheckingPermission && canCreateGoal ? (
            <form className="space-y-5" onSubmit={handleSubmit}>
              {submitError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {submitError}
                </div>
              ) : null}

              <FormSection title="Thông tin cơ bản">
                <FormFieldGrid>
                  <div className="space-y-1.5 md:col-span-2">
                    <FieldLabel htmlFor="goal-name">Tên goal *</FieldLabel>
                    <input
                      id="goal-name"
                      value={form.name}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                      }
                      className={inputClassName}
                      placeholder="Nhập tên goal"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <FieldLabel>Loại</FieldLabel>
                    <Select
                      value={form.type}
                      onValueChange={(value: GoalTypeValue) =>
                        setForm((prev) => ({
                          ...prev,
                          type: value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn loại goal" />
                      </SelectTrigger>
                      <SelectContent>
                        {GOAL_TYPES.map((goalType) => (
                          <SelectItem key={goalType.value} value={goalType.value}>
                            {goalType.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <FieldLabel>Trạng thái</FieldLabel>
                    <Select
                      value={form.status}
                      onValueChange={(value: GoalStatusValue) =>
                        setForm((prev) => ({ ...prev, status: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn trạng thái" />
                      </SelectTrigger>
                      <SelectContent>
                        {GOAL_STATUSES.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </FormFieldGrid>
              </FormSection>

              <FormSection title="Kỳ & chỉ tiêu" actions={<QuarterDateInfo />}>
                <FormFieldGrid>
                  <div className="space-y-1.5">
                    <FieldLabel>Đơn vị đo goal</FieldLabel>
                    <Select
                      value={form.unit}
                      disabled={isOkrGoal}
                      onValueChange={(value: KeyResultUnitValue) =>
                        setForm((prev) => ({
                          ...prev,
                          unit: value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={isOkrGoal ? "Goal OKR dùng phần trăm" : "Chọn đơn vị"}
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
                    <FieldLabel htmlFor="goal-target">Chỉ tiêu *</FieldLabel>
                    <FormattedNumberInput
                      id="goal-target"
                      value={form.target}
                      onValueChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          target: value,
                        }))
                      }
                      disabled={isOkrGoal}
                      className={cn(
                        inputClassName,
                        isOkrGoal ? "cursor-not-allowed bg-slate-50 text-slate-500" : "",
                      )}
                      placeholder={isKpiGoal ? "Ví dụ: 1.200.000.000" : "Goal OKR luôn là 100%"}
                    />
                  </div>
                </FormFieldGrid>

                <FormFieldGrid columns="four">
                  <div className="space-y-1.5">
                    <FieldLabel>Quý *</FieldLabel>
                    <Select
                      value={String(form.quarter)}
                      onValueChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          quarter: Number(value) || 1,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn quý" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Q1</SelectItem>
                        <SelectItem value="2">Q2</SelectItem>
                        <SelectItem value="3">Q3</SelectItem>
                        <SelectItem value="4">Q4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="goal-year">Năm *</FieldLabel>
                    <ClearableNumberInput
                      id="goal-year"
                      min={2000}
                      max={2100}
                      value={form.year}
                      onValueChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          year: value,
                        }))
                      }
                      className={inputClassName}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="goal-start-date">Ngày bắt đầu *</FieldLabel>
                    <input
                      id="goal-start-date"
                      type="date"
                      value={form.startDate}
                      disabled
                      readOnly
                      className={cn(inputClassName, "cursor-not-allowed")}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="goal-end-date">Ngày kết thúc *</FieldLabel>
                    <input
                      id="goal-end-date"
                      type="date"
                      min={form.startDate || undefined}
                      value={form.endDate}
                      disabled
                      readOnly
                      className={cn(inputClassName, "cursor-not-allowed")}
                    />
                  </div>
                </FormFieldGrid>

                {form.startDate &&
                form.endDate &&
                new Date(form.startDate).getTime() > new Date(form.endDate).getTime() ? (
                  <p className="-mt-1 text-xs text-rose-600">
                    Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.
                  </p>
                ) : null}
              </FormSection>

              <FormSection
                title="Phòng ban tham gia"
                actions={
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {participantDepartmentCount} phòng ban
                  </span>
                }
              >
                {participantDepartments.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {participantDepartments.map((department) => {
                      const isSelected = selectedDepartmentIds.has(department.id);

                      return (
                        <label
                          key={department.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition",
                            isSelected
                              ? "border-blue-200 bg-blue-50"
                              : "border-slate-200 bg-white hover:border-slate-300",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRelatedDepartment(department.id)}
                            className="sr-only"
                          />
                          <span
                            aria-hidden="true"
                            className={cn(
                              "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                              isSelected
                                ? "border-blue-600 bg-blue-600 text-white"
                                : "border-slate-300 bg-white text-transparent",
                            )}
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                          </span>
                          <span className="min-w-0 text-sm font-medium text-slate-700">
                            <span className="block truncate">{department.name}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    Phòng ban chính hiện chưa có phòng ban con để thêm vào danh sách tham gia.
                  </p>
                )}
              </FormSection>

              <FormSection title="Mô tả">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="goal-description">Mô tả</FieldLabel>
                  <textarea
                    id="goal-description"
                    rows={3}
                    value={form.description}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                    className={textareaClassName}
                    placeholder="Mô tả goal"
                  />
                </div>
              </FormSection>

              <FormFooterActions>
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
                  {isSubmitting
                    ? isEditMode
                      ? "Đang cập nhật..."
                      : "Đang tạo..."
                    : isEditMode
                      ? "Lưu thay đổi"
                      : "Tạo goal"}
                </button>
              </FormFooterActions>
            </form>
          ) : null}
        </CreateFormShell>
      </CreateFormPage>
      {leaveConfirmDialog}
    </>
  );
}

export default function NewGoalPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f3f5fa]" />}>
      <NewGoalPageContent />
    </Suspense>
  );
}
