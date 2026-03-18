"use client";

import Link from "next/link";
import {
  PointerEvent,
  WheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GOAL_STATUSES, GOAL_TYPES } from "@/lib/constants/goals";
import { getTaskProgressByType, TASK_STATUSES } from "@/lib/constants/tasks";
import { supabase } from "@/lib/supabase";

type Mode = "canvas" | "list";
const GOALS_LIST_PAGE_SIZE = 10;

type GoalKeyResultPreview = {
  id: string;
  name: string;
  progress: number;
};

type GoalNode = {
  id: string;
  nhom: string;
  loai: string;
  tieuDe: string;
  phongBan: string;
  quy: string;
  quarter: number | null;
  year: number | null;
  owner: string;
  vaiTro: string;
  moTa: string;
  progress: number;
  status: string;
  createdAt: string | null;
  parentGoalId: string | null;
  keyResultCount: number;
  keyResultsPreview: GoalKeyResultPreview[];
  x: number;
  y: number;
  mau: "blue" | "indigo" | "emerald" | "orange";
};

type GoalEdge = {
  from: string;
  to: string;
};

type GoalRow = {
  id: string;
  name: string;
  description: string | null;
  type: string | null;
  department_id: string | null;
  progress: number | null;
  status: string | null;
  quarter: number | null;
  year: number | null;
  note: string | null;
  parent_goal_id: string | null;
  created_at: string | null;
};

type KeyResultRow = {
  id: string;
  goal_id: string;
  name: string;
  progress: number | null;
};

type DepartmentOption = {
  id: string;
  name: string;
};

type GoalTaskRow = {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  progress: number | null;
  profile_id: string | null;
  key_result_id: string | null;
};

type GoalTaskItem = {
  id: string;
  tieuDe: string;
  loai: string;
  trangThai: string;
  nguoiPhuTrach: string;
  tienDo: number;
  keyResultName: string;
};

type GoalLogAction =
  | "goal_created"
  | "goal_updated"
  | "goal_status_changed"
  | "goal_progress_updated"
  | "goal_deleted";

type GoalLogRow = {
  id: string;
  goal_id: string | null;
  profile_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string | null;
  action: GoalLogAction | string | null;
};

type GoalLogItem = {
  id: string;
  profileName: string;
  action: GoalLogAction | string | null;
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
const CARD_HEIGHT = 232;
const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 2200;
const WORLD_INITIAL_SCALE = 0.86;
const WORLD_MIN_SCALE = 0.2;
const WORLD_MAX_SCALE = 1.4;

const typeLabelMap = GOAL_TYPES.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const statusLabelMap = GOAL_STATUSES.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const taskStatusLabelMap = TASK_STATUSES.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const goalLogActionLabelMap: Record<GoalLogAction, string> = {
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
  parent_goal_id: "Mục tiêu cha",
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

const clampProgress = (value: number | null) => {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return Math.min(100, Math.max(0, Math.round(safe)));
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

const toGoalLogActionLabel = (action: GoalLogAction | string | null) => {
  if (!action) {
    return "Cập nhật";
  }
  if (action in goalLogActionLabelMap) {
    return goalLogActionLabelMap[action as GoalLogAction];
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
  action: GoalLogAction | string | null,
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
) => {
  if (action === "goal_status_changed") {
    const oldStatusRaw = typeof oldValue?.status === "string" ? oldValue.status : null;
    const newStatusRaw = typeof newValue?.status === "string" ? newValue.status : null;
    const oldStatus = oldStatusRaw ? statusLabelMap[oldStatusRaw] ?? oldStatusRaw : "Không có";
    const newStatus = newStatusRaw ? statusLabelMap[newStatusRaw] ?? newStatusRaw : "Không có";
    return `Trạng thái: ${oldStatus} → ${newStatus}`;
  }

  if (action === "goal_progress_updated") {
    const oldProgress = typeof oldValue?.progress === "number" ? Math.round(oldValue.progress) : null;
    const newProgress = typeof newValue?.progress === "number" ? Math.round(newValue.progress) : null;
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
  keyResultsByGoalId: Record<string, GoalKeyResultPreview[]>,
): { nodes: GoalNode[]; edges: GoalEdge[] } => {
  if (!rows.length) {
    return { nodes: [], edges: [] };
  }

  const rowById = rows.reduce<Record<string, GoalRow>>((acc, row) => {
    acc[row.id] = row;
    return acc;
  }, {});

  const childIdsByParent = rows.reduce<Record<string, string[]>>((acc, row) => {
    if (!row.parent_goal_id || !rowById[row.parent_goal_id]) {
      return acc;
    }
    if (!acc[row.parent_goal_id]) {
      acc[row.parent_goal_id] = [];
    }
    acc[row.parent_goal_id].push(row.id);
    return acc;
  }, {});

  const sortRows = (items: GoalRow[]) =>
    [...items].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (aTime !== bTime) {
        return aTime - bTime;
      }
      return a.name.localeCompare(b.name, "vi");
    });

  const roots = sortRows(
    rows.filter((row) => !row.parent_goal_id || !rowById[row.parent_goal_id]),
  );

  const levelById: Record<string, number> = {};
  const queue = roots.map((row) => row.id);
  roots.forEach((row) => {
    levelById[row.id] = 0;
  });

  while (queue.length) {
    const currentId = queue.shift() as string;
    const children = (childIdsByParent[currentId] ?? [])
      .map((id) => rowById[id])
      .filter(Boolean);
    const sortedChildren = sortRows(children);

    sortedChildren.forEach((child) => {
      if (levelById[child.id] !== undefined) {
        return;
      }
      levelById[child.id] = (levelById[currentId] ?? 0) + 1;
      queue.push(child.id);
    });
  }

  rows.forEach((row) => {
    if (levelById[row.id] === undefined) {
      levelById[row.id] = 0;
    }
  });

  const rowsByLevel = rows.reduce<Record<number, GoalRow[]>>((acc, row) => {
    const level = levelById[row.id] ?? 0;
    if (!acc[level]) {
      acc[level] = [];
    }
    acc[level].push(row);
    return acc;
  }, {});

  const horizontalGap = CARD_WIDTH + 120;
  const topPadding = 180;
  const levelGap = CARD_HEIGHT + 190;

  const positionedNodes: GoalNode[] = [];
  const levels = Object.keys(rowsByLevel)
    .map(Number)
    .sort((a, b) => a - b);

  levels.forEach((level) => {
    const levelRows = sortRows(rowsByLevel[level]);
    const totalWidth = levelRows.length * CARD_WIDTH + (levelRows.length - 1) * 120;
    const startX = Math.max(24, (WORLD_WIDTH - totalWidth) / 2);
    const y = Math.min(
      WORLD_HEIGHT - CARD_HEIGHT - 24,
      Math.max(24, topPadding + level * levelGap),
    );

    levelRows.forEach((row, index) => {
      const statusLabel = row.status ? statusLabelMap[row.status] ?? row.status : "Nháp";
      const typeLabel = row.type ? typeLabelMap[row.type] ?? row.type.toUpperCase() : "KPI";

      positionedNodes.push({
        id: row.id,
        nhom: typeLabel,
        loai: row.type ?? "stats",
        tieuDe: row.name,
        phongBan: row.department_id ? departmentsById[row.department_id] ?? "Chưa có phòng ban" : "Chưa có phòng ban",
        quy: formatQuarterYear(row.quarter, row.year),
        quarter: row.quarter ?? null,
        year: row.year ?? null,
        owner: statusLabel,
        vaiTro: `Loại ${typeLabel}`,
        moTa: row.description || row.note || "Chưa có mô tả",
        progress: clampProgress(row.progress),
        status: row.status ?? "draft",
        createdAt: row.created_at ?? null,
        parentGoalId: row.parent_goal_id,
        keyResultCount: keyResultsByGoalId[row.id]?.length ?? 0,
        keyResultsPreview: (keyResultsByGoalId[row.id] ?? []).slice(0, 3),
        x: Math.min(
          WORLD_WIDTH - CARD_WIDTH - 24,
          Math.max(24, startX + index * horizontalGap),
        ),
        y,
        mau: getColorByStatus(row.status),
      });
    });
  });

  const edges: GoalEdge[] = rows
    .filter((row) => row.parent_goal_id && rowById[row.parent_goal_id])
    .map((row) => ({
      from: row.parent_goal_id as string,
      to: row.id,
    }));

  return { nodes: positionedNodes, edges };
};

const colorMap: Record<GoalNode["mau"], string> = {
  blue: "bg-blue-600",
  indigo: "bg-indigo-600",
  emerald: "bg-emerald-600",
  orange: "bg-orange-500",
};

const badgeMap: Record<GoalNode["mau"], string> = {
  blue: "bg-blue-50 text-blue-700",
  indigo: "bg-indigo-50 text-indigo-700",
  emerald: "bg-emerald-50 text-emerald-700",
  orange: "bg-orange-50 text-orange-700",
};

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-blue-600" style={{ width: `${value}%` }} />
    </div>
  );
}

export default function GoalsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [nodes, setNodes] = useState<GoalNode[]>([]);
  const [edges, setEdges] = useState<GoalEdge[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [canvasScale, setCanvasScale] = useState(WORLD_INITIAL_SCALE);
  const [viewportOffset, setViewportOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isLoadingGoals, setIsLoadingGoals] = useState(true);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [canCreateGoal, setCanCreateGoal] = useState(false);
  const [isCheckingCreatePermission, setIsCheckingCreatePermission] = useState(true);
  const [rootDepartments, setRootDepartments] = useState<DepartmentOption[]>([]);
  const [permissionDebug, setPermissionDebug] = useState<GoalCreatePermissionDebug | null>(null);
  const [selectedGoalTasks, setSelectedGoalTasks] = useState<GoalTaskItem[]>([]);
  const [isLoadingSelectedGoalTasks, setIsLoadingSelectedGoalTasks] = useState(false);
  const [selectedGoalTasksError, setSelectedGoalTasksError] = useState<string | null>(null);
  const [goalLogs, setGoalLogs] = useState<GoalLogItem[]>([]);
  const [isGoalLogsOpen, setIsGoalLogsOpen] = useState(false);
  const [isLoadingGoalLogs, setIsLoadingGoalLogs] = useState(false);
  const [goalLogsError, setGoalLogsError] = useState<string | null>(null);
  const [keywordFilter, setKeywordFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [quarterFilter, setQuarterFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [goalsListPage, setGoalsListPage] = useState(1);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ pointerX: 0, pointerY: 0, originX: 0, originY: 0 });
  const autoCenteredCanvasKeyRef = useRef<string>("");

  const mode: Mode = searchParams.get("mode") === "list" ? "list" : "canvas";
  const showPermissionDebug = searchParams.get("debugPermission") === "1";

  const departmentFilterOptions = useMemo(
    () =>
      [...new Set(nodes.map((node) => node.phongBan))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "vi")),
    [nodes],
  );

  const yearFilterOptions = useMemo(
    () =>
      [...new Set(nodes.map((node) => node.year).filter((year): year is number => year !== null))].sort(
        (a, b) => b - a,
      ),
    [nodes],
  );

  const filteredNodes = useMemo(() => {
    const keyword = keywordFilter.trim().toLowerCase();
    return nodes.filter((goal) => {
      if (keyword) {
        const haystack = `${goal.tieuDe} ${goal.moTa} ${goal.phongBan}`.toLowerCase();
        if (!haystack.includes(keyword)) {
          return false;
        }
      }

      if (departmentFilter !== "all" && goal.phongBan !== departmentFilter) {
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

  const displayedNodes = mode === "list" ? filteredNodes : nodes;
  const validGoalIds = useMemo(() => new Set(displayedNodes.map((node) => node.id)), [displayedNodes]);
  const selectedIdParam = searchParams.get("goal");
  const selectedId =
    selectedIdParam && validGoalIds.has(selectedIdParam)
      ? selectedIdParam
      : (displayedNodes[0]?.id ?? null);
  const isDetailOpen = searchParams.get("detail") !== "closed" && Boolean(selectedId);

  const selectedGoal = useMemo(
    () => displayedNodes.find((node) => node.id === selectedId) ?? null,
    [displayedNodes, selectedId],
  );

  useEffect(() => {
    setGoalsListPage(1);
  }, [keywordFilter, departmentFilter, typeFilter, statusFilter, quarterFilter, yearFilter, mode]);

  const nodeMap = useMemo(
    () =>
      nodes.reduce<Record<string, GoalNode>>((acc, node) => {
        acc[node.id] = node;
        return acc;
      }, {}),
    [nodes],
  );

  const nodeIdentityKey = useMemo(
    () => nodes.map((node) => node.id).sort((a, b) => a.localeCompare(b)).join("|"),
    [nodes],
  );

  useEffect(() => {
    let isActive = true;

    const loadGoals = async () => {
      setIsLoadingGoals(true);
      setGoalsError(null);

      const [
        { data: goalsData, error: goalsLoadError },
        { data: departmentsData, error: departmentsLoadError },
        { data: keyResultsData, error: keyResultsLoadError },
      ] =
        await Promise.all([
          supabase
            .from("goals")
            .select(
              "id,name,description,type,department_id,progress,status,quarter,year,note,parent_goal_id,created_at",
            )
            .order("created_at", { ascending: true }),
          supabase.from("departments").select("id,name"),
          supabase.from("key_results").select("id,goal_id,name,progress"),
        ]);

      if (!isActive) {
        return;
      }

      if (goalsLoadError) {
        setGoalsError("Không tải được danh sách mục tiêu từ hệ thống.");
        setNodes([]);
        setEdges([]);
        setIsLoadingGoals(false);
        return;
      }

      if (departmentsLoadError) {
        setGoalsError("Không tải được danh sách phòng ban.");
        setNodes([]);
        setEdges([]);
        setIsLoadingGoals(false);
        return;
      }

      if (keyResultsLoadError) {
        setGoalsError("Không tải được danh sách key result.");
        setNodes([]);
        setEdges([]);
        setIsLoadingGoals(false);
        return;
      }

      const departmentsById = (departmentsData ?? []).reduce<Record<string, string>>((acc, department) => {
        const departmentId = String(department.id);
        acc[departmentId] = String(department.name);
        return acc;
      }, {});

      const keyResultsByGoalId = ((keyResultsData ?? []) as KeyResultRow[]).reduce<
        Record<string, GoalKeyResultPreview[]>
      >((acc, keyResult) => {
        const goalId = String(keyResult.goal_id);
        if (!acc[goalId]) {
          acc[goalId] = [];
        }
        acc[goalId].push({
          id: String(keyResult.id),
          name: String(keyResult.name),
          progress: clampProgress(keyResult.progress),
        });
        return acc;
      }, {});

      const graph = buildGoalGraph((goalsData as GoalRow[]) ?? [], departmentsById, keyResultsByGoalId);
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setIsLoadingGoals(false);
    };

    void loadGoals();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadCreatePermission = async () => {
      setIsCheckingCreatePermission(true);
      const debugState: GoalCreatePermissionDebug = {
        checkedAt: new Date().toISOString(),
        step: "start",
        authUserId: null,
        profileId: null,
        profileName: null,
        leaderRoleIds: [],
        leaderRolesRaw: [],
        userRoleRows: [],
        departments: [],
        rootDepartments: [],
        canCreateGoal: false,
        error: null,
      };

      try {
        debugState.step = "auth.getUser";
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
          debugState.error = authError?.message ?? "Không lấy được auth user";
          debugState.step = "failed.auth";
          if (isActive) {
            setCanCreateGoal(false);
            setRootDepartments([]);
            setPermissionDebug({ ...debugState });
          }
          return;
        }
        debugState.authUserId = authData.user.id;

        debugState.step = "profiles.by_user_id";
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id,name")
          .eq("user_id", authData.user.id)
          .maybeSingle();

        if (profileError || !profile?.id) {
          debugState.error = profileError?.message ?? "Không tìm thấy profile theo user_id";
          debugState.step = "failed.profile";
          if (isActive) {
            setCanCreateGoal(false);
            setRootDepartments([]);
            setPermissionDebug({ ...debugState });
          }
          return;
        }
        debugState.profileId = profile.id;
        debugState.profileName = profile.name ?? null;

        debugState.step = "roles.list";
        const { data: rolesData, error: roleError } = await supabase
          .from("roles")
          .select("id,name");

        debugState.leaderRolesRaw = (rolesData ?? []).map((role) => ({
          id: String(role.id),
          name: typeof role.name === "string" ? role.name : null,
        }));

        const leaderRoleIds = (rolesData ?? [])
          .filter((role) => {
            const roleName = typeof role.name === "string" ? role.name.trim().toLowerCase() : "";
            return roleName === "leader" || roleName.includes("leader");
          })
          .map((role) => role.id)
          .filter(Boolean) as string[];

        debugState.leaderRoleIds = leaderRoleIds;
        if (roleError || leaderRoleIds.length === 0) {
          debugState.error = roleError?.message ?? "Không tìm thấy role Leader";
          debugState.step = "failed.role";
          if (isActive) {
            setCanCreateGoal(false);
            setRootDepartments([]);
            setPermissionDebug({ ...debugState });
          }
          return;
        }

        debugState.step = "user_role_in_department.by_profile";
        const { data: userRolesData, error: userRolesError } = await supabase
          .from("user_role_in_department")
          .select("department_id,role_id")
          .eq("profile_id", profile.id)
          .in("role_id", leaderRoleIds);

        debugState.userRoleRows = (userRolesData ?? []).map((item) => ({
          department_id: item.department_id ?? null,
          role_id: item.role_id ?? null,
        }));

        const departmentIds = [
          ...new Set((userRolesData ?? []).map((item) => item.department_id).filter(Boolean)),
        ];
        if (userRolesError || departmentIds.length === 0) {
          debugState.error = userRolesError?.message ?? "Không có role Leader gắn với phòng ban";
          debugState.step = "failed.user_role_in_department";
          if (isActive) {
            setCanCreateGoal(false);
            setRootDepartments([]);
            setPermissionDebug({ ...debugState });
          }
          return;
        }

        debugState.step = "departments.by_ids";
        const { data: departmentsData, error: departmentsError } = await supabase
          .from("departments")
          .select("id,name,parent_department_id")
          .in("id", departmentIds);

        if (departmentsError || !departmentsData?.length) {
          debugState.error = departmentsError?.message ?? "Không lấy được phòng ban";
          debugState.step = "failed.departments";
          if (isActive) {
            setCanCreateGoal(false);
            setRootDepartments([]);
            setPermissionDebug({ ...debugState });
          }
          return;
        }

        debugState.departments = departmentsData.map((department) => ({
          id: String(department.id),
          name: String(department.name),
          parent_department_id: department.parent_department_id ?? null,
        }));

        const rootDepartments = departmentsData
          .filter((department) => !department.parent_department_id)
          .map((department) => ({
            id: department.id as string,
            name: department.name as string,
          }));

        debugState.rootDepartments = rootDepartments;
        debugState.canCreateGoal = rootDepartments.length > 0;
        debugState.step = "done";

        if (!isActive) {
          return;
        }

        setCanCreateGoal(rootDepartments.length > 0);
        setRootDepartments(rootDepartments);
        setPermissionDebug({ ...debugState });
      } catch {
        debugState.error = "Lỗi không xác định khi kiểm tra quyền tạo mục tiêu";
        debugState.step = "failed.exception";
        if (isActive) {
          setCanCreateGoal(false);
          setRootDepartments([]);
          setPermissionDebug({ ...debugState });
        }
      } finally {
        if (isActive) {
          setIsCheckingCreatePermission(false);
        }

        console.groupCollapsed("[goals] Debug quyền tạo mục tiêu");
        console.log(debugState);
        console.groupEnd();
      }
    };

    void loadCreatePermission();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedGoal?.id || !isDetailOpen) {
      setSelectedGoalTasks([]);
      setSelectedGoalTasksError(null);
      setIsLoadingSelectedGoalTasks(false);
      return;
    }

    let isActive = true;

    const loadSelectedGoalTasks = async () => {
      setIsLoadingSelectedGoalTasks(true);
      setSelectedGoalTasksError(null);

      const { data: tasksData, error: tasksError } = await supabase
        .from("tasks")
        .select("id,name,type,status,progress,profile_id,key_result_id")
        .eq("goal_id", selectedGoal.id)
        .order("created_at", { ascending: false });

      if (!isActive) {
        return;
      }

      if (tasksError) {
        setSelectedGoalTasks([]);
        setSelectedGoalTasksError("Không tải được phân bổ công việc.");
        setIsLoadingSelectedGoalTasks(false);
        return;
      }

      const typedTasks = (tasksData ?? []) as GoalTaskRow[];
      const keyResultIds = [...new Set(typedTasks.map((task) => task.key_result_id).filter(Boolean))] as string[];
      const profileIds = [...new Set(typedTasks.map((task) => task.profile_id).filter(Boolean))] as string[];
      let profileNameById: Record<string, string> = {};
      let keyResultNameById: Record<string, string> = {};

      if (profileIds.length > 0 || keyResultIds.length > 0) {
        const [{ data: profilesData }, { data: keyResultsData }] = await Promise.all([
          profileIds.length > 0
            ? supabase.from("profiles").select("id,name").in("id", profileIds)
            : Promise.resolve({ data: [] }),
          keyResultIds.length > 0
            ? supabase.from("key_results").select("id,name").in("id", keyResultIds)
            : Promise.resolve({ data: [] }),
        ]);

        if (!isActive) {
          return;
        }

        profileNameById = (profilesData ?? []).reduce<Record<string, string>>((acc, profile) => {
          const profileId = String(profile.id);
          acc[profileId] = profile.name ? String(profile.name) : "Chưa gán";
          return acc;
        }, {});

        keyResultNameById = (keyResultsData ?? []).reduce<Record<string, string>>((acc, keyResult) => {
          const keyResultId = String(keyResult.id);
          acc[keyResultId] = keyResult.name ? String(keyResult.name) : "Task cấp goal";
          return acc;
        }, {});
      }

      const mappedTasks: GoalTaskItem[] = typedTasks.map((task) => ({
        id: task.id,
        tieuDe: task.name,
        loai: task.type === "okr" ? "OKR" : "KPI",
        trangThai: task.status ? taskStatusLabelMap[task.status] ?? task.status : "Chưa cập nhật",
        nguoiPhuTrach: task.profile_id ? profileNameById[task.profile_id] ?? "Chưa gán" : "Chưa gán",
        tienDo: getTaskProgressByType(
          task.type ? String(task.type) : null,
          task.status === "doing" || task.status === "done" || task.status === "cancelled"
            ? task.status
            : "todo",
          task.progress,
        ),
        keyResultName: task.key_result_id
          ? keyResultNameById[task.key_result_id] ?? "Task cấp goal"
          : "Task cấp goal",
      }));

      setSelectedGoalTasks(mappedTasks);
      setSelectedGoalTasksError(null);
      setIsLoadingSelectedGoalTasks(false);
    };

    void loadSelectedGoalTasks();

    return () => {
      isActive = false;
    };
  }, [isDetailOpen, selectedGoal?.id]);

  useEffect(() => {
    if (!selectedGoal?.id || !isGoalLogsOpen) {
      setGoalLogs([]);
      setGoalLogsError(null);
      setIsLoadingGoalLogs(false);
      return;
    }

    let isActive = true;

    const loadGoalLogs = async () => {
      setIsLoadingGoalLogs(true);
      setGoalLogsError(null);

      const { data: logsData, error: logsError } = await supabase
        .from("goal_logs")
        .select("id,goal_id,profile_id,old_value,new_value,created_at,action")
        .eq("goal_id", selectedGoal.id)
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

      const typedLogs = (logsData ?? []) as GoalLogRow[];
      const profileIds = [
        ...new Set(typedLogs.map((item) => item.profile_id).filter(Boolean).map((item) => String(item))),
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

      const mappedLogs: GoalLogItem[] = typedLogs.map((item) => ({
        id: item.id,
        profileName: item.profile_id ? profileNameById[item.profile_id] ?? "Không rõ" : "Hệ thống",
        action: item.action,
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
      setIsGoalLogsOpen(false);
    }
  }, [isDetailOpen, selectedGoal?.id]);

  const clampScale = useCallback(
    (nextScale: number) => Math.min(WORLD_MAX_SCALE, Math.max(WORLD_MIN_SCALE, nextScale)),
    [],
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

  const fitCanvasToNodes = useCallback(() => {
    if (!canvasRef.current || nodes.length === 0) {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const minNodeX = Math.min(...nodes.map((node) => node.x));
    const minNodeY = Math.min(...nodes.map((node) => node.y));
    const maxNodeX = Math.max(...nodes.map((node) => node.x + CARD_WIDTH));
    const maxNodeY = Math.max(...nodes.map((node) => node.y + CARD_HEIGHT));

    const contentWidth = Math.max(1, maxNodeX - minNodeX);
    const contentHeight = Math.max(1, maxNodeY - minNodeY);
    const padding = 96;

    const scaleByWidth = (rect.width - padding * 2) / contentWidth;
    const scaleByHeight = (rect.height - padding * 2) / contentHeight;
    const targetScale = clampScale(Math.min(scaleByWidth, scaleByHeight, WORLD_MAX_SCALE));

    const contentCenterX = minNodeX + contentWidth / 2;
    const contentCenterY = minNodeY + contentHeight / 2;
    const targetViewport = {
      x: rect.width / 2 - contentCenterX * targetScale,
      y: rect.height / 2 - contentCenterY * targetScale,
    };

    setCanvasScale(targetScale);
    setViewportOffset(clampViewportToBounds(targetViewport, targetScale, rect));
  }, [clampScale, clampViewportToBounds, nodes]);

  const applyCanvasZoom = (nextScaleRaw: number, anchor?: { x: number; y: number }) => {
    if (!canvasRef.current) {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const anchorX = anchor?.x ?? rect.width / 2;
    const anchorY = anchor?.y ?? rect.height / 2;
    const nextScale = clampScale(nextScaleRaw);

    const worldX = (anchorX - viewportOffset.x) / canvasScale;
    const worldY = (anchorY - viewportOffset.y) / canvasScale;
    const nextViewport = {
      x: anchorX - worldX * nextScale,
      y: anchorY - worldY * nextScale,
    };

    setCanvasScale(nextScale);
    setViewportOffset(clampViewportToBounds(nextViewport, nextScale, rect));
  };

  const updateUrlState = ({
    nextMode,
    nextGoalId,
    nextDetailOpen,
  }: {
    nextMode?: Mode;
    nextGoalId?: string;
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

  const onPointerDownCard = (event: PointerEvent<HTMLButtonElement>, goalId: string) => {
    if (mode !== "canvas") {
      return;
    }

    event.stopPropagation();

    const cardRect = event.currentTarget.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - cardRect.left,
      y: event.clientY - cardRect.top,
    };

    updateUrlState({ nextGoalId: goalId, nextDetailOpen: true });
    setDraggingId(goalId);
    if (canvasRef.current) {
      canvasRef.current.setPointerCapture(event.pointerId);
    }
  };

  const onPointerDownCanvas = (event: PointerEvent<HTMLDivElement>) => {
    if (mode !== "canvas" || draggingId) {
      return;
    }

    panStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: viewportOffset.x,
      originY: viewportOffset.y,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMoveCanvas = (event: PointerEvent<HTMLDivElement>) => {
    if (!canvasRef.current || mode !== "canvas") {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    if (draggingId) {
      const nextX =
        (event.clientX - rect.left - dragOffsetRef.current.x - viewportOffset.x) / canvasScale;
      const nextY =
        (event.clientY - rect.top - dragOffsetRef.current.y - viewportOffset.y) / canvasScale;

      const clampedX = Math.max(20, Math.min(nextX, WORLD_WIDTH - CARD_WIDTH - 20));
      const clampedY = Math.max(20, Math.min(nextY, WORLD_HEIGHT - CARD_HEIGHT - 20));

      setNodes((prev) =>
        prev.map((node) =>
          node.id === draggingId ? { ...node, x: clampedX, y: clampedY } : node,
        ),
      );
      return;
    }

    if (!isPanning) {
      return;
    }

    const deltaX = event.clientX - panStartRef.current.pointerX;
    const deltaY = event.clientY - panStartRef.current.pointerY;
    const tentativeX = panStartRef.current.originX + deltaX;
    const tentativeY = panStartRef.current.originY + deltaY;
    setViewportOffset(clampViewportToBounds({ x: tentativeX, y: tentativeY }, canvasScale, rect));
  };

  const onPointerUpCanvas = () => {
    if (draggingId) {
      setDraggingId(null);
    }

    if (isPanning) {
      setIsPanning(false);
    }
  };

  const onWheelCanvas = (event: WheelEvent<HTMLDivElement>) => {
    if (mode !== "canvas" || !canvasRef.current) {
      return;
    }

    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const pointer = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    applyCanvasZoom(canvasScale * factor, pointer);
  };

  useEffect(() => {
    if (mode !== "canvas" || isLoadingGoals || nodes.length === 0 || !nodeIdentityKey) {
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
  }, [fitCanvasToNodes, isLoadingGoals, mode, nodeIdentityKey, nodes.length]);

  const handleSelectGoal = (goalId: string) => {
    updateUrlState({ nextGoalId: goalId, nextDetailOpen: true });
  };

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="goals" />

        <div className="flex h-screen w-full flex-1 flex-col overflow-hidden lg:pl-[280px]">
          <main
            className={`grid h-screen w-full ${
              isDetailOpen ? "xl:grid-cols-[minmax(0,1fr)_390px]" : "xl:grid-cols-1"
            }`}
          >
            <section className="flex min-h-0 flex-col border-r border-slate-200">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#f3f5fa] px-4 py-4 lg:px-7">
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">Mục tiêu</h1>
                  <p className="text-sm text-slate-500">
                    Theo dõi cây mục tiêu và danh sách mục tiêu.
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
                </div>
              </header>

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
                    <p className="text-sm text-slate-500">
                      Giữ chuột để kéo không gian. Dùng Ctrl/Cmd + lăn chuột để zoom.
                    </p>
                    <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                      <button
                        type="button"
                        onClick={() => applyCanvasZoom(canvasScale - 0.08)}
                        className="h-7 w-7 rounded text-sm font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        −
                      </button>
                      <button
                        type="button"
                        onClick={fitCanvasToNodes}
                        className="h-7 rounded px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        {Math.round(canvasScale * 100)}%
                      </button>
                      <button
                        type="button"
                        onClick={() => applyCanvasZoom(canvasScale + 0.08)}
                        className="h-7 w-7 rounded text-sm font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div
                    ref={canvasRef}
                    onPointerDown={onPointerDownCanvas}
                    onPointerMove={onPointerMoveCanvas}
                    onPointerUp={onPointerUpCanvas}
                    onPointerCancel={onPointerUpCanvas}
                    onWheel={onWheelCanvas}
                    className={`relative h-[700px] overflow-hidden rounded-2xl border border-slate-200 bg-[#fbfcff] ${
                      isPanning || draggingId ? "cursor-grabbing" : "cursor-grab"
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
                        backgroundImage:
                          "radial-gradient(#dbe4f3 1.1px, transparent 1.1px)",
                        backgroundSize: "36px 36px",
                      }}
                    >
                    <svg
                      className="pointer-events-none absolute inset-0"
                      style={{ width: WORLD_WIDTH, height: WORLD_HEIGHT }}
                    >
                      {edges.map((edge) => {
                        const fromNode = nodeMap[edge.from];
                        const toNode = nodeMap[edge.to];
                        if (!fromNode || !toNode) {
                          return null;
                        }

                        const startX = fromNode.x + CARD_WIDTH / 2;
                        const startY = fromNode.y + CARD_HEIGHT;
                        const endX = toNode.x + CARD_WIDTH / 2;
                        const endY = toNode.y;
                        const midY = startY + (endY - startY) * 0.55;

                        return (
                          <path
                            key={`${edge.from}-${edge.to}`}
                            d={`M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`}
                            stroke="#9fb6dc"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                          />
                        );
                      })}
                    </svg>

                    {nodes.map((goal) => (
                      <button
                        data-goal-card="1"
                        key={goal.id}
                        type="button"
                        onPointerDown={(event) => onPointerDownCard(event, goal.id)}
                        onClick={() => handleSelectGoal(goal.id)}
                        className={`absolute rounded-2xl border bg-white p-4 text-left shadow-[0_14px_34px_-26px_rgba(15,23,42,0.6)] transition ${
                          selectedId === goal.id
                            ? "border-blue-600 ring-2 ring-blue-100"
                            : "border-slate-200 hover:border-blue-300"
                        }`}
                        style={{
                          left: goal.x,
                          top: goal.y,
                          width: CARD_WIDTH,
                          cursor: mode === "canvas" ? "grab" : "pointer",
                        }}
                      >
                        <div className="mb-4 flex items-center justify-between">
                          <span
                            className={`max-w-[240px] truncate rounded-lg px-3 py-1 text-[11px] font-semibold ${badgeMap[goal.mau]}`}
                          >
                            {goal.phongBan}
                          </span>
                          <span
                            className={`inline-flex h-3 w-3 rounded-full ${colorMap[goal.mau]}`}
                          />
                        </div>
                        <p className="line-clamp-2 text-2xl font-semibold leading-tight tracking-[-0.02em] text-slate-900">
                          {goal.tieuDe}
                        </p>
                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">
                              Key result
                            </span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                              {goal.keyResultCount}
                            </span>
                          </div>
                          {goal.keyResultsPreview.length > 0 ? (
                            <div className="space-y-2">
                              {goal.keyResultsPreview.map((keyResult) => (
                                <div
                                  key={keyResult.id}
                                  className="rounded-lg border border-white/80 bg-white px-2.5 py-2"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="line-clamp-1 text-xs font-semibold text-slate-700">
                                      {keyResult.name}
                                    </p>
                                    <span className="text-[11px] font-semibold text-blue-700">
                                      {keyResult.progress}%
                                    </span>
                                  </div>
                                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                    <div
                                      className="h-full rounded-full bg-blue-600"
                                      style={{ width: `${keyResult.progress}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                              {goal.keyResultCount > goal.keyResultsPreview.length ? (
                                <p className="text-[11px] font-medium text-slate-500">
                                  +{goal.keyResultCount - goal.keyResultsPreview.length} key result khác
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500">Chưa có key result.</p>
                          )}
                        </div>
                        <div className="mt-4 space-y-1">
                          <div className="flex items-center justify-between text-sm text-slate-500">
                            <span>Tiến độ</span>
                            <span className="font-semibold">{goal.progress}%</span>
                          </div>
                          <ProgressBar value={goal.progress} />
                        </div>
                      </button>
                    ))}
                    </div>
                  </div>

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
                            <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Tìm kiếm</p>
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
                              <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Phân loại</p>
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
                              <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Trạng thái & thời gian</p>
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
                        <table className="w-full min-w-[1260px] text-left">
                          <thead>
                            <tr className="text-[11px] tracking-[0.08em] text-slate-400 uppercase">
                              <th className="sticky left-0 z-20 w-[320px] min-w-[320px] bg-white px-5 py-3 font-semibold shadow-[1px_0_0_0_#e2e8f0]">
                                Mục tiêu
                              </th>
                              <th className="px-5 py-3 font-semibold">Mục tiêu cha</th>
                              <th className="px-5 py-3 font-semibold">Phòng ban</th>
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
                                      selectedId === goal.id ? "bg-blue-50/40" : "bg-white group-hover:bg-slate-50"
                                    }`}
                                  >
                                    <p className="line-clamp-2 text-sm font-semibold text-slate-700">
                                      {goal.tieuDe}
                                    </p>
                                    <p className="mt-1 line-clamp-1 text-xs text-slate-500">{goal.moTa}</p>
                                  </td>
                                  <td className="max-w-[240px] px-5 py-4 text-sm text-slate-600">
                                    {goal.parentGoalId
                                      ? nodeMap[goal.parentGoalId]?.tieuDe ?? "Không xác định"
                                      : "Không có"}
                                  </td>
                                  <td className="px-5 py-4 text-sm text-slate-600">{goal.phongBan}</td>
                                  <td className="px-5 py-4 text-sm text-slate-600">{goal.nhom}</td>
                                  <td className="px-5 py-4 text-sm text-slate-600">{goal.owner}</td>
                                  <td className="px-5 py-4 text-sm text-slate-600">{goal.quy}</td>
                                  <td className="px-5 py-4">
                                    <div className="w-32 space-y-1">
                                      <ProgressBar value={goal.progress} />
                                      <p className="text-right text-xs font-semibold text-slate-500">
                                        {goal.progress}%
                                      </p>
                                    </div>
                                  </td>
                                  <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-500">
                                    {formatDateTimeVi(goal.createdAt)}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-500">
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
                            Trang {safeGoalsListPage}/{totalGoalPages} · {filteredNodes.length} mục tiêu
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
                              onClick={() => setGoalsListPage((prev) => Math.min(totalGoalPages, prev + 1))}
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
              <aside className="h-full overflow-y-auto border-t border-slate-200 bg-white p-5 xl:border-l xl:border-t-0 xl:p-6">
              <div className="mb-8 flex items-center justify-between">
                <h2 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">
                  Chi tiết mục tiêu
                </h2>
                <button
                  type="button"
                  onClick={() => updateUrlState({ nextDetailOpen: false })}
                  className="text-xl text-slate-400 hover:text-slate-600"
                >
                  ×
                </button>
              </div>

              <div className="space-y-6">
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
                    <p className="text-sm text-slate-400">Phòng ban</p>
                    <p className="mt-2 text-base font-medium text-slate-800">{selectedGoal.phongBan}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Quý</p>
                    <p className="mt-2 text-base font-medium text-slate-800">{selectedGoal.quy}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-slate-400">Trạng thái</p>
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-lg font-semibold text-slate-800">{selectedGoal.owner}</p>
                    <p className="text-sm text-slate-500">{selectedGoal.vaiTro}</p>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm text-slate-400">Tiến độ</p>
                    <p className="text-3xl font-bold text-slate-900">{selectedGoal.progress}%</p>
                  </div>
                  <ProgressBar value={selectedGoal.progress} />
                  <p className="mt-2 text-xs text-slate-500 italic">
                    * Tự động tính theo mục tiêu con và các công việc liên kết.
                  </p>
                </div>

                <div>
                  <p className="text-sm text-slate-400">Mô tả</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{selectedGoal.moTa}</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <h3 className="text-base font-semibold text-slate-900">
                      Task theo key result
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-200">
                    {isLoadingSelectedGoalTasks ? (
                      <p className="px-4 py-5 text-sm text-slate-500">
                        Đang tải công việc...
                      </p>
                    ) : selectedGoalTasksError ? (
                      <p className="px-4 py-5 text-sm text-rose-600">
                        {selectedGoalTasksError}
                      </p>
                    ) : selectedGoalTasks.length > 0 ? (
                      selectedGoalTasks.map((task) => (
                        <div key={task.id} className="space-y-2 px-4 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-slate-800">{task.tieuDe}</p>
                            <div className="flex flex-col items-end gap-1">
                              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                {task.keyResultName}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                                {task.loai}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>{task.trangThai}</span>
                            <span>{task.nguoiPhuTrach}</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span>Tiến độ</span>
                              <span className="font-semibold">{task.tienDo}%</span>
                            </div>
                            <ProgressBar value={task.tienDo} />
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="px-4 py-5 text-sm text-slate-500">
                        Chưa có công việc nào liên kết với goal này.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3 border-t border-slate-200 pt-5">
                  <Link
                    href={`/goals/${selectedGoal.id}?createKr=1`}
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
                    <h3 className="text-lg font-semibold text-slate-900">Nhật ký kiểm tra mục tiêu</h3>
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
                    <p className="text-sm text-slate-500">Chưa có bản ghi nhật ký cho mục tiêu này.</p>
                  ) : (
                    goalLogs.map((log) => {
                      const oldObj = log.oldValue ?? {};
                      const newObj = log.newValue ?? {};
                      const changedKeys = [...new Set([...Object.keys(oldObj), ...Object.keys(newObj)])].filter(
                        (key) => JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key]),
                      );

                      return (
                        <article key={log.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{toGoalLogActionLabel(log.action)}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {formatDateTimeVi(log.createdAt)} · {log.profileName}
                              </p>
                            </div>
                            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">
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
                                  <div key={`${log.id}-${key}`} className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 px-3 py-2 text-xs">
                                    <p className="font-medium text-slate-700">{goalLogFieldLabelMap[key] ?? key}</p>
                                    <p className="line-clamp-2 text-slate-500">{toGoalLogValueText(oldObj[key])}</p>
                                    <p className="line-clamp-2 text-slate-700">{toGoalLogValueText(newObj[key])}</p>
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
