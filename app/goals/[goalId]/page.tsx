"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import {
  GOAL_STATUSES,
  formatGoalParticipationRoleLabel,
  formatGoalTypeLabel,
  getGoalProgressHelp,
  normalizeGoalTypeValue,
} from "@/lib/constants/goals";
import {
  getAllowedKeyResultUnitsByType,
  KEY_RESULT_CONTRIBUTION_TYPES,
  KEY_RESULT_TYPES,
  formatKeyResultContributionTypeLabel,
  formatKeyResultMetric,
  formatKeyResultTypeLabel,
  formatKeyResultUnit,
  normalizeKeyResultUnitForType,
  normalizeKeyResultContributionTypeValue,
  normalizeKeyResultTypeValue,
  type KeyResultUnitValue,
  type KeyResultContributionTypeValue,
  type KeyResultTypeValue,
} from "@/lib/constants/key-results";
import {
  buildGoalProgressMap,
  buildGoalDepartmentPerformanceMap,
  buildKeyResultProgressMap,
  normalizeParticipationWeights,
} from "@/lib/okr";
import {
  formatGoalOwnerName,
  formatGoalOwnersSummary,
  type GoalOwnerProfile,
  type GoalOwnerProfileRow,
} from "@/lib/goal-owners";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";
import {
  formatTimelineRangeVi,
  getTimelineMissingReason,
  isDateRangeOrdered,
} from "@/lib/timeline";

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
  start_date: string | null;
  end_date: string | null;
  target: number | null;
  unit: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type KeyResultRow = {
  id: string;
  goal_id: string;
  name: string;
  description: string | null;
  type: string | null;
  contribution_type: string | null;
  start_value: number;
  target: number;
  current: number;
  unit: string | null;
  weight: number | null;
  responsible_department_id: string | null;
  start_date: string | null;
  end_date: string | null;
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

type DepartmentPerformanceItem = GoalDepartmentItem & {
  ownedKrCount: number;
  goalProgress: number;
  departmentKrProgress: number;
  performance: number;
};

type DepartmentPerformanceViewMode = "table" | "chart";

type KeyResultScaleFormState = {
  type: KeyResultTypeValue;
  contributionType: KeyResultContributionTypeValue;
  responsibleDepartmentId: string;
  startValue: string;
  current: string;
  target: string;
  unit: KeyResultUnitValue;
  startDate: string;
  endDate: string;
};

const statusLabelMap = GOAL_STATUSES.reduce<Record<string, string>>((acc, item) => {
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

const normalizeKeyResultRow = (keyResult: KeyResultRow): KeyResultRow => ({
  ...keyResult,
  id: String(keyResult.id),
  goal_id: String(keyResult.goal_id),
  type: keyResult.type ? String(keyResult.type) : "kpi",
  contribution_type: keyResult.contribution_type ? String(keyResult.contribution_type) : "direct",
  start_value:
    typeof keyResult.start_value === "number"
      ? keyResult.start_value
      : Number(keyResult.start_value ?? 0),
  target: typeof keyResult.target === "number" ? keyResult.target : Number(keyResult.target ?? 0),
  current:
    typeof keyResult.current === "number" ? keyResult.current : Number(keyResult.current ?? 0),
  unit: keyResult.unit ? String(keyResult.unit) : null,
  weight: typeof keyResult.weight === "number" ? keyResult.weight : Number(keyResult.weight ?? 1),
  responsible_department_id: keyResult.responsible_department_id
    ? String(keyResult.responsible_department_id)
    : null,
  start_date: keyResult.start_date ? String(keyResult.start_date) : null,
  end_date: keyResult.end_date ? String(keyResult.end_date) : null,
});

const createKeyResultScaleForm = (keyResult: KeyResultRow): KeyResultScaleFormState => ({
  type: normalizeKeyResultTypeValue(keyResult.type),
  contributionType: normalizeKeyResultContributionTypeValue(keyResult.contribution_type),
  responsibleDepartmentId: keyResult.responsible_department_id ?? "",
  startValue: String(Number.isFinite(keyResult.start_value) ? Number(keyResult.start_value) : 0),
  current: String(Number.isFinite(keyResult.current) ? Number(keyResult.current) : 0),
  target:
    normalizeKeyResultTypeValue(keyResult.type) === "okr"
      ? "100"
      : String(Number.isFinite(keyResult.target) ? Number(keyResult.target) : 0),
  unit: normalizeKeyResultUnitForType(keyResult.type, keyResult.unit),
  startDate: keyResult.start_date ?? "",
  endDate: keyResult.end_date ?? "",
});

const getReadableKeyResultSaveError = (message: string | null | undefined) => {
  const normalizedMessage = String(message ?? "").toLowerCase();

  if (
    normalizedMessage.includes('record "new" has no field "progress"') ||
    normalizedMessage.includes('record "old" has no field "progress"')
  ) {
    return "DB đang còn trigger cũ của KR dùng cột progress không còn tồn tại. Cần chạy migration sửa trigger key_results.";
  }

  return message || "Không thể cập nhật KR.";
};

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-blue-600" style={{ width: `${value}%` }} />
    </div>
  );
}

function DepartmentStatColumn({
  value,
  tone,
}: {
  value: number;
  tone: "primary" | "secondary";
}) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="relative flex h-full w-10 items-end">
      <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[11px] font-semibold text-slate-700">
        {safeValue}%
      </span>
      <div
        className={`w-full rounded-t-sm ${
          tone === "primary" ? "bg-slate-800" : "bg-slate-400"
        }`}
        style={{ height: `${Math.max(safeValue, 2)}%` }}
      />
    </div>
  );
}

function GoalDetailPageContent() {
  const params = useParams<{ goalId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceAccess = useWorkspaceAccess();
  const goalId = params.goalId;
  const hasValidGoalId = Boolean(goalId);

  const [goal, setGoal] = useState<GoalDetailRow | null>(null);
  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const [goalOwners, setGoalOwners] = useState<GoalOwnerProfile[]>([]);
  const [goalDepartments, setGoalDepartments] = useState<GoalDepartmentItem[]>([]);
  const [keyResults, setKeyResults] = useState<KeyResultRow[]>([]);
  const [keyResultLoadError, setKeyResultLoadError] = useState<string | null>(null);
  const [relatedDepartmentLoadError, setRelatedDepartmentLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingKeyResultId, setEditingKeyResultId] = useState<string | null>(null);
  const [keyResultScaleForm, setKeyResultScaleForm] = useState<KeyResultScaleFormState | null>(
    null,
  );
  const [keyResultScaleError, setKeyResultScaleError] = useState<string | null>(null);
  const [savingKeyResultId, setSavingKeyResultId] = useState<string | null>(null);
  const [savedKeyResultId, setSavedKeyResultId] = useState<string | null>(null);
  const [isDeletingGoal, setIsDeletingGoal] = useState(false);
  const [departmentPerformanceView, setDepartmentPerformanceView] =
    useState<DepartmentPerformanceViewMode>("table");

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
      setKeyResultLoadError(null);
      setRelatedDepartmentLoadError(null);
      setEditingKeyResultId(null);
      setKeyResultScaleForm(null);
      setKeyResultScaleError(null);
      setSavingKeyResultId(null);

      const { data: goalData, error: goalError } = await supabase
        .from("goals")
        .select(
          "id,name,description,type,department_id,status,quarter,year,note,start_date,end_date,target,unit,created_at,updated_at",
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
        setGoalOwners([]);
        setGoalDepartments([]);
        setKeyResults([]);
        setIsLoading(false);
        return;
      }

      if (!goalData) {
        setError("Không tìm thấy mục tiêu.");
        setGoal(null);
        setDepartmentName(null);
        setGoalOwners([]);
        setGoalDepartments([]);
        setKeyResults([]);
        setIsLoading(false);
        return;
      }

      const typedGoal = goalData as GoalDetailRow;
      setGoal(typedGoal);

      const [
        { data: departmentData },
        { data: goalOwnerRows, error: goalOwnersError },
        { data: keyResultsData, error: keyResultsError },
        { data: goalDepartmentLinks, error: goalDepartmentsError },
      ] = await Promise.all([
        typedGoal.department_id
          ? supabase
              .from("departments")
              .select("id,name")
              .eq("id", typedGoal.department_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from("goal_owners").select("profile_id").eq("goal_id", typedGoal.id),
        supabase
          .from("key_results")
          .select(
            "id,goal_id,name,description,type,contribution_type,start_value,target,current,unit,weight,responsible_department_id,start_date,end_date,created_at,updated_at",
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

      const ownerProfileIds =
        !goalOwnersError && (goalOwnerRows?.length ?? 0) > 0
          ? [
              ...new Set(
                goalOwnerRows
                  .map((item) => (item.profile_id ? String(item.profile_id) : null))
                  .filter((value): value is string => Boolean(value)),
              ),
            ]
          : [];

      let nextGoalOwners: GoalOwnerProfile[] = [];
      if (ownerProfileIds.length > 0) {
        const { data: ownerProfilesData, error: ownerProfilesError } = await supabase
          .from("profiles")
          .select("id,name,email,avatar")
          .in("id", ownerProfileIds);

        if (!isActive) {
          return;
        }

        if (!ownerProfilesError) {
          const ownerProfilesById = ((ownerProfilesData ?? []) as GoalOwnerProfileRow[]).reduce<
            Record<string, GoalOwnerProfile>
          >((acc, profile) => {
            const profileId = String(profile.id);
            acc[profileId] = {
              id: profileId,
              name: formatGoalOwnerName(profile),
              email: profile.email ? String(profile.email) : null,
              avatar: profile.avatar ? String(profile.avatar) : null,
            };
            return acc;
          }, {});

          nextGoalOwners = ownerProfileIds
            .map((profileId) => ownerProfilesById[profileId] ?? null)
            .filter((profile): profile is GoalOwnerProfile => Boolean(profile));
        }
      }
      setGoalOwners(nextGoalOwners);

      const mappedKeyResults = ((keyResultsData ?? []) as unknown as KeyResultRow[]).map(
        normalizeKeyResultRow,
      );
      setKeyResults(mappedKeyResults);

      const relatedDepartmentIds = Array.from(
        new Set(
          [
            typedGoal.department_id,
            ...((goalDepartmentLinks ?? []) as GoalDepartmentLinkRow[]).map(
              (item) => item.department_id,
            ),
            ...mappedKeyResults.map((item) => item.responsible_department_id),
          ].filter(Boolean),
        ),
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
          setRelatedDepartmentLoadError("Không tải được danh sách phòng ban tham gia.");
        } else {
          const departmentsById = ((relatedDepartmentsData ?? []) as DepartmentRow[]).reduce<
            Record<string, string>
          >((acc, department) => {
            acc[String(department.id)] = String(department.name);
            return acc;
          }, {});

          const rawGoalDepartments = ((goalDepartmentLinks ?? []) as GoalDepartmentLinkRow[]).map(
            (item) => {
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
            },
          );

          const normalizedGoalDepartments =
            rawGoalDepartments.find((item) => item.departmentId === typedGoal.department_id) ||
            !typedGoal.department_id
              ? rawGoalDepartments
              : [
                  {
                    goalId: typedGoal.id,
                    departmentId: String(typedGoal.department_id),
                    name:
                      departmentsById[String(typedGoal.department_id)] ??
                      departmentData?.name ??
                      "Phòng ban chính",
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

      if (keyResultsError) {
        setKeyResultLoadError("Không tải được danh sách KR.");
      }
      if (goalDepartmentsError) {
        setRelatedDepartmentLoadError("Không tải được cấu trúc phòng ban tham gia.");
      }
      setIsLoading(false);
    };

    void loadGoalDetail();

    return () => {
      isActive = false;
    };
  }, [goalId, hasValidGoalId]);

  const keyResultProgressMap = useMemo(() => buildKeyResultProgressMap(keyResults), [keyResults]);
  const goalProgress = useMemo(() => {
    if (!goal?.id) {
      return 0;
    }
    return buildGoalProgressMap(
      [{ id: goal.id, type: goal.type, target: goal.target }],
      keyResults,
      keyResultProgressMap,
    )[goal.id] ?? 0;
  }, [goal, keyResultProgressMap, keyResults]);
  const goalType = goal ? normalizeGoalTypeValue(goal.type) : "kpi";
  const goalTypeLabel = goal ? formatGoalTypeLabel(goal.type) : "Chưa đặt";
  const goalStatusLabel = goal?.status ? (statusLabelMap[goal.status] ?? goal.status) : "Chưa đặt";
  const quarterLabel = goal?.quarter ? `Q${goal.quarter}` : "Chưa đặt";
  const yearLabel = goal?.year ? String(goal.year) : "Chưa đặt";
  const goalMetricTarget = goal?.target ?? null;
  const goalMetricUnit = goal?.unit ?? null;
  const hasGoalMetric = goalMetricTarget !== null || Boolean(goalMetricUnit);
  const directKeyResults = useMemo(
    () =>
      keyResults.filter(
        (keyResult) =>
          normalizeKeyResultContributionTypeValue(keyResult.contribution_type) === "direct",
      ),
    [keyResults],
  );
  const kpiDirectSummary = useMemo(() => {
    const totalCurrent = directKeyResults.reduce((total, keyResult) => {
      const safeCurrent = Number.isFinite(keyResult.current) ? Number(keyResult.current) : 0;
      return total + safeCurrent;
    }, 0);
    const totalTarget = directKeyResults.reduce((total, keyResult) => {
      const safeTarget = Number.isFinite(keyResult.target) ? Number(keyResult.target) : 0;
      return total + safeTarget;
    }, 0);
    const safeGoalTarget =
      Number.isFinite(goalMetricTarget) && Number(goalMetricTarget) > 0 ? Number(goalMetricTarget) : null;
    const currentGap = safeGoalTarget === null ? null : Math.max(0, safeGoalTarget - totalCurrent);
    const currentOver = safeGoalTarget === null ? null : Math.max(0, totalCurrent - safeGoalTarget);
    const targetGap = safeGoalTarget === null ? null : Math.max(0, safeGoalTarget - totalTarget);
    const targetOver = safeGoalTarget === null ? null : Math.max(0, totalTarget - safeGoalTarget);
    const targetCoveragePercent =
      safeGoalTarget && safeGoalTarget > 0
        ? Math.round((totalTarget / safeGoalTarget) * 100)
        : 0;
    const mismatchedUnitCount = goalMetricUnit
      ? directKeyResults.filter((keyResult) => keyResult.unit && keyResult.unit !== goalMetricUnit)
          .length
      : 0;

    return {
      directCount: directKeyResults.length,
      totalCurrent,
      totalTarget,
      safeGoalTarget,
      currentGap,
      currentOver,
      targetGap,
      targetOver,
      targetCoveragePercent,
      mismatchedUnitCount,
    };
  }, [directKeyResults, goalMetricTarget, goalMetricUnit]);
  const goalOwnersSummary = useMemo(
    () => formatGoalOwnersSummary(goalOwners, { limit: 3 }),
    [goalOwners],
  );
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
    const total = keyResults.reduce(
      (acc, keyResult) => acc + (keyResultProgressMap[keyResult.id] ?? 0),
      0,
    );
    return Math.round(total / keyResults.length);
  }, [keyResultProgressMap, keyResults]);
  const goalProgressHelp = getGoalProgressHelp(goalType);
  const departmentPerformanceMap = useMemo(() => {
    if (!goal?.id || goalDepartments.length === 0) {
      return {};
    }

    return buildGoalDepartmentPerformanceMap(
      [{ id: goal.id, type: goal.type, target: goal.target }],
      goalDepartments,
      keyResults,
      keyResultProgressMap,
      {
        [goal.id]: goalProgress,
      },
    );
  }, [goal, goalDepartments, goalProgress, keyResultProgressMap, keyResults]);
  const departmentPerformanceItems = useMemo<DepartmentPerformanceItem[]>(() => {
    return goalDepartments.map((department) => {
      const ownedKeyResults = keyResults.filter(
        (keyResult) => keyResult.responsible_department_id === department.departmentId,
      );
      const performance =
        departmentPerformanceMap[`${department.goalId}:${department.departmentId}`];

      return {
        ...department,
        ownedKrCount: ownedKeyResults.length,
        goalProgress: performance?.goalProgress ?? goalProgress,
        departmentKrProgress: performance?.departmentKrProgress ?? 0,
        performance: performance?.performance ?? 0,
      };
    });
  }, [departmentPerformanceMap, goalDepartments, goalProgress, keyResults]);
  const departmentPerformanceChartItems = useMemo(
    () =>
      [...departmentPerformanceItems].sort((a, b) => {
        if (b.performance !== a.performance) {
          return b.performance - a.performance;
        }
        if (b.departmentKrProgress !== a.departmentKrProgress) {
          return b.departmentKrProgress - a.departmentKrProgress;
        }
        return a.name.localeCompare(b.name, "vi");
      }),
    [departmentPerformanceItems],
  );

  const createKeyResultHref = hasValidGoalId ? `/goals/${goalId}/key-results/new` : null;
  const isCreateKeyResultButtonDisabled =
    isCheckingCreatePermission || !canCreateKeyResult || !createKeyResultHref;
  const keyResultNotice =
    searchParams.get("krCreated") === "1"
      ? "Đã tạo KR."
      : searchParams.get("krDeleted") === "1"
        ? "Đã xóa KR."
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
      setKeyResultScaleError("Bạn không có quyền cập nhật KR ở mục tiêu này.");
      return;
    }

    const safeCurrent = Number(keyResultScaleForm.current);
    const safeTarget = Number(keyResultScaleForm.target);
    const safeStartValue = Number(keyResultScaleForm.startValue);

    if (!Number.isFinite(safeCurrent) || safeCurrent < 0) {
      setKeyResultScaleError("Hiện tại không được nhỏ hơn 0.");
      return;
    }
    if (!Number.isFinite(safeStartValue) || safeStartValue < 0) {
      setKeyResultScaleError("Giá trị bắt đầu không được nhỏ hơn 0.");
      return;
    }
    if (!Number.isFinite(safeTarget) || safeTarget <= 0) {
      setKeyResultScaleError("Chỉ tiêu phải lớn hơn 0.");
      return;
    }
    if (keyResultScaleForm.type === "okr" && safeTarget !== 100) {
      setKeyResultScaleError("KR kiểu OKR luôn có chỉ tiêu cố định là 100%.");
      return;
    }
    if (!keyResultScaleForm.responsibleDepartmentId) {
      setKeyResultScaleError("Vui lòng chọn phòng ban phụ trách KR.");
      return;
    }
    if (
      !isDateRangeOrdered(keyResultScaleForm.startDate || null, keyResultScaleForm.endDate || null)
    ) {
      setKeyResultScaleError("Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.");
      return;
    }

    setKeyResultScaleError(null);
    setSavingKeyResultId(keyResult.id);

    try {
      const payload = {
        type: keyResultScaleForm.type,
        contribution_type: keyResultScaleForm.contributionType,
        responsible_department_id: keyResultScaleForm.responsibleDepartmentId,
        start_value: safeStartValue,
        current: safeCurrent,
        target: safeTarget,
        unit: keyResultScaleForm.unit,
        start_date: keyResultScaleForm.startDate || null,
        end_date: keyResultScaleForm.endDate || null,
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
                type: keyResultScaleForm.type,
                contribution_type: keyResultScaleForm.contributionType,
                responsible_department_id: keyResultScaleForm.responsibleDepartmentId,
                start_value: safeStartValue,
                current: safeCurrent,
                target: safeTarget,
                unit: keyResultScaleForm.unit,
                start_date: keyResultScaleForm.startDate || null,
                end_date: keyResultScaleForm.endDate || null,
                updated_at: new Date().toISOString(),
              }
            : item,
        ),
      );
      setSavedKeyResultId(keyResult.id);
      setEditingKeyResultId(null);
      setKeyResultScaleForm(null);
    } catch {
      setKeyResultScaleError("Có lỗi xảy ra khi cập nhật KR.");
    } finally {
      setSavingKeyResultId(null);
    }
  };

  const handleDeleteGoal = async () => {
    if (!goal || isDeletingGoal) {
      return;
    }

    const keyResultCount = keyResults.length;
    const relatedWarning =
      keyResultCount > 0
        ? ` Thao tác này cũng sẽ xóa ${keyResultCount} KR cùng công việc và liên kết hỗ trợ liên quan.`
        : "";

    if (!window.confirm(`Xóa mục tiêu "${goal.name}"?${relatedWarning}`)) {
      return;
    }

    setIsDeletingGoal(true);

    const { data: keyResultsData, error: keyResultsError } = await supabase
      .from("key_results")
      .select("id")
      .eq("goal_id", goal.id);

    if (keyResultsError) {
      window.alert(
        keyResultsError.message || "Không thể tải danh sách KR để xóa mục tiêu.",
      );
      setIsDeletingGoal(false);
      return;
    }

    const keyResultIds = (keyResultsData ?? []).map((item) => String(item.id));

    if (keyResultIds.length > 0) {
      const { error: deleteOutboundSupportLinksError } = await supabase
        .from("key_result_support_links")
        .delete()
        .in("support_key_result_id", keyResultIds);

      if (deleteOutboundSupportLinksError) {
        window.alert(
          deleteOutboundSupportLinksError.message ||
            "Không thể xóa các liên kết hỗ trợ outbound của mục tiêu.",
        );
        setIsDeletingGoal(false);
        return;
      }

      const { error: deleteInboundSupportLinksError } = await supabase
        .from("key_result_support_links")
        .delete()
        .in("target_key_result_id", keyResultIds);

      if (deleteInboundSupportLinksError) {
        window.alert(
          deleteInboundSupportLinksError.message ||
            "Không thể xóa các liên kết hỗ trợ inbound của mục tiêu.",
        );
        setIsDeletingGoal(false);
        return;
      }

      const { error: deleteTasksError } = await supabase
        .from("tasks")
        .delete()
        .in("key_result_id", keyResultIds);

      if (deleteTasksError) {
        window.alert(deleteTasksError.message || "Không thể xóa công việc thuộc mục tiêu.");
        setIsDeletingGoal(false);
        return;
      }
    }

    const { error: deleteGoalDepartmentsError } = await supabase
      .from("goal_departments")
      .delete()
      .eq("goal_id", goal.id);

    if (deleteGoalDepartmentsError) {
      window.alert(
        deleteGoalDepartmentsError.message || "Không thể xóa phòng ban tham gia của mục tiêu.",
      );
      setIsDeletingGoal(false);
      return;
    }

    const { error: deleteGoalOwnersError } = await supabase
      .from("goal_owners")
      .delete()
      .eq("goal_id", goal.id);

    if (deleteGoalOwnersError) {
      window.alert(
        deleteGoalOwnersError.message || "Không thể xóa người phụ trách của mục tiêu.",
      );
      setIsDeletingGoal(false);
      return;
    }

    if (keyResultIds.length > 0) {
      const { error: deleteKeyResultsError } = await supabase
        .from("key_results")
        .delete()
        .in("id", keyResultIds);

      if (deleteKeyResultsError) {
        window.alert(
          deleteKeyResultsError.message || "Không thể xóa KR của mục tiêu.",
        );
        setIsDeletingGoal(false);
        return;
      }
    }

    const { error: deleteGoalError } = await supabase.from("goals").delete().eq("id", goal.id);

    if (deleteGoalError) {
      window.alert(deleteGoalError.message || "Không thể xóa mục tiêu.");
      setIsDeletingGoal(false);
      return;
    }

    router.push("/goals");
  };

  const editingKeyResult =
    editingKeyResultId && keyResultScaleForm
      ? keyResults.find((item) => item.id === editingKeyResultId) ?? null
      : null;
  const isSavingEditingKeyResult =
    editingKeyResult !== null && savingKeyResultId === editingKeyResult.id;
  const modalCurrentValue = keyResultScaleForm ? Number(keyResultScaleForm.current) : 0;
  const modalTargetValue = keyResultScaleForm ? Number(keyResultScaleForm.target) : 0;
  const modalProgressPreview =
    Number.isFinite(modalCurrentValue) && Number.isFinite(modalTargetValue) && modalTargetValue > 0
      ? Math.max(0, Math.min(100, Math.round((modalCurrentValue / modalTargetValue) * 100)))
      : 0;
  const isModalDateRangeValid = keyResultScaleForm
    ? isDateRangeOrdered(keyResultScaleForm.startDate || null, keyResultScaleForm.endDate || null)
    : true;
  const modalEditError = keyResultScaleForm
    ? keyResultScaleError ||
      (!isModalDateRangeValid ? "Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu." : null)
    : null;
  return (
    <div className="h-screen overflow-hidden bg-[#f3f5fa] text-slate-900">
      <div className="flex h-full w-full">
        <WorkspaceSidebar active="goals" />

        <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader
            title={goal?.name ?? "Chi tiết mục tiêu"}
            items={[
              { label: "Mục tiêu", href: "/goals" },
              { label: goal?.name ?? "Chi tiết mục tiêu" },
            ]}
          />

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-7">
            <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
              {workspaceAccess.canManage && !workspaceAccess.error && hasValidGoalId ? (
                <Link
                  href={`/goals/new?editGoalId=${goalId}`}
                  className="inline-flex h-9 items-center rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                >
                  Sửa mục tiêu
                </Link>
              ) : null}
              {workspaceAccess.canManage && !workspaceAccess.error && hasValidGoalId ? (
                <button
                  type="button"
                  onClick={() => void handleDeleteGoal()}
                  disabled={isDeletingGoal}
                  className="inline-flex h-9 items-center rounded-xl border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDeletingGoal ? "Đang xóa mục tiêu..." : "Xóa mục tiêu"}
                </button>
              ) : null}
              {createKeyResultHref && !isCreateKeyResultButtonDisabled ? (
                <Link
                  href={createKeyResultHref}
                  className="inline-flex h-9 items-center rounded-xl border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  + Thêm KR
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex h-9 items-center rounded-xl border border-blue-300 bg-blue-300 px-4 text-sm font-semibold text-white opacity-60"
                >
                  + Thêm KR
                </button>
              )}
            </div>
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
                <section className="flex flex-col gap-5">
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
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                            Người phụ trách · {goalOwnersSummary}
                          </span>
                        </div>
                        {goalOwners.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {goalOwners.map((owner) => (
                              <span
                                key={owner.id}
                                className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
                              >
                                {owner.name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="min-w-[280px] flex-1 xl:max-w-[540px]">
                        <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2">
                          <div className="bg-slate-50 px-4 py-3">
                            <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
                              KR
                            </p>
                            <div className="mt-1 flex items-baseline gap-2">
                              <p className="text-xl font-semibold text-slate-900">{keyResults.length}</p>
                              <span className="text-xs text-slate-500">KR</span>
                            </div>
                          </div>
                          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 sm:border-t-0 sm:border-l">
                            <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
                              Phòng Ban Tham Gia
                            </p>
                            <div className="mt-1 flex items-baseline gap-2">
                              <p className="text-xl font-semibold text-slate-900">
                                {goalDepartments.length || 1}
                              </p>
                              <span className="text-xs text-slate-500">phòng ban</span>
                            </div>
                          </div>
                          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
                              Chỉ Tiêu
                            </p>
                            <p className="mt-1 truncate text-xl font-semibold text-slate-900">
                              {hasGoalMetric
                                ? formatKeyResultMetric(goalMetricTarget, goalMetricUnit)
                                : "Chưa đặt"}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {formatKeyResultUnit(goalMetricUnit)}
                            </p>
                          </div>
                          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 sm:border-l">
                            <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
                              Kỳ
                            </p>
                            <div className="mt-1 flex items-baseline gap-2">
                              <p className="text-xl font-semibold text-slate-900">
                                {goal.quarter ? `Q${goal.quarter}` : "--"}
                              </p>
                              <span className="text-xs text-slate-500">{goal.year ?? "Chưa đặt năm"}</span>
                            </div>
                          </div>
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
                          {goalType === "kpi" ? (
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                              <span className="font-medium text-slate-600">Chỉ số tiến độ</span>
                              <span className="font-semibold text-slate-900">
                                {formatKeyResultMetric(kpiDirectSummary.totalCurrent, goalMetricUnit)}
                                {kpiDirectSummary.safeGoalTarget !== null
                                  ? ` / ${formatKeyResultMetric(
                                      kpiDirectSummary.safeGoalTarget,
                                      goalMetricUnit,
                                    )}`
                                  : ""}
                              </span>
                            </div>
                          ) : null}
                          <ProgressBar value={goalProgress} />
                          {goalType === "kpi" ? (
                            <p className="mt-2 text-xs text-slate-600">
                              {kpiDirectSummary.safeGoalTarget === null
                                ? `${kpiDirectSummary.directCount} KR trực tiếp đang cộng dồn giá trị hiện tại.`
                                : kpiDirectSummary.currentGap && kpiDirectSummary.currentGap > 0
                                  ? `Còn thiếu ${formatKeyResultMetric(
                                      kpiDirectSummary.currentGap,
                                      goalMetricUnit,
                                    )} để chạm KPI của mục tiêu.`
                                  : (kpiDirectSummary.currentOver ?? 0) > 0
                                    ? `Đã vượt ${formatKeyResultMetric(
                                        kpiDirectSummary.currentOver ?? 0,
                                        goalMetricUnit,
                                      )} so với KPI của mục tiêu.`
                                    : "Đã chạm đúng KPI của mục tiêu."}
                            </p>
                          ) : null}
                          <p className="mt-2 text-xs text-slate-500" title={goalProgressHelp}>
                            Dựa trên tiến độ của các KR, không lấy từ công việc.
                          </p>
                          {goalType === "kpi" ? (
                            <div className="mt-4">
                              <div
                                className={`rounded-2xl border px-4 py-3 ${
                                  kpiDirectSummary.safeGoalTarget !== null &&
                                  kpiDirectSummary.targetGap !== null &&
                                  kpiDirectSummary.targetGap > 0
                                    ? "border-amber-200 bg-amber-50/70"
                                    : "border-emerald-200 bg-emerald-50/70"
                                }`}
                              >
                                <p
                                  className={`text-xs font-semibold tracking-[0.08em] uppercase ${
                                    kpiDirectSummary.safeGoalTarget !== null &&
                                    kpiDirectSummary.targetGap !== null &&
                                    kpiDirectSummary.targetGap > 0
                                      ? "text-amber-700"
                                      : "text-emerald-700"
                                  }`}
                                >
                                  Tổng KPI KR
                                </p>
                                <p className="mt-2 text-2xl font-semibold text-slate-900">
                                  {formatKeyResultMetric(
                                    kpiDirectSummary.totalTarget,
                                    goalMetricUnit,
                                  )}
                                </p>
                                <p className="mt-1 text-sm text-slate-600">
                                  {kpiDirectSummary.safeGoalTarget !== null
                                    ? `${kpiDirectSummary.targetCoveragePercent}% KPI mục tiêu`
                                    : "Chưa có chỉ tiêu mục tiêu để tính độ phủ."}
                                </p>
                                <p className="mt-2 text-xs text-slate-600">
                                  {kpiDirectSummary.safeGoalTarget === null
                                    ? "Mục tiêu KPI chưa có chỉ tiêu nên chưa biết tổng chỉ tiêu KR đã đủ hay chưa."
                                    : kpiDirectSummary.targetGap && kpiDirectSummary.targetGap > 0
                                      ? `Các KR trực tiếp còn thiếu ${formatKeyResultMetric(
                                          kpiDirectSummary.targetGap,
                                          goalMetricUnit,
                                        )} chỉ tiêu để đạt đủ KPI của mục tiêu.`
                                      : `Các KR trực tiếp đã đạt đủ KPI của mục tiêu${
                                          (kpiDirectSummary.targetOver ?? 0) > 0
                                            ? ` và dư ${formatKeyResultMetric(
                                                kpiDirectSummary.targetOver ?? 0,
                                                goalMetricUnit,
                                              )}`
                                            : ""
                                        }.`}
                                </p>
                              </div>
                            </div>
                          ) : null}
                          {goalType === "kpi" && kpiDirectSummary.mismatchedUnitCount > 0 ? (
                            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                              Có {kpiDirectSummary.mismatchedUnitCount} KR trực tiếp khác đơn vị với
                              mục tiêu. Số cộng dồn KPI nên được kiểm tra lại trước khi dùng để quyết
                              định.
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                          Mục tiêu chưa có KR nên chưa có đủ dữ liệu để tính tiến độ.
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

                  {!goal.description?.trim() ? (
                    <article className="rounded-2xl border border-slate-200 bg-white p-5">
                      <h2 className="text-base font-semibold text-slate-900">Ghi chú nội bộ</h2>
                      <p className="mt-2 text-sm leading-relaxed text-slate-700">
                        {goal.note?.trim() || "Chưa có ghi chú."}
                      </p>
                    </article>
                  ) : null}

                  <article className="order-5 rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">
                          Phòng ban tham gia & hiệu suất
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                          Hiệu suất phòng ban = tiến độ mục tiêu x tỷ trọng mục tiêu + tiến độ KR sở
                          hữu x tỷ trọng KR.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {goalDepartments.length} phòng ban
                        </span>
                        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                          <button
                            type="button"
                            onClick={() => setDepartmentPerformanceView("table")}
                            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                              departmentPerformanceView === "table"
                                ? "bg-slate-900 text-white"
                                : "text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            Bảng
                          </button>
                          <button
                            type="button"
                            onClick={() => setDepartmentPerformanceView("chart")}
                            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                              departmentPerformanceView === "chart"
                                ? "bg-slate-900 text-white"
                                : "text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            Biểu đồ
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 border-b border-slate-100 pb-3 text-sm text-slate-600">
                      Tiến độ mục tiêu hiện tại:{" "}
                      <span className="font-semibold text-slate-900">{goalProgress}%</span>
                    </div>

                    {relatedDepartmentLoadError ? (
                      <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {relatedDepartmentLoadError}
                      </p>
                    ) : null}

                    {departmentPerformanceItems.length > 0 ? (
                      departmentPerformanceView === "table" ? (
                        <div className="mt-4 overflow-x-auto">
                          <table className="w-full min-w-[920px] text-left text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                                <th className="px-4 py-3 font-semibold">Phòng ban</th>
                                <th className="px-4 py-3 font-semibold">Vai trò</th>
                                <th className="px-4 py-3 text-right font-semibold">KR sở hữu</th>
                                <th className="px-4 py-3 text-right font-semibold">Tỷ trọng mục tiêu</th>
                                <th className="px-4 py-3 text-right font-semibold">Tỷ trọng KR</th>
                                <th className="px-4 py-3 text-right font-semibold">Tiến độ KR sở hữu</th>
                                <th className="px-4 py-3 text-right font-semibold">Hiệu suất PB</th>
                              </tr>
                            </thead>
                            <tbody>
                              {departmentPerformanceItems.map((department) => (
                                <tr key={department.departmentId} className="border-b border-slate-100 last:border-b-0">
                                  <td className="px-4 py-3">
                                    <p className="font-semibold text-slate-900">{department.name}</p>
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">
                                    {formatGoalParticipationRoleLabel(department.role)}
                                  </td>
                                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                                    {department.ownedKrCount}
                                  </td>
                                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                                    {department.goalWeight.toFixed(2)}
                                  </td>
                                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                                    {department.krWeight.toFixed(2)}
                                  </td>
                                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                                    {department.departmentKrProgress}%
                                  </td>
                                  <td className="px-4 py-3 text-right font-semibold text-slate-950">
                                    {department.performance}%
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="mt-4 space-y-4">
                          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2.5 w-8 rounded-full bg-slate-800" />
                              Hiệu suất phòng ban
                            </span>
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2.5 w-8 rounded-full bg-slate-400" />
                              Tiến độ KR sở hữu
                            </span>
                          </div>

                          <div className="overflow-x-auto">
                            <div
                              className="rounded-xl border border-slate-200 bg-white p-4"
                              style={{
                                minWidth: Math.max(760, departmentPerformanceChartItems.length * 148),
                              }}
                            >
                              <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-4">
                                <div className="relative h-[260px]">
                                  {[100, 75, 50, 25, 0].map((tick) => (
                                    <div
                                      key={tick}
                                      className="absolute inset-x-0 -translate-y-1/2 text-right text-[11px] text-slate-400"
                                      style={{ bottom: `${tick}%` }}
                                    >
                                      {tick}
                                    </div>
                                  ))}
                                </div>

                                <div className="relative">
                                  <div className="absolute inset-0 h-[260px]">
                                    {[100, 75, 50, 25, 0].map((tick) => (
                                      <div
                                        key={tick}
                                        className="absolute inset-x-0 border-t border-slate-100"
                                        style={{ bottom: `${tick}%` }}
                                      />
                                    ))}
                                  </div>

                                  <div
                                    className="relative grid auto-cols-fr grid-flow-col gap-6 pt-2"
                                    style={{ minWidth: Math.max(720, departmentPerformanceChartItems.length * 132) }}
                                  >
                                    {departmentPerformanceChartItems.map((department) => (
                                      <div key={department.departmentId} className="min-w-[112px]">
                                        <div className="flex h-[260px] items-end justify-center gap-3">
                                          <DepartmentStatColumn
                                            value={department.performance}
                                            tone="primary"
                                          />
                                          <DepartmentStatColumn
                                            value={department.departmentKrProgress}
                                            tone="secondary"
                                          />
                                        </div>
                                        <div className="mt-4 text-center">
                                          <p className="text-sm font-semibold text-slate-900">
                                            {department.name}
                                          </p>
                                          <p className="mt-1 text-[11px] text-slate-500">
                                            {formatGoalParticipationRoleLabel(department.role)} · {department.ownedKrCount} KR
                                          </p>
                                          <p className="mt-1 text-[11px] text-slate-400">
                                            Mục tiêu {department.goalWeight.toFixed(2)} · KR {department.krWeight.toFixed(2)}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    ) : (
                      <p className="mt-4 text-sm text-slate-500">
                        Chưa có cấu hình phòng ban tham gia cho mục tiêu này.
                      </p>
                    )}
                  </article>

                  <article className="order-4 rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">
                          KR
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                          Hiển thị nhanh tiến độ, chỉ số hiện tại, mục tiêu và khung thời gian của
                          từng KR.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {keyResults.length} KR
                        </span>
                      </div>
                    </div>
                    {!isCheckingCreatePermission && !canCreateKeyResult ? (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                        Quyền tạo KR đang dùng cùng logic với quyền tạo mục tiêu. Tài khoản hiện tại
                        chưa có quyền này.
                      </div>
                    ) : null}

                    {keyResultNotice ? (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                        {keyResultNotice}
                      </div>
                    ) : null}

                    {goalType === "kpi" ? (
                      <div
                        className={`mt-4 rounded-2xl border px-4 py-4 text-sm ${
                          kpiDirectSummary.safeGoalTarget !== null &&
                          kpiDirectSummary.targetGap !== null &&
                          kpiDirectSummary.targetGap > 0
                            ? "border-amber-200 bg-amber-50 text-amber-900"
                            : "border-blue-200 bg-blue-50 text-blue-900"
                        }`}
                      >
                        <p className="font-semibold">
                          KPI của mục tiêu hiện đang được cộng từ {kpiDirectSummary.directCount} KR trực
                          tiếp.
                        </p>
                        <p className="mt-1">
                          Đã đạt {formatKeyResultMetric(kpiDirectSummary.totalCurrent, goalMetricUnit)}
                          {kpiDirectSummary.safeGoalTarget !== null
                            ? ` / ${formatKeyResultMetric(
                                kpiDirectSummary.safeGoalTarget,
                                goalMetricUnit,
                              )} theo KPI của mục tiêu.`
                            : " từ giá trị hiện tại của các KR trực tiếp."}
                        </p>
                        <p className="mt-1">
                          Tổng chỉ tiêu KR trực tiếp hiện là{" "}
                          {formatKeyResultMetric(kpiDirectSummary.totalTarget, goalMetricUnit)}
                          {kpiDirectSummary.safeGoalTarget === null
                            ? ", nhưng mục tiêu chưa có chỉ tiêu để đối chiếu."
                            : kpiDirectSummary.targetGap && kpiDirectSummary.targetGap > 0
                              ? `, còn thiếu ${formatKeyResultMetric(
                                  kpiDirectSummary.targetGap,
                                  goalMetricUnit,
                                )} để đạt đủ KPI của mục tiêu.`
                              : `, đã đạt đủ KPI của mục tiêu${
                                  (kpiDirectSummary.targetOver ?? 0) > 0
                                    ? ` và dư ${formatKeyResultMetric(
                                        kpiDirectSummary.targetOver ?? 0,
                                        goalMetricUnit,
                                      )}`
                                    : ""
                                }.`}
                        </p>
                        {kpiDirectSummary.mismatchedUnitCount > 0 ? (
                          <p className="mt-2 text-xs text-amber-800">
                            Có {kpiDirectSummary.mismatchedUnitCount} KR trực tiếp đang khác đơn vị
                            với mục tiêu, nên cần kiểm tra lại tính tương thích của số tổng hợp này.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {keyResultLoadError ? (
                      <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {keyResultLoadError}
                      </p>
                    ) : null}
                    {!keyResultLoadError && keyResults.length === 0 ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                        <p className="text-lg font-semibold text-slate-900">
                          Chưa có KR.
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          Hãy tạo KR để bắt đầu theo dõi mục tiêu.
                        </p>
                        {createKeyResultHref && !isCreateKeyResultButtonDisabled ? (
                          <Link
                            href={createKeyResultHref}
                            className="mt-4 inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                          >
                            + Thêm KR
                          </Link>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="mt-4 inline-flex h-10 items-center rounded-xl bg-blue-300 px-4 text-sm font-semibold text-white"
                          >
                            + Thêm KR
                          </button>
                        )}
                      </div>
                    ) : null}

                    {!keyResultLoadError && keyResults.length > 0 ? (
                      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                          <div>
                            <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                              Bảng KR
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {goalType === "kpi"
                                ? "Mục tiêu KPI cộng dồn giá trị hiện tại của KR trực tiếp."
                                : "Mục tiêu OKR lấy trung bình tiến độ của các KR trực tiếp. KR hỗ trợ không được cộng vào tiến độ mục tiêu."}
                            </p>
                          </div>
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {keyResults.length} dòng
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[1220px] text-left text-sm">
                            <thead className="bg-white">
                              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                                <th className="px-4 py-3 font-semibold">KR</th>
                                <th className="px-4 py-3 font-semibold">Phân loại</th>
                                <th className="px-4 py-3 font-semibold">Phòng ban</th>
                                <th className="px-4 py-3 font-semibold">Chỉ số</th>
                                <th className="px-4 py-3 font-semibold">Thời gian</th>
                                <th className="px-4 py-3 font-semibold">Tiến độ</th>
                                <th className="px-4 py-3 text-right font-semibold">Thao tác</th>
                              </tr>
                            </thead>
                            <tbody>
                              {keyResults.map((keyResult) => {
                                const keyResultDetailHref = `/goals/${goal.id}/key-results/${keyResult.id}`;
                                const keyResultProgress = keyResultProgressMap[keyResult.id] ?? 0;
                                const responsibleDepartmentName =
                                  goalDepartmentsById[keyResult.responsible_department_id ?? ""]?.name ??
                                  "Chưa gán phòng ban";

                                return (
                                  <Fragment key={keyResult.id}>
                                    <tr className="border-b border-slate-100 align-top bg-white">
                                      <td className="px-4 py-4">
                                        <Link
                                          href={keyResultDetailHref}
                                          className="font-semibold text-slate-900 hover:text-blue-700"
                                        >
                                          {keyResult.name}
                                        </Link>
                                        <p className="mt-1 text-xs text-slate-500">
                                          {keyResult.description?.trim() || "Chưa có mô tả."}
                                        </p>
                                      </td>
                                      <td className="px-4 py-4">
                                        <div className="flex flex-wrap gap-2 text-xs">
                                          <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
                                            {formatKeyResultTypeLabel(keyResult.type)}
                                          </span>
                                          <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
                                            {formatKeyResultContributionTypeLabel(
                                              keyResult.contribution_type,
                                            )}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="px-4 py-4 text-slate-700">
                                        {responsibleDepartmentName}
                                      </td>
                                      <td className="px-4 py-4">
                                        <p className="font-medium text-slate-900">
                                          {formatKeyResultMetric(keyResult.current, keyResult.unit)}
                                          {" / "}
                                          {formatKeyResultMetric(keyResult.target, keyResult.unit)}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500">
                                          Hiện tại / KPI · {formatKeyResultUnit(keyResult.unit)}
                                        </p>
                                      </td>
                                      <td className="px-4 py-4">
                                        <p className="font-medium text-slate-900">
                                          {formatTimelineRangeVi(keyResult.start_date, keyResult.end_date, {
                                            fallback: "KR chưa có mốc thời gian",
                                          })}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500">
                                          {getTimelineMissingReason(
                                            keyResult.start_date,
                                            keyResult.end_date,
                                            "KR chưa có mốc thời gian",
                                            "Mốc thời gian KR không hợp lệ",
                                          ) ?? "Khung thời gian kế hoạch của KR."}
                                        </p>
                                      </td>
                                      <td className="px-4 py-4">
                                        <div className="w-36 space-y-2">
                                          <div className="flex items-center justify-between text-xs">
                                            <span className="text-slate-500">KR</span>
                                            <span className="font-semibold text-slate-900">
                                              {keyResultProgress}%
                                            </span>
                                          </div>
                                          <ProgressBar value={keyResultProgress} />
                                        </div>
                                      </td>
                                      <td className="px-4 py-4 whitespace-nowrap">
                                        <div className="flex justify-end gap-2 whitespace-nowrap">
                                          <Link
                                            href={keyResultDetailHref}
                                            className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 text-center text-sm font-semibold text-slate-700 hover:bg-slate-100"
                                          >
                                            Chi tiết KR
                                          </Link>
                                          {canCreateKeyResult ? (
                                            <button
                                              type="button"
                                              onClick={() => startEditingKeyResultScale(keyResult)}
                                              className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 text-center text-sm font-semibold text-slate-700 hover:bg-slate-100"
                                            >
                                              Sửa KR
                                            </button>
                                          ) : null}
                                        </div>
                                      </td>
                                    </tr>

                                    {savedKeyResultId === keyResult.id ? (
                                      <tr className="border-b border-slate-100 bg-emerald-50/60">
                                        <td colSpan={8} className="px-4 py-3 text-sm text-emerald-700">
                                          Đã lưu KR.
                                        </td>
                                      </tr>
                                    ) : null}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
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
                        <span className="text-slate-500">Phòng ban tham gia</span>
                        <span className="text-right font-medium text-slate-800">
                          {goalDepartments.length > 0 ? goalDepartments.length : 1}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Loại mục tiêu</span>
                        <span className="text-right font-medium text-slate-800">
                          {goalTypeLabel}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Người phụ trách</span>
                        <div className="max-w-[220px] text-right">
                          {goalOwners.length > 0 ? (
                            <div className="flex flex-wrap justify-end gap-2">
                              {goalOwners.map((owner) => (
                                <span
                                  key={owner.id}
                                  className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
                                >
                                  {owner.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="font-medium text-slate-800">
                              Chưa có người phụ trách
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Trạng thái</span>
                        <span className="text-right font-medium text-slate-800">
                          {goalStatusLabel}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Quý</span>
                        <span className="text-right font-medium text-slate-800">
                          {quarterLabel}
                        </span>
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
                        <span className="text-right font-medium text-slate-800">
                          {goalProgress}%
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Chỉ tiêu mục tiêu</span>
                        <span className="text-right font-medium text-slate-800">
                          {hasGoalMetric
                            ? `${formatKeyResultMetric(goalMetricTarget, goalMetricUnit)}`
                            : "Chưa đặt"}
                        </span>
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
                      <h2 className="text-base font-semibold text-slate-900">Tổng quan tiến độ</h2>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {keyResults.length} KR
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p
                          className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase"
                          title={goalProgressHelp}
                        >
                          Tiến độ mục tiêu
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">
                          {goalProgress}%
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                          TB tiến độ KR
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">
                          {averageKeyResultProgress}%
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                          Số KR
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">
                          {keyResults.length}
                        </p>
                      </div>

                      {goalType === "kpi" ? (
                        <>
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                              KPI từ KR trực tiếp
                            </p>
                            <p className="mt-2 text-2xl font-semibold text-slate-900">
                              {formatKeyResultMetric(kpiDirectSummary.totalCurrent, goalMetricUnit)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {kpiDirectSummary.directCount} KR trực tiếp đang đóng góp vào mục tiêu KPI
                            </p>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                              Tổng KPI KR
                            </p>
                            <p className="mt-2 text-2xl font-semibold text-slate-900">
                              {kpiDirectSummary.safeGoalTarget !== null
                                ? `${kpiDirectSummary.targetCoveragePercent}%`
                                : "Chưa rõ"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {kpiDirectSummary.safeGoalTarget === null
                                ? "Mục tiêu KPI chưa có chỉ tiêu để đối chiếu."
                                : kpiDirectSummary.targetGap && kpiDirectSummary.targetGap > 0
                                  ? `Thiếu ${formatKeyResultMetric(
                                      kpiDirectSummary.targetGap,
                                      goalMetricUnit,
                                    )} chỉ tiêu để đủ KPI của mục tiêu`
                                  : "Tổng chỉ tiêu KR trực tiếp đã phủ đủ KPI của mục tiêu"}
                            </p>
                          </div>
                        </>
                      ) : null}

                      <div className="rounded-xl border border-slate-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-800">
                        <p className="font-semibold">Cách tính tiến độ</p>
                        <p className="mt-1">{goalProgressHelp}</p>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="text-base font-semibold text-slate-900">
                      Phòng ban tham gia
                    </h2>
                    {relatedDepartmentLoadError ? (
                      <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {relatedDepartmentLoadError}
                      </p>
                    ) : null}
                    <div className="mt-3 space-y-3">
                      {goalDepartments.length > 0 ? (
                        goalDepartments.map((department) => (
                          <div
                            key={department.departmentId}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-900">
                                {department.name}
                              </p>
                              <span
                                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                  department.departmentId === goal.department_id
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-white text-slate-600"
                                }`}
                              >
                                {formatGoalParticipationRoleLabel(department.role)}
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-slate-500">
                              Tỷ trọng mục tiêu {department.goalWeight.toFixed(2)} · Tỷ trọng KR{" "}
                              {department.krWeight.toFixed(2)}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">
                          Chưa có dữ liệu phòng ban tham gia.
                        </p>
                      )}
                    </div>
                  </article>
                </aside>
              </div>
            ) : null}

            {editingKeyResult && keyResultScaleForm ? (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
                onClick={() => {
                  if (!isSavingEditingKeyResult) {
                    cancelEditingKeyResultScale();
                  }
                }}
              >
                <div
                  className="max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                    <div>
                      <p className="text-xs font-semibold tracking-[0.08em] text-blue-600 uppercase">
                        Chỉnh sửa KR
                      </p>
                      <h2 className="mt-1 text-xl font-semibold text-slate-900">
                        {editingKeyResult.name}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Cập nhật phân loại, chỉ số, thời gian và tiến độ của KR trong một cửa sổ riêng.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={cancelEditingKeyResultScale}
                      disabled={isSavingEditingKeyResult}
                      className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Đóng
                    </button>
                  </div>

                  <div className="space-y-5 px-5 py-5">
                    {modalEditError ? (
                      <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {modalEditError}
                      </p>
                    ) : null}

                    <div className="grid gap-4 lg:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-sm font-medium text-slate-700">Loại KR</span>
                        <select
                          value={keyResultScaleForm.type}
                          onChange={(event) =>
                            setKeyResultScaleForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    type: normalizeKeyResultTypeValue(event.target.value),
                                    unit: normalizeKeyResultUnitForType(
                                      event.target.value,
                                      prev.unit,
                                    ),
                                    target:
                                      normalizeKeyResultTypeValue(event.target.value) === "okr"
                                        ? "100"
                                        : prev.target,
                                  }
                                : prev,
                            )
                          }
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        >
                          {KEY_RESULT_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-medium text-slate-700">Kiểu đóng góp</span>
                        <select
                          value={keyResultScaleForm.contributionType}
                          onChange={(event) =>
                            setKeyResultScaleForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    contributionType: normalizeKeyResultContributionTypeValue(
                                      event.target.value,
                                    ),
                                  }
                                : prev,
                            )
                          }
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        >
                          {KEY_RESULT_CONTRIBUTION_TYPES.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-medium text-slate-700">Phòng ban phụ trách</span>
                        <select
                          value={keyResultScaleForm.responsibleDepartmentId}
                          onChange={(event) =>
                            setKeyResultScaleForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    responsibleDepartmentId: event.target.value,
                                  }
                                : prev,
                            )
                          }
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        >
                          {goalDepartments.map((department) => (
                            <option key={department.departmentId} value={department.departmentId}>
                              {department.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-medium text-slate-700">Đơn vị</span>
                        <select
                          value={keyResultScaleForm.unit}
                          disabled={keyResultScaleForm.type === "okr"}
                          onChange={(event) =>
                            setKeyResultScaleForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    unit: normalizeKeyResultUnitForType(
                                      prev.type,
                                      event.target.value,
                                    ),
                                  }
                                : prev,
                            )
                          }
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        >
                          {getAllowedKeyResultUnitsByType(keyResultScaleForm.type).map((unit) => (
                            <option key={unit.value} value={unit.value}>
                              {unit.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-medium text-slate-700">Giá trị bắt đầu</span>
                        <FormattedNumberInput
                          value={keyResultScaleForm.startValue}
                          onValueChange={(value) =>
                            setKeyResultScaleForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    startValue: value,
                                  }
                                : prev,
                            )
                          }
                          placeholder="Nhập giá trị bắt đầu"
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-medium text-slate-700">Giá trị hiện tại</span>
                        <FormattedNumberInput
                          value={keyResultScaleForm.current}
                          onValueChange={(value) =>
                            setKeyResultScaleForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    current: value,
                                  }
                                : prev,
                            )
                          }
                          placeholder="Nhập giá trị hiện tại"
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-medium text-slate-700">Chỉ tiêu</span>
                        <FormattedNumberInput
                          value={keyResultScaleForm.target}
                          disabled={keyResultScaleForm.type === "okr"}
                          onValueChange={(value) =>
                            setKeyResultScaleForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    target: value,
                                  }
                                : prev,
                            )
                          }
                          placeholder="Nhập chỉ tiêu"
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-medium text-slate-700">Ngày bắt đầu</span>
                        <input
                          type="date"
                          value={keyResultScaleForm.startDate}
                          onChange={(event) =>
                            setKeyResultScaleForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    startDate: event.target.value,
                                  }
                                : prev,
                            )
                          }
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-medium text-slate-700">Ngày kết thúc</span>
                        <input
                          type="date"
                          min={keyResultScaleForm.startDate || undefined}
                          value={keyResultScaleForm.endDate}
                          onChange={(event) =>
                            setKeyResultScaleForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    endDate: event.target.value,
                                  }
                                : prev,
                            )
                          }
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Xem trước tiến độ KR</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatKeyResultMetric(modalCurrentValue, keyResultScaleForm.unit)}
                            {" / "}
                            {formatKeyResultMetric(modalTargetValue, keyResultScaleForm.unit)}
                          </p>
                        </div>
                        <span className="text-lg font-semibold text-slate-900">
                          {modalProgressPreview}%
                        </span>
                      </div>
                      <div className="mt-3">
                        <ProgressBar value={modalProgressPreview} />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
                    <button
                      type="button"
                      onClick={cancelEditingKeyResultScale}
                      disabled={isSavingEditingKeyResult}
                      className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveKeyResultScale(editingKeyResult)}
                      disabled={isSavingEditingKeyResult}
                      className="inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {isSavingEditingKeyResult ? "Đang lưu..." : "Lưu KR"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}

export default function GoalDetailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f3f5fa]" />}>
      <GoalDetailPageContent />
    </Suspense>
  );
}
