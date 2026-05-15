import {
  formatKeyResultContributionTypeLabel,
  formatKeyResultMetric,
  formatKeyResultTypeLabel,
  formatKeyResultUnit,
} from "@/lib/constants/key-results";
import { formatGoalTypeLabel, GOAL_STATUSES } from "@/lib/constants/goals";
import {
  getTaskPriorityLabel,
  normalizeTaskStatus,
  TASK_STATUSES,
  TASK_TYPES,
} from "@/lib/constants/tasks";
import { formatDateDdMmYyyy, formatDateTimeDdMmYyyy } from "@/lib/date-format";

export type ActivityEntityType = "goal" | "key_result" | "task";

export type ActivityLogPayload = Record<string, unknown> | null;

export type ActivityLogLike = {
  action: string | null;
  entityType: string | null;
  oldValue: ActivityLogPayload;
  newValue: ActivityLogPayload;
};

export type ActivityLogChange = {
  field: string;
  label: string;
  oldText: string;
  newText: string;
};

export type ActivityActionKind =
  | "created"
  | "updated"
  | "deleted"
  | "progress_updated"
  | "status_changed"
  | "details_updated"
  | "unknown";

const ENTITY_LABELS: Record<ActivityEntityType, string> = {
  goal: "Mục tiêu",
  key_result: "Kết quả then chốt",
  task: "Công việc",
};

const TECHNICAL_FIELDS = new Set([
  "id",
  "created_at",
  "updated_at",
  "creator_profile_id",
  "owner_id",
  "profile_id",
]);

const goalStatusLabelMap = GOAL_STATUSES.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const taskStatusLabelMap = TASK_STATUSES.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const taskTypeLabelMap = TASK_TYPES.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const FIELD_LABELS_BY_ENTITY: Record<ActivityEntityType, Record<string, string>> = {
  goal: {
    title: "Tiêu đề",
    name: "Tên mục tiêu",
    description: "Mô tả",
    type: "Loại mục tiêu",
    department_id: "Phòng ban",
    status: "Trạng thái",
    progress: "Tiến độ",
    quarter: "Quý",
    year: "Năm",
    note: "Ghi chú",
    start_date: "Ngày bắt đầu",
    end_date: "Ngày kết thúc",
    target: "Chỉ tiêu",
    unit: "Đơn vị",
  },
  key_result: {
    title: "Tiêu đề",
    name: "Tên KR",
    description: "Mô tả",
    type: "Loại KR",
    contribution_type: "Kiểu đóng góp",
    start_value: "Giá trị bắt đầu",
    current: "Giá trị",
    progress: "Tiến độ",
    target: "Mục tiêu",
    unit: "Đơn vị",
    weight: "Trọng số",
    responsible_department_id: "Phòng ban phụ trách",
    start_date: "Ngày bắt đầu",
    end_date: "Ngày kết thúc",
    status: "Trạng thái",
  },
  task: {
    title: "Tiêu đề",
    name: "Tên công việc",
    description: "Mô tả",
    note: "Ghi chú",
    type: "Loại công việc",
    priority: "Mức ưu tiên",
    status: "Trạng thái",
    current: "Giá trị",
    progress: "Tiến độ",
    target: "Mục tiêu",
    unit: "Đơn vị",
    weight: "Trọng số",
    start_date: "Ngày bắt đầu",
    end_date: "Ngày kết thúc",
    assignee_id: "Người được giao",
    key_result_id: "KR liên kết",
    is_recurring: "Lặp lại",
    hypothesis: "Giả thuyết",
    result: "Kết quả",
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isDateOnlyString = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const isDateTimeString = (value: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) || /\+\d{2}:\d{2}$/.test(value);

const normalizeText = (value: string | null | undefined) => (value ?? "").trim();

const toActivityEntityType = (value: string | null | undefined): ActivityEntityType | null => {
  if (value === "goal" || value === "key_result" || value === "task") {
    return value;
  }
  return null;
};

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const formatNumeric = (value: number) =>
  new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);

const formatPercentValue = (
  value: unknown,
  options?: {
    treatFractionAsPercent?: boolean;
  },
) => {
  const numeric = toNumber(value);
  if (numeric === null) {
    return "Không có";
  }

  const shouldScaleFraction = options?.treatFractionAsPercent && numeric >= 0 && numeric <= 1;
  const normalized = shouldScaleFraction ? numeric * 100 : numeric;
  return `${formatNumeric(normalized)}%`;
};

const formatRawStatusLabel = (value: string | null | undefined) => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) {
    return "Không có";
  }

  if (goalStatusLabelMap[normalized]) {
    return goalStatusLabelMap[normalized];
  }

  const taskStatus = taskStatusLabelMap[normalizeTaskStatus(normalized)];
  if (taskStatus) {
    return taskStatus;
  }

  if (normalized === "paused" || normalized === "blocked" || normalized === "on_hold") {
    return "Tạm dừng";
  }

  return value ?? "Không có";
};

const formatFieldLabel = (entityType: ActivityEntityType, field: string) =>
  FIELD_LABELS_BY_ENTITY[entityType][field] ??
  field
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const isTaskProgressCurrentField = ({
  entityType,
  field,
  actionKind,
}: {
  entityType: ActivityEntityType;
  field: string;
  actionKind: ActivityActionKind;
}) => entityType === "task" && field === "current" && actionKind === "progress_updated";

const formatFieldValue = ({
  entityType,
  field,
  value,
  payload,
  actionKind,
}: {
  entityType: ActivityEntityType;
  field: string;
  value: unknown;
  payload: ActivityLogPayload;
  actionKind: ActivityActionKind;
}) => {
  if (value === null || value === undefined || value === "") {
    return "Không có";
  }

  if (isTaskProgressCurrentField({ entityType, field, actionKind })) {
    return formatPercentValue(value, { treatFractionAsPercent: true });
  }

  if (field === "progress") {
    return formatPercentValue(value, {
      treatFractionAsPercent: entityType === "task" && actionKind === "progress_updated",
    });
  }

  if (field === "status" && typeof value === "string") {
    return formatRawStatusLabel(value);
  }

  if (field === "type" && typeof value === "string") {
    if (entityType === "goal") {
      return formatGoalTypeLabel(value);
    }
    if (entityType === "key_result") {
      return formatKeyResultTypeLabel(value);
    }
    return taskTypeLabelMap[value] ?? value;
  }

  if (field === "priority" && typeof value === "string") {
    return getTaskPriorityLabel(value);
  }

  if (field === "contribution_type" && typeof value === "string") {
    return formatKeyResultContributionTypeLabel(value);
  }

  if (field === "unit" && typeof value === "string") {
    return formatKeyResultUnit(value);
  }

  if (
    (field === "start_value" || field === "current" || field === "target") &&
    (entityType === "key_result" || entityType === "task")
  ) {
    const numeric = toNumber(value);
    const unit = typeof payload?.unit === "string" ? payload.unit : null;
    return numeric === null ? "Không có" : formatKeyResultMetric(numeric, unit);
  }

  if (field === "target" && entityType === "goal") {
    const numeric = toNumber(value);
    return numeric === null ? "Không có" : formatNumeric(numeric);
  }

  if (field === "weight") {
    const numeric = toNumber(value);
    return numeric === null ? "Không có" : formatNumeric(numeric);
  }

  if (typeof value === "boolean") {
    return value ? "Có" : "Không";
  }

  if (typeof value === "number") {
    return formatNumeric(value);
  }

  if (typeof value === "string") {
    if (isDateOnlyString(value)) {
      return formatDateDdMmYyyy(value, "Không có", "Không hợp lệ");
    }
    if (isDateTimeString(value)) {
      return formatDateTimeDdMmYyyy(value, "Không có", "Không hợp lệ");
    }
    return value || "Không có";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "Không đọc được dữ liệu";
  }
};

const toRelevantProgressFields = (entityType: ActivityEntityType) => {
  if (entityType === "goal") {
    return ["progress"];
  }

  return ["current", "progress"];
};

export const getActivityEntityLabel = (entityType: string | null | undefined) => {
  const normalized = toActivityEntityType(entityType);
  return normalized ? ENTITY_LABELS[normalized] : "Đối tượng";
};

export const getActivityActionKind = (action: string | null | undefined): ActivityActionKind => {
  const normalized = normalizeText(action).toLowerCase();

  if (!normalized) {
    return "unknown";
  }

  if (normalized === "insert" || normalized.endsWith("_created")) {
    return "created";
  }

  if (normalized === "delete" || normalized.endsWith("_deleted")) {
    return "deleted";
  }

  if (normalized.endsWith("_progress_updated")) {
    return "progress_updated";
  }

  if (normalized.endsWith("_status_changed")) {
    return "status_changed";
  }

  if (normalized.endsWith("_details_updated")) {
    return "details_updated";
  }

  if (normalized === "update" || normalized.endsWith("_updated")) {
    return "updated";
  }

  return "unknown";
};

export const getActivityActionLabel = (
  action: string | null | undefined,
  entityType?: string | null | undefined,
) => {
  void entityType;

  const kind = getActivityActionKind(action);
  if (kind === "created") {
    return "Đã tạo";
  }
  if (kind === "deleted") {
    return "Đã xoá";
  }
  if (kind === "progress_updated") {
    return "Cập nhật tiến độ";
  }
  if (kind === "status_changed") {
    return "Đổi trạng thái";
  }
  if (kind === "details_updated") {
    return "Cập nhật thông tin";
  }
  if (kind === "updated") {
    return "Đã cập nhật";
  }

  return "Đã cập nhật";
};

export const getActivityObjectName = ({
  oldValue,
  newValue,
}: {
  oldValue: ActivityLogPayload;
  newValue: ActivityLogPayload;
}) => {
  const candidates = [newValue?.title, newValue?.name, oldValue?.title, oldValue?.name];
  const resolved = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return typeof resolved === "string" ? resolved.trim() : null;
};

export const getChangedFields = (
  oldValue: ActivityLogPayload,
  newValue: ActivityLogPayload,
  entityType: string | null | undefined,
  action?: string | null | undefined,
) => {
  const normalizedEntityType = toActivityEntityType(entityType);
  if (!normalizedEntityType) {
    return [] as ActivityLogChange[];
  }

  const actionKind = getActivityActionKind(action);

  const oldRecord = isRecord(oldValue) ? oldValue : null;
  const newRecord = isRecord(newValue) ? newValue : null;
  const orderedKeys = [
    ...Object.keys(FIELD_LABELS_BY_ENTITY[normalizedEntityType]),
    ...Object.keys(oldRecord ?? {}),
    ...Object.keys(newRecord ?? {}),
  ];

  const uniqueKeys = Array.from(new Set(orderedKeys)).filter((field) => !TECHNICAL_FIELDS.has(field));

  return uniqueKeys.reduce<ActivityLogChange[]>((acc, field) => {
    const previous = oldRecord?.[field];
    const next = newRecord?.[field];

    if (JSON.stringify(previous) === JSON.stringify(next)) {
      return acc;
    }

    acc.push({
      field,
      label: isTaskProgressCurrentField({
        entityType: normalizedEntityType,
        field,
        actionKind,
      })
        ? "Tiến độ"
        : formatFieldLabel(normalizedEntityType, field),
      oldText: formatFieldValue({
        entityType: normalizedEntityType,
        field,
        value: previous,
        payload: oldRecord,
        actionKind,
      }),
      newText: formatFieldValue({
        entityType: normalizedEntityType,
        field,
        value: next,
        payload: newRecord,
        actionKind,
      }),
    });
    return acc;
  }, []);
};

export const getActivityVisibleChanges = (
  log: ActivityLogLike,
  limit = 3,
) => {
  const normalizedEntityType = toActivityEntityType(log.entityType);
  if (!normalizedEntityType) {
    return [] as ActivityLogChange[];
  }

  const kind = getActivityActionKind(log.action);
  const changedFields = getChangedFields(
    log.oldValue,
    log.newValue,
    normalizedEntityType,
    log.action,
  );

  if (kind === "created" || kind === "deleted") {
    return [];
  }

  if (kind === "progress_updated") {
    const progressFields = new Set(toRelevantProgressFields(normalizedEntityType));
    return changedFields.filter((item) => progressFields.has(item.field));
  }

  if (kind === "status_changed") {
    return changedFields.filter((item) => item.field === "status");
  }

  if (kind === "details_updated" || kind === "updated" || kind === "unknown") {
    return changedFields.slice(0, limit);
  }

  return changedFields.slice(0, limit);
};

export const getActivityTitle = ({
  actorName,
  action,
  entityType,
  oldValue,
  newValue,
}: {
  actorName: string | null | undefined;
  action: string | null;
  entityType: string | null;
  oldValue: ActivityLogPayload;
  newValue: ActivityLogPayload;
}) => {
  const safeActorName = normalizeText(actorName) || "Hệ thống";
  const actionLabel = getActivityActionLabel(action, entityType);
  const entityLabel = getActivityEntityLabel(entityType);
  const objectName = getActivityObjectName({ oldValue, newValue });
  const actionText = actionLabel.charAt(0).toLowerCase() + actionLabel.slice(1);

  return `${safeActorName} ${actionText} ${entityLabel}${objectName ? ` “${objectName}”` : ""}`;
};

export const getActivityChangeSummary = (log: ActivityLogLike) => {
  const normalizedEntityType = toActivityEntityType(log.entityType);
  if (!normalizedEntityType) {
    return "Thông tin đã được cập nhật";
  }

  const kind = getActivityActionKind(log.action);
  const changedFields = getChangedFields(
    log.oldValue,
    log.newValue,
    normalizedEntityType,
    log.action,
  );

  if (kind === "created" || kind === "deleted") {
    return null;
  }

  if (kind === "progress_updated") {
    const visibleChanges = getActivityVisibleChanges(log, 3);
    const progressChange = visibleChanges.find((item) => item.field === "progress") ?? null;
    const currentChange = visibleChanges.find((item) => item.field === "current") ?? null;
    const parts: string[] = [];

    if (currentChange) {
      parts.push(`Giá trị: ${currentChange.oldText} → ${currentChange.newText}`);
    }

    if (progressChange) {
      parts.push(`Tiến độ: ${progressChange.oldText} → ${progressChange.newText}`);
    }

    return parts.length > 0 ? parts.join(" · ") : "Tiến độ đã được cập nhật";
  }

  if (kind === "status_changed") {
    const statusChange = changedFields.find((item) => item.field === "status") ?? null;
    return statusChange
      ? `Trạng thái: ${statusChange.oldText} → ${statusChange.newText}`
      : "Trạng thái đã được cập nhật";
  }

  const visibleChanges = changedFields.slice(0, 3);
  if (visibleChanges.length === 0) {
    return "Thông tin đã được cập nhật";
  }

  const hiddenCount = Math.max(0, changedFields.length - visibleChanges.length);
  const labelText = visibleChanges.map((item) => item.label).join(", ");
  return hiddenCount > 0
    ? `Thay đổi: ${labelText} · +${hiddenCount} thay đổi khác`
    : `Thay đổi: ${labelText}`;
};
