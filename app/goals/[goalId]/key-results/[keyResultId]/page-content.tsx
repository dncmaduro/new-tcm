"use client";

import Link from "next/link";
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { ActivityHistoryDialog } from "@/components/activity-history-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { formatDateTimeDdMmYyyy } from "@/lib/date-format";
import { TASK_TYPES } from "@/lib/constants/tasks";
import {
  buildKeyResultProgressMap,
  getComputedTaskProgress,
  getKeyResultComputedProgress,
} from "@/lib/okr";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";
import { formatTimelineRangeVi, getTimelineOutsideParentWarning } from "@/lib/timeline";

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

type RoleRow = {
  id: string;
  name: string | null;
};

type UserRoleRow = {
  profile_id: string | null;
  department_id: string | null;
  role_id: string | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
  is_active?: boolean | null;
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
  startValue: number | null;
  current: number | null;
  target: number | null;
  unit: string | null;
  responsibleDepartmentId: string | null;
  responsibleDepartmentName: string | null;
  startDate: string | null;
  endDate: string | null;
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

const TASKS_PAGE_SIZE = 10;

const taskTypeLabelMap = TASK_TYPES.reduce<Record<string, string>>((acc, type) => {
  acc[type.value] = type.label;
  return acc;
}, {});

const normalizeText = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const isLeaderRoleName = (value: string | null | undefined) => {
  const normalizedValue = normalizeText(value);
  return (
    normalizedValue === "leader" ||
    normalizedValue.includes("leader") ||
    normalizedValue.includes("truong nhom")
  );
};

const resolveRootDepartmentId = (
  departmentId: string,
  departments: Array<{ id: string; parentDepartmentId: string | null }>,
) => {
  const departmentsById = departments.reduce<Record<string, { parentDepartmentId: string | null }>>(
    (acc, department) => {
      acc[department.id] = { parentDepartmentId: department.parentDepartmentId };
      return acc;
    },
    {},
  );

  let currentDepartmentId: string | null = departmentId;
  const visitedDepartmentIds = new Set<string>();

  while (currentDepartmentId) {
    if (visitedDepartmentIds.has(currentDepartmentId)) {
      break;
    }

    visitedDepartmentIds.add(currentDepartmentId);
    const currentDepartment:
      | {
          parentDepartmentId: string | null;
        }
      | undefined = departmentsById[currentDepartmentId];

    if (!currentDepartment) {
      return departmentId;
    }

    if (!currentDepartment.parentDepartmentId) {
      return currentDepartmentId;
    }

    currentDepartmentId = currentDepartment.parentDepartmentId;
  }

  return departmentId;
};

const formatDateTime = (value: string | null) => {
  return formatDateTimeDdMmYyyy(value, "Chưa có", "Không hợp lệ");
};

const getProfileDisplayName = (profile: Pick<ProfileRow, "name" | "email">) =>
  profile.name?.trim() || profile.email?.trim() || "Chưa gán";

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
    startValue:
      typeof value.start_value === "number"
        ? value.start_value
        : value.start_value === null || value.start_value === undefined
          ? null
          : Number(value.start_value),
    current:
      typeof value.current === "number"
        ? value.current
        : value.current === null || value.current === undefined
          ? null
          : Number(value.current),
    target:
      typeof value.target === "number"
        ? value.target
        : value.target === null || value.target === undefined
          ? null
          : Number(value.target),
    unit: value.unit ? String(value.unit) : null,
    responsibleDepartmentId: value.responsible_department_id
      ? String(value.responsible_department_id)
      : null,
    responsibleDepartmentName: null,
    startDate: value.start_date ? String(value.start_date) : null,
    endDate: value.end_date ? String(value.end_date) : null,
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

const keyResultEditHref = (keyResult: KeyResultLinkOption | null) =>
  keyResult?.goalId ? `/goals/${keyResult.goalId}/key-results/${keyResult.id}/edit` : null;

function ProgressBar({ value }: { value: number }) {
  const clampedValue = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-blue-600 transition-all"
        style={{ width: `${clampedValue}%` }}
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

function SectionCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <article className={`rounded-2xl border border-slate-200 bg-white p-4 lg:p-5 ${className}`}>
      {children}
    </article>
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
  const [, setGoalDepartmentName] = useState<string | null>(null);
  const [responsibleDepartmentName, setResponsibleDepartmentName] = useState<string | null>(null);
  const [responsibleLeaderNames, setResponsibleLeaderNames] = useState<string[]>([]);
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
  const [taskSearchTerm, setTaskSearchTerm] = useState("");
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState("all");
  const [taskPage, setTaskPage] = useState(1);

  const canManageTasks = workspaceAccess.canManage && !workspaceAccess.error;
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
          "id,goal_id,name,type,contribution_type,start_value,current,target,unit,responsible_department_id,start_date,end_date,goal:goals!key_results_goal_id_fkey(id,name),created_at",
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
              "id,goal_id,name,type,contribution_type,start_value,current,target,unit,responsible_department_id,start_date,end_date,goal:goals!key_results_goal_id_fkey(id,name)",
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

    const relatedDepartmentIds = Array.from(
      new Set(
        Object.values(relatedOptions)
          .map((item) => item.responsibleDepartmentId)
          .filter(Boolean),
      ),
    ) as string[];
    const { data: linkedDepartmentsData } =
      relatedDepartmentIds.length > 0
        ? await supabase.from("departments").select("id,name").in("id", relatedDepartmentIds)
        : { data: [] };
    const linkedDepartmentNameById = ((linkedDepartmentsData ?? []) as DepartmentRow[]).reduce<
      Record<string, string>
    >((acc, department) => {
      acc[String(department.id)] = String(department.name);
      return acc;
    }, {});
    const enrichedRelatedOptions = Object.values(relatedOptions).reduce<
      Record<string, KeyResultLinkOption>
    >((acc, item) => {
      acc[item.id] = {
        ...item,
        responsibleDepartmentName: item.responsibleDepartmentId
          ? (linkedDepartmentNameById[item.responsibleDepartmentId] ?? "Chưa gán phòng ban")
          : "Chưa gán phòng ban",
      };
      return acc;
    }, {});

    setOutboundSupportLinks(
      ((outboundRows ?? []) as Array<Record<string, unknown>>).map((row) => {
        const normalized = normalizeSupportLinkRow(row);
        return {
          ...normalized,
          targetKeyResult: enrichedRelatedOptions[normalized.target_key_result_id] ?? null,
        };
      }),
    );
    setInboundSupportLinks(
      ((inboundRows ?? []) as Array<Record<string, unknown>>).map((row) => {
        const normalized = normalizeSupportLinkRow(row);
        return {
          ...normalized,
          supportKeyResult: enrichedRelatedOptions[normalized.support_key_result_id] ?? null,
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
        setResponsibleLeaderNames([]);
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
        setResponsibleLeaderNames([]);
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

      if (!typedKeyResult.responsible_department_id) {
        setResponsibleLeaderNames([]);
      } else {
        const [
          { data: responsibleRoleRows, error: responsibleRoleError },
          { data: responsibleMembershipRows, error: responsibleMembershipError },
        ] = await Promise.all([
          supabase.from("roles").select("id,name"),
          supabase
            .from("user_role_in_department")
            .select("profile_id,department_id,role_id")
            .eq("department_id", typedKeyResult.responsible_department_id),
        ]);

        if (!isActive) {
          return;
        }

        if (responsibleRoleError || responsibleMembershipError) {
          setResponsibleLeaderNames([]);
        } else {
          const leaderRoleIds = ((responsibleRoleRows ?? []) as RoleRow[])
            .filter((role) => isLeaderRoleName(role.name))
            .map((role) => String(role.id));
          const leaderProfileIds = [
            ...new Set(
              ((responsibleMembershipRows ?? []) as UserRoleRow[])
                .filter(
                  (membership) =>
                    membership.profile_id &&
                    membership.role_id &&
                    leaderRoleIds.includes(String(membership.role_id)),
                )
                .map((membership) => String(membership.profile_id)),
            ),
          ];

          if (leaderRoleIds.length === 0 || leaderProfileIds.length === 0) {
            setResponsibleLeaderNames([]);
          } else {
            const { data: responsibleLeaderProfiles, error: responsibleLeaderProfilesError } =
              await supabase
                .from("profiles")
                .select("id,name,email,is_active")
                .in("id", leaderProfileIds)
                .eq("is_active", true)
                .order("name", { ascending: true });

            if (!isActive) {
              return;
            }

            if (responsibleLeaderProfilesError) {
              setResponsibleLeaderNames([]);
            } else {
              setResponsibleLeaderNames(
                ((responsibleLeaderProfiles ?? []) as ProfileRow[]).map((profile) =>
                  getProfileDisplayName(profile),
                ),
              );
            }
          }
        }
      }

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
              acc[String(profile.id)] = getProfileDisplayName(profile);
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
  const taskAssigneeOptions = useMemo(
    () =>
      tasks
        .reduce<Array<{ id: string; name: string }>>((acc, task) => {
          if (!task.assigneeId) {
            return acc;
          }

          if (acc.some((item) => item.id === task.assigneeId)) {
            return acc;
          }

          acc.push({
            id: task.assigneeId,
            name: task.assigneeName,
          });
          return acc;
        }, [])
        .sort((left, right) => left.name.localeCompare(right.name, "vi")),
    [tasks],
  );
  const filteredTasks = useMemo(() => {
    const normalizedSearchTerm = taskSearchTerm.trim().toLowerCase();

    return tasks.filter((task) => {
      if (taskAssigneeFilter !== "all" && task.assigneeId !== taskAssigneeFilter) {
        return false;
      }

      if (!normalizedSearchTerm) {
        return true;
      }

      return (
        task.name.toLowerCase().includes(normalizedSearchTerm) ||
        task.assigneeName.toLowerCase().includes(normalizedSearchTerm)
      );
    });
  }, [taskAssigneeFilter, taskSearchTerm, tasks]);
  const totalTaskPages = Math.max(1, Math.ceil(filteredTasks.length / TASKS_PAGE_SIZE));
  const safeTaskPage = Math.min(taskPage, totalTaskPages);
  const paginatedTasks = useMemo(() => {
    const startIndex = (safeTaskPage - 1) * TASKS_PAGE_SIZE;
    return filteredTasks.slice(startIndex, startIndex + TASKS_PAGE_SIZE);
  }, [filteredTasks, safeTaskPage]);
  const taskRangeStart = filteredTasks.length === 0 ? 0 : (safeTaskPage - 1) * TASKS_PAGE_SIZE + 1;
  const taskRangeEnd = Math.min(safeTaskPage * TASKS_PAGE_SIZE, filteredTasks.length);

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
  const canUpdateKeyResultProgress = useMemo(() => {
    if (workspaceAccess.error || workspaceAccess.isLoading) {
      return false;
    }

    if (workspaceAccess.hasDirectorRole) {
      return true;
    }

    const responsibleDepartmentId = keyResult?.responsible_department_id;
    if (!responsibleDepartmentId) {
      return false;
    }

    const leaderRoleIds = new Set(
      workspaceAccess.roles.filter((role) => isLeaderRoleName(role.name)).map((role) => role.id),
    );
    if (leaderRoleIds.size === 0) {
      return false;
    }

    const rootDepartmentId = resolveRootDepartmentId(
      responsibleDepartmentId,
      workspaceAccess.departments,
    );

    return workspaceAccess.memberships.some((membership) => {
      if (!membership.departmentId || !membership.roleId || !leaderRoleIds.has(membership.roleId)) {
        return false;
      }

      return (
        membership.departmentId === responsibleDepartmentId ||
        membership.departmentId === rootDepartmentId
      );
    });
  }, [
    keyResult?.responsible_department_id,
    workspaceAccess.departments,
    workspaceAccess.error,
    workspaceAccess.hasDirectorRole,
    workspaceAccess.isLoading,
    workspaceAccess.memberships,
    workspaceAccess.roles,
  ]);
  const canCreateTask = canUpdateKeyResultProgress;
  const responsibleLeaderSummary = useMemo(() => {
    if (!keyResult?.responsible_department_id) {
      return "Chưa gán";
    }

    if (responsibleLeaderNames.length === 0) {
      return "Chưa có leader đang hoạt động";
    }

    return responsibleLeaderNames.join(", ");
  }, [keyResult?.responsible_department_id, responsibleLeaderNames]);
  const goalTypeLabel = formatGoalTypeLabel(goal?.type);
  const keyResultTypeLabel = formatKeyResultTypeLabel(keyResult?.type);
  const keyResultContributionLabel = formatKeyResultContributionTypeLabel(
    keyResult?.contribution_type,
  );
  const keyResultTimelineLabel = keyResult
    ? formatTimelineRangeVi(keyResult.start_date, keyResult.end_date, {
        fallback: "Chưa có mốc thời gian",
      })
    : "Chưa có dữ liệu";
  const keyResultMetricSummary = keyResult
    ? `${formatKeyResultMetric(keyResult.current, keyResult.unit)} / ${formatKeyResultMetric(
        keyResult.target,
        keyResult.unit,
      )}`
    : "Chưa có dữ liệu";
  const supportSectionCountLabel = isSupportKeyResult
    ? `${outboundSupportLinks.length} KR trực tiếp`
    : `${inboundSupportLinks.length} KR hỗ trợ`;

  const handleSaveCurrentMetric = async () => {
    if (!keyResult || isSavingCurrentMetric) {
      return;
    }

    if (!canUpdateKeyResultProgress) {
      setActionError(
        "Bạn không có quyền cập nhật tiến độ KR này. Chỉ Director, leader phòng ban cha nhất hoặc leader phòng ban phụ trách mới được cập nhật.",
      );
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
    if (!goal || !keyResult || isDeletingKeyResult) {
      return;
    }

    const relatedWarning =
      tasks.length > 0
        ? ` KR này đang có ${tasks.length} công việc liên kết và có thể ảnh hưởng dữ liệu liên quan.`
        : "";
    if (!window.confirm(`Xóa KR "${keyResult.name}"?${relatedWarning}`)) {
      return;
    }

    setIsDeletingKeyResult(true);
    setActionError(null);
    setNotice(null);

    const { error } = await supabase.from("key_results").delete().eq("id", keyResult.id);

    if (error) {
      setActionError(error.message || "Không thể xóa KR.");
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
            title="Chi tiết KR"
            items={[
              { label: "Mục tiêu", href: "/goals" },
              ...(goal ? [{ label: goal.name, href: goalHref }] : []),
              { label: keyResult?.name ?? "Chi tiết KR" },
            ]}
          />

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
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
              <div className="w-full min-w-0">
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_312px]">
                  <section className="flex min-w-0 flex-col gap-4">
                    <SectionCard>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
                              {keyResultTypeLabel}
                            </span>
                            <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
                              {keyResultContributionLabel}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                              {responsibleDepartmentName ?? "Chưa gán phòng ban"}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900 lg:text-[28px]">
                                {keyResult.name}
                              </h1>
                            </div>

                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              <ActivityHistoryDialog
                                entityType="key_result"
                                entityId={keyResult.id}
                                title="Lịch sử hoạt động của KR"
                                triggerLabel="Lịch sử"
                                triggerClassName="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                              />
                              {workspaceAccess.canManage && !workspaceAccess.error ? (
                                <>
                                  <Link
                                    href={editKeyResultHref}
                                    className="inline-flex h-8 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                                  >
                                    Sửa KR
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteKeyResult()}
                                    disabled={isDeletingKeyResult}
                                    className="inline-flex h-8 items-center rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {isDeletingKeyResult ? "Đang xóa..." : "Xóa KR"}
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(220px,0.72fr)_minmax(220px,0.72fr)]">
                        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 md:col-span-2 xl:col-span-1">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                Tiến độ
                              </p>
                              <p className="mt-1 text-xl font-semibold text-slate-900">
                                {keyResultProgress}%
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">
                                {isEditingCurrentMetric
                                  ? "Đang cập nhật chỉ số hiện tại"
                                  : keyResultMetricSummary}
                              </p>
                            </div>
                            <div className="shrink-0">
                              {isEditingCurrentMetric ? (
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCurrentMetricDraft(toNumericInput(keyResult.current));
                                      setIsEditingCurrentMetric(false);
                                    }}
                                    disabled={isSavingCurrentMetric}
                                    className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Hủy
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveCurrentMetric()}
                                    disabled={isSavingCurrentMetric}
                                    className="inline-flex h-8 items-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                                  >
                                    {isSavingCurrentMetric ? "Đang lưu..." : "Lưu tiến độ"}
                                  </button>
                                </div>
                              ) : canUpdateKeyResultProgress ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCurrentMetricDraft(toNumericInput(keyResult.current));
                                    setIsEditingCurrentMetric(true);
                                  }}
                                  className="inline-flex h-8 items-center rounded-lg border border-blue-600 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
                                >
                                  Cập nhật tiến độ
                                </button>
                              ) : null}
                            </div>
                          </div>

                          {isEditingCurrentMetric ? (
                            <div className="mt-3 space-y-2">
                              <FormattedNumberInput
                                value={currentMetricDraft}
                                onValueChange={(value) => setCurrentMetricDraft(value)}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                              />
                              <p className="text-[11px] font-medium text-slate-500">
                                Đơn vị tiến độ: {formatKeyResultUnit(keyResult.unit)}.
                              </p>
                            </div>
                          ) : null}

                          <div className="mt-3">
                            <ProgressBar value={keyResultProgress} />
                          </div>
                          {progressHint ? (
                            <p className="mt-2 text-xs text-slate-500">{progressHint}</p>
                          ) : null}
                        </div>

                        <SummaryMiniCard label="Chỉ số" value={keyResultMetricSummary} />
                        <SummaryMiniCard
                          label="Phòng ban"
                          value={responsibleDepartmentName ?? "Chưa có dữ liệu"}
                        />
                      </div>

                      {statusNotice ? (
                        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
                          {statusNotice}
                        </div>
                      ) : null}
                    </SectionCard>

                    <SectionCard className="py-4">
                      <h2 className="text-base font-semibold text-slate-900">Mô tả</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {keyResult.description?.trim() || "Chưa có mô tả."}
                      </p>
                    </SectionCard>

                    <SectionCard>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="text-base font-semibold text-slate-900">
                            {isSupportKeyResult
                              ? "Các KR trực tiếp đang được hỗ trợ"
                              : "Các KR hỗ trợ"}
                          </h2>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {supportSectionCountLabel}
                        </span>
                      </div>

                      {supportLinkError ? (
                        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                          {supportLinkError}
                        </p>
                      ) : null}

                      {isSupportKeyResult ? (
                        <div className="mt-3 space-y-3">
                          {!isLoadingSupportLinks && outboundSupportLinks.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-7 text-center">
                              <p className="text-base font-semibold text-slate-900">
                                Chưa có liên kết hỗ trợ.
                              </p>
                              <p className="mt-1.5 text-sm text-slate-500">
                                KR hỗ trợ nên được nối tới một hoặc nhiều KR trực tiếp để thể hiện
                                phạm vi đóng góp.
                              </p>
                            </div>
                          ) : null}

                          {outboundSupportLinks.length > 0 ? (
                            <div className="overflow-hidden rounded-2xl border border-slate-200">
                              <div className="max-h-[min(58vh,720px)] overflow-auto">
                                <table className="w-full min-w-[1060px] text-left text-sm">
                                  <thead className="sticky top-0 z-10 bg-slate-50">
                                    <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                                      <th className="px-3 py-2.5 font-semibold">Tên KR</th>
                                      <th className="px-3 py-2.5 font-semibold">Phân loại</th>
                                      <th className="px-3 py-2.5 font-semibold">Phòng ban</th>
                                      <th className="px-3 py-2.5 font-semibold">Chỉ số</th>
                                      <th className="px-3 py-2.5 font-semibold">Tiến độ</th>
                                      <th className="px-3 py-2.5 font-semibold">Thời gian</th>
                                      <th className="px-3 py-2.5 font-semibold">Hành động</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {outboundSupportLinks.map((link) => {
                                      const href = keyResultLinkHref(link.targetKeyResult);
                                      const editHref = keyResultEditHref(link.targetKeyResult);
                                      const targetProgress = link.targetKeyResult
                                        ? getKeyResultComputedProgress({
                                            id: link.targetKeyResult.id,
                                            start_value: link.targetKeyResult.startValue,
                                            current: link.targetKeyResult.current,
                                            target: link.targetKeyResult.target,
                                          })
                                        : 0;
                                      const allocationSummary = getSupportAllocationSummary({
                                        allocatedValue: link.allocated_value,
                                        allocatedPercent: link.allocated_percent,
                                        unit: keyResult.unit,
                                      });

                                      return (
                                        <tr
                                          key={link.id}
                                          className="border-b border-slate-100 align-top bg-white last:border-b-0"
                                        >
                                          <td className="px-3 py-2.5">
                                            {href ? (
                                              <Link
                                                href={href}
                                                className="block text-sm font-semibold text-slate-900 hover:text-blue-700"
                                                title={link.targetKeyResult?.name ?? "KR trực tiếp"}
                                              >
                                                {link.targetKeyResult?.name ?? "KR trực tiếp"}
                                              </Link>
                                            ) : (
                                              <p className="text-sm font-semibold text-slate-900">
                                                {link.targetKeyResult?.name ?? "KR trực tiếp"}
                                              </p>
                                            )}
                                            <p className="mt-1 text-xs text-slate-500">
                                              {allocationSummary.shortLabel}:{" "}
                                              {allocationSummary.value}
                                            </p>
                                            {link.note?.trim() ? (
                                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                                                {link.note.trim()}
                                              </p>
                                            ) : null}
                                          </td>
                                          <td className="px-3 py-2.5">
                                            <div className="flex flex-wrap gap-1.5 text-[11px]">
                                              <span className="rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-700">
                                                {formatKeyResultTypeLabel(
                                                  link.targetKeyResult?.type,
                                                )}
                                              </span>
                                              <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700">
                                                {formatKeyResultContributionTypeLabel(
                                                  link.targetKeyResult?.contributionType,
                                                )}
                                              </span>
                                            </div>
                                          </td>
                                          <td className="px-3 py-2.5 text-slate-700">
                                            {link.targetKeyResult?.responsibleDepartmentName ??
                                              "Chưa gán phòng ban"}
                                          </td>
                                          <td className="px-3 py-2.5">
                                            <p className="font-medium text-slate-900">
                                              {link.targetKeyResult
                                                ? `${formatKeyResultMetric(link.targetKeyResult.current, link.targetKeyResult.unit)} / ${formatKeyResultMetric(link.targetKeyResult.target, link.targetKeyResult.unit)}`
                                                : "Chưa có dữ liệu"}
                                            </p>
                                          </td>
                                          <td className="px-3 py-2.5">
                                            <div className="w-full max-w-[180px]">
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs font-semibold text-slate-800">
                                                  {targetProgress}%
                                                </span>
                                                <span className="text-xs text-slate-500">
                                                  {link.targetKeyResult
                                                    ? `${formatKeyResultMetric(link.targetKeyResult.current, link.targetKeyResult.unit)} / ${formatKeyResultMetric(link.targetKeyResult.target, link.targetKeyResult.unit)}`
                                                    : "Chưa có dữ liệu"}
                                                </span>
                                              </div>
                                              <div className="mt-2">
                                                <ProgressBar value={targetProgress} />
                                              </div>
                                            </div>
                                          </td>
                                          <td className="px-3 py-2.5 text-sm text-slate-700">
                                            {formatTimelineRangeVi(
                                              link.targetKeyResult?.startDate ?? null,
                                              link.targetKeyResult?.endDate ?? null,
                                              { fallback: "Chưa có mốc thời gian" },
                                            )}
                                          </td>
                                          <td className="px-3 py-2.5">
                                            <div className="flex justify-end">
                                              {workspaceAccess.canManage &&
                                              !workspaceAccess.error &&
                                              editHref ? (
                                                <Link
                                                  href={editHref}
                                                  className="inline-flex h-8 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                                                >
                                                  Sửa KR
                                                </Link>
                                              ) : href ? (
                                                <Link
                                                  href={href}
                                                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                                >
                                                  Xem KR
                                                </Link>
                                              ) : (
                                                <span className="text-xs text-slate-400">-</span>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <>
                          {!isLoadingSupportLinks && inboundSupportLinks.length === 0 ? (
                            <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-7 text-center">
                              <p className="text-base font-semibold text-slate-900">
                                Chưa có KR hỗ trợ liên kết.
                              </p>
                              <p className="mt-1.5 text-sm text-slate-500">
                                Khi một KR hỗ trợ được phân bổ sang KR trực tiếp này, nó sẽ xuất
                                hiện tại đây.
                              </p>
                            </div>
                          ) : null}

                          {inboundSupportLinks.length > 0 ? (
                            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
                              <div className="max-h-[min(58vh,720px)] overflow-auto">
                                <table className="w-full min-w-[1060px] text-left text-sm">
                                  <thead className="sticky top-0 z-10 bg-slate-50">
                                    <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                                      <th className="px-3 py-2.5 font-semibold">Tên KR</th>
                                      <th className="px-3 py-2.5 font-semibold">Phân loại</th>
                                      <th className="px-3 py-2.5 font-semibold">Phòng ban</th>
                                      <th className="px-3 py-2.5 font-semibold">Chỉ số</th>
                                      <th className="px-3 py-2.5 font-semibold">Tiến độ</th>
                                      <th className="px-3 py-2.5 font-semibold">Thời gian</th>
                                      <th className="px-3 py-2.5 font-semibold">Hành động</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {inboundSupportLinks.map((link) => {
                                      const detailHref = keyResultLinkHref(link.supportKeyResult);
                                      const editHref = keyResultEditHref(link.supportKeyResult);
                                      const supportProgress = link.supportKeyResult
                                        ? getKeyResultComputedProgress({
                                            id: link.supportKeyResult.id,
                                            start_value: link.supportKeyResult.startValue,
                                            current: link.supportKeyResult.current,
                                            target: link.supportKeyResult.target,
                                          })
                                        : 0;

                                      return (
                                        <tr
                                          key={link.id}
                                          className="border-b border-slate-100 align-top bg-white last:border-b-0"
                                        >
                                          <td className="px-3 py-2.5">
                                            {detailHref ? (
                                              <Link
                                                href={detailHref}
                                                className="block text-sm font-semibold text-slate-900 hover:text-blue-700"
                                                title={link.supportKeyResult?.name ?? "KR hỗ trợ"}
                                              >
                                                {link.supportKeyResult?.name ?? "KR hỗ trợ"}
                                              </Link>
                                            ) : (
                                              <p className="text-sm font-semibold text-slate-900">
                                                {link.supportKeyResult?.name ?? "KR hỗ trợ"}
                                              </p>
                                            )}
                                            {link.note?.trim() ? (
                                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                                                {link.note.trim()}
                                              </p>
                                            ) : null}
                                          </td>
                                          <td className="px-3 py-2.5">
                                            <div className="flex flex-wrap gap-1.5 text-[11px]">
                                              <span className="rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-700">
                                                {formatKeyResultTypeLabel(
                                                  link.supportKeyResult?.type,
                                                )}
                                              </span>
                                              <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700">
                                                {formatKeyResultContributionTypeLabel(
                                                  link.supportKeyResult?.contributionType,
                                                )}
                                              </span>
                                            </div>
                                          </td>
                                          <td className="px-3 py-2.5 text-slate-700">
                                            {link.supportKeyResult?.responsibleDepartmentName ??
                                              "Chưa gán phòng ban"}
                                          </td>
                                          <td className="px-3 py-2.5">
                                            <p className="font-medium text-slate-900">
                                              {link.supportKeyResult
                                                ? `${formatKeyResultMetric(link.supportKeyResult.current, link.supportKeyResult.unit)} / ${formatKeyResultMetric(link.supportKeyResult.target, link.supportKeyResult.unit)}`
                                                : "Chưa có dữ liệu"}
                                            </p>
                                          </td>
                                          <td className="px-3 py-2.5">
                                            <div className="w-full max-w-[180px]">
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs font-semibold text-slate-800">
                                                  {supportProgress}%
                                                </span>
                                                <span className="text-xs text-slate-500">
                                                  {link.supportKeyResult
                                                    ? `${formatKeyResultMetric(link.supportKeyResult.current, link.supportKeyResult.unit)} / ${formatKeyResultMetric(link.supportKeyResult.target, link.supportKeyResult.unit)}`
                                                    : "Chưa có dữ liệu"}
                                                </span>
                                              </div>
                                              <div className="mt-2">
                                                <ProgressBar value={supportProgress} />
                                              </div>
                                            </div>
                                          </td>
                                          <td className="px-3 py-2.5 text-sm text-slate-700">
                                            {formatTimelineRangeVi(
                                              link.supportKeyResult?.startDate ?? null,
                                              link.supportKeyResult?.endDate ?? null,
                                              { fallback: "Chưa có mốc thời gian" },
                                            )}
                                          </td>
                                          <td className="px-3 py-2.5">
                                            <div className="flex justify-end">
                                              {workspaceAccess.canManage &&
                                              !workspaceAccess.error &&
                                              editHref ? (
                                                <Link
                                                  href={editHref}
                                                  className="inline-flex h-8 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                                                >
                                                  Sửa KR
                                                </Link>
                                              ) : detailHref ? (
                                                <Link
                                                  href={detailHref}
                                                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                                >
                                                  Xem KR
                                                </Link>
                                              ) : (
                                                <span className="text-xs text-slate-400">-</span>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : null}
                        </>
                      )}
                    </SectionCard>

                    <SectionCard>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="text-base font-semibold text-slate-900">
                            Công việc thực thi của KR
                          </h2>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {filteredTasks.length === tasks.length
                              ? `${tasks.length} công việc`
                              : `${filteredTasks.length}/${tasks.length} công việc`}
                          </span>
                          {canCreateTask ? (
                            <Link
                              href={createTaskHref}
                              className="inline-flex h-8 items-center rounded-lg border border-blue-600 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
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
                        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-7 text-center">
                          <p className="text-base font-semibold text-slate-900">
                            KR này chưa có công việc.
                          </p>
                          <p className="mt-1.5 text-sm text-slate-500">
                            Theo dõi công việc thực thi để cập nhật tiến độ KR nhất quán hơn.
                          </p>
                          {canCreateTask ? (
                            <Link
                              href={createTaskHref}
                              className="mt-4 inline-flex h-9 items-center rounded-lg border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                            >
                              + Thêm công việc đầu tiên
                            </Link>
                          ) : null}
                        </div>
                      ) : null}

                      {!taskLoadError && tasks.length > 0 ? (
                        <>
                          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
                            <label className="block">
                              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                                Tìm công việc
                              </span>
                              <input
                                value={taskSearchTerm}
                                onChange={(event) => {
                                  setTaskSearchTerm(event.target.value);
                                  setTaskPage(1);
                                }}
                                placeholder="Tên công việc hoặc người phụ trách"
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                                Lọc theo người phụ trách
                              </span>
                              <Select
                                value={taskAssigneeFilter}
                                onValueChange={(value) => {
                                  setTaskAssigneeFilter(value);
                                  setTaskPage(1);
                                }}
                              >
                                <SelectTrigger className="h-10 bg-white text-sm">
                                  <SelectValue placeholder="Tất cả người phụ trách" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">Tất cả người phụ trách</SelectItem>
                                  {taskAssigneeOptions.map((assignee) => (
                                    <SelectItem key={assignee.id} value={assignee.id}>
                                      {assignee.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </label>
                          </div>
                          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[920px] text-left text-sm">
                                <thead className="sticky top-0 z-10 bg-slate-50">
                                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                                    <th className="px-3 py-2.5 font-semibold">Công việc</th>
                                    <th className="px-3 py-2.5 font-semibold">Người phụ trách</th>
                                    <th className="px-3 py-2.5 font-semibold">Tiến độ thực thi</th>
                                    {canManageTasks ? (
                                      <th className="px-3 py-2.5 font-semibold">Thao tác</th>
                                    ) : null}
                                  </tr>
                                </thead>
                                <tbody>
                                  {paginatedTasks.length === 0 ? (
                                    <tr>
                                      <td
                                        colSpan={canManageTasks ? 4 : 3}
                                        className="px-3 py-8 text-center text-sm text-slate-500"
                                      >
                                        Không có công việc nào khớp bộ lọc hiện tại.
                                      </td>
                                    </tr>
                                  ) : (
                                    paginatedTasks.map((task) => {
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
                                            <td className="px-3 py-2.5">
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
                                              <p className="mt-2 text-sm text-slate-600">
                                                {formatTimelineRangeVi(
                                                  task.startDate,
                                                  task.endDate,
                                                  {
                                                    fallback: "Công việc chưa có mốc thời gian",
                                                  },
                                                )}
                                              </p>
                                              {alignmentWarning ? (
                                                <p className="mt-1 text-xs text-amber-600">
                                                  {alignmentWarning}
                                                </p>
                                              ) : null}
                                            </td>
                                            <td className="px-3 py-2.5">
                                              <span
                                                className={`text-sm ${task.assigneeId ? "text-slate-700" : "text-slate-400"}`}
                                              >
                                                {task.assigneeName}
                                              </span>
                                            </td>
                                            <td className="px-3 py-2.5">
                                              <div className="w-[140px]">
                                                <div className="flex items-center justify-between gap-2">
                                                  <span className="text-xs font-semibold text-slate-800">
                                                    {task.progress}%
                                                  </span>
                                                </div>
                                                <div className="mt-2">
                                                  <ProgressBar value={task.progress} />
                                                </div>
                                              </div>
                                            </td>
                                            {canManageTasks ? (
                                              <td className="px-3 py-2.5">
                                                <Link
                                                  href={`/tasks/${task.id}`}
                                                  className="inline-flex h-8 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                                                >
                                                  Sửa
                                                </Link>
                                              </td>
                                            ) : null}
                                          </tr>
                                        </Fragment>
                                      );
                                    })
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {totalTaskPages > 1 ? (
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                              <p className="text-slate-500">
                                Hiển thị {taskRangeStart}-{taskRangeEnd} / {filteredTasks.length}{" "}
                                công việc
                              </p>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setTaskPage((current) => Math.max(1, current - 1))}
                                  disabled={safeTaskPage === 1}
                                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Trước
                                </button>
                                <span className="text-xs font-semibold text-slate-600">
                                  Trang {safeTaskPage}/{totalTaskPages}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setTaskPage((current) => Math.min(totalTaskPages, current + 1))
                                  }
                                  disabled={safeTaskPage === totalTaskPages}
                                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Sau
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </SectionCard>
                  </section>

                  <aside className="xl:sticky xl:self-start">
                    <div className="space-y-4">
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
                              Tiến độ KR
                            </span>
                            <span className="text-lg font-semibold text-slate-900">
                              {keyResultProgress}%
                            </span>
                          </div>
                          <div className="mt-2">
                            <ProgressBar value={keyResultProgress} />
                          </div>
                        </div>

                        <div className="mt-3 space-y-2.5">
                          <DetailInfoRow label="Loại mục tiêu" value={goalTypeLabel} />
                          <DetailInfoRow
                            label="Phòng ban phụ trách"
                            value={responsibleDepartmentName ?? "Chưa có dữ liệu"}
                          />
                          <DetailInfoRow label="Người phụ trách" value={responsibleLeaderSummary} />
                          <DetailInfoRow label="Tiến độ" value={keyResultMetricSummary} />
                          <DetailInfoRow label="Thời gian" value={keyResultTimelineLabel} />
                        </div>

                        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                          <DetailInfoRow
                            label="Thời gian tạo"
                            value={formatDateTime(keyResult.created_at)}
                          />
                          <DetailInfoRow
                            label="Cập nhật lần cuối"
                            value={formatDateTime(keyResult.updated_at)}
                          />
                        </div>
                      </article>

                      <article className="rounded-2xl border border-slate-200 bg-white px-3.5 pb-3.5 pt-4 lg:px-4 lg:pb-4 lg:pt-5">
                        <h2 className="text-base font-semibold text-slate-900">
                          Hiệu suất thực thi
                        </h2>
                        <div className="mt-3 space-y-3">
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
                    </div>
                  </aside>
                </div>
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
