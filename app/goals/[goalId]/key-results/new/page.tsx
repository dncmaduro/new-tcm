"use client";

import { InfoCircledIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { KeyResultContributionInfo } from "@/components/key-result-contribution-info";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  formatKeyResultContributionTypeLabel,
  KEY_RESULT_CONTRIBUTION_TYPES,
  KEY_RESULT_TYPES,
  KEY_RESULT_UNITS,
  normalizeKeyResultContributionTypeValue,
  normalizeKeyResultTypeValue,
  type KeyResultContributionTypeValue,
  type KeyResultTypeValue,
  type KeyResultUnitValue,
} from "@/lib/constants/key-results";
import { buildWorkspaceAccessDebug, useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTimelineRangeVi, isDateRangeOrdered } from "@/lib/timeline";

type GoalDetailRow = {
  id: string;
  name: string;
  department_id: string | null;
  start_date: string | null;
  end_date: string | null;
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
  departmentId: string;
  name: string;
  role: string;
};

type ExistingKeyResultRow = {
  id: string;
  goal_id: string;
  name: string;
  description: string | null;
  type: string | null;
  contribution_type: string | null;
  unit: string | null;
  start_value: number | null;
  target: number | null;
  current: number | null;
  responsible_department_id: string | null;
  start_date: string | null;
  end_date: string | null;
};

type KeyResultLinkOption = {
  id: string;
  goalId: string | null;
  goalName: string;
  name: string;
  type: string | null;
  contributionType: string | null;
  unit: string | null;
};

type SupportLinkRow = {
  id: string;
  support_key_result_id: string;
  target_key_result_id: string;
  allocated_value: number | null;
  allocated_percent: number | null;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupportLinkDraft = {
  rowId: string;
  id: string | null;
  targetKeyResultId: string;
  allocatedValue: string;
  allocatedPercent: string;
  note: string;
};

type KeyResultFormState = {
  name: string;
  description: string;
  type: KeyResultTypeValue;
  contributionType: KeyResultContributionTypeValue;
  unit: KeyResultUnitValue;
  target: number;
  responsibleDepartmentId: string;
  startDate: string;
  endDate: string;
};

type KeyResultCreatePermissionDebug = {
  checkedAt: string;
  step: string;
  authUserId: string | null;
  profileId: string | null;
  profileName: string | null;
  leaderRoleIds: string[];
  leaderRolesRaw: Array<{ id: string; name: string | null }>;
  userRoleRows: Array<{ department_id: string | null; role_id: string | null }>;
  departments: Array<{ id: string; name: string; parent_department_id: string | null }>;
  rootDepartments: Array<{ id: string; name: string }>;
  canCreateKeyResult: boolean;
  error: string | null;
};

type GoalKeyResultFormMode = "create" | "edit";

const defaultKeyResultForm: KeyResultFormState = {
  name: "",
  description: "",
  type: "kpi",
  contributionType: "direct",
  unit: "count",
  target: 100,
  responsibleDepartmentId: "",
  startDate: "",
  endDate: "",
};

const DEFAULT_KEY_RESULT_WEIGHT = 1;

const toFormNumber = (value: number | null | undefined, fallback = 0) => {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
};

const toNumericInput = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "";
  }

  return String(Number(value));
};

const createSupportLinkDraftId = () =>
  globalThis.crypto?.randomUUID?.() ?? `support-link-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createSupportLinkDraft = (value?: Partial<Omit<SupportLinkDraft, "rowId">>): SupportLinkDraft => ({
  rowId: createSupportLinkDraftId(),
  id: value?.id ?? null,
  targetKeyResultId: value?.targetKeyResultId ?? "",
  allocatedValue: value?.allocatedValue ?? "",
  allocatedPercent: value?.allocatedPercent ?? "",
  note: value?.note ?? "",
});

const isSupportLinkDraftFilled = (value: SupportLinkDraft) =>
  Boolean(
    value.targetKeyResultId ||
      value.allocatedValue.trim() ||
      value.allocatedPercent.trim() ||
      value.note.trim(),
  );

const getReadableKeyResultSubmitError = (message: string | null | undefined) => {
  const normalizedMessage = String(message ?? "").toLowerCase();

  if (normalizedMessage.includes('record "new" has no field "progress"')) {
    return "DB đang còn trigger cũ của KR dùng cột progress không còn tồn tại. Cần chạy migration sửa trigger key_results.";
  }

  return message || "Không thể tạo KR.";
};

const normalizeKeyResultLinkOption = (value: Record<string, unknown>): KeyResultLinkOption => {
  const rawGoal = Array.isArray(value.goal) ? value.goal[0] ?? null : value.goal ?? null;
  const goalRecord =
    rawGoal && typeof rawGoal === "object" ? (rawGoal as Record<string, unknown>) : null;

  return {
    id: String(value.id),
    goalId: value.goal_id ? String(value.goal_id) : null,
    goalName: goalRecord?.name ? String(goalRecord.name) : "Chưa có mục tiêu",
    name: String(value.name),
    type: value.type ? String(value.type) : null,
    contributionType: value.contribution_type ? String(value.contribution_type) : null,
    unit: value.unit ? String(value.unit) : null,
  };
};

const normalizeSupportLinkRow = (value: Record<string, unknown>): SupportLinkRow => ({
  id: String(value.id),
  support_key_result_id: String(value.support_key_result_id),
  target_key_result_id: String(value.target_key_result_id),
  allocated_value:
    typeof value.allocated_value === "number"
      ? value.allocated_value
      : value.allocated_value === null
        ? null
        : Number(value.allocated_value),
  allocated_percent:
    typeof value.allocated_percent === "number"
      ? value.allocated_percent
      : value.allocated_percent === null
        ? null
        : Number(value.allocated_percent),
  note: value.note ? String(value.note) : null,
  created_at: value.created_at ? String(value.created_at) : null,
  updated_at: value.updated_at ? String(value.updated_at) : null,
});

const toKeyResultFormState = (keyResult: ExistingKeyResultRow): KeyResultFormState => ({
  name: keyResult.name,
  description: keyResult.description ?? "",
  type: normalizeKeyResultTypeValue(keyResult.type),
  contributionType: normalizeKeyResultContributionTypeValue(keyResult.contribution_type),
  unit: (KEY_RESULT_UNITS.some((item) => item.value === keyResult.unit) ? keyResult.unit : "count") as KeyResultUnitValue,
  target: toFormNumber(keyResult.target, 100),
  responsibleDepartmentId: keyResult.responsible_department_id ?? "",
  startDate: keyResult.start_date ?? "",
  endDate: keyResult.end_date ?? "",
});

function SupportAllocationInfo({ type }: { type: KeyResultTypeValue }) {
  const isOkr = type === "okr";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={isOkr ? "Giải thích phần trăm phân bổ" : "Giải thích lượng phân bổ"}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition hover:text-slate-600"
        >
          <InfoCircledIcon className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] space-y-2 p-3 text-xs text-slate-600" align="start">
        <div>
          <p className="font-semibold text-slate-800">
            {isOkr ? "Phần trăm phân bổ" : "Lượng phân bổ"}
          </p>
          <p className="mt-1">
            {isOkr
              ? "Dùng cho KR hỗ trợ loại OKR. Nhập tỷ lệ phần trăm phạm vi đóng góp của KR này vào KR trực tiếp, trong khoảng 0 đến 100."
              : "Dùng cho KR hỗ trợ loại KPI. Nhập lượng tuyệt đối mà KR này phân bổ sang KR trực tiếp, theo đúng đơn vị đo của KR."}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function GoalKeyResultFormPageContent({ mode }: { mode: GoalKeyResultFormMode }) {
  const params = useParams<{ goalId: string; keyResultId?: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceAccess = useWorkspaceAccess();
  const goalId = params.goalId;
  const keyResultId = typeof params.keyResultId === "string" ? params.keyResultId : "";
  const hasValidGoalId = Boolean(goalId);
  const isEditMode = mode === "edit";
  const hasValidKeyResultId = !isEditMode || Boolean(keyResultId);

  const [goal, setGoal] = useState<GoalDetailRow | null>(null);
  const [goalDepartments, setGoalDepartments] = useState<GoalDepartmentItem[]>([]);
  const [form, setForm] = useState<KeyResultFormState>(defaultKeyResultForm);
  const [targetInputValue, setTargetInputValue] = useState(String(defaultKeyResultForm.target));
  const [supportLinkDrafts, setSupportLinkDrafts] = useState<SupportLinkDraft[]>([]);
  const [initialSupportLinkIds, setInitialSupportLinkIds] = useState<string[]>([]);
  const [supportTargetOptions, setSupportTargetOptions] = useState<KeyResultLinkOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSupportTargets, setIsLoadingSupportTargets] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [supportTargetLoadError, setSupportTargetLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showPermissionDebug = searchParams.get("debugPermission") === "1";
  const supportSyncError = searchParams.get("supportSyncError");
  const isCheckingPermission = workspaceAccess.isLoading;
  const canCreateKeyResult = workspaceAccess.canManage && !workspaceAccess.error;
  const permissionError =
    workspaceAccess.error ??
    (!isCheckingPermission && !workspaceAccess.canManage
      ? `Bạn không có quyền ${isEditMode ? "chỉnh sửa" : "tạo"} KR ở mục tiêu này.`
      : null);
  const permissionDebug: KeyResultCreatePermissionDebug = useMemo(
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
      canCreateKeyResult: workspaceAccess.canManage,
    }),
    [workspaceAccess],
  );

  useEffect(() => {
    if (!hasValidGoalId || !hasValidKeyResultId) {
      setIsLoading(false);
      setLoadError(!hasValidGoalId ? "Thiếu mã mục tiêu." : "Thiếu mã KR.");
      return;
    }

    let isActive = true;

    const loadData = async () => {
      setIsLoading(true);
      setIsLoadingSupportTargets(true);
      setLoadError(null);
      setSupportTargetLoadError(null);

      const [goalResult, goalDepartmentResult, keyResultResult, directKeyResultResult, supportLinkResult] = await Promise.all([
        supabase.from("goals").select("id,name,department_id,start_date,end_date").eq("id", goalId).maybeSingle(),
        supabase.from("goal_departments").select("department_id,role,goal_weight,kr_weight").eq("goal_id", goalId),
        isEditMode
          ? supabase
              .from("key_results")
              .select(
                "id,goal_id,name,description,type,contribution_type,unit,start_value,target,current,responsible_department_id,start_date,end_date",
              )
              .eq("id", keyResultId)
              .eq("goal_id", goalId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        isEditMode
          ? supabase
              .from("key_results")
              .select(
                "id,goal_id,name,type,contribution_type,unit,goal:goals!key_results_goal_id_fkey(id,name),created_at",
              )
              .eq("contribution_type", "direct")
              .neq("id", keyResultId)
              .order("created_at", { ascending: false })
          : supabase
              .from("key_results")
              .select(
                "id,goal_id,name,type,contribution_type,unit,goal:goals!key_results_goal_id_fkey(id,name),created_at",
              )
              .eq("contribution_type", "direct")
              .order("created_at", { ascending: false }),
        isEditMode
          ? supabase
              .from("key_result_support_links")
              .select(
                "id,support_key_result_id,target_key_result_id,allocated_value,allocated_percent,note,created_at,updated_at",
              )
              .eq("support_key_result_id", keyResultId)
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
      ]);

      const { data: goalData, error: goalError } = goalResult;
      const { data: goalDepartmentData, error: goalDepartmentError } = goalDepartmentResult;
      const { data: keyResultData, error: keyResultError } = keyResultResult;
      const { data: directKeyResultData, error: directKeyResultError } = directKeyResultResult;
      const { data: supportLinkData, error: supportLinkError } = supportLinkResult;

      if (!isActive) {
        return;
      }

      if (goalError || !goalData) {
        setGoal(null);
        setGoalDepartments([]);
        setSupportLinkDrafts([]);
        setInitialSupportLinkIds([]);
        setSupportTargetOptions([]);
        setLoadError(goalError?.message || "Không tải được dữ liệu mục tiêu.");
        setIsLoading(false);
        setIsLoadingSupportTargets(false);
        return;
      }

      if (isEditMode && (keyResultError || !keyResultData)) {
        setGoal(goalData as GoalDetailRow);
        setGoalDepartments([]);
        setSupportLinkDrafts([]);
        setInitialSupportLinkIds([]);
        setSupportTargetOptions([]);
        setLoadError(keyResultError?.message || "Không tải được dữ liệu KR.");
        setIsLoading(false);
        setIsLoadingSupportTargets(false);
        return;
      }

      if (isEditMode && supportLinkError) {
        setGoal(goalData as GoalDetailRow);
        setGoalDepartments([]);
        setSupportLinkDrafts([]);
        setInitialSupportLinkIds([]);
        setSupportTargetOptions([]);
        setLoadError(supportLinkError.message || "Không tải được dữ liệu liên kết hỗ trợ.");
        setIsLoading(false);
        setIsLoadingSupportTargets(false);
        return;
      }

      const typedGoal = goalData as GoalDetailRow;
      setGoal(typedGoal);

      const typedKeyResult = isEditMode
        ? ({
            ...(keyResultData as ExistingKeyResultRow),
            id: String((keyResultData as ExistingKeyResultRow).id),
            goal_id: String((keyResultData as ExistingKeyResultRow).goal_id),
            responsible_department_id: (keyResultData as ExistingKeyResultRow).responsible_department_id
              ? String((keyResultData as ExistingKeyResultRow).responsible_department_id)
              : null,
          } satisfies ExistingKeyResultRow)
        : null;

      const directOptions = ((directKeyResultData ?? []) as Array<Record<string, unknown>>).map((row) =>
        normalizeKeyResultLinkOption(row),
      );
      const directOptionsById = directOptions.reduce<Record<string, KeyResultLinkOption>>((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {});
      const supportLinkRows = ((supportLinkData ?? []) as Array<Record<string, unknown>>).map((row) =>
        normalizeSupportLinkRow(row),
      );
      const missingTargetIds = supportLinkRows
        .map((item) => item.target_key_result_id)
        .filter((id) => !directOptionsById[id]);
      const { data: relatedTargetData, error: relatedTargetError } =
        missingTargetIds.length > 0
          ? await supabase
              .from("key_results")
              .select("id,goal_id,name,type,contribution_type,unit,goal:goals!key_results_goal_id_fkey(id,name)")
              .in("id", Array.from(new Set(missingTargetIds)))
          : { data: [], error: null };

      if (!isActive) {
        return;
      }

      if (relatedTargetError) {
        setLoadError(relatedTargetError.message || "Không tải được KR liên kết.");
        setIsLoading(false);
        setIsLoadingSupportTargets(false);
        return;
      }

      const mergedSupportTargetOptions = [
        ...directOptions,
        ...((relatedTargetData ?? []) as Array<Record<string, unknown>>).map((row) =>
          normalizeKeyResultLinkOption(row),
        ),
      ].reduce<Record<string, KeyResultLinkOption>>((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {});

      setSupportTargetOptions(Object.values(mergedSupportTargetOptions));
      setSupportLinkDrafts(
        supportLinkRows.map((item) =>
          createSupportLinkDraft({
            id: item.id,
            targetKeyResultId: item.target_key_result_id,
            allocatedValue: toNumericInput(item.allocated_value),
            allocatedPercent: toNumericInput(item.allocated_percent),
            note: item.note ?? "",
          }),
        ),
      );
      setInitialSupportLinkIds(supportLinkRows.map((item) => item.id));
      if (directKeyResultError) {
        setSupportTargetLoadError(
          directKeyResultError.message || "Không tải được danh sách KR trực tiếp để liên kết.",
        );
      }
      setIsLoadingSupportTargets(false);

      const relatedDepartmentIds = Array.from(
        new Set(
          [
            typedGoal.department_id,
            typedKeyResult?.responsible_department_id ?? null,
            ...((goalDepartmentData ?? []) as GoalDepartmentLinkRow[]).map((item) => item.department_id),
          ].filter(Boolean),
        ),
      ) as string[];

      const { data: departmentsData, error: departmentsError } =
        relatedDepartmentIds.length > 0
          ? await supabase.from("departments").select("id,name").in("id", relatedDepartmentIds).order("name", { ascending: true })
          : { data: [], error: null };

      if (!isActive) {
        return;
      }

      if (departmentsError) {
        setGoalDepartments([]);
        setLoadError("Không tải được danh sách phòng ban tham gia mục tiêu.");
        setIsLoading(false);
        return;
      }

      const departmentNameById = ((departmentsData ?? []) as DepartmentRow[]).reduce<Record<string, string>>(
        (acc, department) => {
          acc[String(department.id)] = String(department.name);
          return acc;
        },
        {},
      );

      const mappedGoalDepartments = ((goalDepartmentData ?? []) as GoalDepartmentLinkRow[])
        .filter((item) => item.department_id)
        .map((item) => ({
          departmentId: String(item.department_id),
          name: departmentNameById[String(item.department_id)] ?? "Phòng ban",
          role: item.role ? String(item.role) : "participant",
        }));

      const normalizedGoalDepartments =
        mappedGoalDepartments.find((item) => item.departmentId === typedGoal.department_id) || !typedGoal.department_id
          ? mappedGoalDepartments
          : [
              {
                departmentId: String(typedGoal.department_id),
                name: departmentNameById[String(typedGoal.department_id)] ?? "Phòng ban chính",
                role: "owner",
              },
              ...mappedGoalDepartments,
            ];

      const nextGoalDepartments =
        typedKeyResult?.responsible_department_id &&
        !normalizedGoalDepartments.some((item) => item.departmentId === typedKeyResult.responsible_department_id)
          ? [
              ...normalizedGoalDepartments,
              {
                departmentId: typedKeyResult.responsible_department_id,
                name: departmentNameById[typedKeyResult.responsible_department_id] ?? "Phòng ban",
                role: "participant",
              },
            ]
          : normalizedGoalDepartments;

      setGoalDepartments(nextGoalDepartments);

      if (typedKeyResult) {
        const nextForm = {
          ...toKeyResultFormState(typedKeyResult),
          responsibleDepartmentId:
            typedKeyResult.responsible_department_id || nextGoalDepartments[0]?.departmentId || "",
          startDate: typedKeyResult.start_date || typedGoal.start_date || "",
          endDate: typedKeyResult.end_date || typedGoal.end_date || "",
        };

        setForm(nextForm);
        setTargetInputValue(String(nextForm.target));
      } else {
        setForm((prev) => ({
          ...prev,
          responsibleDepartmentId: prev.responsibleDepartmentId || nextGoalDepartments[0]?.departmentId || "",
          startDate: prev.startDate || typedGoal.start_date || "",
          endDate: prev.endDate || typedGoal.end_date || "",
        }));
        setSupportLinkDrafts([]);
        setInitialSupportLinkIds([]);
      }
      setIsLoading(false);

      if (goalDepartmentError) {
        setLoadError("Không tải đầy đủ danh sách phòng ban tham gia. Bạn vẫn có thể thử tạo KR.");
      }
    };

    void loadData();

    return () => {
      isActive = false;
    };
  }, [goalId, hasValidGoalId, hasValidKeyResultId, isEditMode, keyResultId]);

  useEffect(() => {
    if (!isLoading && form.contributionType === "support" && supportLinkDrafts.length === 0) {
      setSupportLinkDrafts([createSupportLinkDraft()]);
    }
  }, [form.contributionType, isLoading, supportLinkDrafts.length]);

  const isSupportContribution = form.contributionType === "support";
  const isSupportKpi = isSupportContribution && form.type === "kpi";
  const isSupportOkr = isSupportContribution && form.type === "okr";

  useEffect(() => {
    if (!isSupportContribution) {
      return;
    }

    setSupportLinkDrafts((prev) => {
      let didChange = false;
      const next = prev.map((item) => {
        if (form.type === "okr" && item.allocatedValue) {
          didChange = true;
          return { ...item, allocatedValue: "" };
        }

        if (form.type === "kpi" && item.allocatedPercent) {
          didChange = true;
          return { ...item, allocatedPercent: "" };
        }

        return item;
      });

      return didChange ? next : prev;
    });
  }, [form.type, isSupportContribution]);

  const getSupportTargetChoices = (currentRowId: string, currentTargetId: string) => {
    const usedTargetIds = new Set(
      supportLinkDrafts
        .filter((item) => item.rowId !== currentRowId)
        .map((item) => item.targetKeyResultId)
        .filter(Boolean),
    );

    return supportTargetOptions.filter((item) => {
      if (item.id === currentTargetId) {
        return true;
      }

      return (
        normalizeKeyResultContributionTypeValue(item.contributionType) === "direct" &&
        !usedTargetIds.has(item.id)
      );
    });
  };

  const updateSupportLinkDraft = (rowId: string, patch: Partial<Omit<SupportLinkDraft, "rowId">>) => {
    setSupportLinkDrafts((prev) =>
      prev.map((item) => (item.rowId === rowId ? { ...item, ...patch } : item)),
    );
  };

  const addSupportLinkDraft = () => {
    setSupportLinkDrafts((prev) => [...prev, createSupportLinkDraft()]);
  };

  const removeSupportLinkDraft = (rowId: string) => {
    setSupportLinkDrafts((prev) => prev.filter((item) => item.rowId !== rowId));
  };

  const validateSupportLinkDrafts = () => {
    if (!isSupportContribution) {
      return null;
    }

    if (supportTargetLoadError) {
      return "Không tải được danh sách KR trực tiếp để liên kết.";
    }

    const activeDrafts = supportLinkDrafts.filter(isSupportLinkDraftFilled);
    if (activeDrafts.length === 0) {
      return "KR hỗ trợ phải liên kết với ít nhất một KR trực tiếp.";
    }

    const linkedTargetIds = new Set<string>();
    for (const item of activeDrafts) {
      if (!item.targetKeyResultId) {
        return "Vui lòng chọn KR trực tiếp cho mọi liên kết hỗ trợ.";
      }

      if (isEditMode && item.targetKeyResultId === keyResultId) {
        return "KR không thể tự liên kết với chính nó.";
      }

      const safeAllocatedValue = item.allocatedValue.trim() ? Number(item.allocatedValue) : null;
      const safeAllocatedPercent = item.allocatedPercent.trim() ? Number(item.allocatedPercent) : null;

      if (isSupportKpi && safeAllocatedValue !== null && !Number.isFinite(safeAllocatedValue)) {
        return "Lượng phân bổ phải là số hợp lệ.";
      }

      if (
        isSupportOkr &&
        safeAllocatedPercent !== null &&
        (!Number.isFinite(safeAllocatedPercent) || safeAllocatedPercent < 0 || safeAllocatedPercent > 100)
      ) {
        return "Phần trăm phân bổ phải nằm trong khoảng 0 đến 100.";
      }

      if (linkedTargetIds.has(item.targetKeyResultId)) {
        return "Mỗi KR trực tiếp chỉ nên xuất hiện một lần trong phần liên kết hỗ trợ.";
      }

      linkedTargetIds.add(item.targetKeyResultId);
    }

    return null;
  };

  const syncSupportLinks = async (savedKeyResultId: string) => {
    const activeDrafts = isSupportContribution
      ? supportLinkDrafts.filter(isSupportLinkDraftFilled)
      : [];
    const shouldSaveAllocatedValue = form.type === "kpi";
    const shouldSaveAllocatedPercent = form.type === "okr";

    const retainedIds = new Set(
      activeDrafts
        .map((item) => item.id)
        .filter((value): value is string => Boolean(value)),
    );
    const idsToDelete = initialSupportLinkIds.filter((item) => !retainedIds.has(item));

    if (idsToDelete.length > 0) {
      const { error } = await supabase.from("key_result_support_links").delete().in("id", idsToDelete);
      if (error) {
        return error.message || "Không thể xóa liên kết hỗ trợ cũ.";
      }
    }

    const existingRows = activeDrafts
      .filter((item): item is SupportLinkDraft & { id: string } => Boolean(item.id))
      .map((item) => ({
        id: item.id,
        support_key_result_id: savedKeyResultId,
        target_key_result_id: item.targetKeyResultId,
        allocated_value:
          shouldSaveAllocatedValue && item.allocatedValue.trim()
            ? Number(item.allocatedValue)
            : null,
        allocated_percent:
          shouldSaveAllocatedPercent && item.allocatedPercent.trim()
            ? Number(item.allocatedPercent)
            : null,
        note: item.note.trim() || null,
      }));

    if (existingRows.length > 0) {
      const { error } = await supabase
        .from("key_result_support_links")
        .upsert(existingRows, { onConflict: "id" });
      if (error) {
        return error.message || "Không thể cập nhật liên kết hỗ trợ.";
      }
    }

    const newRows = activeDrafts
      .filter((item) => !item.id)
      .map((item) => ({
        support_key_result_id: savedKeyResultId,
        target_key_result_id: item.targetKeyResultId,
        allocated_value:
          shouldSaveAllocatedValue && item.allocatedValue.trim()
            ? Number(item.allocatedValue)
            : null,
        allocated_percent:
          shouldSaveAllocatedPercent && item.allocatedPercent.trim()
            ? Number(item.allocatedPercent)
            : null,
        note: item.note.trim() || null,
      }));

    if (newRows.length > 0) {
      const { error } = await supabase.from("key_result_support_links").insert(newRows);
      if (error) {
        return error.message || "Không thể tạo liên kết hỗ trợ mới.";
      }
    }

    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!goal?.id) {
      setSubmitError(`Không xác định được mục tiêu để ${isEditMode ? "chỉnh sửa" : "tạo"} KR.`);
      return;
    }

    if (!canCreateKeyResult) {
      setSubmitError(
        `Bạn không có quyền ${isEditMode ? "chỉnh sửa" : "tạo"} KR cho mục tiêu này.`,
      );
      return;
    }

    if (isEditMode && !keyResultId) {
      setSubmitError("Không xác định được KR cần chỉnh sửa.");
      return;
    }

    const safeTarget = Number(form.target);
    if (!form.name.trim()) {
      setSubmitError("Vui lòng nhập tên KR.");
      return;
    }
    if (!Number.isFinite(safeTarget) || safeTarget <= 0) {
      setSubmitError("Chỉ tiêu phải lớn hơn 0.");
      return;
    }
    if (!form.responsibleDepartmentId) {
      setSubmitError("Vui lòng chọn phòng ban phụ trách.");
      return;
    }
    if (!isDateRangeOrdered(form.startDate || null, form.endDate || null)) {
      setSubmitError("Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.");
      return;
    }
    if (
      goalDepartments.length > 0 &&
      !goalDepartments.some((item) => item.departmentId === form.responsibleDepartmentId)
    ) {
      setSubmitError("Phòng ban phụ trách phải nằm trong danh sách phòng ban tham gia mục tiêu.");
      return;
    }

    const supportLinkValidationError = validateSupportLinkDrafts();
    if (supportLinkValidationError) {
      setSubmitError(supportLinkValidationError);
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        goal_id: goal.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        type: form.type,
        contribution_type: form.contributionType,
        unit: form.unit,
        target: safeTarget,
        weight: DEFAULT_KEY_RESULT_WEIGHT,
        responsible_department_id: form.responsibleDepartmentId,
        start_date: form.startDate || null,
        end_date: form.endDate || null,
      };

      const { data: savedKeyResult, error } = isEditMode
        ? await supabase.from("key_results").update(payload).eq("id", keyResultId).select("id").maybeSingle()
        : await supabase
            .from("key_results")
            .insert({
              ...payload,
              start_value: 0,
              current: 0,
            })
            .select("id")
            .maybeSingle();

      if (error) {
        if (error.code === "42501") {
          setSubmitError(
            `DB đang chặn ${isEditMode ? "UPDATE" : "INSERT"} vào key_results (RLS 403). Người đang quản lý goal cũng phải ${
              isEditMode ? "sửa được" : "tạo được"
            } KR, nên cần chạy migration sửa policy bảng key_results.`,
          );
        } else {
          setSubmitError(getReadableKeyResultSubmitError(error.message));
        }
        return;
      }

      const savedKeyResultId = savedKeyResult?.id ? String(savedKeyResult.id) : null;
      if (savedKeyResultId) {
        const supportLinkSyncError = await syncSupportLinks(savedKeyResultId);
        if (supportLinkSyncError) {
          if (isEditMode) {
            setSubmitError(`Đã lưu KR nhưng chưa cập nhật được liên kết hỗ trợ: ${supportLinkSyncError}`);
            return;
          }

          const nextSearchParams = new URLSearchParams({
            supportSyncError: supportLinkSyncError,
          });
          router.push(`/goals/${goal.id}/key-results/${savedKeyResultId}/edit?${nextSearchParams.toString()}`);
          router.refresh();
          return;
        }
      }

      router.push(
        isEditMode
          ? savedKeyResultId
            ? `/goals/${goal.id}/key-results/${savedKeyResultId}?updated=1`
            : `/goals/${goal.id}`
          : savedKeyResultId
            ? `/goals/${goal.id}/key-results/${savedKeyResultId}?created=1`
            : `/goals/${goal.id}?krCreated=1`,
      );
      router.refresh();
    } catch {
      setSubmitError(`Có lỗi xảy ra khi ${isEditMode ? "lưu" : "tạo"} KR.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-[#f3f5fa] text-slate-900">
      <div className="flex h-full w-full">
        <WorkspaceSidebar active="goals" />

        <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#f3f5fa] lg:pl-[var(--workspace-sidebar-width)]">
          <header className="border-b border-slate-200 bg-[#f3f5fa] px-4 py-4 lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                <Link href="/goals" className="hover:text-slate-700">
                  Mục tiêu
                </Link>
                <span className="px-2">›</span>
                {goal ? (
                  <>
                    <Link href={`/goals/${goal.id}`} className="hover:text-slate-700">
                      {goal.name}
                    </Link>
                    <span className="px-2">›</span>
                  </>
                ) : null}
                <span className="font-semibold text-slate-700">
                  {isEditMode ? "Chỉnh sửa KR" : "Tạo KR mới"}
                </span>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto bg-[#f3f5fa] px-4 py-6 lg:px-7">
            {showPermissionDebug ? (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-xs text-slate-100">
                <p className="mb-2 font-semibold text-sky-300">
                  Debug quyền tạo KR (debugPermission=1)
                </p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                  {JSON.stringify(permissionDebug, null, 2)}
                </pre>
              </div>
            ) : null}

            <section className="mx-auto w-full max-w-[920px] rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_50px_-40px_rgba(15,23,42,0.4)] lg:p-6">
              <div className="mb-5">
                <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">
                  {isEditMode ? "Chỉnh sửa KR" : "Tạo KR mới"}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {goal
                    ? `${isEditMode ? "Đang chỉnh sửa KR của mục tiêu" : "Mục tiêu"}: ${goal.name}`
                    : "Thiết lập loại đo lường, chỉ tiêu, thời gian và phòng ban phụ trách."}
                </p>
                {goal?.start_date || goal?.end_date ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Khung thời gian mục tiêu:{" "}
                    {formatTimelineRangeVi(goal.start_date, goal.end_date, {
                      fallback: "Chưa đặt khung thời gian",
                    })}
                  </p>
                ) : null}
              </div>

              {isLoading ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Đang tải dữ liệu mục tiêu...
                </div>
              ) : null}

              {!isLoading && loadError ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  {loadError}
                </div>
              ) : null}

              {isCheckingPermission ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Đang kiểm tra quyền tạo KR...
                </div>
              ) : null}

              {!isCheckingPermission && permissionError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {permissionError}
                </div>
              ) : null}

              {!isLoading && !isCheckingPermission && hasValidGoalId && goal && canCreateKeyResult ? (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  {submitError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {submitError}
                    </div>
                  ) : null}

                  {!submitError && supportSyncError ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      {supportSyncError}
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:items-end md:grid-cols-[minmax(0,1fr)_220px_200px_200px]">
                    <div className="flex h-full flex-col justify-end gap-1.5">
                      <label className="inline-flex min-h-5 items-center text-sm font-semibold text-slate-700">Tên KR *</label>
                      <input
                        value={form.name}
                        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        placeholder="Ví dụ: Tăng MRR thêm 20%"
                      />
                    </div>

                    <div className="flex h-full flex-col justify-end gap-1.5">
                      <label className="inline-flex min-h-5 items-center text-sm font-semibold text-slate-700">Phòng ban phụ trách *</label>
                      <Select
                        value={form.responsibleDepartmentId || undefined}
                        onValueChange={(value) =>
                          setForm((prev) => ({ ...prev, responsibleDepartmentId: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn phòng ban phụ trách" />
                        </SelectTrigger>
                        <SelectContent>
                          {goalDepartments.map((department) => (
                            <SelectItem key={department.departmentId} value={department.departmentId}>
                              {department.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex h-full flex-col justify-end gap-1.5">
                      <label className="inline-flex min-h-5 items-center text-sm font-semibold text-slate-700">Loại kết quả</label>
                      <Select
                        value={form.type}
                        onValueChange={(value: KeyResultTypeValue) =>
                          setForm((prev) => ({ ...prev, type: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn loại kết quả" />
                        </SelectTrigger>
                        <SelectContent>
                          {KEY_RESULT_TYPES.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex h-full flex-col justify-end gap-1.5">
                      <label className="inline-flex min-h-5 items-center gap-1.5 text-sm font-semibold text-slate-700">
                        <span>Kiểu đóng góp</span>
                        <KeyResultContributionInfo />
                      </label>
                      <Select
                        value={form.contributionType}
                        onValueChange={(value: KeyResultContributionTypeValue) =>
                          setForm((prev) => ({ ...prev, contributionType: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn kiểu đóng góp" />
                        </SelectTrigger>
                        <SelectContent>
                          {KEY_RESULT_CONTRIBUTION_TYPES.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p className="font-semibold">
                      KR hiện tại đang ở dạng {form.type.toUpperCase()} /{" "}
                      {formatKeyResultContributionTypeLabel(form.contributionType).toLowerCase()}.
                  </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Đây là nơi lưu chỉ số chính. Công việc chỉ theo dõi phần thực thi và không tự cộng dồn vào giá trị hiện tại.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Đơn vị</label>
                      <Select
                        value={form.unit}
                        onValueChange={(value: KeyResultUnitValue) =>
                          setForm((prev) => ({ ...prev, unit: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn đơn vị" />
                        </SelectTrigger>
                        <SelectContent>
                          {KEY_RESULT_UNITS.map((unit) => (
                            <SelectItem key={unit.value} value={unit.value}>
                              {unit.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Chỉ tiêu *</label>
                      <FormattedNumberInput
                        value={targetInputValue}
                        onValueChange={(value) => {
                          setTargetInputValue(value);
                          setForm((prev) => ({
                            ...prev,
                            target: value ? Number(value) : 0,
                          }));
                        }}
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                  </div>

                  {isSupportContribution ? (
                    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="text-base font-semibold text-slate-900">
                            Liên kết hỗ trợ tới KR trực tiếp
                          </h2>
                          <p className="mt-1 text-sm text-slate-500">
                            Chọn rõ KR trực tiếp mà KR hỗ trợ này đóng góp vào. Mỗi dòng là một liên kết.
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {supportLinkDrafts.filter(isSupportLinkDraftFilled).length} liên kết
                        </span>
                      </div>

                      {isLoadingSupportTargets ? (
                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                          Đang tải danh sách KR trực tiếp...
                        </div>
                      ) : null}

                      {supportTargetLoadError ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                          {supportTargetLoadError}
                        </div>
                      ) : null}

                      <div className="space-y-3">
                        {supportLinkDrafts.map((item, index) => {
                          const targetChoices = getSupportTargetChoices(item.rowId, item.targetKeyResultId);
                          return (
                            <div key={item.rowId} className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-900">Liên kết #{index + 1}</p>
                                <button
                                  type="button"
                                  onClick={() => removeSupportLinkDraft(item.rowId)}
                                  className="inline-flex h-8 items-center rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                                >
                                  Xóa liên kết
                                </button>
                              </div>

                              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1.25fr)_220px]">
                                <label className="space-y-1.5">
                                  <span className="text-sm font-semibold text-slate-700">
                                    KR trực tiếp *
                                  </span>
                                  <Select
                                    value={item.targetKeyResultId || undefined}
                                    onValueChange={(value) =>
                                      updateSupportLinkDraft(item.rowId, { targetKeyResultId: value })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Chọn KR trực tiếp" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {targetChoices.map((target) => (
                                        <SelectItem key={target.id} value={target.id}>
                                          {target.name} · {target.goalName}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </label>

                                {isSupportKpi ? (
                                  <label className="space-y-1.5">
                                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                                      <span>Lượng phân bổ</span>
                                      <SupportAllocationInfo type={form.type} />
                                    </span>
                                    <FormattedNumberInput
                                      value={item.allocatedValue}
                                      onValueChange={(value) =>
                                        updateSupportLinkDraft(item.rowId, { allocatedValue: value })
                                      }
                                      placeholder="Ví dụ: 20"
                                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    />
                                  </label>
                                ) : null}

                                {isSupportOkr ? (
                                  <label className="space-y-1.5">
                                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                                      <span>Phần trăm phân bổ</span>
                                      <SupportAllocationInfo type={form.type} />
                                    </span>
                                    <FormattedNumberInput
                                      value={item.allocatedPercent}
                                      onValueChange={(value) =>
                                        updateSupportLinkDraft(item.rowId, { allocatedPercent: value })
                                      }
                                      placeholder="Ví dụ: 25"
                                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    />
                                  </label>
                                ) : null}
                              </div>

                              <label className="mt-4 block space-y-1.5">
                                <span className="text-sm font-semibold text-slate-700">Ghi chú liên kết</span>
                                <textarea
                                  rows={3}
                                  value={item.note}
                                  onChange={(event) =>
                                    updateSupportLinkDraft(item.rowId, { note: event.target.value })
                                  }
                                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                  placeholder={
                                    isSupportOkr
                                      ? "Ví dụ: KR này hỗ trợ 25% phạm vi kết quả của KR trực tiếp."
                                      : "Ví dụ: Phân bổ 20 đơn hoặc 20 lead từ KR hỗ trợ này sang KR trực tiếp."
                                  }
                                />
                              </label>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={addSupportLinkDraft}
                          className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          + Thêm liên kết hỗ trợ
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Ngày bắt đầu</label>
                      <input
                        type="date"
                        value={form.startDate}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, startDate: event.target.value }))
                        }
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Ngày kết thúc</label>
                      <input
                        type="date"
                        min={form.startDate || undefined}
                        value={form.endDate}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, endDate: event.target.value }))
                        }
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  {!isDateRangeOrdered(form.startDate || null, form.endDate || null) ? (
                    <p className="-mt-2 text-xs text-rose-600">
                      Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.
                    </p>
                  ) : null}

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700">Mô tả</label>
                    <textarea
                      rows={4}
                      value={form.description}
                      onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="Mô tả phạm vi và cách đo kết quả"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <Link
                      href={
                        isEditMode ? `/goals/${goal.id}/key-results/${keyResultId}` : `/goals/${goal.id}`
                      }
                      className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Hủy
                    </Link>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="h-10 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {isSubmitting
                        ? isEditMode
                          ? "Đang lưu..."
                          : "Đang tạo..."
                        : isEditMode
                          ? "Lưu thay đổi KR"
                          : "Tạo KR"}
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

export function GoalKeyResultFormPage({ mode }: { mode: GoalKeyResultFormMode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f3f5fa]" />}>
      <GoalKeyResultFormPageContent mode={mode} />
    </Suspense>
  );
}

export default function NewGoalKeyResultPage() {
  return <GoalKeyResultFormPage mode="create" />;
}
