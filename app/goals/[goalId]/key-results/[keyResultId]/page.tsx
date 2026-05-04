"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { formatGoalTypeLabel } from "@/lib/constants/goals";
import {
  formatKeyResultContributionTypeLabel,
  formatKeyResultMetric,
  formatKeyResultTypeLabel,
  formatKeyResultUnit,
  getSupportAllocationFieldLabel,
  getKeyResultProgressHint,
  normalizeKeyResultContributionTypeValue,
  usesPercentSupportAllocation,
} from "@/lib/constants/key-results";
import { TASK_TYPES } from "@/lib/constants/tasks";
import {
  buildKeyResultProgressMap,
  computeWeightedProgress,
  getComputedTaskProgress,
} from "@/lib/okr";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";
import {
  formatTimelineRangeVi,
  getTimelineMissingReason,
  getTimelineOutsideParentWarning,
} from "@/lib/timeline";

type GoalRow = {
  id: string;
  name: string;
  type: string | null;
  department_id: string | null;
  target: number | null;
  unit: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type GoalDepartmentLinkRow = {
  department_id: string | null;
  role: string | null;
};

type KeyResultDetailRow = {
  id: string;
  goal_id: string;
  name: string;
  description: string | null;
  type: string | null;
  contribution_type: string | null;
  start_value: number | null;
  target: number | null;
  current: number | null;
  unit: string | null;
  weight: number | null;
  responsible_department_id: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type DepartmentRow = {
  id: string;
  name: string;
};

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type TaskRow = {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  progress: number | null;
  weight: number | null;
  assignee_id: string | null;
  profile_id: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type KeyResultTaskItem = {
  id: string;
  name: string;
  type: string | null;
  typeLabel: string;
  progress: number;
  weight: number;
  assigneeId: string | null;
  assigneeName: string;
  startDate: string | null;
  endDate: string | null;
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

type OutboundSupportLinkItem = SupportLinkRow & {
  targetKeyResult: KeyResultLinkOption | null;
};

type InboundSupportLinkItem = SupportLinkRow & {
  supportKeyResult: KeyResultLinkOption | null;
};

const taskTypeLabelMap = TASK_TYPES.reduce<Record<string, string>>((acc, type) => {
  acc[type.value] = type.label;
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

const formatOptionalMetric = (value: number | null, unit: string | null) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "Chưa đặt";
  }
  return formatKeyResultMetric(Number(value), unit);
};

const formatOptionalPercent = (value: number | null) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "Chưa đặt";
  }
  return `${Math.round(Number(value) * 100) / 100}%`;
};

const getSupportAllocationSummary = ({
  allocatedValue,
  allocatedPercent,
  unit,
}: {
  allocatedValue: number | null;
  allocatedPercent: number | null;
  unit: string | null;
}) => {
  if (usesPercentSupportAllocation(unit)) {
    return {
      label: getSupportAllocationFieldLabel(unit),
      shortLabel: "Phần trăm",
      value: formatOptionalPercent(allocatedPercent),
    };
  }

  return {
    label: getSupportAllocationFieldLabel(unit),
    shortLabel: "Lượng",
    value: formatOptionalMetric(allocatedValue, unit),
  };
};

const toNumericInput = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "";
  }
  return String(Number(value));
};

const normalizeKeyResultLinkOption = (value: Record<string, unknown>): KeyResultLinkOption => {
  const rawGoal = Array.isArray(value.goal) ? (value.goal[0] ?? null) : (value.goal ?? null);
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

const keyResultLinkHref = (keyResult: KeyResultLinkOption | null) =>
  keyResult?.goalId ? `/goals/${keyResult.goalId}/key-results/${keyResult.id}` : null;

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default function KeyResultDetailPage() {
  const params = useParams<{ goalId: string; keyResultId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceAccess = useWorkspaceAccess();
  const goalId = typeof params.goalId === "string" ? params.goalId : "";
  const keyResultId = typeof params.keyResultId === "string" ? params.keyResultId : "";
  const hasValidParams = Boolean(goalId && keyResultId);

  const [goal, setGoal] = useState<GoalRow | null>(null);
  const [keyResult, setKeyResult] = useState<KeyResultDetailRow | null>(null);
  const [goalDepartmentName, setGoalDepartmentName] = useState<string | null>(null);
  const [responsibleDepartmentName, setResponsibleDepartmentName] = useState<string | null>(null);
  const [tasks, setTasks] = useState<KeyResultTaskItem[]>([]);
  const [outboundSupportLinks, setOutboundSupportLinks] = useState<OutboundSupportLinkItem[]>([]);
  const [inboundSupportLinks, setInboundSupportLinks] = useState<InboundSupportLinkItem[]>([]);
  const [currentMetricDraft, setCurrentMetricDraft] = useState("");
  const [isEditingCurrentMetric, setIsEditingCurrentMetric] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSupportLinks, setIsLoadingSupportLinks] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [taskLoadError, setTaskLoadError] = useState<string | null>(null);
  const [supportLinkError, setSupportLinkError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSavingCurrentMetric, setIsSavingCurrentMetric] = useState(false);
  const [isDeletingKeyResult, setIsDeletingKeyResult] = useState(false);

  const isCheckingCreatePermission = workspaceAccess.isLoading;
  const canCreateTask = workspaceAccess.canManage && !workspaceAccess.error;
  const statusNotice =
    searchParams.get("created") === "1"
      ? "Đã tạo KR."
      : searchParams.get("updated") === "1"
        ? "Đã cập nhật KR."
        : searchParams.get("taskCreated") === "1"
          ? "Đã tạo công việc và gắn vào KR."
          : null;

  const loadSupportRelationshipData = useCallback(async (currentKeyResultId: string) => {
    setIsLoadingSupportLinks(true);
    setSupportLinkError(null);

    const [
      { data: outboundRows, error: outboundError },
      { data: inboundRows, error: inboundError },
      { data: directRows, error: directError },
    ] = await Promise.all([
      supabase
        .from("key_result_support_links")
        .select(
          "id,support_key_result_id,target_key_result_id,allocated_value,allocated_percent,note,created_at,updated_at",
        )
        .eq("support_key_result_id", currentKeyResultId)
        .order("created_at", { ascending: false }),
      supabase
        .from("key_result_support_links")
        .select(
          "id,support_key_result_id,target_key_result_id,allocated_value,allocated_percent,note,created_at,updated_at",
        )
        .eq("target_key_result_id", currentKeyResultId)
        .order("created_at", { ascending: false }),
      supabase
        .from("key_results")
        .select(
          "id,goal_id,name,type,contribution_type,unit,goal:goals!key_results_goal_id_fkey(id,name),created_at",
        )
        .eq("contribution_type", "direct")
        .neq("id", currentKeyResultId)
        .order("created_at", { ascending: false }),
    ]);

    if (outboundError || inboundError || directError) {
      setOutboundSupportLinks([]);
      setInboundSupportLinks([]);
      setSupportLinkError(
        outboundError?.message ||
          inboundError?.message ||
          directError?.message ||
          "Không tải được dữ liệu liên kết hỗ trợ.",
      );
      setIsLoadingSupportLinks(false);
      return;
    }

    const directOptions = ((directRows ?? []) as Array<Record<string, unknown>>).map((row) =>
      normalizeKeyResultLinkOption(row),
    );
    const directOptionsById = directOptions.reduce<Record<string, KeyResultLinkOption>>(
      (acc, item) => {
        acc[item.id] = item;
        return acc;
      },
      {},
    );

    const relatedIds = [
      ...new Set(
        [
          ...((outboundRows ?? []) as Array<Record<string, unknown>>).map((row) =>
            row.target_key_result_id ? String(row.target_key_result_id) : null,
          ),
          ...((inboundRows ?? []) as Array<Record<string, unknown>>).map((row) =>
            row.support_key_result_id ? String(row.support_key_result_id) : null,
          ),
        ].filter(Boolean),
      ),
    ] as string[];

    const missingRelatedIds = relatedIds.filter((id) => !directOptionsById[id]);
    const { data: relatedKeyResultRows, error: relatedKeyResultError } =
      missingRelatedIds.length > 0
        ? await supabase
            .from("key_results")
            .select(
              "id,goal_id,name,type,contribution_type,unit,goal:goals!key_results_goal_id_fkey(id,name)",
            )
            .in("id", missingRelatedIds)
        : { data: [], error: null };

    if (relatedKeyResultError) {
      setOutboundSupportLinks([]);
      setInboundSupportLinks([]);
      setSupportLinkError(relatedKeyResultError.message || "Không tải được chi tiết KR liên kết.");
      setIsLoadingSupportLinks(false);
      return;
    }

    const relatedOptions = [
      ...directOptions,
      ...((relatedKeyResultRows ?? []) as Array<Record<string, unknown>>).map((row) =>
        normalizeKeyResultLinkOption(row),
      ),
    ].reduce<Record<string, KeyResultLinkOption>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});

    setOutboundSupportLinks(
      ((outboundRows ?? []) as Array<Record<string, unknown>>).map((row) => {
        const normalized = normalizeSupportLinkRow(row);
        return {
          ...normalized,
          targetKeyResult: relatedOptions[normalized.target_key_result_id] ?? null,
        };
      }),
    );
    setInboundSupportLinks(
      ((inboundRows ?? []) as Array<Record<string, unknown>>).map((row) => {
        const normalized = normalizeSupportLinkRow(row);
        return {
          ...normalized,
          supportKeyResult: relatedOptions[normalized.support_key_result_id] ?? null,
        };
      }),
    );
    setIsLoadingSupportLinks(false);
  }, []);

  useEffect(() => {
    if (!hasValidParams) {
      return;
    }

    let isActive = true;

    const loadData = async () => {
      setIsLoading(true);
      setLoadError(null);
      setTaskLoadError(null);
      setSupportLinkError(null);
      setActionError(null);
      setNotice(null);

      const [{ data: goalData, error: goalError }, { data: keyResultData, error: keyResultError }] =
        await Promise.all([
          supabase
            .from("goals")
            .select(
              "id,name,type,department_id,target,unit,start_date,end_date,created_at,updated_at",
            )
            .eq("id", goalId)
            .maybeSingle(),
          supabase
            .from("key_results")
            .select(
              "id,goal_id,name,description,type,contribution_type,start_value,target,current,unit,weight,responsible_department_id,start_date,end_date,created_at,updated_at",
            )
            .eq("id", keyResultId)
            .eq("goal_id", goalId)
            .maybeSingle(),
        ]);

      if (!isActive) {
        return;
      }

      if (goalError || !goalData) {
        setGoal(null);
        setKeyResult(null);
        setGoalDepartmentName(null);
        setResponsibleDepartmentName(null);
        setTasks([]);
        setOutboundSupportLinks([]);
        setInboundSupportLinks([]);
        setLoadError(goalError?.message || "Không tải được mục tiêu liên kết.");
        setIsLoading(false);
        return;
      }

      if (keyResultError || !keyResultData) {
        setGoal(goalData as GoalRow);
        setKeyResult(null);
        setGoalDepartmentName(null);
        setResponsibleDepartmentName(null);
        setTasks([]);
        setOutboundSupportLinks([]);
        setInboundSupportLinks([]);
        setLoadError(keyResultError?.message || "Không tìm thấy KR.");
        setIsLoading(false);
        return;
      }

      const typedGoal = {
        ...(goalData as GoalRow),
        id: String(goalData.id),
        department_id: goalData.department_id ? String(goalData.department_id) : null,
      } satisfies GoalRow;
      const typedKeyResult = {
        ...(keyResultData as KeyResultDetailRow),
        id: String(keyResultData.id),
        goal_id: String(keyResultData.goal_id),
        responsible_department_id: keyResultData.responsible_department_id
          ? String(keyResultData.responsible_department_id)
          : null,
      } satisfies KeyResultDetailRow;

      setGoal(typedGoal);
      setKeyResult(typedKeyResult);
      setCurrentMetricDraft(toNumericInput(typedKeyResult.current));
      setIsEditingCurrentMetric(false);

      const [{ data: tasksData, error: tasksError }, { data: goalDepartmentData }] =
        await Promise.all([
          supabase
            .from("tasks")
            .select(
              "id,name,type,weight,assignee_id,profile_id,start_date,end_date,created_at,updated_at",
            )
            .eq("key_result_id", typedKeyResult.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("goal_departments")
            .select("department_id,role")
            .eq("goal_id", typedGoal.id),
        ]);

      const relatedDepartmentIds = Array.from(
        new Set(
          [
            typedGoal.department_id,
            typedKeyResult.responsible_department_id,
            ...((goalDepartmentData ?? []) as GoalDepartmentLinkRow[]).map(
              (item) => item.department_id,
            ),
          ].filter(Boolean),
        ),
      ) as string[];

      const { data: departmentsData } =
        relatedDepartmentIds.length > 0
          ? await supabase.from("departments").select("id,name").in("id", relatedDepartmentIds)
          : { data: [] };

      if (!isActive) {
        return;
      }

      const departmentNameById = ((departmentsData ?? []) as DepartmentRow[]).reduce<
        Record<string, string>
      >((acc, department) => {
        acc[String(department.id)] = String(department.name);
        return acc;
      }, {});

      setGoalDepartmentName(
        typedGoal.department_id
          ? (departmentNameById[typedGoal.department_id] ?? "Phòng ban")
          : null,
      );
      setResponsibleDepartmentName(
        typedKeyResult.responsible_department_id
          ? (departmentNameById[typedKeyResult.responsible_department_id] ?? "Phòng ban phụ trách")
          : null,
      );
      if (tasksError) {
        setTasks([]);
        setTaskLoadError("Không tải được danh sách công việc của KR.");
      } else {
        const typedTasks = ((tasksData ?? []) as TaskRow[]).map((task) => ({
          ...task,
          id: String(task.id),
          assignee_id: task.assignee_id ? String(task.assignee_id) : null,
          profile_id: task.profile_id ? String(task.profile_id) : null,
        }));

        const profileIds = [
          ...new Set(
            typedTasks.flatMap((task) => [task.assignee_id, task.profile_id]).filter(Boolean),
          ),
        ] as string[];
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

        setTasks(
          typedTasks.map((task) => {
            const effectiveAssigneeId = task.assignee_id ?? task.profile_id;
            return {
              id: task.id,
              name: String(task.name),
              type: task.type ? String(task.type) : null,
              typeLabel: task.type ? (taskTypeLabelMap[task.type] ?? task.type) : "KPI",
              progress: getComputedTaskProgress(task),
              weight: typeof task.weight === "number" ? task.weight : Number(task.weight ?? 1),
              assigneeId: effectiveAssigneeId,
              assigneeName: effectiveAssigneeId
                ? (profileNameById[effectiveAssigneeId] ?? "Chưa gán")
                : "Chưa gán",
              startDate: task.start_date ? String(task.start_date) : null,
              endDate: task.end_date ? String(task.end_date) : null,
            } satisfies KeyResultTaskItem;
          }),
        );
      }

      await loadSupportRelationshipData(typedKeyResult.id);

      if (!isActive) {
        return;
      }

      setIsLoading(false);
    };

    void loadData();

    return () => {
      isActive = false;
    };
  }, [goalId, hasValidParams, keyResultId, loadSupportRelationshipData]);

  const keyResultProgressMap = useMemo(() => {
    if (!keyResult) {
      return {};
    }

    return buildKeyResultProgressMap([keyResult]);
  }, [keyResult]);

  const keyResultProgress = useMemo(() => {
    if (!keyResult) {
      return 0;
    }
    return keyResultProgressMap[keyResult.id] ?? 0;
  }, [keyResult, keyResultProgressMap]);

  const executionAverageTaskProgress = useMemo(() => computeWeightedProgress(tasks), [tasks]);
  const taskCompletionRate = useMemo(() => {
    if (!tasks.length) {
      return 0;
    }

    const doneCount = tasks.filter((task) => task.progress >= 100).length;
    return Math.round((doneCount / tasks.length) * 100);
  }, [tasks]);

  const tasksByProgressBand = useMemo(
    () => [
      {
        value: "not_started",
        label: "Chưa bắt đầu",
        count: tasks.filter((task) => task.progress <= 0).length,
      },
      {
        value: "in_execution",
        label: "Đang thực thi",
        count: tasks.filter((task) => task.progress > 0 && task.progress < 100).length,
      },
      {
        value: "done",
        label: "Hoàn thành",
        count: tasks.filter((task) => task.progress >= 100).length,
      },
    ],
    [tasks],
  );

  const goalHref = goal ? `/goals/${goal.id}` : "/goals";
  const createTaskHref = useMemo(() => {
    if (!hasValidParams) {
      return "/tasks/new";
    }

    const query = new URLSearchParams({
      goalId,
      keyResultId,
    });

    const departmentId = keyResult?.responsible_department_id ?? goal?.department_id ?? null;
    if (departmentId) {
      query.set("departmentId", departmentId);
    }

    return `/tasks/new?${query.toString()}`;
  }, [goal, goalId, hasValidParams, keyResult, keyResultId]);

  const editKeyResultHref = useMemo(() => {
    if (!hasValidParams || !goal || !keyResult) {
      return "#";
    }

    return `/goals/${goalId}/key-results/${keyResultId}/edit`;
  }, [goal, goalId, hasValidParams, keyResult, keyResultId]);

  const progressHint = keyResult ? getKeyResultProgressHint(keyResult.unit) : "";
  const isSupportKeyResult =
    normalizeKeyResultContributionTypeValue(keyResult?.contribution_type) === "support";

  const handleSaveCurrentMetric = async () => {
    if (!keyResult || isSavingCurrentMetric) {
      return;
    }

    const safeCurrent = Number(currentMetricDraft);
    if (!Number.isFinite(safeCurrent)) {
      setActionError("Tiến độ của KR phải là số hợp lệ.");
      return;
    }

    setIsSavingCurrentMetric(true);
    setActionError(null);
    setNotice(null);

    const { data, error } = await supabase
      .from("key_results")
      .update({ current: safeCurrent })
      .eq("id", keyResult.id)
      .select(
        "id,goal_id,name,description,type,contribution_type,start_value,target,current,unit,weight,responsible_department_id,start_date,end_date,created_at,updated_at",
      )
      .maybeSingle();

    if (error || !data) {
      setActionError(error?.message || "Không thể cập nhật tiến độ của KR.");
      setIsSavingCurrentMetric(false);
      return;
    }

    const nextKeyResult = {
      ...(data as KeyResultDetailRow),
      id: String(data.id),
      goal_id: String(data.goal_id),
      responsible_department_id: data.responsible_department_id
        ? String(data.responsible_department_id)
        : null,
    } satisfies KeyResultDetailRow;

    setKeyResult(nextKeyResult);
    setCurrentMetricDraft(toNumericInput(nextKeyResult.current));
    setIsEditingCurrentMetric(false);
    setNotice("Đã cập nhật tiến độ của KR.");
    setIsSavingCurrentMetric(false);
  };

  const handleDeleteKeyResult = async () => {
    if (!keyResult || isDeletingKeyResult) {
      return;
    }

    const relatedTaskCount = tasks.length;
    const relatedSupportLinkCount = outboundSupportLinks.length + inboundSupportLinks.length;
    const relatedItems: string[] = [];

    if (relatedTaskCount > 0) {
      relatedItems.push(`${relatedTaskCount} công việc`);
    }
    if (relatedSupportLinkCount > 0) {
      relatedItems.push(`${relatedSupportLinkCount} liên kết hỗ trợ`);
    }

    const relatedWarning =
      relatedItems.length > 0
        ? ` Thao tác này cũng sẽ xóa ${relatedItems.join(" và ")} liên quan.`
        : "";

    if (!window.confirm(`Xóa KR "${keyResult.name}"?${relatedWarning}`)) {
      return;
    }

    setIsDeletingKeyResult(true);
    setActionError(null);
    setNotice(null);

    const deleteOutboundLinksResult = await supabase
      .from("key_result_support_links")
      .delete()
      .eq("support_key_result_id", keyResult.id);

    if (deleteOutboundLinksResult.error) {
      setActionError(
        deleteOutboundLinksResult.error.message ||
          "Không thể xóa các liên kết hỗ trợ đi ra của KR.",
      );
      setIsDeletingKeyResult(false);
      return;
    }

    const deleteInboundLinksResult = await supabase
      .from("key_result_support_links")
      .delete()
      .eq("target_key_result_id", keyResult.id);

    if (deleteInboundLinksResult.error) {
      setActionError(
        deleteInboundLinksResult.error.message ||
          "Không thể xóa các liên kết hỗ trợ đi vào của KR.",
      );
      setIsDeletingKeyResult(false);
      return;
    }

    const deleteTasksResult = await supabase
      .from("tasks")
      .delete()
      .eq("key_result_id", keyResult.id);

    if (deleteTasksResult.error) {
      setActionError(deleteTasksResult.error.message || "Không thể xóa công việc của KR.");
      setIsDeletingKeyResult(false);
      return;
    }

    const deleteKeyResultResult = await supabase
      .from("key_results")
      .delete()
      .eq("id", keyResult.id);

    if (deleteKeyResultResult.error) {
      setActionError(deleteKeyResultResult.error.message || "Không thể xóa KR.");
      setIsDeletingKeyResult(false);
      return;
    }

    router.push(`${goalHref}?krDeleted=1`);
  };

  return (
    <div className="h-screen overflow-hidden bg-[#f3f5fa] text-slate-900">
      <div className="flex h-full w-full">
        <WorkspaceSidebar active="goals" />

        <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader
            title={keyResult?.name ?? "Chi tiết KR"}
            items={[
              { label: "Mục tiêu", href: "/goals" },
              ...(goal ? [{ label: goal.name, href: goalHref }] : []),
              { label: keyResult?.name ?? "Chi tiết KR" },
            ]}
          />

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-7">
            <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
              {workspaceAccess.canManage && !workspaceAccess.error && keyResult ? (
                <Link
                  href={editKeyResultHref}
                  className="inline-flex h-9 items-center rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                >
                  Chỉnh sửa KR
                </Link>
              ) : null}
              {workspaceAccess.canManage && !workspaceAccess.error && keyResult ? (
                <Link
                  href={createTaskHref}
                  className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  + Thêm công việc
                </Link>
              ) : null}
              {workspaceAccess.canManage && !workspaceAccess.error && keyResult ? (
                <button
                  type="button"
                  onClick={() => void handleDeleteKeyResult()}
                  disabled={isDeletingKeyResult}
                  className="inline-flex h-9 items-center rounded-xl border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDeletingKeyResult ? "Đang xóa..." : "Xóa KR"}
                </button>
              ) : null}
            </div>
            {!hasValidParams ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
                Thiếu mã mục tiêu hoặc mã KR.
              </div>
            ) : null}

            {hasValidParams && isLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">
                Đang tải chi tiết KR...
              </div>
            ) : null}

            {hasValidParams && !isLoading && loadError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
                {loadError}
              </div>
            ) : null}

            {!isLoading && actionError ? (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {actionError}
              </div>
            ) : null}

            {!isLoading && notice ? (
              <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {notice}
              </div>
            ) : null}

            {hasValidParams && !isLoading && !loadError && goal && keyResult ? (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="space-y-5">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-slate-500">
                          Thuộc mục tiêu{" "}
                          <Link
                            href={goalHref}
                            className="font-medium text-blue-700 hover:text-blue-800"
                          >
                            {goal.name}
                          </Link>
                        </p>
                        <div className="mt-2 flex flex-wrap items-end gap-3">
                          <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-slate-900">
                            {keyResult.name}
                          </h1>
                          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                            {keyResultProgress}%
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
                            {formatKeyResultTypeLabel(keyResult.type)}
                          </span>
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
                            {formatKeyResultContributionTypeLabel(keyResult.contribution_type)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                            {responsibleDepartmentName ?? "Chưa gán phòng ban"}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                            {formatKeyResultUnit(keyResult.unit)}
                          </span>
                        </div>
                      </div>

                      <div className="grid min-w-[280px] flex-1 gap-3 sm:grid-cols-3">
                        <MetricCard
                          label="Bắt đầu"
                          value={formatKeyResultMetric(keyResult.start_value, keyResult.unit)}
                        />
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                                Hiện tại
                              </p>
                              {isEditingCurrentMetric ? (
                                <div className="mt-2 space-y-2">
                                  <FormattedNumberInput
                                    value={currentMetricDraft}
                                    onValueChange={(value) => setCurrentMetricDraft(value)}
                                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                  />
                                  <p className="text-[11px] text-slate-500">
                                    Đơn vị tiến độ: {formatKeyResultUnit(keyResult.unit)}.
                                  </p>
                                </div>
                              ) : (
                                <p className="mt-2 text-2xl font-semibold text-slate-900">
                                  {formatKeyResultMetric(keyResult.current, keyResult.unit)}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {isEditingCurrentMetric ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCurrentMetricDraft(toNumericInput(keyResult.current));
                                    setIsEditingCurrentMetric(false);
                                  }}
                                  disabled={isSavingCurrentMetric}
                                  className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Hủy
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleSaveCurrentMetric()}
                                  disabled={isSavingCurrentMetric}
                                  className="inline-flex h-9 items-center rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                                >
                                  {isSavingCurrentMetric ? "Đang lưu..." : "Lưu tiến độ"}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setCurrentMetricDraft(toNumericInput(keyResult.current));
                                  setIsEditingCurrentMetric(true);
                                }}
                                className="inline-flex h-9 items-center rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                              >
                                Cập nhật tiến độ
                              </button>
                            )}
                          </div>
                        </div>
                        <MetricCard
                          label="Mục tiêu"
                          value={formatKeyResultMetric(keyResult.target, keyResult.unit)}
                        />
                      </div>
                    </div>

                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-700">Tiến độ KR</span>
                        <span className="font-semibold text-slate-900">{keyResultProgress}%</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-blue-600"
                          style={{ width: `${keyResultProgress}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">{progressHint}</p>
                    </div>

                    {statusNotice ? (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                        {statusNotice}
                      </div>
                    ) : null}

                    {!isCheckingCreatePermission && !canCreateTask ? (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                        Tài khoản hiện tại chưa có quyền tạo công việc cho KR này.
                      </div>
                    ) : null}
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="text-base font-semibold text-slate-900">Mô tả</h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">
                      {keyResult.description?.trim() || "Chưa có mô tả."}
                    </p>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">
                          {isSupportKeyResult
                            ? "Các KR trực tiếp đang được hỗ trợ"
                            : "Các KR hỗ trợ"}
                        </h2>
                      </div>
                      <div className="text-xs font-semibold text-slate-500">
                        {isSupportKeyResult
                          ? `Hỗ trợ ${outboundSupportLinks.length} KR`
                          : `Được ${inboundSupportLinks.length} KR hỗ trợ`}
                      </div>
                    </div>

                    {supportLinkError ? (
                      <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {supportLinkError}
                      </p>
                    ) : null}

                    {isSupportKeyResult ? (
                      <div className="mt-4 space-y-4">
                        {!isLoadingSupportLinks && outboundSupportLinks.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                            <p className="text-lg font-semibold text-slate-900">
                              Chưa có liên kết hỗ trợ.
                            </p>
                            <p className="mt-2 text-sm text-slate-500">
                              KR hỗ trợ nên được nối tới một hoặc nhiều KR trực tiếp để thể hiện
                              phạm vi đóng góp.
                            </p>
                          </div>
                        ) : null}

                        {outboundSupportLinks.map((link) => {
                          const href = keyResultLinkHref(link.targetKeyResult);
                          const allocationSummary = getSupportAllocationSummary({
                            allocatedValue: link.allocated_value,
                            allocatedPercent: link.allocated_percent,
                            unit: keyResult.unit,
                          });

                          return (
                            <div
                              key={link.id}
                              className="rounded-2xl border border-slate-200 bg-white p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                                    KR trực tiếp nhận hỗ trợ
                                  </p>
                                  {href ? (
                                    <Link
                                      href={href}
                                      className="mt-1 inline-flex text-lg font-semibold text-slate-900 hover:text-blue-700"
                                    >
                                      {link.targetKeyResult?.name ?? "KR trực tiếp"}
                                    </Link>
                                  ) : (
                                    <p className="mt-1 text-lg font-semibold text-slate-900">
                                      {link.targetKeyResult?.name ?? "KR trực tiếp"}
                                    </p>
                                  )}
                                  <p className="mt-1 text-xs text-slate-500">
                                    {link.targetKeyResult?.goalName ?? "Chưa có mục tiêu"} ·{" "}
                                    {formatKeyResultTypeLabel(link.targetKeyResult?.type)} ·{" "}
                                    {formatKeyResultContributionTypeLabel(
                                      link.targetKeyResult?.contributionType,
                                    )}
                                  </p>
                                </div>
                                <p className="text-xs text-slate-500">
                                  Cập nhật lần cuối: {formatDateTime(link.updated_at)}
                                </p>
                              </div>

                              <div className="mt-4 max-w-xs rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                                  {allocationSummary.label}
                                </p>
                                <p className="mt-2 text-sm font-semibold text-slate-900">
                                  {allocationSummary.value}
                                </p>
                              </div>

                              <p className="mt-3 text-sm text-slate-600">
                                {link.note?.trim() || "Chưa có ghi chú liên kết."}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <>
                        {!isLoadingSupportLinks && inboundSupportLinks.length === 0 ? (
                          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                            <p className="text-lg font-semibold text-slate-900">
                              Chưa có KR hỗ trợ liên kết.
                            </p>
                            <p className="mt-2 text-sm text-slate-500">
                              Khi một KR hỗ trợ được phân bổ sang KR trực tiếp này, nó sẽ xuất hiện
                              tại đây.
                            </p>
                          </div>
                        ) : null}

                        {inboundSupportLinks.length > 0 ? (
                          <div className="mt-4 space-y-3">
                            {inboundSupportLinks.map((link) => {
                              const href = keyResultLinkHref(link.supportKeyResult);
                              const allocationSummary = getSupportAllocationSummary({
                                allocatedValue: link.allocated_value,
                                allocatedPercent: link.allocated_percent,
                                unit: link.supportKeyResult?.unit ?? null,
                              });
                              return (
                                <div
                                  key={link.id}
                                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                                        KR hỗ trợ
                                      </p>
                                      {href ? (
                                        <Link
                                          href={href}
                                          className="mt-1 inline-flex text-lg font-semibold text-slate-900 hover:text-blue-700"
                                        >
                                          {link.supportKeyResult?.name ?? "KR hỗ trợ"}
                                        </Link>
                                      ) : (
                                        <p className="mt-1 text-lg font-semibold text-slate-900">
                                          {link.supportKeyResult?.name ?? "KR hỗ trợ"}
                                        </p>
                                      )}
                                      <p className="mt-1 text-xs text-slate-500">
                                        {link.supportKeyResult?.goalName ?? "Chưa có mục tiêu"} ·{" "}
                                        {formatKeyResultTypeLabel(link.supportKeyResult?.type)} ·{" "}
                                        {formatKeyResultContributionTypeLabel(
                                          link.supportKeyResult?.contributionType,
                                        )}
                                      </p>
                                    </div>

                                    <div>
                                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                                        {allocationSummary.shortLabel}: {allocationSummary.value}
                                      </span>
                                    </div>
                                  </div>
                                  <p className="mt-3 text-sm text-slate-600">
                                    {link.note?.trim() || "Chưa có ghi chú liên kết."}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </>
                    )}
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">
                          Công việc thực thi của KR
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                          Công việc chỉ theo dõi phần thực thi. Tiến độ đo lường của KR vẫn lấy trực
                          tiếp từ giá trị hiện tại và chỉ tiêu.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {tasks.length} công việc
                        </span>
                        {canCreateTask ? (
                          <Link
                            href={createTaskHref}
                            className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            + Thêm công việc
                          </Link>
                        ) : null}
                      </div>
                    </div>

                    {taskLoadError ? (
                      <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {taskLoadError}
                      </p>
                    ) : null}

                    {!taskLoadError && tasks.length === 0 ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                        <p className="text-lg font-semibold text-slate-900">
                          KR này chưa có công việc.
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          Hãy thêm công việc để bắt đầu triển khai. Công việc sẽ không tự cộng vào
                          tiến độ của KR.
                        </p>
                        {canCreateTask ? (
                          <Link
                            href={createTaskHref}
                            className="mt-4 inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                          >
                            + Thêm công việc đầu tiên
                          </Link>
                        ) : null}
                      </div>
                    ) : null}

                    {!taskLoadError && tasks.length > 0 ? (
                      <>
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                              Trung bình tiến độ thực thi
                            </p>
                            <p className="mt-2 text-2xl font-semibold text-slate-900">
                              {executionAverageTaskProgress}%
                            </p>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                              Tỷ lệ công việc hoàn thành
                            </p>
                            <p className="mt-2 text-2xl font-semibold text-slate-900">
                              {taskCompletionRate}%
                            </p>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                              Ghi chú
                            </p>
                            <p className="mt-2 text-sm text-slate-700">
                              Các chỉ số này chỉ phản ánh phần thực thi, không phải chỉ số đo lường
                              chính của KR.
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[1120px] text-left">
                              <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-[0.08em] text-slate-400">
                                  <th className="px-4 py-3 font-semibold">Công việc</th>
                                  <th className="px-4 py-3 font-semibold">Người phụ trách</th>
                                  <th className="px-4 py-3 font-semibold">Tiến độ thực thi</th>
                                  <th className="px-4 py-3 font-semibold">Thời gian thực thi</th>
                                  <th className="px-4 py-3 font-semibold">Thao tác</th>
                                </tr>
                              </thead>
                              <tbody>
                                {tasks.map((task) => {
                                  const timelineHint =
                                    getTimelineMissingReason(
                                      task.startDate,
                                      task.endDate,
                                      "Công việc chưa có mốc thời gian",
                                      "Mốc thời gian công việc không hợp lệ",
                                    ) ?? "Nằm trong khung thời gian của KR";
                                  const alignmentWarning = getTimelineOutsideParentWarning(
                                    task.startDate,
                                    task.endDate,
                                    keyResult.start_date,
                                    keyResult.end_date,
                                    {
                                      subjectLabel: "Thời gian công việc",
                                      parentLabel: "KR",
                                    },
                                  );

                                  return (
                                    <Fragment key={task.id}>
                                      <tr className="border-b border-slate-100 align-top hover:bg-slate-50/70">
                                        <td className="px-4 py-4">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <Link
                                              href={`/tasks/${task.id}`}
                                              className="text-sm font-semibold text-slate-900 hover:text-blue-700"
                                            >
                                              {task.name}
                                            </Link>
                                            <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                              {task.typeLabel}
                                            </span>
                                          </div>
                                        </td>
                                        <td className="px-4 py-4">
                                          <span
                                            className={`text-sm ${task.assigneeId ? "text-slate-700" : "text-slate-400"}`}
                                          >
                                            {task.assigneeName}
                                          </span>
                                        </td>
                                        <td className="px-4 py-4">
                                          <div className="w-[140px]">
                                            <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                                              <span className="text-slate-700">
                                                {task.progress}%
                                              </span>
                                              <span className="text-slate-400">Công việc</span>
                                            </div>
                                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                                              <div
                                                className="h-full rounded-full bg-blue-600"
                                                style={{ width: `${task.progress}%` }}
                                              />
                                            </div>
                                          </div>
                                        </td>
                                        <td className="px-4 py-4 text-sm text-slate-600">
                                          <p className="font-medium text-slate-700">
                                            {formatTimelineRangeVi(task.startDate, task.endDate, {
                                              fallback: "Công việc chưa có mốc thời gian",
                                            })}
                                          </p>
                                          <p className="mt-1 text-xs text-slate-400">
                                            {timelineHint}
                                          </p>
                                          {alignmentWarning ? (
                                            <p className="mt-1 text-xs text-amber-600">
                                              {alignmentWarning}
                                            </p>
                                          ) : null}
                                        </td>
                                        <td className="px-4 py-4">
                                          <Link
                                            href={`/tasks/${task.id}`}
                                            className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                          >
                                            Chi tiết
                                          </Link>
                                        </td>
                                      </tr>
                                    </Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </article>
                </section>

                <aside className="h-fit space-y-5">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="text-base font-semibold text-slate-900">Thông tin KR</h2>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Mục tiêu</span>
                        <Link
                          href={goalHref}
                          className="text-right font-medium text-blue-600 hover:text-blue-700"
                        >
                          {goal.name}
                        </Link>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Loại mục tiêu</span>
                        <span className="text-right font-medium text-slate-800">
                          {formatGoalTypeLabel(goal.type)}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Loại kết quả</span>
                        <span className="text-right font-medium text-slate-800">
                          {formatKeyResultTypeLabel(keyResult.type)}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Kiểu đóng góp</span>
                        <span className="text-right font-medium text-slate-800">
                          {formatKeyResultContributionTypeLabel(keyResult.contribution_type)}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Phòng ban chính</span>
                        <span className="text-right font-medium text-slate-800">
                          {goalDepartmentName ?? "Chưa có phòng ban"}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Phòng ban phụ trách</span>
                        <span className="text-right font-medium text-slate-800">
                          {responsibleDepartmentName ?? "Chưa gán"}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Chỉ tiêu mục tiêu</span>
                        <span className="text-right font-medium text-slate-800">
                          {formatOptionalMetric(goal.target, goal.unit)}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Đơn vị đo</span>
                        <span className="text-right font-medium text-slate-800">
                          {formatKeyResultUnit(keyResult.unit)}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Hiện tại / KPI</span>
                        <span className="text-right font-medium text-slate-800">
                          {formatKeyResultMetric(keyResult.current, keyResult.unit)}
                          {" / "}
                          {formatKeyResultMetric(keyResult.target, keyResult.unit)}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Khung thời gian</span>
                        <span className="text-right font-medium text-slate-800">
                          {formatTimelineRangeVi(keyResult.start_date, keyResult.end_date, {
                            fallback: "KR chưa có mốc thời gian",
                          })}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3 border-t border-slate-100 pt-3">
                        <span className="text-slate-500">Thời gian tạo</span>
                        <span className="text-right font-medium text-slate-800">
                          {formatDateTime(keyResult.created_at)}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Cập nhật lần cuối</span>
                        <span className="text-right font-medium text-slate-800">
                          {formatDateTime(keyResult.updated_at)}
                        </span>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="text-base font-semibold text-slate-900">Nguyên tắc đo lường</h2>
                    <div className="mt-4 space-y-3 text-sm text-slate-700">
                      <p>
                        Mục tiêu định nghĩa phạm vi cần đạt. KR là nơi lưu chỉ số đo lường kết quả.
                        Công việc chỉ là lớp triển khai.
                      </p>
                      <p>
                        Tiến độ của KR được cập nhật trực tiếp tại chính mục này. Công việc không
                        còn là nguồn cộng dồn vào chỉ số đo lường.
                      </p>
                      <p>
                        {isSupportKeyResult
                          ? "Đây là KR hỗ trợ, nên việc chọn KR trực tiếp được thực hiện trong form chỉnh sửa."
                          : "Đây là KR trực tiếp, nên phần bên trái chỉ hiển thị các KR hỗ trợ đang đóng góp vào nó."}
                      </p>
                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="text-base font-semibold text-slate-900">Hiệu suất thực thi</h2>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                          Số công việc
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{tasks.length}</p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                          Trung bình tiến độ thực thi
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">
                          {executionAverageTaskProgress}%
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                          Tỷ lệ công việc hoàn thành
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">
                          {taskCompletionRate}%
                        </p>
                      </div>

                      {tasksByProgressBand.map((item) => {
                        const percent = tasks.length
                          ? Math.round((item.count / tasks.length) * 100)
                          : 0;
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
                </aside>
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
