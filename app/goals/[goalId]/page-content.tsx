"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { ActivityHistoryDialog } from "@/components/activity-history-dialog";
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
  normalizeKeyResultUnitForType,
  normalizeKeyResultContributionTypeValue,
  normalizeKeyResultTypeValue,
  type KeyResultUnitValue,
  type KeyResultContributionTypeValue,
  type KeyResultTypeValue,
} from "@/lib/constants/key-results";
import { formatDateTimeDdMmYyyy } from "@/lib/date-format";
import {
  buildGoalProgressMap,
  buildGoalDepartmentPerformanceMap,
  buildKeyResultProgressMap,
  normalizeParticipationWeights,
} from "@/lib/okr";
import {
  formatGoalOwnerName,
  type GoalOwnerProfile,
  type GoalOwnerProfileRow,
} from "@/lib/goal-owners";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";
import { formatTimelineRangeVi, isDateRangeOrdered } from "@/lib/timeline";

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
  return formatDateTimeDdMmYyyy(value, "Chưa có", "Không hợp lệ");
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

function DepartmentStatColumn({ value, tone }: { value: number; tone: "primary" | "secondary" }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex h-full w-10 flex-col items-center justify-end">
      <span className="mb-1 text-[11px] font-semibold text-slate-700">{safeValue}%</span>
      <div
        className={`w-full rounded-t-sm ${tone === "primary" ? "bg-slate-800" : "bg-slate-400"}`}
        style={{ height: `${Math.max(safeValue, 2)}%` }}
      />
    </div>
  );
}

function SummaryMiniCard({
  label,
  value,
  hint,
  className = "",
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50/80 p-3 ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p className="mt-1.5 text-base font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function DetailInfoRow({
  label,
  value,
  valueClassName = "",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`max-w-[65%] text-right font-medium text-slate-800 ${valueClassName}`}>
        {value}
      </span>
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
  const [, setDepartmentName] = useState<string | null>(null);
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
        setError(goalError.message || "Không tải được chi tiết goal.");
        setGoal(null);
        setDepartmentName(null);
        setGoalOwners([]);
        setGoalDepartments([]);
        setKeyResults([]);
        setIsLoading(false);
        return;
      }

      if (!goalData) {
        setError("Không tìm thấy goal.");
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
    return (
      buildGoalProgressMap(
        [{ id: goal.id, type: goal.type, target: goal.target }],
        keyResults,
        keyResultProgressMap,
      )[goal.id] ?? 0
    );
  }, [goal, keyResultProgressMap, keyResults]);
  const goalType = goal ? normalizeGoalTypeValue(goal.type) : "kpi";
  const goalTypeLabel = goal ? formatGoalTypeLabel(goal.type) : "Chưa đặt";
  const goalStatusLabel = goal?.status ? (statusLabelMap[goal.status] ?? goal.status) : "Chưa đặt";
  const quarterLabel = goal?.quarter ? `Q${goal.quarter}` : "Chưa đặt";
  const yearLabel = goal?.year ? String(goal.year) : "Chưa đặt";
  const goalMetricTarget = goal?.target ?? null;
  const goalMetricUnit = goal?.unit ?? null;
  const goalOwnerSummary =
    goalOwners.length > 0 ? goalOwners.map((owner) => owner.name).join(", ") : "Chưa có phụ trách";
  const goalDescription = goal?.description?.trim() ?? "";
  const goalDepartmentCount =
    goalDepartments.length > 0 ? goalDepartments.length : goal?.department_id ? 1 : 0;
  const goalDepartmentNames =
    goalDepartments.length > 0
      ? goalDepartments.map((department) => department.name).join(" • ")
      : "Chưa có phòng ban tham gia";
  const goalTimelineLabel = formatTimelineRangeVi(
    goal?.start_date ?? null,
    goal?.end_date ?? null,
    {
      fallback: "Chưa có mốc thời gian",
    },
  );
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
      Number.isFinite(goalMetricTarget) && Number(goalMetricTarget) > 0
        ? Number(goalMetricTarget)
        : null;
    const currentGap = safeGoalTarget === null ? null : Math.max(0, safeGoalTarget - totalCurrent);
    const currentOver = safeGoalTarget === null ? null : Math.max(0, totalCurrent - safeGoalTarget);
    const targetGap = safeGoalTarget === null ? null : Math.max(0, safeGoalTarget - totalTarget);
    const targetOver = safeGoalTarget === null ? null : Math.max(0, totalTarget - safeGoalTarget);
    const targetCoveragePercent =
      safeGoalTarget && safeGoalTarget > 0 ? Math.round((totalTarget / safeGoalTarget) * 100) : 0;
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
  const goalProgressMetricLabel =
    goalType === "kpi"
      ? `${formatKeyResultMetric(kpiDirectSummary.totalCurrent, goalMetricUnit)} / ${
          kpiDirectSummary.safeGoalTarget !== null
            ? formatKeyResultMetric(kpiDirectSummary.safeGoalTarget, goalMetricUnit)
            : "Chưa đặt"
        }`
      : `${formatKeyResultMetric(goalProgress, "percent")} / 100%`;
  const goalDepartmentsById = useMemo(
    () =>
      goalDepartments.reduce<Record<string, GoalDepartmentItem>>((acc, item) => {
        acc[item.departmentId] = item;
        return acc;
      }, {}),
    [goalDepartments],
  );

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
  const topDepartmentPerformance = departmentPerformanceChartItems[0] ?? null;
  const averageDepartmentPerformance =
    departmentPerformanceItems.length > 0
      ? Math.round(
          departmentPerformanceItems.reduce((total, item) => total + item.performance, 0) /
            departmentPerformanceItems.length,
        )
      : 0;
  const isKpiInsightWarning =
    goalType === "kpi" &&
    ((kpiDirectSummary.safeGoalTarget !== null &&
      kpiDirectSummary.targetGap !== null &&
      kpiDirectSummary.targetGap > 0) ||
      kpiDirectSummary.mismatchedUnitCount > 0);

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
      setKeyResultScaleError("Bạn không có quyền cập nhật KR ở goal này.");
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
        ? ` Thao tác này cũng sẽ xóa ${keyResultCount} KR cùng task và liên kết hỗ trợ liên quan.`
        : "";

    if (!window.confirm(`Xóa goal "${goal.name}"?${relatedWarning}`)) {
      return;
    }

    setIsDeletingGoal(true);

    const { data: keyResultsData, error: keyResultsError } = await supabase
      .from("key_results")
      .select("id")
      .eq("goal_id", goal.id);

    if (keyResultsError) {
      window.alert(keyResultsError.message || "Không thể tải danh sách KR để xóa goal.");
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
            "Không thể xóa các liên kết hỗ trợ outbound của goal.",
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
            "Không thể xóa các liên kết hỗ trợ inbound của goal.",
        );
        setIsDeletingGoal(false);
        return;
      }

      const { error: deleteTasksError } = await supabase
        .from("tasks")
        .delete()
        .in("key_result_id", keyResultIds);

      if (deleteTasksError) {
        window.alert(deleteTasksError.message || "Không thể xóa task thuộc goal.");
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
        deleteGoalDepartmentsError.message || "Không thể xóa phòng ban tham gia của goal.",
      );
      setIsDeletingGoal(false);
      return;
    }

    const { error: deleteGoalOwnersError } = await supabase
      .from("goal_owners")
      .delete()
      .eq("goal_id", goal.id);

    if (deleteGoalOwnersError) {
      window.alert(deleteGoalOwnersError.message || "Không thể xóa người phụ trách của goal.");
      setIsDeletingGoal(false);
      return;
    }

    if (keyResultIds.length > 0) {
      const { error: deleteKeyResultsError } = await supabase
        .from("key_results")
        .delete()
        .in("id", keyResultIds);

      if (deleteKeyResultsError) {
        window.alert(deleteKeyResultsError.message || "Không thể xóa KR của goal.");
        setIsDeletingGoal(false);
        return;
      }
    }

    const { error: deleteGoalError } = await supabase.from("goals").delete().eq("id", goal.id);

    if (deleteGoalError) {
      window.alert(deleteGoalError.message || "Không thể xóa goal.");
      setIsDeletingGoal(false);
      return;
    }

    router.push("/goals");
  };

  const editingKeyResult =
    editingKeyResultId && keyResultScaleForm
      ? (keyResults.find((item) => item.id === editingKeyResultId) ?? null)
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
            title="Chi tiết goal"
            items={[
              { label: "Goal", href: "/goals" },
              { label: goal?.name ?? "Chi tiết goal" },
            ]}
          />

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
            {!hasValidGoalId ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
                Thiếu mã goal.
              </div>
            ) : null}

            {hasValidGoalId && isLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">
                Đang tải chi tiết goal...
              </div>
            ) : null}

            {hasValidGoalId && !isLoading && error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {hasValidGoalId && !isLoading && !error && goal ? (
              <div className="w-full min-w-0">
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_312px]">
                  <section className="flex min-w-0 flex-col gap-4">
                    <article className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
                              {goalTypeLabel}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                              {formatQuarterYear(goal.quarter, goal.year)}
                            </span>
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                              {goalStatusLabel}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900 lg:text-[28px]">
                                {goal.name}
                              </h1>
                            </div>

                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              <ActivityHistoryDialog
                                entityType="goal"
                                entityId={goal.id}
                                title="Lịch sử hoạt động của goal"
                                triggerLabel="Lịch sử"
                                triggerClassName="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                              />
                              {workspaceAccess.canManage &&
                              !workspaceAccess.error &&
                              hasValidGoalId ? (
                                <>
                                  <Link
                                    href={`/goals/new?editGoalId=${goalId}`}
                                    className="inline-flex h-8 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                                  >
                                    Sửa goal
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteGoal()}
                                    disabled={isDeletingGoal}
                                    className="inline-flex h-8 items-center rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {isDeletingGoal ? "Đang xóa..." : "Xóa goal"}
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,0.9fr))]">
                        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 md:col-span-2 xl:col-span-1">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p
                                className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500"
                                title={goalProgressHelp}
                              >
                                Tiến độ
                              </p>
                              <p className="mt-1 text-xl font-semibold text-slate-900">
                                {goalProgress}%
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-slate-900">
                                {goalProgressMetricLabel}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3">
                            <ProgressBar value={goalProgress} />
                          </div>
                        </div>

                        <SummaryMiniCard label="Kỳ" value={`${quarterLabel} / ${yearLabel}`} />
                        <SummaryMiniCard
                          label="KR"
                          value={`${keyResults.length} KR`}
                          hint={
                            keyResults.length > 0
                              ? `${directKeyResults.length} trực tiếp`
                              : undefined
                          }
                        />
                        <SummaryMiniCard label="Phòng ban" value={`${goalDepartmentCount}`} />
                      </div>

                      {goalType === "kpi" ? (
                        <div
                          className={`mt-3 rounded-xl border px-3.5 py-3 ${
                            isKpiInsightWarning
                              ? "border-amber-200 bg-amber-50/70"
                              : "border-slate-200 bg-slate-50/80"
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${
                                  isKpiInsightWarning ? "text-amber-700" : "text-slate-600"
                                }`}
                              >
                                Tổng KPI KR
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">
                                {formatKeyResultMetric(
                                  kpiDirectSummary.totalTarget,
                                  goalMetricUnit,
                                )}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                isKpiInsightWarning
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {kpiDirectSummary.safeGoalTarget !== null
                                ? `${kpiDirectSummary.targetCoveragePercent}% độ phủ`
                                : "Chưa có chỉ tiêu goal"}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs leading-5 text-slate-600">
                            {kpiDirectSummary.safeGoalTarget === null
                              ? "Goal KPI chưa có chỉ tiêu để đối chiếu tổng KPI từ các KR trực tiếp."
                              : kpiDirectSummary.targetGap && kpiDirectSummary.targetGap > 0
                                ? `Còn thiếu ${formatKeyResultMetric(
                                    kpiDirectSummary.targetGap,
                                    goalMetricUnit,
                                  )} để phủ đủ KPI goal.`
                                : `Các KR trực tiếp đã phủ đủ KPI của goal${
                                    (kpiDirectSummary.targetOver ?? 0) > 0
                                      ? ` và dư ${formatKeyResultMetric(
                                          kpiDirectSummary.targetOver ?? 0,
                                          goalMetricUnit,
                                        )}`
                                      : ""
                                  }.`}
                          </p>
                          {kpiDirectSummary.mismatchedUnitCount > 0 ? (
                            <p className="mt-2 text-xs font-medium text-amber-800">
                              Có {kpiDirectSummary.mismatchedUnitCount} KR trực tiếp khác đơn vị với
                              goal, nên cần kiểm tra lại trước khi ra quyết định.
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {goalDescription ? (
                        <div className="mt-3 border-t border-slate-100 pt-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                            Mô tả
                          </p>
                          <p className="mt-1.5 text-sm leading-6 text-slate-700">
                            {goalDescription}
                          </p>
                        </div>
                      ) : null}

                      {keyResults.length === 0 ? (
                        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-500">
                          Goal chưa có KR nên chưa có đủ dữ liệu để tính tiến độ chi tiết.
                        </div>
                      ) : null}
                    </article>

                    <article className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="text-base font-semibold text-slate-900">KR</h2>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {keyResults.length} KR
                          </span>
                          {createKeyResultHref && !isCreateKeyResultButtonDisabled ? (
                            <Link
                              href={createKeyResultHref}
                              className="inline-flex h-8 items-center rounded-lg border border-blue-600 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
                            >
                              + Thêm KR
                            </Link>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="inline-flex h-8 items-center rounded-lg border border-blue-300 bg-blue-300 px-3 text-xs font-semibold text-white opacity-60"
                            >
                              + Thêm KR
                            </button>
                          )}
                        </div>
                      </div>

                      {keyResultNotice ? (
                        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
                          {keyResultNotice}
                        </div>
                      ) : null}

                      {keyResultLoadError ? (
                        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                          {keyResultLoadError}
                        </p>
                      ) : null}

                      {!keyResultLoadError && keyResults.length === 0 ? (
                        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-7 text-center">
                          <p className="text-base font-semibold text-slate-900">Chưa có KR.</p>
                          <p className="mt-1.5 text-sm text-slate-500">
                            Hãy tạo KR để bắt đầu theo dõi goal.
                          </p>
                        </div>
                      ) : null}

                      {!keyResultLoadError && keyResults.length > 0 ? (
                        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
                          <div className="max-h-[min(58vh,720px)] overflow-auto">
                            <table className="w-full min-w-[980px] text-left text-sm">
                              <thead className="sticky top-0 z-10 bg-slate-50">
                                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                                  <th className="px-3 py-2.5 font-semibold">KR</th>
                                  <th className="px-3 py-2.5 font-semibold">Phân loại</th>
                                  <th className="px-3 py-2.5 font-semibold">Phòng ban</th>
                                  <th className="px-3 py-2.5 font-semibold">Chỉ số</th>
                                  <th className="px-3 py-2.5 font-semibold">Thời gian</th>
                                </tr>
                              </thead>
                              <tbody>
                                {keyResults.map((keyResult) => {
                                  const keyResultDetailHref = `/goals/${goal.id}/key-results/${keyResult.id}`;
                                  const keyResultProgress = keyResultProgressMap[keyResult.id] ?? 0;
                                  const responsibleDepartmentName =
                                    goalDepartmentsById[keyResult.responsible_department_id ?? ""]
                                      ?.name ?? "Chưa gán phòng ban";

                                  return (
                                    <Fragment key={keyResult.id}>
                                      <tr className="border-b border-slate-100 align-top bg-white">
                                        <td className="px-3 py-2.5">
                                          <Link
                                            href={keyResultDetailHref}
                                            title={keyResult.name}
                                            className="block text-sm font-semibold text-slate-900 hover:text-blue-700"
                                          >
                                            {keyResult.name}
                                          </Link>
                                          {keyResult.description?.trim() ? (
                                            <p
                                              className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500"
                                              title={keyResult.description.trim()}
                                            >
                                              {keyResult.description.trim()}
                                            </p>
                                          ) : null}
                                          {canCreateKeyResult ? (
                                            <button
                                              type="button"
                                              onClick={() => startEditingKeyResultScale(keyResult)}
                                              className="mt-2 inline-flex h-7 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                                            >
                                              Sửa
                                            </button>
                                          ) : null}
                                        </td>
                                        <td className="px-3 py-2.5">
                                          <div className="flex flex-wrap gap-1.5 text-[11px]">
                                            <span className="rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-700">
                                              {formatKeyResultTypeLabel(keyResult.type)}
                                            </span>
                                            <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700">
                                              {formatKeyResultContributionTypeLabel(
                                                keyResult.contribution_type,
                                              )}
                                            </span>
                                          </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-700">
                                          {responsibleDepartmentName}
                                        </td>
                                        <td className="px-3 py-2.5">
                                          <div className="w-[220px] space-y-1.5">
                                            <div className="flex items-center justify-between gap-2">
                                              <p className="font-medium text-slate-900">
                                                {formatKeyResultMetric(
                                                  keyResult.current,
                                                  keyResult.unit,
                                                )}{" "}
                                                /{" "}
                                                {formatKeyResultMetric(
                                                  keyResult.target,
                                                  keyResult.unit,
                                                )}
                                              </p>
                                              <span className="text-xs font-semibold text-slate-600">
                                                {keyResultProgress}%
                                              </span>
                                            </div>
                                            <ProgressBar value={keyResultProgress} />
                                          </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-sm text-slate-700">
                                          {formatTimelineRangeVi(
                                            keyResult.start_date,
                                            keyResult.end_date,
                                            {
                                              fallback: "KR chưa có mốc thời gian",
                                            },
                                          )}
                                        </td>
                                      </tr>

                                      {savedKeyResultId === keyResult.id ? (
                                        <tr className="border-b border-slate-100 bg-emerald-50/60">
                                          <td
                                            colSpan={5}
                                            className="px-3 py-2.5 text-sm text-emerald-700"
                                          >
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

                    <article className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="text-base font-semibold text-slate-900">
                            Phòng ban tham gia & hiệu suất
                          </h2>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {goalDepartments.length} phòng ban
                          </span>
                          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                            <button
                              type="button"
                              onClick={() => setDepartmentPerformanceView("table")}
                              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
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
                              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
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

                      {departmentPerformanceItems.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                            Hiệu suất TB {averageDepartmentPerformance}%
                          </span>
                          {topDepartmentPerformance ? (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                              Dẫn đầu: {topDepartmentPerformance.name}{" "}
                              {topDepartmentPerformance.performance}%
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {relatedDepartmentLoadError ? (
                        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                          {relatedDepartmentLoadError}
                        </p>
                      ) : null}

                      {departmentPerformanceItems.length > 0 ? (
                        departmentPerformanceView === "table" ? (
                          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
                            <div className="max-h-[420px] overflow-auto">
                              <table className="w-full min-w-[760px] text-left text-sm">
                                <thead className="sticky top-0 z-10 bg-slate-50">
                                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                                    <th className="px-3 py-2.5 font-semibold">Phòng ban</th>
                                    <th className="px-3 py-2.5 font-semibold">Vai trò</th>
                                    <th className="px-3 py-2.5 text-right font-semibold">
                                      KR sở hữu
                                    </th>
                                    <th className="px-3 py-2.5 text-right font-semibold">
                                      Tiến độ KR
                                    </th>
                                    <th className="px-3 py-2.5 text-right font-semibold">
                                      Hiệu suất
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {departmentPerformanceItems.map((department) => (
                                    <tr
                                      key={department.departmentId}
                                      className="border-b border-slate-100 last:border-b-0"
                                    >
                                      <td className="px-3 py-2.5 font-semibold text-slate-900">
                                        {department.name}
                                      </td>
                                      <td className="px-3 py-2.5 text-slate-600">
                                        {formatGoalParticipationRoleLabel(department.role)}
                                      </td>
                                      <td className="px-3 py-2.5 text-right font-medium text-slate-900">
                                        {department.ownedKrCount}
                                      </td>
                                      <td className="px-3 py-2.5 text-right font-medium text-slate-900">
                                        {department.departmentKrProgress}%
                                      </td>
                                      <td className="px-3 py-2.5 text-right font-semibold text-slate-950">
                                        {department.performance}%
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 space-y-3">
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
                                className="rounded-xl border border-slate-200 bg-white p-3"
                                style={{
                                  minWidth: Math.max(
                                    720,
                                    departmentPerformanceChartItems.length * 132,
                                  ),
                                }}
                              >
                                <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 pt-2">
                                  <div className="relative h-[220px]">
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
                                    <div className="absolute inset-0 h-[220px]">
                                      {[100, 75, 50, 25, 0].map((tick) => (
                                        <div
                                          key={tick}
                                          className="absolute inset-x-0 border-t border-slate-100"
                                          style={{ bottom: `${tick}%` }}
                                        />
                                      ))}
                                    </div>

                                    <div
                                      className="relative grid auto-cols-fr grid-flow-col gap-5 pt-2"
                                      style={{
                                        minWidth: Math.max(
                                          660,
                                          departmentPerformanceChartItems.length * 116,
                                        ),
                                      }}
                                    >
                                      {departmentPerformanceChartItems.map((department) => (
                                        <div
                                          key={department.departmentId}
                                          className="min-w-[100px]"
                                        >
                                          <div className="flex h-[220px] items-end justify-center gap-2.5">
                                            <DepartmentStatColumn
                                              value={department.performance}
                                              tone="primary"
                                            />
                                            <DepartmentStatColumn
                                              value={department.departmentKrProgress}
                                              tone="secondary"
                                            />
                                          </div>
                                          <div className="mt-3 text-center">
                                            <p className="text-sm font-semibold text-slate-900">
                                              {department.name}
                                            </p>
                                            <p className="mt-1 text-[11px] text-slate-500">
                                              {department.ownedKrCount} KR
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
                        <p className="mt-3 text-sm text-slate-500">
                          Chưa có cấu hình phòng ban tham gia cho goal này.
                        </p>
                      )}
                    </article>
                  </section>

                  <aside className="xl:sticky xl:self-start">
                    <article className="rounded-2xl border border-slate-200 bg-white px-3.5 pb-3.5 pt-4 lg:px-4 lg:pb-4 lg:pt-5 xl:max-h-[calc(100vh-7rem)] xl:overflow-auto">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-base font-semibold text-slate-900">
                            Thông tin chi tiết
                          </h2>
                        </div>
                      </div>

                      <div className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                            Tiến độ goal
                          </span>
                          <span className="text-lg font-semibold text-slate-900">
                            {goalProgress}%
                          </span>
                        </div>
                        <div className="mt-2">
                          <ProgressBar value={goalProgress} />
                        </div>
                      </div>

                      <div className="mt-3 space-y-2.5">
                        <DetailInfoRow
                          label="Phòng ban tham gia"
                          value={`${goalDepartmentCount}`}
                        />
                        <DetailInfoRow label="Người phụ trách" value={goalOwnerSummary} />
                        <DetailInfoRow label="Loại goal" value={goalTypeLabel} />
                        <DetailInfoRow label="Quý / Năm" value={`${quarterLabel} / ${yearLabel}`} />
                        <DetailInfoRow label="Thời gian" value={goalTimelineLabel} />
                      </div>

                      {goalDepartmentCount > 0 ? (
                        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                            Danh sách phòng ban
                          </p>
                          <p className="mt-1.5 text-sm leading-6 text-slate-700">
                            {goalDepartmentNames}
                          </p>
                        </div>
                      ) : null}

                      <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                        <DetailInfoRow label="Tạo lúc" value={formatDateTime(goal.created_at)} />
                        <DetailInfoRow label="Cập nhật" value={formatDateTime(goal.updated_at)} />
                      </div>
                    </article>
                  </aside>
                </div>
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
                        Cập nhật phân loại, chỉ số, thời gian và tiến độ của KR trong một cửa sổ
                        riêng.
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
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        >
                          {KEY_RESULT_CONTRIBUTION_TYPES.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-medium text-slate-700">
                          Phòng ban phụ trách
                        </span>
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
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
                          disabled
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
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
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
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
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
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            Xem trước tiến độ KR ({modalProgressPreview}%)
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatKeyResultMetric(modalCurrentValue, keyResultScaleForm.unit)}
                            {" / "}
                            {formatKeyResultMetric(modalTargetValue, keyResultScaleForm.unit)}
                          </p>
                        </div>
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
