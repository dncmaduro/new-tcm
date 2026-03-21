"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { GOAL_STATUSES, GOAL_TYPES, GoalStatusValue, GoalTypeValue } from "@/lib/constants/goals";
import { buildWorkspaceAccessDebug, useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";
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

type ParentGoalOption = {
  id: string;
  name: string;
  departmentId: string | null;
  quarter: number | null;
  year: number | null;
};

type GoalDepartmentRole = "owner" | "participant" | "supporter";

type DepartmentParticipationFormState = {
  departmentId: string;
  role: GoalDepartmentRole;
  goalWeight: number;
  krWeight: number;
};

type DepartmentTreeNode = DepartmentOption & {
  depth: number;
  children: DepartmentTreeNode[];
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

type GoalFormState = {
  name: string;
  description: string;
  type: GoalTypeValue;
  departmentId: string;
  status: GoalStatusValue;
  quarter: number;
  year: number;
  note: string;
  parentGoalId: string;
  startDate: string;
  endDate: string;
};

const now = new Date();
const initialQuarter = Math.floor(now.getMonth() / 3) + 1;
const NO_PARENT_GOAL_VALUE = "__no_parent_goal__";
const quarterStartDate = new Date(now.getFullYear(), (initialQuarter - 1) * 3, 1);
const quarterEndDate = new Date(now.getFullYear(), initialQuarter * 3, 0);
const toDateInputValue = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const defaultStartDate = toDateInputValue(quarterStartDate);
const defaultEndDate = toDateInputValue(quarterEndDate);

const defaultForm: GoalFormState = {
  name: "",
  description: "",
  type: GOAL_TYPES[0].value,
  departmentId: "",
  status: GOAL_STATUSES[0].value,
  quarter: initialQuarter,
  year: now.getFullYear(),
  note: "",
  parentGoalId: "",
  startDate: defaultStartDate,
  endDate: defaultEndDate,
};

const DEFAULT_GOAL_WEIGHT = 50;
const DEFAULT_KR_WEIGHT = 50;

const createDepartmentParticipation = (
  departmentId: string,
  role: GoalDepartmentRole,
): DepartmentParticipationFormState => ({
  departmentId,
  role,
  goalWeight: DEFAULT_GOAL_WEIGHT,
  krWeight: DEFAULT_KR_WEIGHT,
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
      goal_weight: Number(item.goalWeight) / 100,
      kr_weight: Number(item.krWeight) / 100,
    });
    return acc;
  }, []);

const sortDepartmentsByName = (rows: DepartmentOption[]) =>
  [...rows].sort((a, b) => a.name.localeCompare(b.name, "vi"));

const buildDepartmentTree = (rows: DepartmentOption[]): DepartmentTreeNode[] => {
  if (!rows.length) {
    return [];
  }

  const departmentIds = new Set(rows.map((department) => department.id));
  const childrenByParent = rows.reduce<Record<string, DepartmentOption[]>>((acc, department) => {
    if (!department.parentDepartmentId || !departmentIds.has(department.parentDepartmentId)) {
      return acc;
    }

    if (!acc[department.parentDepartmentId]) {
      acc[department.parentDepartmentId] = [];
    }

    acc[department.parentDepartmentId].push(department);
    return acc;
  }, {});

  const buildNode = (department: DepartmentOption, depth: number): DepartmentTreeNode => ({
    ...department,
    depth,
    children: sortDepartmentsByName(childrenByParent[department.id] ?? []).map((child) =>
      buildNode(child, depth + 1),
    ),
  });

  const rootDepartments = sortDepartmentsByName(
    rows.filter(
      (department) =>
        !department.parentDepartmentId || !departmentIds.has(department.parentDepartmentId),
    ),
  );

  return rootDepartments.map((department) => buildNode(department, 0));
};

function DepartmentTreeItem({
  node,
  collapsedDepartmentIds,
  onToggleBranch,
  onToggleDepartment,
  primaryDepartmentId,
  selectedDepartmentIds,
}: {
  node: DepartmentTreeNode;
  collapsedDepartmentIds: Record<string, boolean>;
  onToggleBranch: (departmentId: string) => void;
  onToggleDepartment: (departmentId: string) => void;
  primaryDepartmentId: string;
  selectedDepartmentIds: Set<string>;
}) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsedDepartmentIds[node.id] ?? false;
  const isPrimary = node.id === primaryDepartmentId;
  const isSelected = isPrimary || selectedDepartmentIds.has(node.id);

  return (
    <div className="space-y-2">
      <div
        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition ${
          isSelected
            ? "border-blue-200 bg-blue-50"
            : "border-slate-200 bg-white hover:border-slate-300"
        }`}
        style={{ marginLeft: `${node.depth * 18}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={isCollapsed ? `Mở nhánh ${node.name}` : `Thu nhánh ${node.name}`}
            onClick={() => onToggleBranch(node.id)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-500 hover:border-slate-300 hover:text-slate-700"
          >
            {isCollapsed ? "+" : "-"}
          </button>
        ) : (
          <span className="inline-flex h-8 w-8 shrink-0" />
        )}

        <button
          type="button"
          onClick={() => {
            if (!isPrimary) {
              onToggleDepartment(node.id);
            }
          }}
          className={`flex min-w-0 flex-1 items-center justify-between gap-3 text-left ${
            isPrimary ? "cursor-default" : ""
          }`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[10px] font-bold ${
                isSelected
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white text-transparent"
              }`}
            >
              ✓
            </span>
            <span className="truncate text-sm font-medium text-slate-700">{node.name}</span>
          </span>

          <span className="flex shrink-0 items-center gap-2">
            {hasChildren ? (
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500">
                {node.children.length} nhánh con
              </span>
            ) : null}
            {isPrimary ? (
              <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-700">
                chính
              </span>
            ) : isSelected ? (
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                đã chọn
              </span>
            ) : null}
          </span>
        </button>
      </div>

      {hasChildren && !isCollapsed ? (
        <div className="space-y-2">
          {node.children.map((child) => (
            <DepartmentTreeItem
              key={child.id}
              node={child}
              collapsedDepartmentIds={collapsedDepartmentIds}
              onToggleBranch={onToggleBranch}
              onToggleDepartment={onToggleDepartment}
              primaryDepartmentId={primaryDepartmentId}
              selectedDepartmentIds={selectedDepartmentIds}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function NewGoalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceAccess = useWorkspaceAccess();

  const [form, setForm] = useState<GoalFormState>(defaultForm);
  const [allDepartments, setAllDepartments] = useState<DepartmentOption[]>([]);
  const [departmentParticipations, setDepartmentParticipations] = useState<
    DepartmentParticipationFormState[]
  >([]);
  const [collapsedDepartmentIds, setCollapsedDepartmentIds] = useState<Record<string, boolean>>({});
  const [parentGoalOptions, setParentGoalOptions] = useState<ParentGoalOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
      ? "Bạn không có quyền tạo mục tiêu ở phòng ban cấp gốc."
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

  useEffect(() => {
    if (isCheckingPermission) {
      return;
    }

    if (!canCreateGoal) {
      setAllDepartments([]);
      setDepartmentParticipations([]);
      setParentGoalOptions([]);
      return;
    }

    let isActive = true;

    const loadFormData = async () => {
      const { data: allDepartmentsData, error: allDepartmentsError } = await supabase
        .from("departments")
        .select("id,name,parent_department_id")
        .order("name", { ascending: true });

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

      const { data: existingGoals, error: existingGoalsError } = await supabase
        .from("goals")
        .select("id,name,department_id,quarter,year")
        .order("created_at", { ascending: false });

      if (!isActive) {
        return;
      }

      if (existingGoalsError) {
        setParentGoalOptions([]);
      } else {
        setParentGoalOptions(
          (existingGoals ?? []).map((goal) => ({
            id: String(goal.id),
            name: String(goal.name),
            departmentId: goal.department_id ? String(goal.department_id) : null,
            quarter: typeof goal.quarter === "number" ? goal.quarter : null,
            year: typeof goal.year === "number" ? goal.year : null,
          })),
        );
      }

      if (editGoalId) {
        const [
          { data: goalData, error: goalError },
          { data: goalDepartmentData, error: goalDepartmentError },
        ] = await Promise.all([
          supabase
            .from("goals")
            .select(
              "id,name,description,type,department_id,status,quarter,year,note,parent_goal_id,start_date,end_date",
            )
            .eq("id", editGoalId)
            .maybeSingle(),
          supabase
            .from("goal_departments")
            .select("department_id,role,goal_weight,kr_weight")
            .eq("goal_id", editGoalId),
        ]);

        if (!isActive) {
          return;
        }

        if (goalError || !goalData) {
          setSubmitError(goalError?.message || "Không tải được dữ liệu mục tiêu để chỉnh sửa.");
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

        setForm({
          name: String(goalData.name ?? ""),
          description: String(goalData.description ?? ""),
          type: String(goalData.type ?? GOAL_TYPES[0].value) as GoalTypeValue,
          departmentId: goalData.department_id ? String(goalData.department_id) : "",
          status: String(goalData.status ?? GOAL_STATUSES[0].value) as GoalStatusValue,
          quarter: typeof goalData.quarter === "number" ? goalData.quarter : initialQuarter,
          year: typeof goalData.year === "number" ? goalData.year : now.getFullYear(),
          note: String(goalData.note ?? ""),
          parentGoalId: goalData.parent_goal_id ? String(goalData.parent_goal_id) : "",
          startDate: goalData.start_date ? String(goalData.start_date) : defaultStartDate,
          endDate: goalData.end_date ? String(goalData.end_date) : defaultEndDate,
        });
        setDepartmentParticipations(
          normalizeDepartmentParticipations(
            goalDepartmentRows
              .filter((item) => item.department_id)
              .map((item) => ({
                departmentId: String(item.department_id),
                role: (item.role === "owner" ? "owner" : "participant") as GoalDepartmentRole,
                goalWeight:
                  typeof item.goal_weight === "number"
                    ? Number(item.goal_weight) * 100
                    : DEFAULT_GOAL_WEIGHT,
                krWeight:
                  typeof item.kr_weight === "number"
                    ? Number(item.kr_weight) * 100
                    : DEFAULT_KR_WEIGHT,
              })),
            goalData.department_id ? String(goalData.department_id) : "",
          ),
        );
        return;
      }

      const matchedFromQuery = queryDepartmentId
        ? departmentOptions.find((department) => department.id === queryDepartmentId)
        : null;
      const nextDepartmentId = matchedFromQuery?.id ?? departmentOptions[0]?.id ?? "";
      setDepartmentParticipations(
        nextDepartmentId ? [createDepartmentParticipation(nextDepartmentId, "owner")] : [],
      );
      setForm((prev) => ({
        ...prev,
        departmentId: nextDepartmentId,
      }));
    };

    void loadFormData();

    return () => {
      isActive = false;
    };
  }, [canCreateGoal, editGoalId, isCheckingPermission, queryDepartmentId, rootDepartments]);

  const departmentsById = useMemo(() => {
    return allDepartments.reduce<Record<string, DepartmentOption>>((acc, department) => {
      acc[department.id] = department;
      return acc;
    }, {});
  }, [allDepartments]);

  const departmentTree = useMemo(() => buildDepartmentTree(allDepartments), [allDepartments]);

  const selectedDepartmentIds = useMemo(() => {
    const next = new Set(departmentParticipations.map((item) => item.departmentId));
    if (form.departmentId) {
      next.add(form.departmentId);
    }
    return next;
  }, [departmentParticipations, form.departmentId]);

  const participantDepartmentCount = useMemo(
    () => departmentParticipations.filter((item) => item.departmentId !== form.departmentId).length,
    [departmentParticipations, form.departmentId],
  );

  useEffect(() => {
    setCollapsedDepartmentIds((prev) => {
      const next: Record<string, boolean> = {};

      const syncTree = (nodes: DepartmentTreeNode[]) => {
        nodes.forEach((node) => {
          if (node.children.length > 0 && prev[node.id]) {
            next[node.id] = true;
          }
          syncTree(node.children);
        });
      };

      syncTree(departmentTree);
      return next;
    });
  }, [departmentTree]);

  const availableParentGoals = useMemo(() => {
    const selectedDepartment = departmentsById[form.departmentId];
    const parentDepartmentId = selectedDepartment?.parentDepartmentId ?? null;

    if (!parentDepartmentId) {
      return [];
    }

    return parentGoalOptions.filter(
      (goal) => goal.departmentId === parentDepartmentId && goal.id !== editGoalId,
    );
  }, [departmentsById, editGoalId, form.departmentId, parentGoalOptions]);

  const hasParentGoal = form.parentGoalId.trim().length > 0;
  const selectedDepartment = useMemo(
    () => allDepartments.find((department) => department.id === form.departmentId) ?? null,
    [allDepartments, form.departmentId],
  );

  const isFormValid = useMemo(() => {
    const hasValidDepartmentParticipations =
      departmentParticipations.length > 0 &&
      departmentParticipations.every((item) => {
        const goalWeight = Number(item.goalWeight);
        const krWeight = Number(item.krWeight);
        return (
          item.departmentId.trim().length > 0 &&
          Number.isFinite(goalWeight) &&
          Number.isFinite(krWeight) &&
          goalWeight >= 0 &&
          krWeight >= 0 &&
          Math.abs(goalWeight + krWeight - 100) <= 0.001
        );
      });

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
      hasValidDepartmentParticipations
    );
  }, [departmentParticipations, form]);

  const toggleRelatedDepartment = (departmentId: string) => {
    setDepartmentParticipations((prev) => {
      if (departmentId === form.departmentId) {
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

  const toggleDepartmentBranch = (departmentId: string) => {
    setCollapsedDepartmentIds((prev) => ({
      ...prev,
      [departmentId]: !prev[departmentId],
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canCreateGoal) {
      setSubmitError("Bạn không có quyền tạo mục tiêu.");
      return;
    }

    if (!isFormValid) {
      setSubmitError("Vui lòng điền đầy đủ thông tin hợp lệ.");
      return;
    }

    const normalizedParticipations = normalizeDepartmentParticipations(
      departmentParticipations,
      form.departmentId,
    );
    const invalidParticipation = normalizedParticipations.find((item) => {
      const goalWeight = Number(item.goalWeight);
      const krWeight = Number(item.krWeight);
      return (
        !item.departmentId ||
        !Number.isFinite(goalWeight) ||
        !Number.isFinite(krWeight) ||
        goalWeight < 0 ||
        krWeight < 0 ||
        Math.abs(goalWeight + krWeight - 100) > 0.001
      );
    });

    if (invalidParticipation) {
      setSubmitError(
        "Mỗi phòng ban tham gia phải có trọng số hợp lệ và tổng trọng số phải bằng 100%.",
      );
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
        parent_goal_id: form.parentGoalId || null,
        start_date: form.startDate || null,
        end_date: form.endDate || null,
      };

      let savedGoalId = editGoalId ? String(editGoalId) : null;

      if (isEditMode && savedGoalId) {
        const { error } = await supabase.from("goals").update(payload).eq("id", savedGoalId);

        if (error) {
          if (error.code === "42501") {
            setSubmitError(
              "Bạn không có quyền cập nhật mục tiêu (RLS). Vui lòng kiểm tra lại policy UPDATE bảng goals.",
            );
          } else {
            setSubmitError(error.message || "Không thể cập nhật mục tiêu.");
          }
          return;
        }
      } else {
        const { data: createdGoal, error } = await supabase
          .from("goals")
          .insert(payload)
          .select("id")
          .maybeSingle();

        if (error || !createdGoal) {
          if (error?.code === "42501") {
            setSubmitError(
              "Bạn không có quyền tạo mục tiêu (RLS). Vui lòng kiểm tra lại policy INSERT bảng goals.",
            );
          } else {
            setSubmitError(error?.message || "Không thể tạo mục tiêu.");
          }
          return;
        }

        savedGoalId = String(createdGoal.id);
      }

      if (!savedGoalId) {
        setSubmitError("Không xác định được mục tiêu cần lưu.");
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
              ? `${isEditMode ? "Mục tiêu đã được cập nhật" : "Mục tiêu đã được tạo"} nhưng chưa lưu được danh sách team phối hợp: ${goalDepartmentsError.message}`
              : `${isEditMode ? "Mục tiêu đã được cập nhật" : "Mục tiêu đã được tạo"} nhưng chưa lưu được danh sách team phối hợp. Mở chi tiết mục tiêu để kiểm tra lại.`,
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
            ? `Đã lưu mục tiêu nhưng chưa kiểm tra lại được danh sách team phối hợp: ${currentGoalDepartmentsError.message}`
            : "Đã lưu mục tiêu nhưng chưa kiểm tra lại được danh sách team phối hợp.",
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
              ? `Đã lưu mục tiêu nhưng chưa xóa được team phối hợp cũ: ${deleteStaleGoalDepartmentsError.message}`
              : "Đã lưu mục tiêu nhưng chưa xóa được team phối hợp cũ.",
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
            ? `Đã lưu mục tiêu nhưng chưa xác nhận được danh sách team phối hợp cuối cùng: ${finalGoalDepartmentsError.message}`
            : "Đã lưu mục tiêu nhưng chưa xác nhận được danh sách team phối hợp cuối cùng.",
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
          "Mục tiêu đã được cập nhật nhưng danh sách team phối hợp chưa đồng bộ hoàn toàn. DB có thể đang thiếu quyền DELETE cho bảng goal_departments.",
        );
        return;
      }

      router.push(`/goals/${savedGoalId}`);
      router.refresh();
    } catch {
      setSubmitError(`Có lỗi xảy ra khi ${isEditMode ? "cập nhật" : "tạo"} mục tiêu.`);
    } finally {
      setIsSubmitting(false);
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
                  {isEditMode ? "Chỉnh sửa mục tiêu" : "Tạo mục tiêu mới"}
                </span>
              </div>
              <div className="flex items-center gap-2">
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
            {showPermissionDebug && permissionDebug ? (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-xs text-slate-100">
                <p className="mb-2 font-semibold text-sky-300">
                  Debug quyền tạo mục tiêu (debugPermission=1)
                </p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                  {JSON.stringify(permissionDebug, null, 2)}
                </pre>
              </div>
            ) : null}

            <section className="mx-auto w-full max-w-[920px] rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_50px_-40px_rgba(15,23,42,0.4)] lg:p-6">
              <div className="mb-5">
                <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">
                  {isEditMode ? "Chỉnh sửa mục tiêu" : "Thêm mục tiêu mới"}
                </h1>
              </div>

              {isCheckingPermission ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Đang kiểm tra quyền tạo mục tiêu...
                </div>
              ) : null}

              {!isCheckingPermission && permissionError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {permissionError}
                </div>
              ) : null}

              {!isCheckingPermission && canCreateGoal ? (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  {submitError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {submitError}
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <label htmlFor="goal-name" className="text-sm font-semibold text-slate-700">
                      Tên mục tiêu *
                    </label>
                    <input
                      id="goal-name"
                      value={form.name}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="Ví dụ: Tăng thị phần thêm 15% tại EU"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Loại (type)</label>
                      <Select
                        value={form.type}
                        onValueChange={(value: GoalTypeValue) =>
                          setForm((prev) => ({ ...prev, type: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn loại mục tiêu" />
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
                      <label className="text-sm font-semibold text-slate-700">
                        Trạng thái (status)
                      </label>
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
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700">Phòng ban *</label>
                    <Select
                      value={form.departmentId || undefined}
                      onValueChange={(value) => {
                        setForm((prev) => ({
                          ...prev,
                          departmentId: value,
                          parentGoalId: "",
                        }));
                        setDepartmentParticipations((prev) =>
                          normalizeDepartmentParticipations(
                            prev.map((item) =>
                              item.departmentId === form.departmentId
                                ? { ...item, departmentId: value }
                                : item,
                            ),
                            value,
                          ),
                        );
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn phòng ban" />
                      </SelectTrigger>
                      <SelectContent>
                        {allDepartments.map((department) => (
                          <SelectItem key={department.id} value={department.id}>
                            {department.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="max-h-[700px] overflow-y-auto pr-1">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-sm font-semibold text-slate-700">
                            Các phòng ban tham gia
                          </label>
                          <span className="text-xs text-slate-500">
                            {participantDepartmentCount} phòng ban tham gia
                          </span>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="space-y-2">
                            {departmentTree.map((department) => (
                              <DepartmentTreeItem
                                key={department.id}
                                node={department}
                                collapsedDepartmentIds={collapsedDepartmentIds}
                                onToggleBranch={toggleDepartmentBranch}
                                onToggleDepartment={toggleRelatedDepartment}
                                primaryDepartmentId={form.departmentId}
                                selectedDepartmentIds={selectedDepartmentIds}
                              />
                            ))}
                          </div>
                          <p className="mt-3 text-xs text-slate-500">
                            Bấm vào từng node để thêm hoặc bỏ phòng ban tham gia. Goal vẫn có
                            `department_id` là đơn vị chính. Mỗi phòng ban tham gia có vai trò,
                            tỷ trọng mục tiêu và tỷ trọng KR để phục vụ chấm hiệu suất theo mục tiêu.
                          </p>
                        </div>
                        {departmentParticipations.length > 0 ? (
                          <div className="mt-3 space-y-3">
                            {departmentParticipations
                              .slice()
                              .sort((a, b) =>
                                a.departmentId === form.departmentId
                                  ? -1
                                  : b.departmentId === form.departmentId
                                    ? 1
                                    : 0,
                              )
                              .map((item) => {
                                const departmentName =
                                  allDepartments.find(
                                    (department) => department.id === item.departmentId,
                                  )?.name ?? "Phòng ban";
                                const totalWeight = Number(item.goalWeight) + Number(item.krWeight);
                                const isPrimary = item.departmentId === form.departmentId;
                                const hasValidTotalWeight = Math.abs(totalWeight - 100) <= 0.001;

                                return (
                                  <div
                                    key={item.departmentId}
                                    className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[minmax(0,1.2fr)_160px_140px_140px_auto]"
                                  >
                                    <div>
                                      <p className="text-sm font-semibold text-slate-800">
                                        {departmentName}
                                      </p>
                                      <p className="mt-1 text-xs text-slate-500">
                                        {isPrimary
                                          ? "Đơn vị chính của mục tiêu"
                                          : "Đơn vị tham gia thực thi"}
                                      </p>
                                    </div>

                                    <label className="space-y-1 text-xs font-medium text-slate-600">
                                      <span>Vai trò</span>
                                      <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                                        {isPrimary ? "Đơn vị chính" : "Tham gia"}
                                      </div>
                                    </label>

                                    <label className="space-y-1 text-xs font-medium text-slate-600">
                                      <span>Trọng số mục tiêu (%)</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        step="0.1"
                                        value={item.goalWeight}
                                        onChange={(event) =>
                                          setDepartmentParticipations((prev) =>
                                            prev.map((row) =>
                                              row.departmentId === item.departmentId
                                                ? {
                                                    ...row,
                                                    goalWeight: Number(event.target.value),
                                                  }
                                                : row,
                                            ),
                                          )
                                        }
                                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                      />
                                    </label>

                                    <label className="space-y-1 text-xs font-medium text-slate-600">
                                      <span>Trọng số KR (%)</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        step="0.1"
                                        value={item.krWeight}
                                        onChange={(event) =>
                                          setDepartmentParticipations((prev) =>
                                            prev.map((row) =>
                                              row.departmentId === item.departmentId
                                                ? {
                                                    ...row,
                                                    krWeight: Number(event.target.value),
                                                  }
                                                : row,
                                            ),
                                          )
                                        }
                                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                      />
                                    </label>

                                    <div className="flex items-end justify-between gap-2 md:justify-end">
                                      <span
                                        className={`inline-flex h-10 items-center rounded-lg px-3 text-xs font-semibold ${
                                          hasValidTotalWeight
                                            ? "bg-emerald-50 text-emerald-700"
                                            : "bg-rose-50 text-rose-700"
                                        }`}
                                      >
                                        {hasValidTotalWeight ? "Đủ 100%" : "Tổng phải 100%"}
                                      </span>
                                      {!isPrimary ? (
                                        <button
                                          type="button"
                                          onClick={() => toggleRelatedDepartment(item.departmentId)}
                                          className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                        >
                                          Bỏ
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {selectedDepartment ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      <p className="font-semibold text-slate-800">
                        Đơn vị chính: {selectedDepartment.name}
                      </p>
                      <p className="mt-1">
                        Mục tiêu mới sẽ được tạo theo cấu trúc `goal -&gt; key_results -&gt; tasks`.
                        Sau khi tạo goal, bạn có thể vào trang chi tiết để thêm key result và phân
                        công task theo từng key result.
                      </p>
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700">Mục tiêu cha</label>
                    <Select
                      value={form.parentGoalId || NO_PARENT_GOAL_VALUE}
                      onValueChange={(value) => {
                        const nextParentGoalId = value === NO_PARENT_GOAL_VALUE ? "" : value;
                        setForm((prev) => {
                          if (!nextParentGoalId) {
                            return { ...prev, parentGoalId: "" };
                          }

                          const selectedParentGoal = availableParentGoals.find(
                            (goal) => goal.id === nextParentGoalId,
                          );

                          if (
                            !selectedParentGoal ||
                            selectedParentGoal.quarter === null ||
                            selectedParentGoal.year === null
                          ) {
                            return { ...prev, parentGoalId: nextParentGoalId };
                          }

                          return {
                            ...prev,
                            parentGoalId: nextParentGoalId,
                            quarter: selectedParentGoal.quarter,
                            year: selectedParentGoal.year,
                          };
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Không có mục tiêu cha" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_PARENT_GOAL_VALUE}>Không có mục tiêu cha</SelectItem>
                        {availableParentGoals.map((goal) => (
                          <SelectItem key={goal.id} value={goal.id}>
                            {goal.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="goal-progress"
                        className="text-sm font-semibold text-slate-700"
                      >
                        Tiến độ (%)
                      </label>
                      <input
                        id="goal-progress"
                        type="number"
                        value={0}
                        disabled
                        className="h-11 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-600 outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Quý (1-4) *</label>
                      <Select
                        disabled={hasParentGoal}
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
                      <label htmlFor="goal-year" className="text-sm font-semibold text-slate-700">
                        Năm *
                      </label>
                      <input
                        id="goal-year"
                        type="number"
                        min={2000}
                        max={2100}
                        disabled={hasParentGoal}
                        value={form.year}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            year: Number(event.target.value) || now.getFullYear(),
                          }))
                        }
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="goal-start-date"
                        className="text-sm font-semibold text-slate-700"
                      >
                        Ngày bắt đầu *
                      </label>
                      <input
                        id="goal-start-date"
                        type="date"
                        value={form.startDate}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            startDate: event.target.value,
                          }))
                        }
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="goal-end-date"
                        className="text-sm font-semibold text-slate-700"
                      >
                        Ngày kết thúc *
                      </label>
                      <input
                        id="goal-end-date"
                        type="date"
                        min={form.startDate || undefined}
                        value={form.endDate}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            endDate: event.target.value,
                          }))
                        }
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  {form.startDate &&
                  form.endDate &&
                  new Date(form.startDate).getTime() > new Date(form.endDate).getTime() ? (
                    <p className="-mt-2 text-xs text-rose-600">
                      Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.
                    </p>
                  ) : null}

                  {hasParentGoal ? (
                    <p className="-mt-2 text-xs text-slate-500">
                      Quý và năm đang tự động lấy theo mục tiêu cha đã chọn.
                    </p>
                  ) : null}

                  <div className="space-y-1.5">
                    <label
                      htmlFor="goal-description"
                      className="text-sm font-semibold text-slate-700"
                    >
                      Mô tả (description)
                    </label>
                    <textarea
                      id="goal-description"
                      rows={4}
                      value={form.description}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="Mô tả mục tiêu"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="goal-note" className="text-sm font-semibold text-slate-700">
                      Ghi chú (note)
                    </label>
                    <textarea
                      id="goal-note"
                      rows={3}
                      value={form.note}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          note: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="Ghi chú nội bộ"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <Link
                      href="/goals"
                      className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Hủy
                    </Link>
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
                          : "Tạo mục tiêu"}
                    </button>
                  </div>
                </form>
              ) : null}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
