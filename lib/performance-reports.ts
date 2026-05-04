import { endOfMonth, endOfQuarter, format, isValid, parseISO, startOfWeek } from "date-fns";
import { supabase } from "@/lib/supabase";
import type {
  ManagedDepartment,
  WorkspaceRole,
  WorkspaceDepartment,
  WorkspaceMembership,
} from "@/lib/stores/workspace-access-store";
import { getDirectorRoleIds, getLeaderRoleIds } from "@/lib/stores/workspace-access-store";

export const REPORT_PERIOD_TYPES = [
  { value: "weekly", label: "Tuần" },
  { value: "monthly", label: "Tháng" },
  { value: "quarterly", label: "Quý" },
] as const;

export const REPORT_STATUSES = [
  { value: "draft", label: "Nháp" },
  { value: "pending", label: "Chờ duyệt" },
  { value: "reviewed", label: "Đã duyệt" },
  { value: "locked", label: "Đã khóa" },
  { value: "rejected", label: "Từ chối" },
] as const;

export const REPORT_ITEM_TYPES = [
  { value: "goal", label: "Mục tiêu" },
  { value: "direct_kr", label: "KR trực tiếp" },
  { value: "support_kr", label: "KR phối hợp" },
  { value: "execution", label: "Task" },
] as const;

export type PerformanceReportPeriodType = (typeof REPORT_PERIOD_TYPES)[number]["value"];
export type PerformanceReportStatus = (typeof REPORT_STATUSES)[number]["value"];
export type PerformanceReportItemType = (typeof REPORT_ITEM_TYPES)[number]["value"];
export type ReportAccessScope = "director" | "leader" | "member";

export type PerformanceReportProfile = {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
};

export type PerformanceReportDepartment = {
  id: string;
  name: string;
  parentDepartmentId?: string | null;
};

export type PerformanceReportMetricKind = "goal" | "kr";

export type PerformanceReportRow = {
  id: string;
  profile_id: string | null;
  department_id: string | null;
  period_type: PerformanceReportPeriodType;
  period_key: string;
  period_start: string | null;
  period_end: string | null;
  overall_score: number | null;
  business_score: number | null;
  support_score: number | null;
  execution_score: number | null;
  goal_count: number | null;
  direct_kr_count: number | null;
  support_kr_count: number | null;
  task_count: number | null;
  completed_task_count: number | null;
  total_task_points: number | null;
  completed_task_points: number | null;
  overdue_task_count: number | null;
  self_comment: string | null;
  manager_comment: string | null;
  status: PerformanceReportStatus;
  created_by: string | null;
  reviewed_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PerformanceReportWithRelations = PerformanceReportRow & {
  profile?: PerformanceReportProfile;
  department?: PerformanceReportDepartment;
};

export type PerformanceReportItemRow = {
  id: string;
  performance_report_id: string;
  item_type: PerformanceReportItemType;
  reference_id: string | null;
  name: string;
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
  progress_percent: number | null;
  weight: number | null;
  score: number | null;
  meta_json: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ReportProfileOption = {
  id: string;
  name: string;
  email: string | null;
};

export type ReportDepartmentOption = {
  id: string;
  name: string;
  parentDepartmentId: string | null;
};

export type ReportingScopeDirectory = {
  roleScope: ReportAccessScope;
  accessibleProfileIds: string[];
  accessibleDepartmentIds: string[];
  profileOptions: ReportProfileOption[];
  departmentOptions: ReportDepartmentOption[];
  profileNameById: Record<string, string>;
  departmentNameById: Record<string, string>;
  membershipsByProfileId: Record<string, string[]>;
};

export type PerformanceReportDraftInput = {
  profileId: string;
  departmentId: string | null;
  periodType: PerformanceReportPeriodType;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  selfComment: string;
};

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type UserRoleRow = {
  profile_id: string | null;
  department_id: string | null;
};

export type PerformanceReportRoleMembershipRow = {
  profile_id: string | null;
  department_id: string | null;
  role_id: string | null;
};

const toNumeric = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const reportPeriodTypeLabelMap = REPORT_PERIOD_TYPES.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const reportStatusLabelMap = REPORT_STATUSES.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const reportItemTypeLabelMap = REPORT_ITEM_TYPES.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const clampScore = (value: number | null | undefined) => {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.min(100, Number(value)));
};

const toIsoDate = (value: Date) => format(value, "yyyy-MM-dd");

const toValidDate = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
};

export const normalizeReportPeriodType = (value: string | null | undefined): PerformanceReportPeriodType => {
  if (value === "weekly" || value === "monthly" || value === "quarterly") {
    return value;
  }
  return "weekly";
};

export const normalizeReportStatus = (value: string | null | undefined): PerformanceReportStatus => {
  if (value === "pending" || value === "reviewed" || value === "locked" || value === "rejected") {
    return value;
  }
  if (value === "submitted") {
    return "pending";
  }
  return "draft";
};

export const normalizeReportItemType = (value: string | null | undefined): PerformanceReportItemType => {
  if (value === "direct_kr" || value === "support_kr" || value === "execution") {
    return value;
  }
  return "goal";
};

export const normalizePerformanceReportRow = (value: Record<string, unknown>) =>
  ({
    id: String(value.id),
    profile_id: value.profile_id ? String(value.profile_id) : null,
    department_id: value.department_id ? String(value.department_id) : null,
    period_type: normalizeReportPeriodType(value.period_type ? String(value.period_type) : null),
    period_key: value.period_key ? String(value.period_key) : "",
    period_start: value.period_start ? String(value.period_start) : null,
    period_end: value.period_end ? String(value.period_end) : null,
    overall_score: toNumeric(value.overall_score as number | string | null | undefined),
    business_score: toNumeric(value.business_score as number | string | null | undefined),
    support_score: toNumeric(value.support_score as number | string | null | undefined),
    execution_score: toNumeric(value.execution_score as number | string | null | undefined),
    goal_count: toNumeric(value.goal_count as number | string | null | undefined),
    direct_kr_count: toNumeric(value.direct_kr_count as number | string | null | undefined),
    support_kr_count: toNumeric(value.support_kr_count as number | string | null | undefined),
    task_count: toNumeric(value.task_count as number | string | null | undefined),
    completed_task_count: toNumeric(value.completed_task_count as number | string | null | undefined),
    total_task_points: toNumeric(value.total_task_points as number | string | null | undefined),
    completed_task_points: toNumeric(
      value.completed_task_points as number | string | null | undefined,
    ),
    overdue_task_count: toNumeric(value.overdue_task_count as number | string | null | undefined),
    self_comment: value.self_comment ? String(value.self_comment) : null,
    manager_comment: value.manager_comment ? String(value.manager_comment) : null,
    status: normalizeReportStatus(value.status ? String(value.status) : null),
    created_by: value.created_by ? String(value.created_by) : null,
    reviewed_by: value.reviewed_by ? String(value.reviewed_by) : null,
    created_at: value.created_at ? String(value.created_at) : null,
    updated_at: value.updated_at ? String(value.updated_at) : null,
  }) satisfies PerformanceReportRow;

export const normalizePerformanceReportWithRelations = (
  value: Record<string, unknown>,
): PerformanceReportWithRelations => {
  const baseReport = normalizePerformanceReportRow(value);
  const rawProfile = Array.isArray(value.profile) ? (value.profile[0] ?? null) : value.profile;
  const rawDepartment = Array.isArray(value.department)
    ? (value.department[0] ?? null)
    : value.department;

  const profile =
    rawProfile && typeof rawProfile === "object" && "id" in rawProfile
      ? {
          id: String((rawProfile as Record<string, unknown>).id),
          name:
            String(
              (rawProfile as Record<string, unknown>).name ??
                (rawProfile as Record<string, unknown>).email ??
                "Chưa có tên",
            ) || "Chưa có tên",
          email: (rawProfile as Record<string, unknown>).email
            ? String((rawProfile as Record<string, unknown>).email)
            : undefined,
          avatar: (rawProfile as Record<string, unknown>).avatar
            ? String((rawProfile as Record<string, unknown>).avatar)
            : undefined,
        }
      : undefined;

  const department =
    rawDepartment && typeof rawDepartment === "object" && "id" in rawDepartment
      ? {
          id: String((rawDepartment as Record<string, unknown>).id),
          name: String((rawDepartment as Record<string, unknown>).name ?? "Không rõ"),
          parentDepartmentId: (rawDepartment as Record<string, unknown>).parent_department_id
            ? String((rawDepartment as Record<string, unknown>).parent_department_id)
            : null,
        }
      : undefined;

  return {
    ...baseReport,
    profile,
    department,
  };
};

export const normalizePerformanceReportItemRow = (value: Record<string, unknown>) =>
  ({
    id: String(value.id),
    performance_report_id: String(value.performance_report_id),
    item_type: normalizeReportItemType(value.item_type ? String(value.item_type) : null),
    reference_id: value.reference_id ? String(value.reference_id) : null,
    name: value.name ? String(value.name) : "Mục dữ liệu",
    target_value: toNumeric(value.target_value as number | string | null | undefined),
    current_value: toNumeric(value.current_value as number | string | null | undefined),
    unit: value.unit ? String(value.unit) : null,
    progress_percent: toNumeric(value.progress_percent as number | string | null | undefined),
    weight: toNumeric(value.weight as number | string | null | undefined),
    score: toNumeric(value.score as number | string | null | undefined),
    meta_json:
      value.meta_json && typeof value.meta_json === "object" && !Array.isArray(value.meta_json)
        ? (value.meta_json as Record<string, unknown>)
        : null,
    created_at: value.created_at ? String(value.created_at) : null,
    updated_at: value.updated_at ? String(value.updated_at) : null,
  }) satisfies PerformanceReportItemRow;

export const formatReportPeriodTypeLabel = (value: string | null | undefined) =>
  reportPeriodTypeLabelMap[normalizeReportPeriodType(value)] ?? "Tuần";

export const formatReportStatusLabel = (value: string | null | undefined) =>
  reportStatusLabelMap[normalizeReportStatus(value)] ?? "Nháp";

export const formatReportItemTypeLabel = (value: string | null | undefined) =>
  reportItemTypeLabelMap[normalizeReportItemType(value)] ?? "Mục tiêu";

export const getReportStatusTone = (value: string | null | undefined) => {
  const normalized = normalizeReportStatus(value);
  if (normalized === "locked") {
    return "bg-slate-200 text-slate-700";
  }
  if (normalized === "rejected") {
    return "bg-rose-50 text-rose-700";
  }
  if (normalized === "reviewed") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (normalized === "pending") {
    return "bg-amber-50 text-amber-700";
  }
  return "bg-blue-50 text-blue-700";
};

export const formatReportScore = (value: number | null | undefined) => {
  const safeValue = clampScore(value);
  if (safeValue === null) {
    return "--";
  }
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(safeValue)}%`;
};

export const formatReportProgressValue = (
  value: number | null | undefined,
  emptyText = "Chưa có dữ liệu",
) => {
  const formatted = formatReportScore(value);
  return formatted === "--" ? emptyText : formatted;
};

export const formatReportCount = (value: number | null | undefined) => {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Number(value));
};

export const formatReportNumericValue = (
  value: number | null | undefined,
  unit: string | null | undefined,
) => {
  if (!Number.isFinite(value)) {
    return "--";
  }

  const formatted = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(value));

  if (!unit) {
    return formatted;
  }
  return `${formatted} ${unit}`.trim();
};

export const formatReportPointValue = (value: number | null | undefined, emptyText = "0") => {
  if (!Number.isFinite(value)) {
    return emptyText;
  }

  return new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(Number(value));
};

export const formatReportTaskCompletionText = (
  completed: number | null | undefined,
  total: number | null | undefined,
  emptyText = "Chưa có task",
) => {
  const safeTotal = Number.isFinite(total) ? Number(total) : 0;
  if (safeTotal <= 0) {
    return emptyText;
  }

  const safeCompleted = Number.isFinite(completed) ? Number(completed) : 0;
  return `${formatReportCount(safeCompleted)} / ${formatReportCount(safeTotal)} task`;
};

export const formatReportTaskPointText = (
  completed: number | null | undefined,
  total: number | null | undefined,
  emptyText = "Chưa có điểm task",
) => {
  const safeTotal = Number.isFinite(total) ? Number(total) : 0;
  if (safeTotal <= 0) {
    return emptyText;
  }

  const safeCompleted = Number.isFinite(completed) ? Number(completed) : 0;
  return `${formatReportPointValue(safeCompleted)} / ${formatReportPointValue(safeTotal)} điểm`;
};

export const formatReportDateRange = (start: string | null | undefined, end: string | null | undefined) => {
  const startDate = toValidDate(start ?? null);
  const endDate = toValidDate(end ?? null);

  if (!startDate && !endDate) {
    return "Chưa xác định thời gian báo cáo";
  }
  if (startDate && !endDate) {
    return format(startDate, "dd/MM/yyyy");
  }
  if (!startDate && endDate) {
    return format(endDate, "dd/MM/yyyy");
  }

  return `${format(startDate as Date, "dd/MM/yyyy")} - ${format(endDate as Date, "dd/MM/yyyy")}`;
};

export const buildGoalReportProfileIds = (params: {
  roles: WorkspaceRole[];
  departments: WorkspaceDepartment[];
  memberships: PerformanceReportRoleMembershipRow[];
}) => {
  const directorRoleIds = new Set(getDirectorRoleIds(params.roles));
  const leaderRoleIds = new Set(getLeaderRoleIds(params.roles));
  const rootDepartmentIds = new Set(
    params.departments.filter((department) => !department.parentDepartmentId).map((department) => department.id),
  );

  return [
    ...new Set(
      params.memberships
        .filter((membership) => {
          if (!membership.profile_id || !membership.role_id) {
            return false;
          }

          if (directorRoleIds.has(membership.role_id)) {
            return true;
          }

          return (
            leaderRoleIds.has(membership.role_id) &&
            Boolean(membership.department_id && rootDepartmentIds.has(membership.department_id))
          );
        })
        .map((membership) => membership.profile_id as string),
    ),
  ];
};

export const getPerformanceReportMetricKind = (
  profileId: string | null | undefined,
  goalReportProfileIds: string[] | Set<string>,
): PerformanceReportMetricKind => {
  if (!profileId) {
    return "kr";
  }

  const goalProfileIdSet =
    goalReportProfileIds instanceof Set ? goalReportProfileIds : new Set(goalReportProfileIds);

  return goalProfileIdSet.has(profileId) ? "goal" : "kr";
};

export const getSuggestedPeriodEnd = (
  periodType: PerformanceReportPeriodType,
  periodStart: string,
) => {
  const startDate = toValidDate(periodStart);
  if (!startDate) {
    return "";
  }

  if (periodType === "monthly") {
    return toIsoDate(endOfMonth(startDate));
  }

  if (periodType === "quarterly") {
    return toIsoDate(endOfQuarter(startDate));
  }

  const weekStart = startOfWeek(startDate, { weekStartsOn: 1 });
  const endDate = new Date(weekStart);
  endDate.setDate(endDate.getDate() + 6);
  return toIsoDate(endDate);
};

export const buildPerformanceReportPeriodKey = (
  periodType: PerformanceReportPeriodType,
  periodStart: string,
) => {
  const startDate = toValidDate(periodStart);
  if (!startDate) {
    return "";
  }

  if (periodType === "monthly") {
    return format(startDate, "yyyy-MM");
  }

  if (periodType === "quarterly") {
    return `${format(startDate, "yyyy")}-Q${Math.floor(startDate.getMonth() / 3) + 1}`;
  }

  const weekStart = startOfWeek(startDate, { weekStartsOn: 1 });
  return format(weekStart, "RRRR-'W'II");
};

export const isReportLocked = (status: string | null | undefined) => normalizeReportStatus(status) === "locked";

export const canOwnerEditReport = (status: string | null | undefined) => {
  const normalized = normalizeReportStatus(status);
  return normalized === "draft" || normalized === "pending" || normalized === "rejected";
};

export const getOwnerStatusChoices = (status: string | null | undefined): PerformanceReportStatus[] => {
  const normalized = normalizeReportStatus(status);
  if (normalized === "draft" || normalized === "rejected") {
    return ["draft", "pending"];
  }
  return [normalized];
};

export const getManagerStatusChoices = (status: string | null | undefined): PerformanceReportStatus[] => {
  const normalized = normalizeReportStatus(status);
  if (normalized === "locked") {
    return ["locked"];
  }
  if (normalized === "reviewed") {
    return ["reviewed", "locked"];
  }
  if (normalized === "pending") {
    return ["pending", "reviewed", "rejected", "locked"];
  }
  if (normalized === "rejected") {
    return ["rejected", "pending", "reviewed"];
  }
  return ["draft", "pending", "reviewed"];
};

export const getReportItemGroupDescription = (itemType: PerformanceReportItemType) => {
  if (itemType === "goal") {
    return "Nhóm này cho thấy mức độ bao đạt mục tiêu trong kỳ đánh giá.";
  }
  if (itemType === "direct_kr") {
    return "Nhóm này phản ánh mức đóng góp trực tiếp vào kết quả chính của kỳ đánh giá.";
  }
  if (itemType === "support_kr") {
    return "Nhóm này phản ánh phần phối hợp với các KR trực tiếp và các nhóm liên quan.";
  }
  return "Nhóm này tóm tắt tiến độ task để tham khảo thêm, không thay thế mục tiêu và KR.";
};

export const buildDepartmentSubtreeIds = (
  rootDepartmentIds: string[],
  departments: WorkspaceDepartment[],
) => {
  const childrenByParent = departments.reduce<Record<string, string[]>>((acc, department) => {
    if (!department.parentDepartmentId) {
      return acc;
    }
    if (!acc[department.parentDepartmentId]) {
      acc[department.parentDepartmentId] = [];
    }
    acc[department.parentDepartmentId].push(department.id);
    return acc;
  }, {});

  const scoped = new Set<string>(rootDepartmentIds);
  const queue = [...rootDepartmentIds];

  while (queue.length > 0) {
    const currentId = queue.shift() as string;
    const children = childrenByParent[currentId] ?? [];
    for (const childId of children) {
      if (scoped.has(childId)) {
        continue;
      }
      scoped.add(childId);
      queue.push(childId);
    }
  }

  return Array.from(scoped);
};

export const formatReportScopeLabel = (scope: ReportAccessScope) => {
  if (scope === "director") {
    return "Ban giám đốc";
  }
  if (scope === "leader") {
    return "Quản lý";
  }
  return "Thành viên";
};

export const validatePerformanceReportDraft = (input: PerformanceReportDraftInput) => {
  const errors: string[] = [];

  if (!input.profileId) {
    errors.push("Chưa chọn nhân sự.");
  }

  if (!input.periodStart) {
    errors.push("Chưa chọn ngày bắt đầu kỳ báo cáo.");
  }

  if (!input.periodEnd) {
    errors.push("Chưa chọn ngày kết thúc kỳ báo cáo.");
  }

  const startDate = toValidDate(input.periodStart);
  const endDate = toValidDate(input.periodEnd);

  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    errors.push("Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.");
  }

  if (!input.periodKey.trim()) {
    errors.push("Không thể xác định mã kỳ.");
  }

  return errors;
};

export const loadReportingScopeDirectory = async (params: {
  currentProfileId: string | null;
  currentProfileName: string | null;
  memberships: WorkspaceMembership[];
  hasDirectorRole: boolean;
  canManage: boolean;
  managedDepartments: ManagedDepartment[];
  departments: WorkspaceDepartment[];
}) => {
  const departmentNameById = params.departments.reduce<Record<string, string>>((acc, department) => {
    acc[department.id] = department.name;
    return acc;
  }, {});

  const allDepartmentOptions = params.departments.map((department) => ({
    id: department.id,
    name: department.name,
    parentDepartmentId: department.parentDepartmentId,
  })) satisfies ReportDepartmentOption[];

  if (!params.currentProfileId) {
    return {
      roleScope: "member" as ReportAccessScope,
      accessibleProfileIds: [],
      accessibleDepartmentIds: [],
      profileOptions: [],
      departmentOptions: [],
      profileNameById: {},
      departmentNameById,
      membershipsByProfileId: {},
    } satisfies ReportingScopeDirectory;
  }

  const roleScope: ReportAccessScope = params.hasDirectorRole ? "director" : params.canManage ? "leader" : "member";

  const accessibleDepartmentIds =
    roleScope === "director"
      ? params.departments.map((department) => department.id)
      : roleScope === "leader"
        ? buildDepartmentSubtreeIds(
            params.managedDepartments.map((department) => department.id),
            params.departments,
          )
        : [
            ...new Set(
              params.memberships
                .map((membership) => membership.departmentId)
                .filter((value): value is string => Boolean(value)),
            ),
          ];

  const membershipRows =
    roleScope === "director"
      ? await supabase.from("user_role_in_department").select("profile_id,department_id")
      : roleScope === "leader"
        ? accessibleDepartmentIds.length > 0
          ? await supabase
              .from("user_role_in_department")
              .select("profile_id,department_id")
              .in("department_id", accessibleDepartmentIds)
          : { data: [] as UserRoleRow[], error: null }
        : {
            data: params.memberships.map((membership) => ({
              profile_id: membership.profileId,
              department_id: membership.departmentId,
            })),
            error: null,
          };

  if (membershipRows.error) {
    throw new Error(membershipRows.error.message || "Không tải được phạm vi nhân sự cho báo cáo.");
  }

  const typedMembershipRows = ((membershipRows.data ?? []) as UserRoleRow[]).map((row) => ({
    profile_id: row.profile_id ? String(row.profile_id) : null,
    department_id: row.department_id ? String(row.department_id) : null,
  }));

  const accessibleProfileIds = [
    ...new Set(
      [
        params.currentProfileId,
        ...typedMembershipRows
          .map((row) => row.profile_id)
          .filter((value): value is string => Boolean(value)),
      ].filter(Boolean),
    ),
  ] as string[];

  const membershipsByProfileId = typedMembershipRows.reduce<Record<string, string[]>>((acc, row) => {
    if (!row.profile_id || !row.department_id) {
      return acc;
    }
    if (!acc[row.profile_id]) {
      acc[row.profile_id] = [];
    }
    if (!acc[row.profile_id].includes(row.department_id)) {
      acc[row.profile_id].push(row.department_id);
    }
    return acc;
  }, {});

  const profilesResult =
    accessibleProfileIds.length > 0
      ? await supabase.from("profiles").select("id,name,email").in("id", accessibleProfileIds)
      : { data: [] as ProfileRow[], error: null };

  if (profilesResult.error) {
    throw new Error(profilesResult.error.message || "Không tải được danh sách nhân sự cho báo cáo.");
  }

  const profileNameById = ((profilesResult.data ?? []) as ProfileRow[]).reduce<Record<string, string>>((acc, profile) => {
    acc[String(profile.id)] = profile.name?.trim() || profile.email?.trim() || "Không rõ";
    return acc;
  }, {});

  if (!profileNameById[params.currentProfileId]) {
    profileNameById[params.currentProfileId] = params.currentProfileName?.trim() || "Tôi";
  }

  const profileOptions = accessibleProfileIds
    .map((profileId) => {
      const matchedProfile = ((profilesResult.data ?? []) as ProfileRow[]).find((item) => String(item.id) === profileId);
      return {
        id: profileId,
        name: profileNameById[profileId] ?? "Không rõ",
        email: matchedProfile?.email ? String(matchedProfile.email) : null,
      } satisfies ReportProfileOption;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));

  const departmentOptions = (roleScope === "director"
    ? allDepartmentOptions
    : allDepartmentOptions.filter((department) => accessibleDepartmentIds.includes(department.id))
  ).sort((a, b) => a.name.localeCompare(b.name, "vi"));

  return {
    roleScope,
    accessibleProfileIds,
    accessibleDepartmentIds,
    profileOptions,
    departmentOptions,
    profileNameById,
    departmentNameById,
    membershipsByProfileId,
  } satisfies ReportingScopeDirectory;
};
