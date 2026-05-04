"use client";

import Link from "next/link";
import {
  PointerEvent,
  Suspense,
  WheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GOAL_STATUSES,
  GOAL_TYPES,
  formatGoalTypeLabel,
  getGoalProgressHelp,
  normalizeGoalTypeValue,
} from "@/lib/constants/goals";
import { buildGoalProgressMap, buildKeyResultProgressMap } from "@/lib/okr";
import { formatKeyResultMetric, formatKeyResultUnit } from "@/lib/constants/key-results";
import {
  formatGoalOwnersSummary,
  getGoalOwnerSearchText,
  loadGoalOwnersByGoalIds,
  type GoalOwnerProfile,
} from "@/lib/goal-owners";
import { buildWorkspaceAccessDebug, useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";
import { formatTimelineRangeVi } from "@/lib/timeline";

type Mode = "canvas" | "list";
const GOALS_LIST_PAGE_SIZE = 10;

type GoalKeyResultPreview = {
  id: string;
  name: string;
  progress: number;
  contributionType: string | null;
  supportTargetSummary: string | null;
};

type GoalNode = {
  id: string;
  nhom: string;
  loai: string;
  tieuDe: string;
  phongBan: string;
  teamSummary: string;
  teamNames: string[];
  departmentCount: number;
  quy: string;
  quarter: number | null;
  year: number | null;
  owners: GoalOwnerProfile[];
  ownersSummary: string;
  statusLabel: string;
  moTa: string;
  progress: number;
  status: string;
  target: number | null;
  unit: string | null;
  createdAt: string | null;
  keyResultCount: number;
  taskCount: number;
  keyResultsPreview: GoalKeyResultPreview[];
  startDate: string | null;
  endDate: string | null;
  healthStatus: "on_track" | "at_risk" | "off_track";
  x: number;
  y: number;
  mau: "blue" | "indigo" | "emerald" | "orange";
};

type GoalEdge = {
  from: string;
  to: string;
};

type GoalCanvasKeyResultNode = {
  id: string;
  goalId: string;
  keyResultId: string;
  name: string;
  progress: number;
  contributionType: string | null;
  supportTargetSummary: string | null;
  x: number;
  y: number;
};

type KeyResultDetailPanelItem = {
  id: string;
  goalId: string;
  name: string;
  contributionType: string | null;
  supportTargetSummary: string | null;
  progress: number;
  startValue: number | null;
  current: number | null;
  target: number | null;
  unit: string | null;
  startDate: string | null;
  endDate: string | null;
};

type CanvasNodePosition = {
  x: number;
  y: number;
};

type CanvasBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type CanvasEdgeFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CanvasDragTarget =
  | { type: "goal"; id: string }
  | { type: "key_result"; id: string; goalId: string; keyResultId: string };

type CanvasFocusTarget =
  | { type: "goal"; goalId: string }
  | { type: "key_result"; goalId: string; keyResultId: string };

type GoalRow = {
  id: string;
  name: string;
  description: string | null;
  type: string | null;
  department_id: string | null;
  status: string | null;
  quarter: number | null;
  year: number | null;
  note: string | null;
  target: number | null;
  unit: string | null;
  created_at: string | null;
  start_date: string | null;
  end_date: string | null;
};

type KeyResultRow = {
  id: string;
  goal_id: string;
  name: string;
  contribution_type: string | null;
  start_value: number | null;
  current: number | null;
  target: number | null;
  unit: string | null;
  weight: number | null;
  start_date: string | null;
  end_date: string | null;
};

type KeyResultSupportLinkRow = {
  support_key_result_id: string | null;
  target_key_result_id: string | null;
};

type GoalDepartmentParticipationRow = {
  goal_id: string | null;
  department_id: string | null;
};

type ActivityLogAction =
  | "goal_created"
  | "goal_updated"
  | "goal_status_changed"
  | "goal_progress_updated"
  | "goal_deleted";

type ActivityLogRow = {
  id: string;
  entity_id: string | null;
  entity_type: string | null;
  profile_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string | null;
  action: ActivityLogAction | string | null;
};

type ActivityLogItem = {
  id: string;
  profileName: string;
  action: ActivityLogAction | string | null;
  entityType: string | null;
  createdAt: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
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
  departments: Array<{ id: string; name: string; parent_department_id: string | null }>;
  rootDepartments: Array<{ id: string; name: string }>;
  canCreateGoal: boolean;
  error: string | null;
};

const CARD_WIDTH = 320;
const CARD_HEIGHT = 286;
const KR_CARD_WIDTH = 216;
const KR_CARD_HEIGHT = 112;
const KR_CARD_GAP = 36;
const GOAL_TO_KR_GAP = 128;
const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 2200;
const WORLD_INITIAL_SCALE = 0.86;
const WORLD_MIN_SCALE = 0.2;
const WORLD_MAX_SCALE = 1.4;
const CANVAS_DRAG_THRESHOLD = 5;
const CANVAS_FOCUS_ANIMATION_MS = 240;

const statusLabelMap = GOAL_STATUSES.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const goalLogActionLabelMap: Record<ActivityLogAction, string> = {
  goal_created: "Tạo mục tiêu",
  goal_updated: "Cập nhật mục tiêu",
  goal_status_changed: "Thay đổi trạng thái",
  goal_progress_updated: "Cập nhật tiến độ",
  goal_deleted: "Xóa mục tiêu",
};

const goalLogFieldLabelMap: Record<string, string> = {
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
};

const goalHealthLabelMap: Record<GoalNode["healthStatus"], string> = {
  on_track: "Đúng tiến độ",
  at_risk: "Có rủi ro",
  off_track: "Chậm tiến độ",
};

const getColorByStatus = (status: string | null): GoalNode["mau"] => {
  if (status === "completed") {
    return "emerald";
  }
  if (status === "cancelled") {
    return "orange";
  }
  if (status === "active") {
    return "blue";
  }
  return "indigo";
};

const formatQuarterYear = (quarter: number | null, year: number | null) => {
  if (quarter && year) {
    return `Q${quarter} ${year}`;
  }
  if (year) {
    return `Năm ${year}`;
  }
  return "Chưa đặt quý";
};

const getGoalHealthStatus = ({
  endDate,
  hasKeyResults,
  progress,
}: {
  endDate: string | null;
  hasKeyResults: boolean;
  progress: number;
}): GoalNode["healthStatus"] => {
  if (!hasKeyResults) {
    return "off_track";
  }

  const normalizedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const deadline = endDate ? new Date(endDate) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (deadline && !Number.isNaN(deadline.getTime())) {
    deadline.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0 && normalizedProgress < 100) {
      return "off_track";
    }
    if (diffDays <= 14 && normalizedProgress < 70) {
      return "at_risk";
    }
  }

  if (normalizedProgress < 35) {
    return "at_risk";
  }

  return "on_track";
};

const formatDateTimeVi = (value: string | null) => {
  if (!value) {
    return "Chưa có";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Không hợp lệ";
  }
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

const toGoalLogActionLabel = (action: ActivityLogAction | string | null) => {
  if (!action) {
    return "Cập nhật";
  }
  if (action in goalLogActionLabelMap) {
    return goalLogActionLabelMap[action as ActivityLogAction];
  }
  return action;
};

const toGoalLogValueText = (value: unknown) => {
  if (value === null || value === undefined) {
    return "Không có";
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return String(value);
    }
    return "Không hợp lệ";
  }
  if (typeof value === "boolean") {
    return value ? "Có" : "Không";
  }
  if (typeof value === "string") {
    return value || "Không có";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "Không đọc được";
  }
};

const toGoalLogSummary = (
  action: ActivityLogAction | string | null,
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
) => {
  if (action === "goal_status_changed") {
    const oldStatusRaw = typeof oldValue?.status === "string" ? oldValue.status : null;
    const newStatusRaw = typeof newValue?.status === "string" ? newValue.status : null;
    const oldStatus = oldStatusRaw ? (statusLabelMap[oldStatusRaw] ?? oldStatusRaw) : "Không có";
    const newStatus = newStatusRaw ? (statusLabelMap[newStatusRaw] ?? newStatusRaw) : "Không có";
    return `Trạng thái: ${oldStatus} → ${newStatus}`;
  }

  if (action === "goal_progress_updated") {
    const oldProgress =
      typeof oldValue?.progress === "number" ? Math.round(oldValue.progress) : null;
    const newProgress =
      typeof newValue?.progress === "number" ? Math.round(newValue.progress) : null;
    return `Tiến độ: ${oldProgress ?? 0}% → ${newProgress ?? 0}%`;
  }

  if (action === "goal_created") {
    return "Mục tiêu được khởi tạo.";
  }

  if (action === "goal_deleted") {
    return "Mục tiêu đã bị xóa.";
  }

  const oldObj = oldValue ?? {};
  const newObj = newValue ?? {};
  const keys = [...new Set([...Object.keys(oldObj), ...Object.keys(newObj)])];
  const changedKeys = keys.filter((key) => {
    const oldJson = JSON.stringify(oldObj[key]);
    const newJson = JSON.stringify(newObj[key]);
    return oldJson !== newJson;
  });

  if (changedKeys.length === 0) {
    return "Cập nhật thông tin mục tiêu.";
  }

  const labels = changedKeys.map((key) => goalLogFieldLabelMap[key] ?? key);
  return `Thay đổi: ${labels.join(", ")}.`;
};

const buildGoalGraph = (
  rows: GoalRow[],
  departmentsById: Record<string, string>,
  goalDepartmentNamesByGoalId: Record<string, string[]>,
  keyResultsByGoalId: Record<string, GoalKeyResultPreview[]>,
  supportTargetIdsByKeyResultId: Record<string, string[]>,
  taskCountByGoalId: Record<string, number>,
  goalProgressById: Record<string, number>,
  goalOwnersByGoalId: Record<string, GoalOwnerProfile[]>,
): {
  nodes: GoalNode[];
  edges: GoalEdge[];
  keyResultNodePositions: Record<string, CanvasNodePosition>;
} => {
  if (!rows.length) {
    return { nodes: [], edges: [], keyResultNodePositions: {} };
  }

  const sortRows = (items: GoalRow[]) =>
    [...items].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (aTime !== bTime) {
        return aTime - bTime;
      }
      return a.name.localeCompare(b.name, "vi");
    });

  const sortedRows = sortRows(rows);
  const topPadding = 140;
  const sidePadding = 96;
  const horizontalGap = 144;
  const verticalGap = 136;

  const positionedNodes: GoalNode[] = [];
  const layoutItems = sortedRows.map((row) => {
    const statusLabel = row.status ? (statusLabelMap[row.status] ?? row.status) : "Nháp";
    const normalizedGoalType = normalizeGoalTypeValue(row.type);
    const typeLabel = formatGoalTypeLabel(normalizedGoalType);
    const progress = goalProgressById[row.id] ?? 0;
    const goalOwners = goalOwnersByGoalId[row.id] ?? [];
    const participatingDepartmentNames = goalDepartmentNamesByGoalId[row.id] ?? [];
    const primaryDepartmentName = row.department_id
      ? (departmentsById[row.department_id] ?? "Chưa có phòng ban")
      : (participatingDepartmentNames[0] ?? "Chưa có phòng ban");
    const mergedDepartmentNames = Array.from(
      new Set([primaryDepartmentName, ...participatingDepartmentNames].filter(Boolean)),
    );
    const healthStatus = getGoalHealthStatus({
      endDate: row.end_date ?? null,
      hasKeyResults: (keyResultsByGoalId[row.id]?.length ?? 0) > 0,
      progress,
    });
    const keyResultCount = keyResultsByGoalId[row.id]?.length ?? 0;
    const keyResultFootprintWidth =
      keyResultCount > 0 ? keyResultCount * KR_CARD_WIDTH + (keyResultCount - 1) * KR_CARD_GAP : 0;
    const footprintWidth = Math.max(CARD_WIDTH, keyResultFootprintWidth);
    const footprintHeight =
      CARD_HEIGHT + (keyResultCount > 0 ? GOAL_TO_KR_GAP + KR_CARD_HEIGHT : 0);

    return {
      node: {
        id: row.id,
        nhom: typeLabel,
        loai: normalizedGoalType,
        tieuDe: row.name,
        phongBan: primaryDepartmentName,
        teamSummary:
          mergedDepartmentNames.length > 1
            ? `${primaryDepartmentName} +${mergedDepartmentNames.length - 1}`
            : primaryDepartmentName,
        teamNames: mergedDepartmentNames,
        departmentCount: mergedDepartmentNames.length,
        quy: formatQuarterYear(row.quarter, row.year),
        quarter: row.quarter ?? null,
        year: row.year ?? null,
        owners: goalOwners,
        ownersSummary: formatGoalOwnersSummary(goalOwners, { limit: 2 }),
        statusLabel,
        moTa: row.description || row.note || "Chưa có mô tả",
        progress,
        status: row.status ?? "draft",
        target:
          row.target === null || row.target === undefined
            ? null
            : typeof row.target === "number"
              ? row.target
              : Number(row.target),
        unit: row.unit ? String(row.unit) : null,
        createdAt: row.created_at ?? null,
        keyResultCount,
        taskCount: taskCountByGoalId[row.id] ?? 0,
        keyResultsPreview: keyResultsByGoalId[row.id] ?? [],
        startDate: row.start_date ?? null,
        endDate: row.end_date ?? null,
        healthStatus,
        mau: getColorByStatus(row.status),
      },
      footprintWidth,
      footprintHeight,
    };
  });

  const maxRowWidth = WORLD_WIDTH - sidePadding * 2;
  const layoutRows: Array<typeof layoutItems> = [];
  let currentRow: typeof layoutItems = [];
  let currentRowWidth = 0;

  layoutItems.forEach((item) => {
    const nextRowWidth =
      currentRow.length === 0
        ? item.footprintWidth
        : currentRowWidth + horizontalGap + item.footprintWidth;

    if (currentRow.length > 0 && nextRowWidth > maxRowWidth) {
      layoutRows.push(currentRow);
      currentRow = [item];
      currentRowWidth = item.footprintWidth;
      return;
    }

    currentRow.push(item);
    currentRowWidth = nextRowWidth;
  });

  if (currentRow.length > 0) {
    layoutRows.push(currentRow);
  }

  let cursorY = topPadding;

  layoutRows.forEach((rowItems) => {
    const rowWidth = rowItems.reduce(
      (sum, item, index) => sum + item.footprintWidth + (index === 0 ? 0 : horizontalGap),
      0,
    );
    const rowHeight = rowItems.reduce(
      (maxHeight, item) => Math.max(maxHeight, item.footprintHeight),
      CARD_HEIGHT,
    );
    let cursorX = Math.max(sidePadding, (WORLD_WIDTH - rowWidth) / 2);

    rowItems.forEach((item) => {
      const goalX = cursorX + (item.footprintWidth - CARD_WIDTH) / 2;

      positionedNodes.push({
        ...item.node,
        x: Math.min(WORLD_WIDTH - CARD_WIDTH - sidePadding, Math.max(sidePadding, goalX)),
        y: Math.min(WORLD_HEIGHT - CARD_HEIGHT - sidePadding, Math.max(sidePadding, cursorY)),
      });

      cursorX += item.footprintWidth + horizontalGap;
    });

    cursorY += rowHeight + verticalGap;
  });

  const keyResultNodePositions = positionedNodes.reduce<Record<string, CanvasNodePosition>>(
    (acc, goal) => {
      if (goal.keyResultsPreview.length === 0) {
        return acc;
      }

      const totalWidth =
        goal.keyResultsPreview.length * KR_CARD_WIDTH +
        (goal.keyResultsPreview.length - 1) * KR_CARD_GAP;
      const startX = goal.x + CARD_WIDTH / 2 - totalWidth / 2;
      const y = goal.y + CARD_HEIGHT + GOAL_TO_KR_GAP;

      goal.keyResultsPreview.forEach((keyResult, index) => {
        acc[`kr:${goal.id}:${keyResult.id}`] = {
          x: startX + index * (KR_CARD_WIDTH + KR_CARD_GAP),
          y,
        };
      });

      return acc;
    },
    {},
  );

  const keyResultNodeIdByKeyResultId = positionedNodes.reduce<Record<string, string>>(
    (acc, goal) => {
      goal.keyResultsPreview.forEach((keyResult) => {
        acc[keyResult.id] = `kr:${goal.id}:${keyResult.id}`;
      });
      return acc;
    },
    {},
  );

  return {
    nodes: positionedNodes,
    edges: positionedNodes.flatMap((goal) =>
      goal.keyResultsPreview.flatMap((keyResult) => {
        const keyResultNodeId = `kr:${goal.id}:${keyResult.id}`;
        if (keyResult.contributionType === "support") {
          return (supportTargetIdsByKeyResultId[keyResult.id] ?? [])
            .map((targetKeyResultId) => keyResultNodeIdByKeyResultId[targetKeyResultId] ?? null)
            .filter((value): value is string => Boolean(value))
            .map((targetNodeId) => ({
              from: targetNodeId,
              to: keyResultNodeId,
            }));
        }

        return [
          {
            from: goal.id,
            to: keyResultNodeId,
          },
        ];
      }),
    ),
    keyResultNodePositions,
  };
};

const badgeMap: Record<GoalNode["mau"], string> = {
  blue: "bg-blue-50 text-blue-700",
  indigo: "bg-indigo-50 text-indigo-700",
  emerald: "bg-emerald-50 text-emerald-700",
  orange: "bg-orange-50 text-orange-700",
};

const healthBadgeMap: Record<GoalNode["healthStatus"], string> = {
  on_track: "bg-emerald-50 text-emerald-700",
  at_risk: "bg-amber-50 text-amber-700",
  off_track: "bg-rose-50 text-rose-700",
};

const getCanvasConnectorPath = (fromNode: CanvasEdgeFrame, toNode: CanvasEdgeFrame) => {
  const fromCenterX = fromNode.x + fromNode.width / 2;
  const fromCenterY = fromNode.y + fromNode.height / 2;
  const toCenterX = toNode.x + toNode.width / 2;
  const toCenterY = toNode.y + toNode.height / 2;

  let startX = fromCenterX;
  let startY = fromNode.y + fromNode.height;
  let endX = toCenterX;
  let endY = toNode.y;

  if (toNode.y >= fromNode.y + fromNode.height + 12) {
    startX = fromCenterX;
    startY = fromNode.y + fromNode.height;
    endX = toCenterX;
    endY = toNode.y;
  } else if (fromNode.y >= toNode.y + toNode.height + 12) {
    startX = fromCenterX;
    startY = fromNode.y;
    endX = toCenterX;
    endY = toNode.y + toNode.height;
  } else if (toCenterX >= fromCenterX) {
    startX = fromNode.x + fromNode.width;
    startY = fromCenterY;
    endX = toNode.x;
    endY = toCenterY;
  } else {
    startX = fromNode.x;
    startY = fromCenterY;
    endX = toNode.x + toNode.width;
    endY = toCenterY;
  }

  const deltaX = endX - startX;
  const deltaY = endY - startY;

  if (Math.abs(deltaY) >= Math.abs(deltaX)) {
    const directionY = deltaY === 0 ? 1 : Math.sign(deltaY);
    const controlOffset = Math.max(36, Math.min(104, Math.abs(deltaY) * 0.45));
    return `M ${startX} ${startY} C ${startX} ${startY + directionY * controlOffset}, ${endX} ${
      endY - directionY * controlOffset
    }, ${endX} ${endY}`;
  }

  const directionX = deltaX === 0 ? 1 : Math.sign(deltaX);
  const controlOffset = Math.max(36, Math.min(120, Math.abs(deltaX) * 0.45));
  return `M ${startX} ${startY} C ${startX + directionX * controlOffset} ${startY}, ${
    endX - directionX * controlOffset
  } ${endY}, ${endX} ${endY}`;
};

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-blue-600" style={{ width: `${value}%` }} />
    </div>
  );
}

function GoalsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspaceAccess = useWorkspaceAccess();

  const [nodes, setNodes] = useState<GoalNode[]>([]);
  const [edges, setEdges] = useState<GoalEdge[]>([]);
  const [goalNodePositions, setGoalNodePositions] = useState<Record<string, CanvasNodePosition>>(
    {},
  );
  const [keyResultNodePositions, setKeyResultNodePositions] = useState<
    Record<string, CanvasNodePosition>
  >({});
  const [draggingTarget, setDraggingTarget] = useState<CanvasDragTarget | null>(null);
  const [canvasScale, setCanvasScale] = useState(WORLD_INITIAL_SCALE);
  const [viewportOffset, setViewportOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isLoadingGoals, setIsLoadingGoals] = useState(true);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [goalLogs, setGoalLogs] = useState<ActivityLogItem[]>([]);
  const [isGoalLogsOpen, setIsGoalLogsOpen] = useState(false);
  const [isLoadingGoalLogs, setIsLoadingGoalLogs] = useState(false);
  const [goalLogsError, setGoalLogsError] = useState<string | null>(null);
  const [activeGoalMenuId, setActiveGoalMenuId] = useState<string | null>(null);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [keyResultDetailsById, setKeyResultDetailsById] = useState<
    Record<string, KeyResultDetailPanelItem>
  >({});
  const [keywordFilter, setKeywordFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [quarterFilter, setQuarterFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [goalsListPage, setGoalsListPage] = useState(1);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const canvasScaleRef = useRef(WORLD_INITIAL_SCALE);
  const viewportOffsetRef = useRef({ x: 0, y: 0 });
  const goalNodePositionsRef = useRef<Record<string, CanvasNodePosition>>({});
  const keyResultNodePositionsRef = useRef<Record<string, CanvasNodePosition>>({});
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ pointerX: 0, pointerY: 0, originX: 0, originY: 0 });
  const autoCenteredCanvasKeyRef = useRef<string>("");
  const dragPointerStartRef = useRef({ x: 0, y: 0 });
  const dragMovedRef = useRef(false);
  const suppressCanvasClickRef = useRef(false);
  const dragCaptureElementRef = useRef<HTMLElement | null>(null);
  const interactionCanvasRectRef = useRef<DOMRect | null>(null);
  const scheduledCanvasFrameRef = useRef<number | null>(null);
  const canvasAnimationFrameRef = useRef<number | null>(null);
  const pendingGoalPositionRef = useRef<{ id: string; position: CanvasNodePosition } | null>(null);
  const pendingKeyResultPositionRef = useRef<{ id: string; position: CanvasNodePosition } | null>(
    null,
  );
  const pendingViewportOffsetRef = useRef<{ x: number; y: number } | null>(null);

  const mode: Mode = searchParams.get("mode") === "list" ? "list" : "canvas";
  const showPermissionDebug = searchParams.get("debugPermission") === "1";
  const canCreateGoal = workspaceAccess.canManage && !workspaceAccess.error;
  const isCheckingCreatePermission = workspaceAccess.isLoading;
  const rootDepartments = workspaceAccess.managedDepartments;
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

  const departmentFilterOptions = useMemo(
    () =>
      [...new Set(nodes.flatMap((node) => node.teamNames))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "vi")),
    [nodes],
  );

  const yearFilterOptions = useMemo(
    () =>
      [
        ...new Set(nodes.map((node) => node.year).filter((year): year is number => year !== null)),
      ].sort((a, b) => b - a),
    [nodes],
  );

  const filteredNodes = useMemo(() => {
    const keyword = keywordFilter.trim().toLowerCase();
    return nodes.filter((goal) => {
      if (keyword) {
        const haystack =
          `${goal.tieuDe} ${goal.moTa} ${goal.teamNames.join(" ")} ${getGoalOwnerSearchText(goal.owners)}`.toLowerCase();
        if (!haystack.includes(keyword)) {
          return false;
        }
      }

      if (departmentFilter !== "all" && !goal.teamNames.includes(departmentFilter)) {
        return false;
      }

      if (typeFilter !== "all" && goal.loai !== typeFilter) {
        return false;
      }

      if (statusFilter !== "all" && goal.status !== statusFilter) {
        return false;
      }

      if (quarterFilter !== "all" && String(goal.quarter ?? "") !== quarterFilter) {
        return false;
      }

      if (yearFilter !== "all" && String(goal.year ?? "") !== yearFilter) {
        return false;
      }

      return true;
    });
  }, [departmentFilter, keywordFilter, nodes, quarterFilter, statusFilter, typeFilter, yearFilter]);
  const totalGoalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredNodes.length / GOALS_LIST_PAGE_SIZE)),
    [filteredNodes.length],
  );
  const safeGoalsListPage = Math.min(goalsListPage, totalGoalPages);
  const paginatedFilteredNodes = useMemo(() => {
    const start = (safeGoalsListPage - 1) * GOALS_LIST_PAGE_SIZE;
    return filteredNodes.slice(start, start + GOALS_LIST_PAGE_SIZE);
  }, [filteredNodes, safeGoalsListPage]);

  const displayedNodes = filteredNodes;
  const validGoalIds = useMemo(
    () => new Set(displayedNodes.map((node) => node.id)),
    [displayedNodes],
  );
  const selectedIdParam = searchParams.get("goal");
  const selectedKeyResultIdParam = searchParams.get("kr");
  const selectedId =
    selectedIdParam && validGoalIds.has(selectedIdParam)
      ? selectedIdParam
      : (displayedNodes[0]?.id ?? null);
  const isDetailOpen = searchParams.get("detail") !== "closed" && Boolean(selectedId);

  const selectedGoal = useMemo(
    () => displayedNodes.find((node) => node.id === selectedId) ?? null,
    [displayedNodes, selectedId],
  );
  const selectedKeyResult =
    selectedGoal?.id && selectedKeyResultIdParam
      ? (() => {
          const detail = keyResultDetailsById[selectedKeyResultIdParam];
          if (!detail || detail.goalId !== selectedGoal.id) {
            return null;
          }

          return detail;
        })()
      : null;

  useEffect(() => {
    canvasScaleRef.current = canvasScale;
  }, [canvasScale]);

  useEffect(() => {
    viewportOffsetRef.current = viewportOffset;
  }, [viewportOffset]);

  useEffect(() => {
    goalNodePositionsRef.current = goalNodePositions;
  }, [goalNodePositions]);

  useEffect(() => {
    keyResultNodePositionsRef.current = keyResultNodePositions;
  }, [keyResultNodePositions]);

  const flushCanvasInteraction = useCallback(() => {
    scheduledCanvasFrameRef.current = null;

    const nextGoalPosition = pendingGoalPositionRef.current;
    if (nextGoalPosition) {
      pendingGoalPositionRef.current = null;
      setGoalNodePositions((prev) => {
        const current = prev[nextGoalPosition.id];
        if (
          current?.x === nextGoalPosition.position.x &&
          current?.y === nextGoalPosition.position.y
        ) {
          return prev;
        }

        const next = {
          ...prev,
          [nextGoalPosition.id]: nextGoalPosition.position,
        };
        goalNodePositionsRef.current = next;
        return next;
      });
    }

    const nextKeyResultPosition = pendingKeyResultPositionRef.current;
    if (nextKeyResultPosition) {
      pendingKeyResultPositionRef.current = null;
      setKeyResultNodePositions((prev) => {
        const current = prev[nextKeyResultPosition.id];
        if (
          current?.x === nextKeyResultPosition.position.x &&
          current?.y === nextKeyResultPosition.position.y
        ) {
          return prev;
        }

        const next = {
          ...prev,
          [nextKeyResultPosition.id]: nextKeyResultPosition.position,
        };
        keyResultNodePositionsRef.current = next;
        return next;
      });
    }

    const nextViewportOffset = pendingViewportOffsetRef.current;
    if (nextViewportOffset) {
      pendingViewportOffsetRef.current = null;
      setViewportOffset((prev) => {
        if (prev.x === nextViewportOffset.x && prev.y === nextViewportOffset.y) {
          return prev;
        }

        viewportOffsetRef.current = nextViewportOffset;
        return nextViewportOffset;
      });
    }
  }, []);

  const scheduleCanvasInteractionFlush = useCallback(() => {
    if (scheduledCanvasFrameRef.current !== null) {
      return;
    }

    scheduledCanvasFrameRef.current = requestAnimationFrame(() => {
      flushCanvasInteraction();
    });
  }, [flushCanvasInteraction]);

  const flushPendingCanvasInteraction = useCallback(() => {
    if (scheduledCanvasFrameRef.current === null) {
      return;
    }

    cancelAnimationFrame(scheduledCanvasFrameRef.current);
    flushCanvasInteraction();
  }, [flushCanvasInteraction]);

  useEffect(() => {
    return () => {
      if (scheduledCanvasFrameRef.current !== null) {
        cancelAnimationFrame(scheduledCanvasFrameRef.current);
      }
      if (canvasAnimationFrameRef.current !== null) {
        cancelAnimationFrame(canvasAnimationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      setGoalsListPage(1);
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [keywordFilter, departmentFilter, typeFilter, statusFilter, quarterFilter, yearFilter, mode]);

  const canvasGoalNodes = useMemo(
    () =>
      displayedNodes.map((node) => {
        const position = goalNodePositions[node.id];
        if (!position) {
          return node;
        }

        return {
          ...node,
          x: position.x,
          y: position.y,
        };
      }),
    [displayedNodes, goalNodePositions],
  );

  const goalNodeMap = useMemo(
    () =>
      canvasGoalNodes.reduce<Record<string, GoalNode>>((acc, node) => {
        acc[node.id] = node;
        return acc;
      }, {}),
    [canvasGoalNodes],
  );

  const canvasKeyResultNodes = useMemo<GoalCanvasKeyResultNode[]>(
    () =>
      canvasGoalNodes.flatMap((goal) => {
        if (goal.keyResultsPreview.length === 0) {
          return [];
        }

        const totalWidth =
          goal.keyResultsPreview.length * KR_CARD_WIDTH +
          (goal.keyResultsPreview.length - 1) * KR_CARD_GAP;
        return goal.keyResultsPreview.map((keyResult, index) => ({
          id: `kr:${goal.id}:${keyResult.id}`,
          goalId: goal.id,
          keyResultId: keyResult.id,
          name: keyResult.name,
          progress: keyResult.progress,
          contributionType: keyResult.contributionType,
          supportTargetSummary: keyResult.supportTargetSummary,
          x:
            keyResultNodePositions[`kr:${goal.id}:${keyResult.id}`]?.x ??
            goal.x + CARD_WIDTH / 2 - totalWidth / 2 + index * (KR_CARD_WIDTH + KR_CARD_GAP),
          y:
            keyResultNodePositions[`kr:${goal.id}:${keyResult.id}`]?.y ??
            goal.y + CARD_HEIGHT + GOAL_TO_KR_GAP,
        }));
      }),
    [canvasGoalNodes, keyResultNodePositions],
  );

  const canvasKeyResultNodeMap = useMemo(
    () =>
      canvasKeyResultNodes.reduce<Record<string, GoalCanvasKeyResultNode>>((acc, node) => {
        acc[node.id] = node;
        return acc;
      }, {}),
    [canvasKeyResultNodes],
  );

  const canvasKeyResultNodesByGoalId = useMemo(
    () =>
      canvasKeyResultNodes.reduce<Record<string, GoalCanvasKeyResultNode[]>>((acc, node) => {
        if (!acc[node.goalId]) {
          acc[node.goalId] = [];
        }
        acc[node.goalId].push(node);
        return acc;
      }, {}),
    [canvasKeyResultNodes],
  );

  const canvasBounds = useMemo(() => {
    const allBounds = [
      ...canvasGoalNodes.map((node) => ({
        minX: node.x,
        minY: node.y,
        maxX: node.x + CARD_WIDTH,
        maxY: node.y + CARD_HEIGHT,
      })),
      ...canvasKeyResultNodes.map((node) => ({
        minX: node.x,
        minY: node.y,
        maxX: node.x + KR_CARD_WIDTH,
        maxY: node.y + KR_CARD_HEIGHT,
      })),
    ];

    if (allBounds.length === 0) {
      return null;
    }

    return {
      minX: Math.min(...allBounds.map((item) => item.minX)),
      minY: Math.min(...allBounds.map((item) => item.minY)),
      maxX: Math.max(...allBounds.map((item) => item.maxX)),
      maxY: Math.max(...allBounds.map((item) => item.maxY)),
    };
  }, [canvasGoalNodes, canvasKeyResultNodes]);

  const nodeIdentityKey = useMemo(
    () =>
      displayedNodes
        .map(
          (node) =>
            `${node.id}:${node.keyResultsPreview.map((keyResult) => keyResult.id).join(",")}`,
        )
        .sort((a, b) => a.localeCompare(b))
        .join("|"),
    [displayedNodes],
  );

  useEffect(() => {
    let isActive = true;

    const loadGoals = async () => {
      setIsLoadingGoals(true);
      setGoalsError(null);

      const [
        { data: goalsData, error: goalsLoadError },
        { data: departmentsData, error: departmentsLoadError },
        { data: goalDepartmentsData, error: goalDepartmentsLoadError },
        { data: keyResultsData, error: keyResultsLoadError },
        { data: tasksData, error: tasksLoadError },
        { data: supportLinksData, error: supportLinksLoadError },
      ] = await Promise.all([
        supabase
          .from("goals")
          .select(
            "id,name,description,type,department_id,status,quarter,year,note,target,unit,start_date,end_date,created_at",
          )
          .order("created_at", { ascending: true }),
        supabase.from("departments").select("id,name"),
        supabase.from("goal_departments").select("goal_id,department_id"),
        supabase
          .from("key_results")
          .select(
            "id,goal_id,name,contribution_type,start_value,current,target,unit,weight,start_date,end_date",
          ),
        supabase.from("tasks").select("id,key_result_id,type,weight"),
        supabase
          .from("key_result_support_links")
          .select("support_key_result_id,target_key_result_id"),
      ]);

      if (!isActive) {
        return;
      }

      if (goalsLoadError) {
        setGoalsError("Không tải được danh sách mục tiêu từ hệ thống.");
        setNodes([]);
        setEdges([]);
        setKeyResultDetailsById({});
        goalNodePositionsRef.current = {};
        setGoalNodePositions({});
        keyResultNodePositionsRef.current = {};
        setKeyResultNodePositions({});
        setIsLoadingGoals(false);
        return;
      }

      if (departmentsLoadError) {
        setGoalsError("Không tải được danh sách phòng ban.");
        setNodes([]);
        setEdges([]);
        setKeyResultDetailsById({});
        goalNodePositionsRef.current = {};
        setGoalNodePositions({});
        keyResultNodePositionsRef.current = {};
        setKeyResultNodePositions({});
        setIsLoadingGoals(false);
        return;
      }
      if (goalDepartmentsLoadError) {
        setGoalsError("Không tải được cấu trúc phòng ban tham gia mục tiêu.");
        setNodes([]);
        setEdges([]);
        setKeyResultDetailsById({});
        goalNodePositionsRef.current = {};
        setGoalNodePositions({});
        keyResultNodePositionsRef.current = {};
        setKeyResultNodePositions({});
        setIsLoadingGoals(false);
        return;
      }

      if (keyResultsLoadError) {
        setGoalsError("Không tải được danh sách key result.");
        setNodes([]);
        setEdges([]);
        setKeyResultDetailsById({});
        goalNodePositionsRef.current = {};
        setGoalNodePositions({});
        keyResultNodePositionsRef.current = {};
        setKeyResultNodePositions({});
        setIsLoadingGoals(false);
        return;
      }
      if (tasksLoadError) {
        setGoalsError("Không tải được dữ liệu task để hiển thị số lượng công việc.");
        setNodes([]);
        setEdges([]);
        setKeyResultDetailsById({});
        goalNodePositionsRef.current = {};
        setGoalNodePositions({});
        keyResultNodePositionsRef.current = {};
        setKeyResultNodePositions({});
        setIsLoadingGoals(false);
        return;
      }
      if (supportLinksLoadError) {
        setGoalsError("Không tải được dữ liệu liên kết hỗ trợ giữa các KR.");
        setNodes([]);
        setEdges([]);
        setKeyResultDetailsById({});
        goalNodePositionsRef.current = {};
        setGoalNodePositions({});
        keyResultNodePositionsRef.current = {};
        setKeyResultNodePositions({});
        setIsLoadingGoals(false);
        return;
      }

      const departmentsById = (departmentsData ?? []).reduce<Record<string, string>>(
        (acc, department) => {
          const departmentId = String(department.id);
          acc[departmentId] = String(department.name);
          return acc;
        },
        {},
      );
      const goalDepartmentNamesByGoalId = (
        (goalDepartmentsData ?? []) as GoalDepartmentParticipationRow[]
      ).reduce<Record<string, string[]>>((acc, item) => {
        const goalId = item.goal_id ? String(item.goal_id) : null;
        const departmentId = item.department_id ? String(item.department_id) : null;
        if (!goalId || !departmentId) {
          return acc;
        }
        const departmentName = departmentsById[departmentId];
        if (!departmentName) {
          return acc;
        }
        if (!acc[goalId]) {
          acc[goalId] = [];
        }
        if (!acc[goalId].includes(departmentName)) {
          acc[goalId].push(departmentName);
        }
        return acc;
      }, {});
      let goalOwnersByGoalId: Record<string, GoalOwnerProfile[]> = {};

      try {
        goalOwnersByGoalId = await loadGoalOwnersByGoalIds(
          ((goalsData ?? []) as GoalRow[]).map((goal) => String(goal.id)),
        );
      } catch {
        setGoalsError("Không tải được danh sách owners của mục tiêu.");
        setNodes([]);
        setEdges([]);
        setKeyResultDetailsById({});
        goalNodePositionsRef.current = {};
        setGoalNodePositions({});
        keyResultNodePositionsRef.current = {};
        setKeyResultNodePositions({});
        setIsLoadingGoals(false);
        return;
      }

      const typedKeyResults = ((keyResultsData ?? []) as unknown as KeyResultRow[]).map(
        (keyResult) => ({
          id: String(keyResult.id),
          goal_id: String(keyResult.goal_id),
          name: String(keyResult.name),
          contribution_type: keyResult.contribution_type
            ? String(keyResult.contribution_type)
            : null,
          start_value:
            keyResult.start_value === null || keyResult.start_value === undefined
              ? null
              : typeof keyResult.start_value === "number"
                ? keyResult.start_value
                : Number(keyResult.start_value),
          current:
            keyResult.current === null || keyResult.current === undefined
              ? null
              : typeof keyResult.current === "number"
                ? keyResult.current
                : Number(keyResult.current),
          target:
            keyResult.target === null || keyResult.target === undefined
              ? null
              : typeof keyResult.target === "number"
                ? keyResult.target
                : Number(keyResult.target),
          unit: keyResult.unit ? String(keyResult.unit) : null,
          weight:
            typeof keyResult.weight === "number" ? keyResult.weight : Number(keyResult.weight ?? 1),
          start_date: keyResult.start_date ? String(keyResult.start_date) : null,
          end_date: keyResult.end_date ? String(keyResult.end_date) : null,
        }),
      );
      const typedSupportLinks = ((supportLinksData ?? []) as KeyResultSupportLinkRow[]).map(
        (link) => ({
          supportKeyResultId: link.support_key_result_id
            ? String(link.support_key_result_id)
            : null,
          targetKeyResultId: link.target_key_result_id ? String(link.target_key_result_id) : null,
        }),
      );
      const keyResultNameById = typedKeyResults.reduce<Record<string, string>>((acc, keyResult) => {
        acc[keyResult.id] = keyResult.name;
        return acc;
      }, {});
      const supportTargetIdsByKeyResultId = typedSupportLinks.reduce<Record<string, string[]>>(
        (acc, link) => {
          if (!link.supportKeyResultId || !link.targetKeyResultId) {
            return acc;
          }

          if (!acc[link.supportKeyResultId]) {
            acc[link.supportKeyResultId] = [];
          }

          if (!acc[link.supportKeyResultId].includes(link.targetKeyResultId)) {
            acc[link.supportKeyResultId].push(link.targetKeyResultId);
          }

          return acc;
        },
        {},
      );
      const supportTargetNamesByKeyResultId = typedSupportLinks.reduce<Record<string, string[]>>(
        (acc, link) => {
          if (!link.supportKeyResultId || !link.targetKeyResultId) {
            return acc;
          }

          const targetName = keyResultNameById[link.targetKeyResultId];
          if (!targetName) {
            return acc;
          }

          if (!acc[link.supportKeyResultId]) {
            acc[link.supportKeyResultId] = [];
          }

          if (!acc[link.supportKeyResultId].includes(targetName)) {
            acc[link.supportKeyResultId].push(targetName);
          }

          return acc;
        },
        {},
      );
      const keyResultsByGoalId = typedKeyResults.reduce<Record<string, GoalKeyResultPreview[]>>(
        (acc, keyResult) => {
          const goalId = keyResult.goal_id;
          const supportTargetNames = supportTargetNamesByKeyResultId[keyResult.id] ?? [];
          const supportTargetSummary =
            keyResult.contribution_type === "support"
              ? supportTargetNames.length > 0
                ? supportTargetNames.length === 1
                  ? supportTargetNames[0]
                  : `${supportTargetNames[0]} +${supportTargetNames.length - 1}`
                : "Chưa có"
              : null;

          if (!acc[goalId]) {
            acc[goalId] = [];
          }
          acc[goalId].push({
            id: keyResult.id,
            name: keyResult.name,
            progress: 0,
            contributionType: keyResult.contribution_type,
            supportTargetSummary,
          });
          return acc;
        },
        {},
      );
      const goalIdByKeyResultId = typedKeyResults.reduce<Record<string, string>>(
        (acc, keyResult) => {
          acc[keyResult.id] = keyResult.goal_id;
          return acc;
        },
        {},
      );
      const taskCountByGoalId = (
        (tasksData ?? []) as Array<{ key_result_id: string | null }>
      ).reduce<Record<string, number>>((acc, task) => {
        const keyResultId = task.key_result_id ? String(task.key_result_id) : null;
        const goalId = keyResultId ? (goalIdByKeyResultId[keyResultId] ?? null) : null;
        if (!goalId) {
          return acc;
        }
        acc[goalId] = (acc[goalId] ?? 0) + 1;
        return acc;
      }, {});
      const keyResultProgressMap = buildKeyResultProgressMap(typedKeyResults);
      typedKeyResults.forEach((keyResult) => {
        const goalId = keyResult.goal_id;
        if (!keyResultsByGoalId[goalId]) {
          keyResultsByGoalId[goalId] = [];
        }
        const preview = keyResultsByGoalId[goalId].find((item) => item.id === keyResult.id);
        if (preview) {
          preview.progress = keyResultProgressMap[keyResult.id] ?? 0;
        }
      });
      const nextKeyResultDetailsById = typedKeyResults.reduce<
        Record<string, KeyResultDetailPanelItem>
      >((acc, keyResult) => {
        acc[keyResult.id] = {
          id: keyResult.id,
          goalId: keyResult.goal_id,
          name: keyResult.name,
          contributionType: keyResult.contribution_type,
          supportTargetSummary:
            keyResult.contribution_type === "support"
              ? (supportTargetNamesByKeyResultId[keyResult.id]?.join(", ") ?? null)
              : null,
          progress: keyResultProgressMap[keyResult.id] ?? 0,
          startValue: keyResult.start_value,
          current: keyResult.current,
          target: keyResult.target,
          unit: keyResult.unit,
          startDate: keyResult.start_date,
          endDate: keyResult.end_date,
        };
        return acc;
      }, {});
      const goalProgressById = buildGoalProgressMap(
        ((goalsData as GoalRow[]) ?? []).map((goal) => ({
          id: String(goal.id),
          type: goal.type ? String(goal.type) : null,
          target:
            goal.target === null || goal.target === undefined
              ? null
              : typeof goal.target === "number"
                ? goal.target
                : Number(goal.target),
        })),
        typedKeyResults,
        keyResultProgressMap,
      );
      const graph = buildGoalGraph(
        (goalsData as GoalRow[]) ?? [],
        departmentsById,
        goalDepartmentNamesByGoalId,
        keyResultsByGoalId,
        supportTargetIdsByKeyResultId,
        taskCountByGoalId,
        goalProgressById,
        goalOwnersByGoalId,
      );
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setKeyResultDetailsById(nextKeyResultDetailsById);
      goalNodePositionsRef.current = {};
      setGoalNodePositions({});
      keyResultNodePositionsRef.current = graph.keyResultNodePositions;
      setKeyResultNodePositions(graph.keyResultNodePositions);
      setIsLoadingGoals(false);
    };

    void loadGoals();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedGoal?.id || !isGoalLogsOpen) {
      const frameId = requestAnimationFrame(() => {
        setGoalLogs([]);
        setGoalLogsError(null);
        setIsLoadingGoalLogs(false);
      });

      return () => {
        cancelAnimationFrame(frameId);
      };
    }

    let isActive = true;

    const loadGoalLogs = async () => {
      setIsLoadingGoalLogs(true);
      setGoalLogsError(null);

      const { data: logsData, error: logsError } = await supabase
        .from("activity_logs")
        .select("id,entity_id,entity_type,profile_id,old_value,new_value,created_at,action")
        .eq("entity_type", "goal")
        .eq("entity_id", selectedGoal.id)
        .order("created_at", { ascending: false });

      if (!isActive) {
        return;
      }

      if (logsError) {
        setGoalLogs([]);
        setGoalLogsError("Không tải được nhật ký mục tiêu.");
        setIsLoadingGoalLogs(false);
        return;
      }

      const typedLogs = (logsData ?? []) as unknown as ActivityLogRow[];
      const profileIds = [
        ...new Set(
          typedLogs
            .map((item) => item.profile_id)
            .filter(Boolean)
            .map((item) => String(item)),
        ),
      ];
      let profileNameById: Record<string, string> = {};

      if (profileIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id,name")
          .in("id", profileIds);

        if (!isActive) {
          return;
        }

        profileNameById = (profilesData ?? []).reduce<Record<string, string>>((acc, profile) => {
          const profileId = String(profile.id);
          acc[profileId] = profile.name ? String(profile.name) : "Không rõ";
          return acc;
        }, {});
      }

      const mappedLogs: ActivityLogItem[] = typedLogs.map((item) => ({
        id: item.id,
        profileName: item.profile_id
          ? (profileNameById[item.profile_id] ?? "Không rõ")
          : "Hệ thống",
        action: item.action,
        entityType: item.entity_type,
        createdAt: item.created_at,
        oldValue: item.old_value ?? null,
        newValue: item.new_value ?? null,
      }));

      setGoalLogs(mappedLogs);
      setGoalLogsError(null);
      setIsLoadingGoalLogs(false);
    };

    void loadGoalLogs();

    return () => {
      isActive = false;
    };
  }, [isGoalLogsOpen, selectedGoal?.id]);

  useEffect(() => {
    if (!isDetailOpen || !selectedGoal?.id) {
      const frameId = requestAnimationFrame(() => {
        setIsGoalLogsOpen(false);
      });

      return () => {
        cancelAnimationFrame(frameId);
      };
    }
  }, [isDetailOpen, selectedGoal?.id]);

  const clampScale = useCallback(
    (nextScale: number) => Math.min(WORLD_MAX_SCALE, Math.max(WORLD_MIN_SCALE, nextScale)),
    [],
  );

  const roundCanvasScale = useCallback((value: number) => Math.round(value * 1000) / 1000, []);

  const roundViewportOffset = useCallback(
    (nextViewport: { x: number; y: number }) => ({
      x: Math.round(nextViewport.x),
      y: Math.round(nextViewport.y),
    }),
    [],
  );

  const stopCanvasAnimation = useCallback(() => {
    if (canvasAnimationFrameRef.current !== null) {
      cancelAnimationFrame(canvasAnimationFrameRef.current);
      canvasAnimationFrameRef.current = null;
    }
  }, []);

  const commitCanvasView = useCallback(
    (nextScale: number, nextViewport: { x: number; y: number }) => {
      const roundedScale = roundCanvasScale(nextScale);
      const roundedViewport = roundViewportOffset(nextViewport);
      canvasScaleRef.current = roundedScale;
      viewportOffsetRef.current = roundedViewport;
      setCanvasScale(roundedScale);
      setViewportOffset(roundedViewport);
    },
    [roundCanvasScale, roundViewportOffset],
  );

  const animateCanvasView = useCallback(
    (
      targetScale: number,
      targetViewport: { x: number; y: number },
      duration = CANVAS_FOCUS_ANIMATION_MS,
    ) => {
      stopCanvasAnimation();

      const startScale = canvasScaleRef.current;
      const startViewport = viewportOffsetRef.current;
      const roundedTargetScale = roundCanvasScale(targetScale);
      const roundedTargetViewport = roundViewportOffset(targetViewport);

      if (
        Math.abs(startScale - roundedTargetScale) < 0.001 &&
        Math.abs(startViewport.x - roundedTargetViewport.x) < 1 &&
        Math.abs(startViewport.y - roundedTargetViewport.y) < 1
      ) {
        commitCanvasView(roundedTargetScale, roundedTargetViewport);
        return;
      }

      const startAt = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - startAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);

        commitCanvasView(startScale + (roundedTargetScale - startScale) * eased, {
          x: startViewport.x + (roundedTargetViewport.x - startViewport.x) * eased,
          y: startViewport.y + (roundedTargetViewport.y - startViewport.y) * eased,
        });

        if (progress < 1) {
          canvasAnimationFrameRef.current = requestAnimationFrame(step);
          return;
        }

        canvasAnimationFrameRef.current = null;
      };

      canvasAnimationFrameRef.current = requestAnimationFrame(step);
    },
    [commitCanvasView, roundCanvasScale, roundViewportOffset, stopCanvasAnimation],
  );

  const clampViewportToBounds = useCallback(
    (nextViewport: { x: number; y: number }, scale: number, rect?: DOMRect) => {
      const viewportRect = rect ?? canvasRef.current?.getBoundingClientRect();
      if (!viewportRect) {
        return nextViewport;
      }

      const worldPixelWidth = WORLD_WIDTH * scale;
      const worldPixelHeight = WORLD_HEIGHT * scale;

      if (worldPixelWidth <= viewportRect.width && worldPixelHeight <= viewportRect.height) {
        return {
          x: (viewportRect.width - worldPixelWidth) / 2,
          y: (viewportRect.height - worldPixelHeight) / 2,
        };
      }

      const minX = Math.min(0, viewportRect.width - worldPixelWidth);
      const minY = Math.min(0, viewportRect.height - worldPixelHeight);
      const centeredX =
        worldPixelWidth <= viewportRect.width
          ? (viewportRect.width - worldPixelWidth) / 2
          : Math.min(0, Math.max(minX, nextViewport.x));
      const centeredY =
        worldPixelHeight <= viewportRect.height
          ? (viewportRect.height - worldPixelHeight) / 2
          : Math.min(0, Math.max(minY, nextViewport.y));

      return {
        x: centeredX,
        y: centeredY,
      };
    },
    [],
  );

  const focusCanvasBounds = useCallback(
    (bounds: CanvasBounds, options?: { padding?: number }) => {
      if (!canvasRef.current) {
        return;
      }

      const rect = canvasRef.current.getBoundingClientRect();
      const padding = options?.padding ?? 96;
      const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
      const contentHeight = Math.max(1, bounds.maxY - bounds.minY);

      const scaleByWidth = (rect.width - padding * 2) / contentWidth;
      const scaleByHeight = (rect.height - padding * 2) / contentHeight;
      const targetScale = clampScale(Math.min(scaleByWidth, scaleByHeight, WORLD_MAX_SCALE));

      const contentCenterX = bounds.minX + contentWidth / 2;
      const contentCenterY = bounds.minY + contentHeight / 2;
      const targetViewport = {
        x: rect.width / 2 - contentCenterX * targetScale,
        y: rect.height / 2 - contentCenterY * targetScale,
      };

      const nextViewportOffset = clampViewportToBounds(targetViewport, targetScale, rect);
      animateCanvasView(targetScale, nextViewportOffset);
    },
    [animateCanvasView, clampScale, clampViewportToBounds],
  );

  const fitCanvasToNodes = useCallback(() => {
    if (displayedNodes.length === 0 || !canvasBounds) {
      return;
    }

    focusCanvasBounds(canvasBounds, { padding: 96 });
  }, [canvasBounds, displayedNodes.length, focusCanvasBounds]);

  const focusCanvasCluster = useCallback(
    (target: CanvasFocusTarget) => {
      if (mode !== "canvas") {
        return;
      }

      if (target.type === "goal") {
        const goalNode = goalNodeMap[target.goalId];
        if (!goalNode) {
          return;
        }

        const childNodes = canvasKeyResultNodesByGoalId[target.goalId] ?? [];
        const clusterBounds = [
          {
            minX: goalNode.x,
            minY: goalNode.y,
            maxX: goalNode.x + CARD_WIDTH,
            maxY: goalNode.y + CARD_HEIGHT,
          },
          ...childNodes.map((node) => ({
            minX: node.x,
            minY: node.y,
            maxX: node.x + KR_CARD_WIDTH,
            maxY: node.y + KR_CARD_HEIGHT,
          })),
        ].reduce<CanvasBounds>(
          (acc, item) => ({
            minX: Math.min(acc.minX, item.minX),
            minY: Math.min(acc.minY, item.minY),
            maxX: Math.max(acc.maxX, item.maxX),
            maxY: Math.max(acc.maxY, item.maxY),
          }),
          {
            minX: goalNode.x,
            minY: goalNode.y,
            maxX: goalNode.x + CARD_WIDTH,
            maxY: goalNode.y + CARD_HEIGHT,
          },
        );

        focusCanvasBounds(clusterBounds, { padding: childNodes.length > 0 ? 88 : 72 });
        return;
      }

      const keyResultNode = canvasKeyResultNodeMap[`kr:${target.goalId}:${target.keyResultId}`];
      if (!keyResultNode) {
        return;
      }

      focusCanvasBounds(
        {
          minX: keyResultNode.x,
          minY: keyResultNode.y,
          maxX: keyResultNode.x + KR_CARD_WIDTH,
          maxY: keyResultNode.y + KR_CARD_HEIGHT,
        },
        { padding: 84 },
      );
    },
    [canvasKeyResultNodeMap, canvasKeyResultNodesByGoalId, focusCanvasBounds, goalNodeMap, mode],
  );

  const applyCanvasZoom = (nextScaleRaw: number, anchor?: { x: number; y: number }) => {
    if (!canvasRef.current) {
      return;
    }

    stopCanvasAnimation();
    const rect = canvasRef.current.getBoundingClientRect();
    const anchorX = anchor?.x ?? rect.width / 2;
    const anchorY = anchor?.y ?? rect.height / 2;
    const nextScale = clampScale(nextScaleRaw);

    const currentViewportOffset = viewportOffsetRef.current;
    const currentCanvasScale = canvasScaleRef.current;
    const worldX = (anchorX - currentViewportOffset.x) / currentCanvasScale;
    const worldY = (anchorY - currentViewportOffset.y) / currentCanvasScale;
    const nextViewport = {
      x: anchorX - worldX * nextScale,
      y: anchorY - worldY * nextScale,
    };

    const clampedViewportOffset = clampViewportToBounds(nextViewport, nextScale, rect);
    commitCanvasView(nextScale, clampedViewportOffset);
  };

  const updateUrlState = ({
    nextMode,
    nextGoalId,
    nextKeyResultId,
    nextDetailOpen,
  }: {
    nextMode?: Mode;
    nextGoalId?: string;
    nextKeyResultId?: string | null;
    nextDetailOpen?: boolean;
  }) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("mode", nextMode ?? mode);

    const resolvedGoalId = nextGoalId ?? selectedId;
    if (resolvedGoalId) {
      nextParams.set("goal", resolvedGoalId);
    } else {
      nextParams.delete("goal");
    }

    const resolvedKeyResultId =
      nextKeyResultId !== undefined
        ? nextKeyResultId
        : nextGoalId !== undefined && nextGoalId !== selectedId
          ? null
          : selectedKeyResultIdParam;
    if (resolvedKeyResultId) {
      nextParams.set("kr", resolvedKeyResultId);
    } else {
      nextParams.delete("kr");
    }

    if (nextDetailOpen ?? isDetailOpen) {
      nextParams.delete("detail");
    } else {
      nextParams.set("detail", "closed");
    }

    const current = searchParams.toString();
    const next = nextParams.toString();

    if (current === next) {
      return;
    }

    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const consumeSuppressedCanvasClick = () => {
    if (!suppressCanvasClickRef.current) {
      return false;
    }

    suppressCanvasClickRef.current = false;
    return true;
  };

  const startDraggingCanvasCard = (
    event: PointerEvent<HTMLElement>,
    target: CanvasDragTarget,
    position: CanvasNodePosition,
  ) => {
    if (mode !== "canvas") {
      return;
    }

    event.stopPropagation();
    stopCanvasAnimation();

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) {
      return;
    }

    interactionCanvasRectRef.current = canvasRect;
    const currentViewportOffset = viewportOffsetRef.current;
    const currentCanvasScale = canvasScaleRef.current;
    dragOffsetRef.current = {
      x:
        event.clientX -
        (canvasRect.left + currentViewportOffset.x + position.x * currentCanvasScale),
      y:
        event.clientY -
        (canvasRect.top + currentViewportOffset.y + position.y * currentCanvasScale),
    };
    dragPointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
    dragMovedRef.current = false;
    suppressCanvasClickRef.current = false;

    setDraggingTarget(target);
    dragCaptureElementRef.current = event.currentTarget;
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const onPointerDownCanvas = (event: PointerEvent<HTMLDivElement>) => {
    if (mode !== "canvas" || draggingTarget) {
      return;
    }

    stopCanvasAnimation();
    panStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: viewportOffsetRef.current.x,
      originY: viewportOffsetRef.current.y,
    };
    interactionCanvasRectRef.current = event.currentTarget.getBoundingClientRect();
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMoveCanvas = (event: PointerEvent<HTMLDivElement>) => {
    if (!canvasRef.current || mode !== "canvas") {
      return;
    }

    const rect = interactionCanvasRectRef.current ?? canvasRef.current.getBoundingClientRect();
    if (draggingTarget) {
      const movedDistance = Math.hypot(
        event.clientX - dragPointerStartRef.current.x,
        event.clientY - dragPointerStartRef.current.y,
      );
      if (movedDistance >= CANVAS_DRAG_THRESHOLD) {
        dragMovedRef.current = true;
      }

      const currentViewportOffset = viewportOffsetRef.current;
      const currentCanvasScale = canvasScaleRef.current;
      const nextX =
        (event.clientX - rect.left - dragOffsetRef.current.x - currentViewportOffset.x) /
        currentCanvasScale;
      const nextY =
        (event.clientY - rect.top - dragOffsetRef.current.y - currentViewportOffset.y) /
        currentCanvasScale;
      if (draggingTarget.type === "goal") {
        const clampedX = Math.max(20, Math.min(nextX, WORLD_WIDTH - CARD_WIDTH - 20));
        const clampedY = Math.max(20, Math.min(nextY, WORLD_HEIGHT - CARD_HEIGHT - 20));

        pendingGoalPositionRef.current = {
          id: draggingTarget.id,
          position: {
            x: clampedX,
            y: clampedY,
          },
        };
        scheduleCanvasInteractionFlush();
        return;
      }

      const clampedX = Math.max(20, Math.min(nextX, WORLD_WIDTH - KR_CARD_WIDTH - 20));
      const clampedY = Math.max(20, Math.min(nextY, WORLD_HEIGHT - KR_CARD_HEIGHT - 20));
      pendingKeyResultPositionRef.current = {
        id: draggingTarget.id,
        position: {
          x: clampedX,
          y: clampedY,
        },
      };
      scheduleCanvasInteractionFlush();
      return;
    }

    if (!isPanning) {
      return;
    }

    const deltaX = event.clientX - panStartRef.current.pointerX;
    const deltaY = event.clientY - panStartRef.current.pointerY;
    const tentativeX = panStartRef.current.originX + deltaX;
    const tentativeY = panStartRef.current.originY + deltaY;
    pendingViewportOffsetRef.current = clampViewportToBounds(
      { x: tentativeX, y: tentativeY },
      canvasScaleRef.current,
      rect,
    );
    scheduleCanvasInteractionFlush();
  };

  const onPointerUpCanvas = (event: PointerEvent<HTMLDivElement>) => {
    flushPendingCanvasInteraction();
    if (dragCaptureElementRef.current?.hasPointerCapture(event.pointerId)) {
      dragCaptureElementRef.current.releasePointerCapture(event.pointerId);
    }
    dragCaptureElementRef.current = null;
    interactionCanvasRectRef.current = null;

    if (draggingTarget) {
      if (dragMovedRef.current) {
        suppressCanvasClickRef.current = true;
      }
      setDraggingTarget(null);
      dragMovedRef.current = false;
    }

    if (isPanning) {
      setIsPanning(false);
    }
  };

  const onWheelCanvas = (event: WheelEvent<HTMLDivElement>) => {
    if (mode !== "canvas" || !canvasRef.current) {
      return;
    }

    event.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const pointer = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    applyCanvasZoom(canvasScaleRef.current * factor, pointer);
  };

  useEffect(() => {
    if (mode !== "canvas" || isLoadingGoals || displayedNodes.length === 0 || !nodeIdentityKey) {
      return;
    }

    if (autoCenteredCanvasKeyRef.current === nodeIdentityKey) {
      return;
    }

    autoCenteredCanvasKeyRef.current = nodeIdentityKey;
    const frameId = requestAnimationFrame(() => {
      fitCanvasToNodes();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [displayedNodes.length, fitCanvasToNodes, isLoadingGoals, mode, nodeIdentityKey]);

  const handleSelectGoal = (goalId: string) => {
    updateUrlState({ nextGoalId: goalId, nextKeyResultId: null, nextDetailOpen: true });
    if (mode === "canvas") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          focusCanvasCluster({ type: "goal", goalId });
        });
      });
    }
    setActiveGoalMenuId(null);
  };

  const handleDeleteGoal = async (goalId: string) => {
    const targetGoal = nodes.find((node) => node.id === goalId);
    if (!targetGoal) {
      return;
    }

    const confirmed = window.confirm(`Xóa mục tiêu "${targetGoal.tieuDe}"?`);
    if (!confirmed) {
      return;
    }

    setDeletingGoalId(goalId);

    const { data: keyResultsData, error: keyResultsError } = await supabase
      .from("key_results")
      .select("id")
      .eq("goal_id", goalId);

    if (keyResultsError) {
      window.alert(
        keyResultsError.message || "Không thể tải danh sách key result để xóa mục tiêu.",
      );
      setDeletingGoalId(null);
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
        setDeletingGoalId(null);
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
        setDeletingGoalId(null);
        return;
      }

      const { error: deleteTasksError } = await supabase
        .from("tasks")
        .delete()
        .in("key_result_id", keyResultIds);

      if (deleteTasksError) {
        window.alert(deleteTasksError.message || "Không thể xóa công việc thuộc mục tiêu.");
        setDeletingGoalId(null);
        return;
      }
    }

    const { error: deleteGoalDepartmentsError } = await supabase
      .from("goal_departments")
      .delete()
      .eq("goal_id", goalId);

    if (deleteGoalDepartmentsError) {
      window.alert(
        deleteGoalDepartmentsError.message || "Không thể xóa phòng ban tham gia của mục tiêu.",
      );
      setDeletingGoalId(null);
      return;
    }

    const { error: deleteGoalOwnersError } = await supabase
      .from("goal_owners")
      .delete()
      .eq("goal_id", goalId);

    if (deleteGoalOwnersError) {
      window.alert(deleteGoalOwnersError.message || "Không thể xóa owners của mục tiêu.");
      setDeletingGoalId(null);
      return;
    }

    if (keyResultIds.length > 0) {
      const { error: deleteKeyResultsError } = await supabase
        .from("key_results")
        .delete()
        .in("id", keyResultIds);

      if (deleteKeyResultsError) {
        window.alert(deleteKeyResultsError.message || "Không thể xóa key result của mục tiêu.");
        setDeletingGoalId(null);
        return;
      }
    }

    const { error } = await supabase.from("goals").delete().eq("id", goalId);

    if (error) {
      window.alert(error.message || "Không thể xóa mục tiêu.");
      setDeletingGoalId(null);
      return;
    }

    setNodes((prev) => prev.filter((node) => node.id !== goalId));
    setGoalNodePositions((prev) => {
      if (!prev[goalId]) {
        return prev;
      }

      const next = { ...prev };
      delete next[goalId];
      goalNodePositionsRef.current = next;
      return next;
    });
    setKeyResultNodePositions((prev) => {
      const nextEntries = Object.entries(prev).filter(
        ([nodeId]) => !nodeId.startsWith(`kr:${goalId}:`),
      );
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }

      const next = Object.fromEntries(nextEntries);
      keyResultNodePositionsRef.current = next;
      return next;
    });
    setEdges((prev) =>
      prev.filter(
        (edge) =>
          edge.from !== goalId &&
          edge.to !== goalId &&
          !edge.from.startsWith(`kr:${goalId}:`) &&
          !edge.to.startsWith(`kr:${goalId}:`),
      ),
    );
    setActiveGoalMenuId(null);
    setDeletingGoalId(null);

    if (selectedId === goalId) {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("goal");
      nextParams.set("detail", "closed");
      const next = nextParams.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
      return;
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="goals" />

        <div className="flex h-screen w-full flex-1 flex-col overflow-hidden lg:pl-[var(--workspace-sidebar-width)]">
          <main
            className={`grid h-screen w-full ${
              isDetailOpen ? "xl:grid-cols-[minmax(0,1fr)_390px]" : "xl:grid-cols-1"
            }`}
          >
            <section className="flex min-h-0 flex-col border-r border-slate-200">
              <WorkspacePageHeader title="Mục tiêu" items={[{ label: "Mục tiêu" }]} />

              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#f3f5fa] px-4 py-4 lg:px-7">
                <div className="rounded-xl border border-slate-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => updateUrlState({ nextMode: "canvas" })}
                    className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                      mode === "canvas"
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Canvas
                  </button>
                  <button
                    type="button"
                    onClick={() => updateUrlState({ nextMode: "list" })}
                    className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                      mode === "list"
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Danh sách
                  </button>
                </div>

                {!isCheckingCreatePermission && canCreateGoal ? (
                  <button
                    type="button"
                    onClick={() => {
                      const defaultDepartmentId = rootDepartments[0]?.id;
                      const next = defaultDepartmentId
                        ? `/goals/new?departmentId=${defaultDepartmentId}`
                        : "/goals/new";
                      router.push(next);
                    }}
                    className="h-9 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    + Thêm mục tiêu
                  </button>
                ) : null}
              </div>

              {showPermissionDebug && permissionDebug ? (
                <div className="border-b border-slate-200 bg-slate-950 px-4 py-3 text-xs text-slate-100 lg:px-7">
                  <p className="mb-2 font-semibold text-sky-300">
                    Debug quyền tạo mục tiêu (debugPermission=1)
                  </p>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                    {JSON.stringify(permissionDebug, null, 2)}
                  </pre>
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-y-auto">
                {isLoadingGoals ? (
                  <div className="p-4 lg:p-7">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
                      Đang tải dữ liệu mục tiêu...
                    </div>
                  </div>
                ) : goalsError ? (
                  <div className="p-4 lg:p-7">
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700">
                      {goalsError}
                    </div>
                  </div>
                ) : nodes.length === 0 ? (
                  <div className="p-4 lg:p-7">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
                      Chưa có mục tiêu nào trong hệ thống.
                    </div>
                  </div>
                ) : mode === "canvas" ? (
                  <div className="space-y-4 p-4 lg:p-7">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-sm text-slate-500">
                          Click item để focus cụm. Kéo từng card Goal hoặc KR để di chuyển riêng.
                          Lăn chuột để zoom.
                        </p>
                        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5">
                          <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
                            Quý
                          </span>
                          <Select value={quarterFilter} onValueChange={setQuarterFilter}>
                            <SelectTrigger className="h-8 min-w-[110px] border-none bg-transparent px-2 py-0 text-sm shadow-none focus-visible:ring-0">
                              <SelectValue placeholder="Tất cả quý" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Tất cả quý</SelectItem>
                              <SelectItem value="1">Q1</SelectItem>
                              <SelectItem value="2">Q2</SelectItem>
                              <SelectItem value="3">Q3</SelectItem>
                              <SelectItem value="4">Q4</SelectItem>
                            </SelectContent>
                          </Select>
                          <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
                            Năm
                          </span>
                          <Select value={yearFilter} onValueChange={setYearFilter}>
                            <SelectTrigger className="h-8 min-w-[110px] border-none bg-transparent px-2 py-0 text-sm shadow-none focus-visible:ring-0">
                              <SelectValue placeholder="Tất cả năm" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Tất cả năm</SelectItem>
                              {yearFilterOptions.map((year) => (
                                <SelectItem key={year} value={String(year)}>
                                  {year}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <button
                            type="button"
                            onClick={() => {
                              setQuarterFilter("all");
                              setYearFilter("all");
                            }}
                            disabled={quarterFilter === "all" && yearFilter === "all"}
                            className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Xóa lọc
                          </button>
                        </div>
                      </div>
                      <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                        <button
                          type="button"
                          onClick={() => applyCanvasZoom(canvasScaleRef.current - 0.08)}
                          className="h-7 w-7 rounded text-sm font-semibold text-slate-600 hover:bg-slate-100"
                        >
                          −
                        </button>
                        <button
                          type="button"
                          onClick={fitCanvasToNodes}
                          disabled={filteredNodes.length === 0}
                          className="h-7 rounded px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                        >
                          Vừa khung
                        </button>
                        <span className="inline-flex h-7 items-center rounded bg-slate-100 px-2 text-[11px] font-semibold text-slate-500">
                          Thu phóng {Math.round(canvasScale * 100)}%
                        </span>
                        <button
                          type="button"
                          onClick={() => applyCanvasZoom(canvasScaleRef.current + 0.08)}
                          className="h-7 w-7 rounded text-sm font-semibold text-slate-600 hover:bg-slate-100"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    {filteredNodes.length === 0 ? (
                      <div className="flex h-[700px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-600">
                        Không có mục tiêu phù hợp với bộ lọc hiện tại.
                      </div>
                    ) : (
                      <div
                        ref={canvasRef}
                        onPointerDown={onPointerDownCanvas}
                        onPointerMove={onPointerMoveCanvas}
                        onPointerUp={onPointerUpCanvas}
                        onPointerCancel={onPointerUpCanvas}
                        onWheel={onWheelCanvas}
                        className={`relative h-[700px] overflow-hidden rounded-2xl border border-slate-200 bg-[#fbfcff] ${
                          isPanning || draggingTarget ? "cursor-grabbing" : "cursor-grab"
                        }`}
                        style={{ touchAction: "none" }}
                      >
                        <div
                          className="absolute left-0 top-0"
                          style={{
                            width: WORLD_WIDTH,
                            height: WORLD_HEIGHT,
                            transform: `translate(${viewportOffset.x}px, ${viewportOffset.y}px) scale(${canvasScale})`,
                            transformOrigin: "0 0",
                            willChange: isPanning || draggingTarget ? "transform" : "auto",
                            backgroundImage: "radial-gradient(#dbe4f3 1.1px, transparent 1.1px)",
                            backgroundSize: "36px 36px",
                          }}
                        >
                          <svg
                            className="pointer-events-none absolute inset-0"
                            style={{ width: WORLD_WIDTH, height: WORLD_HEIGHT }}
                          >
                            {edges.map((edge) => {
                              const fromGoalNode = goalNodeMap[edge.from];
                              const fromKeyResultNode = canvasKeyResultNodeMap[edge.from];
                              const toNode = canvasKeyResultNodeMap[edge.to];
                              const fromNode = fromGoalNode
                                ? {
                                    x: fromGoalNode.x,
                                    y: fromGoalNode.y,
                                    width: CARD_WIDTH,
                                    height: CARD_HEIGHT,
                                  }
                                : fromKeyResultNode
                                  ? {
                                      x: fromKeyResultNode.x,
                                      y: fromKeyResultNode.y,
                                      width: KR_CARD_WIDTH,
                                      height: KR_CARD_HEIGHT,
                                    }
                                  : null;
                              if (!fromNode || !toNode) {
                                return null;
                              }

                              const connectorPath = getCanvasConnectorPath(fromNode, {
                                x: toNode.x,
                                y: toNode.y,
                                width: KR_CARD_WIDTH,
                                height: KR_CARD_HEIGHT,
                              });

                              return (
                                <path
                                  key={`${edge.from}-${edge.to}`}
                                  d={connectorPath}
                                  stroke="#8ea8d2"
                                  strokeWidth="2.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  fill="none"
                                />
                              );
                            })}
                          </svg>

                          {canvasKeyResultNodes.map((keyResultNode) => (
                            <div
                              key={keyResultNode.id}
                              style={{
                                left: keyResultNode.x,
                                top: keyResultNode.y,
                                width: KR_CARD_WIDTH,
                                minHeight: KR_CARD_HEIGHT,
                              }}
                              role="button"
                              tabIndex={0}
                              onPointerDown={(event) =>
                                startDraggingCanvasCard(
                                  event,
                                  {
                                    type: "key_result",
                                    id: keyResultNode.id,
                                    goalId: keyResultNode.goalId,
                                    keyResultId: keyResultNode.keyResultId,
                                  },
                                  {
                                    x: keyResultNode.x,
                                    y: keyResultNode.y,
                                  },
                                )
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                if (consumeSuppressedCanvasClick()) {
                                  return;
                                }
                                updateUrlState({
                                  nextGoalId: keyResultNode.goalId,
                                  nextKeyResultId: keyResultNode.keyResultId,
                                  nextDetailOpen: true,
                                });
                                focusCanvasCluster({
                                  type: "key_result",
                                  goalId: keyResultNode.goalId,
                                  keyResultId: keyResultNode.keyResultId,
                                });
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  updateUrlState({
                                    nextGoalId: keyResultNode.goalId,
                                    nextKeyResultId: keyResultNode.keyResultId,
                                    nextDetailOpen: true,
                                  });
                                  focusCanvasCluster({
                                    type: "key_result",
                                    goalId: keyResultNode.goalId,
                                    keyResultId: keyResultNode.keyResultId,
                                  });
                                }
                              }}
                              className="absolute cursor-grab rounded-2xl border border-slate-200 bg-white/96 p-3 text-left shadow-[0_12px_26px_-24px_rgba(15,23,42,0.9)] outline-none transition hover:border-blue-300 hover:bg-white focus-visible:ring-2 focus-visible:ring-blue-100"
                            >
                              <div>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
                                      {keyResultNode.contributionType === "support"
                                        ? "KR hỗ trợ"
                                        : "KR"}
                                    </p>
                                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">
                                      {keyResultNode.name}
                                    </p>
                                    {keyResultNode.contributionType === "support" ? (
                                      <p className="mt-1 line-clamp-2 text-[11px] text-amber-700">
                                        Hỗ trợ cho:{" "}
                                        {keyResultNode.supportTargetSummary ?? "Chưa có"}
                                      </p>
                                    ) : null}
                                  </div>
                                  <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
                                    {keyResultNode.progress}%
                                  </span>
                                </div>
                                <div className="mt-3">
                                  <ProgressBar value={keyResultNode.progress} />
                                </div>
                              </div>
                              <div className="mt-3 flex justify-end">
                                <Link
                                  href={`/goals/${keyResultNode.goalId}/key-results/${keyResultNode.keyResultId}`}
                                  onClick={(event) => event.stopPropagation()}
                                  onPointerDown={(event) => event.stopPropagation()}
                                  className="inline-flex h-7 items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                                >
                                  Mở KR
                                </Link>
                              </div>
                            </div>
                          ))}

                          {canvasGoalNodes.map((goal) => (
                            <div
                              key={goal.id}
                              className={`group absolute rounded-2xl border bg-white shadow-[0_14px_34px_-26px_rgba(15,23,42,0.6)] transition ${
                                selectedId === goal.id
                                  ? "border-blue-600 ring-2 ring-blue-100"
                                  : "border-slate-200 hover:border-blue-300"
                              }`}
                              style={{
                                left: goal.x,
                                top: goal.y,
                                width: CARD_WIDTH,
                              }}
                            >
                              <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setActiveGoalMenuId((prev) =>
                                        prev === goal.id ? null : goal.id,
                                      );
                                    }}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50"
                                  >
                                    ...
                                  </button>
                                  {activeGoalMenuId === goal.id ? (
                                    <div
                                      className="absolute right-0 top-10 z-20 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
                                      onClick={(event) => event.stopPropagation()}
                                      onPointerDown={(event) => event.stopPropagation()}
                                    >
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setActiveGoalMenuId(null);
                                          router.push(`/goals/new?editGoalId=${goal.id}`);
                                        }}
                                        onPointerDown={(event) => event.stopPropagation()}
                                        className="flex w-full items-center px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                      >
                                        Sửa mục tiêu
                                      </button>
                                      <button
                                        type="button"
                                        disabled={deletingGoalId === goal.id}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void handleDeleteGoal(goal.id);
                                        }}
                                        onPointerDown={(event) => event.stopPropagation()}
                                        className="flex w-full items-center px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {deletingGoalId === goal.id
                                          ? "Đang xóa..."
                                          : "Xóa mục tiêu"}
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </div>

                              <div
                                data-goal-card="1"
                                onPointerDown={(event) =>
                                  startDraggingCanvasCard(
                                    event,
                                    { type: "goal", id: goal.id },
                                    { x: goal.x, y: goal.y },
                                  )
                                }
                                onClick={() => {
                                  if (consumeSuppressedCanvasClick()) {
                                    return;
                                  }
                                  handleSelectGoal(goal.id);
                                }}
                                className="h-full w-full p-4 text-left"
                                style={{ cursor: mode === "canvas" ? "grab" : "pointer" }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    handleSelectGoal(goal.id);
                                  }
                                }}
                              >
                                <div className="flex items-start justify-between gap-3 pr-12">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={`inline-flex max-w-[150px] truncate rounded-lg px-2.5 py-1 text-[11px] font-semibold ${badgeMap[goal.mau]}`}
                                      title={goal.teamNames.join(", ")}
                                    >
                                      {goal.teamSummary}
                                    </span>
                                    {goal.departmentCount > 1 ? (
                                      <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                        {goal.departmentCount} phòng ban
                                      </span>
                                    ) : null}
                                    <span
                                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${healthBadgeMap[goal.healthStatus]}`}
                                    >
                                      {goalHealthLabelMap[goal.healthStatus]}
                                    </span>
                                  </div>
                                </div>

                                <p className="mt-4 line-clamp-2 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-slate-900">
                                  {goal.tieuDe}
                                </p>
                                <p className="mt-2 line-clamp-1 text-xs font-medium text-slate-500">
                                  Owners · {goal.ownersSummary}
                                </p>

                                <div className="mt-4 grid grid-cols-3 gap-2">
                                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                                      KR
                                    </p>
                                    <p className="mt-1 text-lg font-semibold text-slate-900">
                                      {goal.keyResultCount}
                                    </p>
                                  </div>
                                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                                      Task
                                    </p>
                                    <p className="mt-1 text-lg font-semibold text-slate-900">
                                      {goal.taskCount}
                                    </p>
                                  </div>
                                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                                      Tiến độ
                                    </p>
                                    <p className="mt-1 text-lg font-semibold text-slate-900">
                                      {goal.progress}%
                                    </p>
                                  </div>
                                </div>

                                {goal.keyResultCount > 0 ? (
                                  <div className="mt-3 space-y-1">
                                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                                      <span>{goal.statusLabel}</span>
                                      <span>{goal.keyResultCount} KR</span>
                                    </div>
                                    <ProgressBar value={goal.progress} />
                                  </div>
                                ) : (
                                  <p className="mt-3 text-xs font-medium text-slate-500">
                                    Chưa có KR để theo dõi tiến độ.
                                  </p>
                                )}

                                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                                  <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">
                                    Khung thời gian
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-slate-700">
                                    {formatTimelineRangeVi(goal.startDate, goal.endDate, {
                                      fallback: "Chưa đặt khung thời gian",
                                    })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 p-4 lg:p-7">
                    <article className="rounded-2xl border border-slate-200 bg-white">
                      <div className="space-y-3 border-b border-slate-100 px-5 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">
                            Danh sách mục tiêu
                          </h2>
                          <p className="text-sm text-slate-500">
                            Hiển thị {filteredNodes.length}/{nodes.length} mục tiêu
                          </p>
                        </div>
                        <div className="grid gap-3 xl:grid-cols-[minmax(260px,1.1fr)_minmax(0,2fr)]">
                          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">
                              Tìm kiếm
                            </p>
                            <input
                              value={keywordFilter}
                              onChange={(event) => setKeywordFilter(event.target.value)}
                              placeholder="Tìm theo tên/mô tả..."
                              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setKeywordFilter("");
                                setDepartmentFilter("all");
                                setTypeFilter("all");
                                setStatusFilter("all");
                                setQuarterFilter("all");
                                setYearFilter("all");
                              }}
                              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              Xóa bộ lọc
                            </button>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">
                                Phân loại
                              </p>
                              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Tất cả phòng ban" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">Tất cả phòng ban</SelectItem>
                                  {departmentFilterOptions.map((department) => (
                                    <SelectItem key={department} value={department}>
                                      {department}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Tất cả loại" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">Tất cả loại</SelectItem>
                                  {GOAL_TYPES.map((type) => (
                                    <SelectItem key={type.value} value={type.value}>
                                      {type.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">
                                Trạng thái & thời gian
                              </p>
                              <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Tất cả trạng thái" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">Tất cả trạng thái</SelectItem>
                                  {GOAL_STATUSES.map((status) => (
                                    <SelectItem key={status.value} value={status.value}>
                                      {status.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <div className="grid grid-cols-2 gap-2">
                                <Select value={quarterFilter} onValueChange={setQuarterFilter}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Tất cả quý" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">Tất cả quý</SelectItem>
                                    <SelectItem value="1">Q1</SelectItem>
                                    <SelectItem value="2">Q2</SelectItem>
                                    <SelectItem value="3">Q3</SelectItem>
                                    <SelectItem value="4">Q4</SelectItem>
                                  </SelectContent>
                                </Select>

                                <Select value={yearFilter} onValueChange={setYearFilter}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Tất cả năm" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">Tất cả năm</SelectItem>
                                    {yearFilterOptions.map((year) => (
                                      <SelectItem key={year} value={String(year)}>
                                        {year}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1220px] text-left">
                          <thead>
                            <tr className="text-[11px] tracking-[0.08em] text-slate-400 uppercase">
                              <th className="sticky left-0 z-20 w-[320px] min-w-[320px] bg-white px-5 py-3 font-semibold shadow-[1px_0_0_0_#e2e8f0]">
                                Mục tiêu
                              </th>
                              <th className="px-5 py-3 font-semibold">Phòng ban</th>
                              <th className="px-5 py-3 font-semibold">Owners</th>
                              <th className="px-5 py-3 font-semibold">Loại</th>
                              <th className="px-5 py-3 font-semibold">Trạng thái</th>
                              <th className="px-5 py-3 font-semibold">Kỳ</th>
                              <th className="px-5 py-3 font-semibold">Tiến độ</th>
                              <th className="px-5 py-3 font-semibold">Tạo lúc</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredNodes.length > 0 ? (
                              paginatedFilteredNodes.map((goal) => (
                                <tr
                                  key={goal.id}
                                  className={`group cursor-pointer border-t border-slate-100 transition ${
                                    selectedId === goal.id ? "bg-blue-50/40" : "hover:bg-slate-50"
                                  }`}
                                  onClick={() => handleSelectGoal(goal.id)}
                                >
                                  <td
                                    className={`sticky left-0 z-10 w-[320px] min-w-[320px] px-5 py-4 shadow-[1px_0_0_0_#e2e8f0] ${
                                      selectedId === goal.id
                                        ? "bg-blue-50/40"
                                        : "bg-white group-hover:bg-slate-50"
                                    }`}
                                  >
                                    <p className="line-clamp-2 text-sm font-semibold text-slate-700">
                                      {goal.tieuDe}
                                    </p>
                                    <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                                      {goal.moTa}
                                    </p>
                                  </td>
                                  <td
                                    className="px-5 py-4 text-sm text-slate-600"
                                    title={goal.teamNames.join(", ")}
                                  >
                                    {goal.teamSummary}
                                  </td>
                                  <td
                                    className="px-5 py-4 text-sm text-slate-600"
                                    title={goal.owners.map((owner) => owner.name).join(", ")}
                                  >
                                    {goal.ownersSummary}
                                  </td>
                                  <td className="px-5 py-4 text-sm text-slate-600">{goal.nhom}</td>
                                  <td className="px-5 py-4 text-sm text-slate-600">
                                    <div className="space-y-2">
                                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                        {goal.statusLabel}
                                      </span>
                                      <span
                                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${healthBadgeMap[goal.healthStatus]}`}
                                      >
                                        {goalHealthLabelMap[goal.healthStatus]}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-5 py-4 text-sm text-slate-600">{goal.quy}</td>
                                  <td className="px-5 py-4">
                                    {goal.keyResultCount > 0 ? (
                                      <div className="w-32 space-y-1">
                                        <ProgressBar value={goal.progress} />
                                        <p className="text-right text-xs font-semibold text-slate-500">
                                          {goal.progress}%
                                        </p>
                                      </div>
                                    ) : (
                                      <p className="text-xs font-medium text-slate-500">
                                        Chưa có KR
                                      </p>
                                    )}
                                  </td>
                                  <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-500">
                                    {formatDateTimeVi(goal.createdAt)}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td
                                  colSpan={8}
                                  className="px-5 py-8 text-center text-sm text-slate-500"
                                >
                                  Không có mục tiêu phù hợp với bộ lọc hiện tại.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      {filteredNodes.length > 0 ? (
                        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
                          <p className="text-slate-500">
                            Trang {safeGoalsListPage}/{totalGoalPages} · {filteredNodes.length} mục
                            tiêu
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setGoalsListPage((prev) => Math.max(1, prev - 1))}
                              disabled={safeGoalsListPage <= 1}
                              className="h-9 rounded-lg border border-slate-200 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Trước
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setGoalsListPage((prev) => Math.min(totalGoalPages, prev + 1))
                              }
                              disabled={safeGoalsListPage >= totalGoalPages}
                              className="h-9 rounded-lg border border-slate-200 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Sau
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  </div>
                )}
              </div>
            </section>

            {isDetailOpen && selectedGoal ? (
              <aside className="flex h-full min-h-0 flex-col border-t border-slate-200 bg-white xl:border-l xl:border-t-0">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 xl:px-6">
                  <h2 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">
                    {selectedKeyResult ? "Chi tiết KR" : "Chi tiết mục tiêu"}
                  </h2>
                  <button
                    type="button"
                    onClick={() => updateUrlState({ nextDetailOpen: false })}
                    className="text-xl text-slate-400 hover:text-slate-600"
                  >
                    ×
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 xl:px-6 xl:py-6">
                  <div className="space-y-6">
                    {selectedKeyResult ? (
                      <>
                        <div>
                          <p className="text-[11px] font-semibold tracking-[0.08em] text-blue-600 uppercase">
                            {selectedKeyResult.contributionType === "support"
                              ? "KR hỗ trợ"
                              : "Key Result"}
                          </p>
                          <h3 className="mt-2 text-2xl font-semibold leading-tight tracking-[-0.03em] text-slate-900">
                            {selectedKeyResult.name}
                          </h3>
                          <p className="mt-2 text-sm text-slate-500">
                            Thuộc mục tiêu: {selectedGoal.tieuDe}
                          </p>
                        </div>

                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-sm text-slate-400">Tiến độ</p>
                            <p className="text-3xl font-bold text-slate-900">
                              {selectedKeyResult.progress}%
                            </p>
                          </div>
                          <ProgressBar value={selectedKeyResult.progress} />
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <p className="text-sm text-slate-400">Bắt đầu</p>
                            <p className="mt-2 text-base font-medium text-slate-800">
                              {formatKeyResultMetric(
                                selectedKeyResult.startValue,
                                selectedKeyResult.unit,
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-slate-400">Hiện tại</p>
                            <p className="mt-2 text-base font-medium text-slate-800">
                              {formatKeyResultMetric(
                                selectedKeyResult.current,
                                selectedKeyResult.unit,
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-slate-400">Chỉ tiêu</p>
                            <p className="mt-2 text-base font-medium text-slate-800">
                              {formatKeyResultMetric(
                                selectedKeyResult.target,
                                selectedKeyResult.unit,
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-slate-400">Đơn vị đo</p>
                            <p className="mt-2 text-base font-medium text-slate-800">
                              {formatKeyResultUnit(selectedKeyResult.unit)}
                            </p>
                          </div>
                        </div>

                        <div>
                          <p className="text-sm text-slate-400">Khung thời gian</p>
                          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-sm font-medium text-slate-800">
                              {formatTimelineRangeVi(
                                selectedKeyResult.startDate,
                                selectedKeyResult.endDate,
                                {
                                  fallback: "Chưa đặt khung thời gian",
                                },
                              )}
                            </p>
                            {selectedKeyResult.contributionType === "support" ? (
                              <p className="mt-2 text-sm text-amber-700">
                                Hỗ trợ cho:{" "}
                                {selectedKeyResult.supportTargetSummary ?? "Chưa xác định"}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="text-[11px] font-semibold tracking-[0.08em] text-blue-600 uppercase">
                            Mục tiêu
                          </p>
                          <h3 className="mt-2 text-2xl font-semibold leading-tight tracking-[-0.03em] text-slate-900">
                            {selectedGoal.tieuDe}
                          </h3>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <p className="text-sm text-slate-400">Phòng ban chính</p>
                            <p className="mt-2 text-base font-medium text-slate-800">
                              {selectedGoal.phongBan}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-slate-400">Team tham gia</p>
                            <p className="mt-2 text-base font-medium text-slate-800">
                              {selectedGoal.departmentCount}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-slate-400">Quý</p>
                            <p className="mt-2 text-base font-medium text-slate-800">
                              {selectedGoal.quy}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-slate-400">Loại goal</p>
                            <p className="mt-2 text-base font-medium text-slate-800">
                              {selectedGoal.nhom}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-slate-400">Owners</p>
                            {selectedGoal.owners.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {selectedGoal.owners.slice(0, 4).map((owner) => (
                                  <span
                                    key={owner.id}
                                    className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
                                  >
                                    {owner.name}
                                  </span>
                                ))}
                                {selectedGoal.owners.length > 4 ? (
                                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                    +{selectedGoal.owners.length - 4}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <p className="mt-2 text-base font-medium text-slate-800">
                                Chưa có owners
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-sm text-slate-400">Target goal</p>
                            <p className="mt-2 text-base font-medium text-slate-800">
                              {selectedGoal.target !== null || selectedGoal.unit
                                ? `${formatKeyResultMetric(selectedGoal.target, selectedGoal.unit)} · ${formatKeyResultUnit(selectedGoal.unit)}`
                                : "Chưa đặt"}
                            </p>
                          </div>
                        </div>

                        <div>
                          <p className="text-sm text-slate-400">Trạng thái</p>
                          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-semibold text-slate-800">
                                {selectedGoal.statusLabel}
                              </span>
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${healthBadgeMap[selectedGoal.healthStatus]}`}
                              >
                                {goalHealthLabelMap[selectedGoal.healthStatus]}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-slate-500">
                              Khung thời gian{" "}
                              {formatTimelineRangeVi(selectedGoal.startDate, selectedGoal.endDate, {
                                fallback: "Chưa đặt khung thời gian",
                              })}
                            </p>
                          </div>
                        </div>

                        {selectedGoal.keyResultCount > 0 ? (
                          <div>
                            <div className="mb-2 flex items-center justify-between">
                              <p className="text-sm text-slate-400">Tiến độ</p>
                              <p className="text-3xl font-bold text-slate-900">
                                {selectedGoal.progress}%
                              </p>
                            </div>
                            <ProgressBar value={selectedGoal.progress} />
                            <p className="mt-2 text-xs text-slate-500 italic">
                              * {getGoalProgressHelp(selectedGoal.loai)}
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 p-4">
                            <p className="text-sm font-medium text-slate-700">
                              Chưa có Key Result. Hãy thêm KR để bắt đầu theo dõi mục tiêu.
                            </p>
                            <Link
                              href={`/goals/${selectedGoal.id}/key-results/new`}
                              className="mt-3 inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white"
                            >
                              + Thêm Key Result
                            </Link>
                          </div>
                        )}

                        <div>
                          <p className="text-sm text-slate-400">Mô tả</p>
                          <p className="mt-2 text-sm leading-relaxed text-slate-700">
                            {selectedGoal.moTa}
                          </p>
                        </div>

                        {selectedGoal.teamNames.length > 0 ? (
                          <div>
                            <p className="text-sm text-slate-400">Danh sách phòng ban tham gia</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {selectedGoal.teamNames.map((teamName, index) => (
                                <span
                                  key={`${selectedGoal.id}-${teamName}`}
                                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                    index === 0
                                      ? "bg-blue-50 text-blue-700"
                                      : "bg-slate-100 text-slate-700"
                                  }`}
                                >
                                  {teamName}
                                  {index === 0 ? " · chính" : ""}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
                <div className="border-t border-slate-200 bg-white/95 px-5 py-4 shadow-[0_-8px_24px_-20px_rgba(15,23,42,0.35)] backdrop-blur xl:px-6">
                  <div className="space-y-3">
                    {selectedKeyResult ? (
                      <>
                        <Link
                          href={`/goals/${selectedGoal.id}/key-results/${selectedKeyResult.id}`}
                          className="flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-base font-semibold text-slate-700"
                        >
                          Mở KR
                        </Link>
                        <Link
                          href={`/goals/${selectedGoal.id}`}
                          className="flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 text-base font-semibold text-white"
                        >
                          Mở mục tiêu
                        </Link>
                      </>
                    ) : (
                      <>
                        <Link
                          href={`/goals/${selectedGoal.id}/key-results/new`}
                          className="flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-base font-semibold text-slate-700"
                        >
                          Thêm KR
                        </Link>
                        <Link
                          href={`/goals/${selectedGoal.id}`}
                          className="flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 text-base font-semibold text-white"
                        >
                          Mở trang chi tiết
                        </Link>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsGoalLogsOpen(true)}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white text-base font-semibold text-slate-700"
                    >
                      Xem nhật ký kiểm tra
                    </button>
                  </div>
                </div>
              </aside>
            ) : null}
          </main>

          {isGoalLogsOpen && selectedGoal ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
              onClick={() => setIsGoalLogsOpen(false)}
            >
              <div
                className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      Nhật ký kiểm tra mục tiêu
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">{selectedGoal.tieuDe}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsGoalLogsOpen(false)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Đóng
                  </button>
                </div>

                <div className="max-h-[68vh] space-y-3 overflow-y-auto px-5 py-4">
                  {isLoadingGoalLogs ? (
                    <p className="text-sm text-slate-500">Đang tải nhật ký...</p>
                  ) : goalLogsError ? (
                    <p className="text-sm text-rose-600">{goalLogsError}</p>
                  ) : goalLogs.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Chưa có bản ghi nhật ký cho mục tiêu này.
                    </p>
                  ) : (
                    goalLogs.map((log) => {
                      const oldObj = log.oldValue ?? {};
                      const newObj = log.newValue ?? {};
                      const changedKeys = [
                        ...new Set([...Object.keys(oldObj), ...Object.keys(newObj)]),
                      ].filter(
                        (key) => JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key]),
                      );

                      return (
                        <article
                          key={log.id}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-800">
                                {toGoalLogActionLabel(log.action)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {formatDateTimeVi(log.createdAt)} · {log.profileName}
                              </p>
                            </div>
                            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">
                              {(log.entityType ?? "goal").toUpperCase()} ·{" "}
                              {log.action ?? "goal_updated"}
                            </span>
                          </div>

                          <p className="mt-3 text-sm text-slate-700">
                            {toGoalLogSummary(log.action, log.oldValue, log.newValue)}
                          </p>

                          {changedKeys.length > 0 ? (
                            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                              <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-0 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold tracking-[0.05em] text-slate-500 uppercase">
                                <p>Trường</p>
                                <p>Trước</p>
                                <p>Sau</p>
                              </div>
                              <div className="divide-y divide-slate-100">
                                {changedKeys.map((key) => (
                                  <div
                                    key={`${log.id}-${key}`}
                                    className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 px-3 py-2 text-xs"
                                  >
                                    <p className="font-medium text-slate-700">
                                      {goalLogFieldLabelMap[key] ?? key}
                                    </p>
                                    <p className="line-clamp-2 text-slate-500">
                                      {toGoalLogValueText(oldObj[key])}
                                    </p>
                                    <p className="line-clamp-2 text-slate-700">
                                      {toGoalLogValueText(newObj[key])}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </article>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function GoalsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f3f5fa]" />}>
      <GoalsPageContent />
    </Suspense>
  );
}
