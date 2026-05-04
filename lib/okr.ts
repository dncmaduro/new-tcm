import { normalizeGoalTypeValue } from "@/lib/constants/goals";
import { normalizeKeyResultContributionTypeValue } from "@/lib/constants/key-results";

type ProgressTaskLike = {
  key_result_id?: string | null;
  keyResultId?: string | null;
  type?: string | null;
  status?: string | null;
  current?: number | null;
  target?: number | null;
  progress?: number | null;
  weight?: number | null;
};

type ProgressKeyResultLike = {
  id: string;
  goal_id?: string | null;
  goalId?: string | null;
  type?: string | null;
  contribution_type?: string | null;
  contributionType?: string | null;
  start_value?: number | null;
  startValue?: number | null;
  current?: number | null;
  target?: number | null;
  weight?: number | null;
  responsible_department_id?: string | null;
  responsibleDepartmentId?: string | null;
};

type ProgressGoalLike = {
  id: string;
  type?: string | null;
  target?: number | null;
};

type GoalDepartmentParticipationLike = {
  goal_id?: string | null;
  goalId?: string | null;
  department_id?: string | null;
  departmentId?: string | null;
  role?: string | null;
  goal_weight?: number | null;
  goalWeight?: number | null;
  kr_weight?: number | null;
  krWeight?: number | null;
};

const normalizeProgress = (value: number | null | undefined) => {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return Math.max(0, Math.min(100, Math.round(safe)));
};

const isDirectKeyResult = <TKeyResult extends ProgressKeyResultLike>(keyResult: TKeyResult) =>
  normalizeKeyResultContributionTypeValue(
    keyResult.contributionType ?? keyResult.contribution_type ?? null,
  ) === "direct";

const computeGoalKeyResultProgress = <TKeyResult extends ProgressKeyResultLike>({
  goalType,
  goalTarget,
  keyResults,
  keyResultProgressMap,
}: {
  goalType: "kpi" | "okr";
  goalTarget?: number | null;
  keyResults: TKeyResult[];
  keyResultProgressMap: Record<string, number>;
}) => {
  const directKeyResults = keyResults.filter(isDirectKeyResult);

  if (directKeyResults.length === 0) {
    return 0;
  }

  if (goalType === "kpi") {
    const safeGoalTarget = Number.isFinite(goalTarget) ? Number(goalTarget) : 0;

    if (safeGoalTarget <= 0) {
      return 0;
    }

    const totalDirectCurrent = directKeyResults.reduce((total, keyResult) => {
      const safeCurrent = Number.isFinite(keyResult.current) ? Number(keyResult.current) : 0;
      return total + safeCurrent;
    }, 0);

    return computeMetricProgress(totalDirectCurrent, 0, safeGoalTarget);
  }

  return computeWeightedProgress(
    directKeyResults.map((keyResult) => ({
      progress: keyResultProgressMap[keyResult.id] ?? 0,
    })),
  );
};

const computeDepartmentKeyResultProgress = <TKeyResult extends ProgressKeyResultLike>({
  goalType,
  keyResults,
  keyResultProgressMap,
}: {
  goalType: "kpi" | "okr";
  keyResults: TKeyResult[];
  keyResultProgressMap: Record<string, number>;
}) => {
  const directKeyResults = keyResults.filter(isDirectKeyResult);

  if (directKeyResults.length === 0) {
    return 0;
  }

  if (goalType === "kpi") {
    const totalCurrent = directKeyResults.reduce((sum, keyResult) => {
      const safeCurrent = Number.isFinite(keyResult.current) ? Number(keyResult.current) : 0;
      return sum + safeCurrent;
    }, 0);
    const totalTarget = directKeyResults.reduce((sum, keyResult) => {
      const safeTarget = Number.isFinite(keyResult.target) ? Number(keyResult.target) : 0;
      return sum + safeTarget;
    }, 0);

    if (totalTarget <= 0) {
      return 0;
    }

    return computeMetricProgress(totalCurrent, 0, totalTarget);
  }

  return computeWeightedProgress(
    directKeyResults.map((keyResult) => ({
      progress: keyResultProgressMap[keyResult.id] ?? 0,
    })),
  );
};

export const getComputedTaskProgress = (task: ProgressTaskLike) => {
  const safeCurrent = Number.isFinite(task.current) ? Number(task.current) : null;
  const safeTarget = Number.isFinite(task.target) ? Number(task.target) : null;

  if (safeCurrent !== null && safeTarget !== null && safeTarget > 0) {
    return computeMetricProgress(safeCurrent, 0, safeTarget);
  }

  return normalizeProgress(task.progress);
};

export const computeWeightedProgress = (
  rows: Array<{ progress: number | null | undefined; weight?: number | null }>,
) => {
  if (!rows.length) {
    return 0;
  }

  const totalProgress = rows.reduce((sum, row) => sum + normalizeProgress(row.progress), 0);
  return normalizeProgress(totalProgress / rows.length);
};

export const computeMetricProgress = (
  current: number | null | undefined,
  startValue: number | null | undefined,
  target: number | null | undefined,
) => {
  const safeCurrent = Number.isFinite(current) ? Number(current) : 0;
  const safeStartValue = Number.isFinite(startValue) ? Number(startValue) : 0;
  const safeTarget = Number.isFinite(target) ? Number(target) : 0;
  const denominator = safeTarget - safeStartValue;

  if (denominator <= 0) {
    return safeCurrent >= safeTarget && safeTarget > safeStartValue ? 100 : 0;
  }

  return normalizeProgress(((safeCurrent - safeStartValue) / denominator) * 100);
};

export const getKeyResultComputedProgress = <TKeyResult extends ProgressKeyResultLike>(
  keyResult: TKeyResult,
) => {
  return computeMetricProgress(
    keyResult.current,
    keyResult.startValue ?? keyResult.start_value,
    keyResult.target,
  );
};

export const buildKeyResultProgressMap = <TKeyResult extends ProgressKeyResultLike>(
  keyResults: TKeyResult[],
  tasks?: ProgressTaskLike[],
) => {
  void tasks;
  return keyResults.reduce<Record<string, number>>((acc, keyResult) => {
    acc[keyResult.id] = getKeyResultComputedProgress(keyResult);
    return acc;
  }, {});
};

export const buildGoalProgressMap = <
  TGoal extends ProgressGoalLike,
  TKeyResult extends ProgressKeyResultLike,
>(
  goals: TGoal[],
  keyResults: TKeyResult[],
  keyResultProgressMap: Record<string, number>,
) => {
  const keyResultsByGoalId = keyResults.reduce<Record<string, TKeyResult[]>>((acc, keyResult) => {
    const goalId = keyResult.goalId ?? keyResult.goal_id ?? null;
    if (!goalId) {
      return acc;
    }
    if (!acc[goalId]) {
      acc[goalId] = [];
    }
    acc[goalId].push(keyResult);
    return acc;
  }, {});

  return goals.reduce<Record<string, number>>((acc, goal) => {
    const goalType = normalizeGoalTypeValue(goal.type ?? null);
    acc[goal.id] = computeGoalKeyResultProgress({
      goalType,
      goalTarget: goal.target ?? null,
      keyResults: keyResultsByGoalId[goal.id] ?? [],
      keyResultProgressMap,
    });
    return acc;
  }, {});
};

export const normalizeParticipationWeights = ({
  goalWeight,
  krWeight,
}: {
  goalWeight?: number | null;
  krWeight?: number | null;
}) => {
  const safeGoalWeight = Number.isFinite(goalWeight) ? Number(goalWeight) : null;
  const safeKrWeight = Number.isFinite(krWeight) ? Number(krWeight) : null;

  if (safeGoalWeight !== null && safeKrWeight !== null && safeGoalWeight + safeKrWeight > 0) {
    const total = safeGoalWeight + safeKrWeight;
    return {
      goalWeight: safeGoalWeight / total,
      krWeight: safeKrWeight / total,
    };
  }

  if (safeGoalWeight !== null && safeGoalWeight >= 0 && safeGoalWeight <= 1) {
    return {
      goalWeight: safeGoalWeight,
      krWeight: 1 - safeGoalWeight,
    };
  }

  if (safeKrWeight !== null && safeKrWeight >= 0 && safeKrWeight <= 1) {
    return {
      goalWeight: 1 - safeKrWeight,
      krWeight: safeKrWeight,
    };
  }

  return {
    goalWeight: 0.5,
    krWeight: 0.5,
  };
};

export const computeDepartmentPerformance = ({
  goalProgress,
  departmentKrProgress,
  goalWeight,
  krWeight,
}: {
  goalProgress: number | null | undefined;
  departmentKrProgress: number | null | undefined;
  goalWeight?: number | null;
  krWeight?: number | null;
}) => {
  const normalizedWeights = normalizeParticipationWeights({ goalWeight, krWeight });
  return normalizeProgress(
    normalizeProgress(goalProgress) * normalizedWeights.goalWeight +
      normalizeProgress(departmentKrProgress) * normalizedWeights.krWeight,
  );
};

export const buildDepartmentKeyResultProgressMap = <
  TGoal extends ProgressGoalLike,
  TGoalDepartment extends GoalDepartmentParticipationLike,
  TKeyResult extends ProgressKeyResultLike,
>(
  goals: TGoal[],
  goalDepartments: TGoalDepartment[],
  keyResults: TKeyResult[],
  keyResultProgressMap: Record<string, number>,
) => {
  const goalsById = goals.reduce<Record<string, TGoal>>((acc, goal) => {
    acc[goal.id] = goal;
    return acc;
  }, {});

  return goalDepartments.reduce<Record<string, number>>((acc, goalDepartment) => {
    const goalId = goalDepartment.goalId ?? goalDepartment.goal_id ?? null;
    const departmentId = goalDepartment.departmentId ?? goalDepartment.department_id ?? null;
    if (!goalId || !departmentId) {
      return acc;
    }

    const ownedKeyResults = keyResults.filter((keyResult) => {
      const keyResultGoalId = keyResult.goalId ?? keyResult.goal_id ?? null;
      const responsibleDepartmentId =
        keyResult.responsibleDepartmentId ?? keyResult.responsible_department_id ?? null;
      return keyResultGoalId === goalId && responsibleDepartmentId === departmentId;
    });

    acc[`${goalId}:${departmentId}`] = computeDepartmentKeyResultProgress({
      goalType: normalizeGoalTypeValue(goalsById[goalId]?.type ?? null),
      keyResults: ownedKeyResults,
      keyResultProgressMap,
    });

    return acc;
  }, {});
};

export const buildGoalDepartmentPerformanceMap = <
  TGoal extends ProgressGoalLike,
  TGoalDepartment extends GoalDepartmentParticipationLike,
  TKeyResult extends ProgressKeyResultLike,
>(
  goals: TGoal[],
  goalDepartments: TGoalDepartment[],
  keyResults: TKeyResult[],
  keyResultProgressMap: Record<string, number>,
  goalProgressMap: Record<string, number>,
) => {
  const departmentKeyResultProgressMap = buildDepartmentKeyResultProgressMap(
    goals,
    goalDepartments,
    keyResults,
    keyResultProgressMap,
  );

  return goalDepartments.reduce<
    Record<
      string,
      {
        goalId: string;
        departmentId: string;
        role: string | null;
        goalWeight: number;
        krWeight: number;
        goalProgress: number;
        departmentKrProgress: number;
        performance: number;
      }
    >
  >((acc, goalDepartment) => {
    const goalId = goalDepartment.goalId ?? goalDepartment.goal_id ?? null;
    const departmentId = goalDepartment.departmentId ?? goalDepartment.department_id ?? null;
    if (!goalId || !departmentId) {
      return acc;
    }

    const weights = normalizeParticipationWeights({
      goalWeight: goalDepartment.goalWeight ?? goalDepartment.goal_weight,
      krWeight: goalDepartment.krWeight ?? goalDepartment.kr_weight,
    });
    const goalProgress = goalProgressMap[goalId] ?? 0;
    const departmentKrProgress = departmentKeyResultProgressMap[`${goalId}:${departmentId}`] ?? 0;
    acc[`${goalId}:${departmentId}`] = {
      goalId,
      departmentId,
      role: goalDepartment.role ?? null,
      goalWeight: weights.goalWeight,
      krWeight: weights.krWeight,
      goalProgress,
      departmentKrProgress,
      performance: computeDepartmentPerformance({
        goalProgress,
        departmentKrProgress,
        goalWeight: weights.goalWeight,
        krWeight: weights.krWeight,
      }),
    };
    return acc;
  }, {});
};

export const normalizeComputedProgress = normalizeProgress;
