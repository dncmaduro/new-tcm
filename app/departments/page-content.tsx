"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, Info, Search } from "lucide-react";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { supabase } from "@/lib/supabase";

type DepartmentMode = "departments" | "people";

type DepartmentRow = {
  id: string;
  name: string;
  parent_department_id: string | null;
};

type UserRoleDepartmentRow = {
  department_id: string | null;
  profile_id: string | null;
  role_id: string | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
  is_active: boolean | null;
};

type RoleRow = {
  id: string;
  name: string | null;
};

type DepartmentMember = {
  nodeId: string;
  profileId: string;
  departmentId: string;
  departmentName: string;
  name: string;
  email: string | null;
  role: string;
  avatar: string;
  tone: string;
  isHead: boolean;
  isDirector: boolean;
};

type DepartmentItem = {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string;
  pathLabel: string;
  head: string;
  headRole: string;
  members: number;
  subDepartments: number;
  description: string;
  membersList: DepartmentMember[];
};

type CanvasPosition = {
  x: number;
  y: number;
};

type LayoutDepartmentNode = CanvasPosition & {
  id: string;
};

type CanvasEdge = {
  id: string;
  from: string;
  to: string;
  type: "department";
};

type PersonnelNode = CanvasPosition & {
  id: string;
  departmentId: string;
  member: DepartmentMember;
};

type PersonnelEdge = {
  id: string;
  from: string;
  to: string;
};

type CanvasBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type CanvasDragTarget = {
  type: "department";
  id: string;
  originX: number;
  originY: number;
  pointerX: number;
  pointerY: number;
};

const DEPARTMENT_CARD_WIDTH = 280;
const DEPARTMENT_CARD_HEIGHT = 132;
const DEPARTMENT_GAP_X = 90;
const DEPARTMENT_LEVEL_GAP_Y = 130;
const PERSON_CARD_WIDTH = 244;
const PERSON_CARD_HEIGHT = 112;
const PERSON_GAP_X = 68;
const PERSON_LEVEL_GAP_Y = 108;
const CANVAS_WORLD_WIDTH = 4200;
const CANVAS_PADDING = 72;
const CANVAS_MIN_SCALE = 0.28;
const CANVAS_MAX_SCALE = 1.28;
const CANVAS_INITIAL_SCALE = 0.82;
const FOCUS_PADDING = 88;

const memberToneClasses = [
  "bg-cyan-100 text-cyan-700",
  "bg-indigo-100 text-indigo-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-emerald-100 text-emerald-700",
  "bg-orange-100 text-orange-700",
  "bg-sky-100 text-sky-700",
  "bg-fuchsia-100 text-fuchsia-700",
];

const toInitials = (value: string) => {
  const parts = value
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!parts.length) {
    return "--";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
};

const normalizeText = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const isDirectorRole = (roleName: string) => {
  const normalized = normalizeText(roleName);
  return normalized === "director" || normalized.includes("director") || normalized.includes("giam doc");
};

const isHeadRole = (roleName: string) => {
  const normalized = normalizeText(roleName);
  return (
    isDirectorRole(roleName) ||
    normalized.includes("leader") ||
    normalized.includes("head") ||
    normalized.includes("manager") ||
    normalized.includes("truong")
  );
};

const getRolePriority = (roleName: string) => {
  if (isDirectorRole(roleName)) {
    return 0;
  }

  return isHeadRole(roleName) ? 1 : 2;
};

const sortByVietnameseName = <T extends { name: string }>(items: T[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name, "vi"));

const getDepartmentPathLabel = (
  departmentId: string,
  departmentsById: Record<string, DepartmentRow>,
) => {
  const parts: string[] = [];
  let currentDepartmentId: string | null = departmentId;
  const visitedDepartmentIds = new Set<string>();

  while (currentDepartmentId) {
    if (visitedDepartmentIds.has(currentDepartmentId)) {
      break;
    }

    visitedDepartmentIds.add(currentDepartmentId);
    const department: DepartmentRow | undefined = departmentsById[currentDepartmentId];
    if (!department) {
      break;
    }

    parts.unshift(department.name);
    currentDepartmentId = department.parent_department_id
      ? String(department.parent_department_id)
      : null;
  }

  return parts.join(" / ");
};

const getConnectorPath = (
  from: { x: number; y: number; width: number; height: number },
  to: { x: number; y: number; width: number; height: number },
) => {
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height;
  const endX = to.x + to.width / 2;
  const endY = to.y;
  const distance = Math.max(72, Math.min(160, (endY - startY) * 0.48));

  return `M ${startX} ${startY} C ${startX} ${startY + distance} ${endX} ${endY - distance} ${endX} ${endY}`;
};

const buildCanvasLayout = (items: DepartmentItem[]) => {
  if (!items.length) {
    return {
      departmentNodes: [] as LayoutDepartmentNode[],
      edges: [] as CanvasEdge[],
      worldWidth: CANVAS_WORLD_WIDTH,
      worldHeight: 1800,
    };
  }

  const byId = items.reduce<Record<string, DepartmentItem>>((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});

  const childrenByParent = items.reduce<Record<string, string[]>>((acc, item) => {
    if (!item.parentId || !byId[item.parentId]) {
      return acc;
    }

    if (!acc[item.parentId]) {
      acc[item.parentId] = [];
    }

    acc[item.parentId].push(item.id);
    return acc;
  }, {});

  const roots = sortByVietnameseName(items.filter((item) => !item.parentId || !byId[item.parentId]));
  const queue = roots.map((item) => item.id);
  const levelById: Record<string, number> = {};

  roots.forEach((item) => {
    levelById[item.id] = 0;
  });

  while (queue.length > 0) {
    const currentId = queue.shift() as string;
    const childIds = (childrenByParent[currentId] ?? []).filter((id) => Boolean(byId[id]));
    const children = sortByVietnameseName(childIds.map((id) => byId[id]));

    children.forEach((child) => {
      if (levelById[child.id] !== undefined) {
        return;
      }

      levelById[child.id] = (levelById[currentId] ?? 0) + 1;
      queue.push(child.id);
    });
  }

  const levelBuckets = items.reduce<Record<number, DepartmentItem[]>>((acc, item) => {
    const level = levelById[item.id] ?? 0;
    if (!acc[level]) {
      acc[level] = [];
    }
    acc[level].push(item);
    return acc;
  }, {});

  const sortedLevels = Object.keys(levelBuckets)
    .map((value) => Number(value))
    .sort((a, b) => a - b);

  const levelTopByLevel = new Map<number, number>();
  let nextTop = 120;
  sortedLevels.forEach((level) => {
    levelTopByLevel.set(level, nextTop);
    nextTop += DEPARTMENT_CARD_HEIGHT + DEPARTMENT_LEVEL_GAP_Y;
  });

  const departmentNodes: LayoutDepartmentNode[] = [];

  sortedLevels.forEach((level) => {
    const levelItems = sortByVietnameseName(levelBuckets[level]);
    const rowWidth =
      levelItems.length * DEPARTMENT_CARD_WIDTH +
      Math.max(0, levelItems.length - 1) * DEPARTMENT_GAP_X;
    const startX = Math.max(CANVAS_PADDING, (CANVAS_WORLD_WIDTH - rowWidth) / 2);
    const topY = levelTopByLevel.get(level) ?? 120;

    levelItems.forEach((item, index) => {
      const x = startX + index * (DEPARTMENT_CARD_WIDTH + DEPARTMENT_GAP_X);
      const y = topY;
      departmentNodes.push({ id: item.id, x, y });
    });
  });

  const edges: CanvasEdge[] = items
    .filter((item) => item.parentId && byId[item.parentId])
    .map((item) => ({
      id: `dept:${item.parentId}:${item.id}`,
      from: item.parentId as string,
      to: item.id,
      type: "department" as const,
    }));

  return {
    departmentNodes,
    edges,
    worldWidth: CANVAS_WORLD_WIDTH,
    worldHeight: Math.max(1800, nextTop + CANVAS_PADDING),
  };
};

const buildPersonnelLayout = (items: DepartmentItem[]) => {
  const membersByNodeId = items.flatMap((department) =>
    department.membersList.map((member) => ({ ...member, departmentId: department.id })),
  );
  const departmentById = items.reduce<Record<string, DepartmentItem>>((acc, department) => {
    acc[department.id] = department;
    return acc;
  }, {});
  const leaderByDepartmentId = items.reduce<Record<string, DepartmentMember | null>>((acc, department) => {
    acc[department.id] =
      department.membersList.find((member) => member.isDirector) ??
      department.membersList.find((member) => member.isHead) ??
      null;
    return acc;
  }, {});
  const nodesById = membersByNodeId.reduce<Record<string, { departmentId: string; member: DepartmentMember }>>(
    (acc, item) => {
      acc[item.nodeId] = { departmentId: item.departmentId, member: item };
      return acc;
    },
    {},
  );
  const edges: PersonnelEdge[] = [];

  const findParentLeader = (departmentId: string | null): DepartmentMember | null => {
    const visited = new Set<string>();
    let currentId = departmentId;

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const leader = leaderByDepartmentId[currentId];
      if (leader) {
        return leader;
      }
      currentId = departmentById[currentId]?.parentId ?? null;
    }

    return null;
  };

  items.forEach((department) => {
    const leader = leaderByDepartmentId[department.id];
    if (!leader) {
      return;
    }

    const parentLeader = findParentLeader(department.parentId);
    if (parentLeader && parentLeader.nodeId !== leader.nodeId) {
      edges.push({
        id: `person:${parentLeader.nodeId}:${leader.nodeId}`,
        from: parentLeader.nodeId,
        to: leader.nodeId,
      });
    }

    department.membersList.forEach((member) => {
      if (member.nodeId !== leader.nodeId) {
        edges.push({
          id: `person:${leader.nodeId}:${member.nodeId}`,
          from: leader.nodeId,
          to: member.nodeId,
        });
      }
    });
  });

  const childrenByParent = edges.reduce<Record<string, string[]>>((acc, edge) => {
    (acc[edge.from] ??= []).push(edge.to);
    return acc;
  }, {});
  const compareNodeIds = (leftId: string, rightId: string) => {
    const left = nodesById[leftId];
    const right = nodesById[rightId];
    const directorOrder = Number(right.member.isDirector) - Number(left.member.isDirector);
    if (directorOrder !== 0) {
      return directorOrder;
    }

    const headOrder = Number(right.member.isHead) - Number(left.member.isHead);
    if (headOrder !== 0) {
      return headOrder;
    }

    const departmentOrder = left.member.departmentName.localeCompare(right.member.departmentName, "vi");
    if (departmentOrder !== 0) {
      return departmentOrder;
    }

    return left.member.name.localeCompare(right.member.name, "vi");
  };

  Object.values(childrenByParent).forEach((childIds) => childIds.sort(compareNodeIds));

  const incoming = new Set(edges.map((edge) => edge.to));
  const roots = Object.keys(nodesById).filter((nodeId) => !incoming.has(nodeId)).sort(compareNodeIds);
  const positionedNodeIds = new Set<string>();
  const treeRoots = [...roots];

  // Dữ liệu phòng ban hợp lệ tạo thành một rừng. Phần dự phòng này vẫn hiển thị
  // node nếu dữ liệu có vòng lặp hoặc liên kết chưa đầy đủ.
  Object.keys(nodesById)
    .sort(compareNodeIds)
    .forEach((nodeId) => {
      if (!incoming.has(nodeId) || treeRoots.includes(nodeId)) {
        return;
      }

      let currentId: string | undefined = nodeId;
      const visited = new Set<string>();
      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const parentEdge = edges.find((edge) => edge.to === currentId);
        currentId = parentEdge?.from;
      }

      if (currentId) {
        treeRoots.push(nodeId);
      }
    });

  const subtreeWidthById: Record<string, number> = {};
  const getSubtreeWidth = (nodeId: string, visiting = new Set<string>()): number => {
    if (subtreeWidthById[nodeId] !== undefined) {
      return subtreeWidthById[nodeId];
    }
    if (visiting.has(nodeId)) {
      return PERSON_CARD_WIDTH;
    }

    visiting.add(nodeId);
    const childWidths = (childrenByParent[nodeId] ?? []).map((childId) => getSubtreeWidth(childId, visiting));
    visiting.delete(nodeId);

    const childrenWidth =
      childWidths.reduce((total, width) => total + width, 0) + Math.max(0, childWidths.length - 1) * PERSON_GAP_X;
    const subtreeWidth = Math.max(PERSON_CARD_WIDTH, childrenWidth);
    subtreeWidthById[nodeId] = subtreeWidth;
    return subtreeWidth;
  };

  const rootsWidth =
    treeRoots.reduce((total, nodeId) => total + getSubtreeWidth(nodeId), 0) +
    Math.max(0, treeRoots.length - 1) * PERSON_GAP_X;
  const worldWidth = Math.max(1800, rootsWidth + CANVAS_PADDING * 2);
  const personnelNodes: PersonnelNode[] = [];
  let maxDepth = 0;

  const placeSubtree = (nodeId: string, left: number, depth: number, path = new Set<string>()) => {
    if (path.has(nodeId) || positionedNodeIds.has(nodeId)) {
      return;
    }

    path.add(nodeId);
    positionedNodeIds.add(nodeId);
    maxDepth = Math.max(maxDepth, depth);
    const subtreeWidth = getSubtreeWidth(nodeId);
    const item = nodesById[nodeId];
    personnelNodes.push({
      id: nodeId,
      departmentId: item.departmentId,
      member: item.member,
      x: left + (subtreeWidth - PERSON_CARD_WIDTH) / 2,
      y: 120 + depth * (PERSON_CARD_HEIGHT + PERSON_LEVEL_GAP_Y),
    });

    const children = childrenByParent[nodeId] ?? [];
    const childrenWidth =
      children.reduce((total, childId) => total + getSubtreeWidth(childId), 0) +
      Math.max(0, children.length - 1) * PERSON_GAP_X;
    let childLeft = left + (subtreeWidth - childrenWidth) / 2;

    children.forEach((childId) => {
      placeSubtree(childId, childLeft, depth + 1, new Set(path));
      childLeft += getSubtreeWidth(childId) + PERSON_GAP_X;
    });
  };

  let rootLeft = Math.max(CANVAS_PADDING, (worldWidth - rootsWidth) / 2);
  treeRoots.forEach((nodeId) => {
    placeSubtree(nodeId, rootLeft, 0);
    rootLeft += getSubtreeWidth(nodeId) + PERSON_GAP_X;
  });

  Object.keys(nodesById)
    .filter((nodeId) => !positionedNodeIds.has(nodeId))
    .sort(compareNodeIds)
    .forEach((nodeId) => {
      placeSubtree(nodeId, rootLeft, 0);
      rootLeft += getSubtreeWidth(nodeId) + PERSON_GAP_X;
    });

  return {
    personnelNodes,
    edges,
    worldWidth,
    worldHeight: Math.max(1800, 120 + (maxDepth + 1) * (PERSON_CARD_HEIGHT + PERSON_LEVEL_GAP_Y) + CANVAS_PADDING),
  };
};

function DepartmentCanvasCard({
  item,
  active,
  faded,
  onSelect,
  onPointerDown,
}: {
  item: DepartmentItem;
  active: boolean;
  faded: boolean;
  onSelect: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      data-node-card="true"
      type="button"
      onPointerDown={onPointerDown}
      onClick={onSelect}
      className={`flex h-[132px] w-[280px] flex-col rounded-[24px] border bg-white/98 px-4 py-3 text-left shadow-[0_18px_40px_-34px_rgba(15,23,42,0.35)] transition ${
        active
          ? "border-blue-500 ring-2 ring-blue-100"
          : "border-slate-200 hover:border-blue-300 hover:bg-white"
      } ${faded ? "opacity-55" : ""}`}
    >
      <p className="line-clamp-2 min-w-0 text-lg font-semibold leading-snug tracking-[-0.03em] text-slate-900">
        {item.name}
      </p>
      <p className="mt-4 truncate text-sm text-slate-600">
        Leader: <span className="font-medium text-slate-800">{item.head}</span>
      </p>
      <p className="mt-1 text-sm text-slate-600">
        Nhân viên: <span className="font-medium text-slate-800">{item.members}</span>
      </p>
    </button>
  );
}

function PersonnelCanvasCard({
  member,
  active,
  faded,
  onSelect,
}: {
  member: DepartmentMember;
  active: boolean;
  faded: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      data-node-card="true"
      type="button"
      onClick={onSelect}
      className={`flex h-[112px] w-[244px] items-center gap-3 rounded-[22px] border bg-white/98 px-4 text-left shadow-[0_18px_40px_-34px_rgba(15,23,42,0.35)] transition ${
        active
          ? "border-blue-500 ring-2 ring-blue-100"
          : "border-slate-200 hover:border-blue-300 hover:bg-white"
      } ${faded ? "opacity-55" : ""}`}
    >
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-semibold ${member.tone}`}>
        {member.avatar}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-base font-semibold text-slate-900">{member.name}</span>
          {member.isHead ? (
            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-amber-700">
              {member.isDirector ? "Director" : "Leader"}
            </span>
          ) : null}
        </span>
        <span className="mt-1 block truncate text-sm text-slate-600">{member.role}</span>
        <span className="mt-1 block truncate text-xs text-slate-400">{member.departmentName}</span>
      </span>
    </button>
  );
}

function DetailPanelContent({
  department,
  member = null,
}: {
  department: DepartmentItem | null;
  member?: DepartmentMember | null;
}) {
  if (member) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_44px_-36px_rgba(15,23,42,0.35)]">
        <div className="border-b border-slate-100 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className={`grid h-12 w-12 place-items-center rounded-[18px] text-sm font-semibold ${member.tone}`}>
              {member.avatar}
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-xl font-semibold tracking-[-0.02em] text-slate-900">{member.name}</h3>
              <p className="truncate text-xs text-slate-500">{member.role}</p>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Phòng ban</p>
              <p className="mt-1 font-semibold text-slate-900">{member.departmentName}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Vai trò</p>
              <p className="mt-1 font-semibold text-slate-900">{member.role}</p>
            </div>
            {member.email ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Email</p>
                <p className="mt-1 break-all font-medium text-slate-700">{member.email}</p>
              </div>
            ) : null}
          </div>
          {member.isHead ? (
            <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
              {member.isDirector
                ? "Nhân sự này đang là Director của tổ chức."
                : "Nhân sự này đang là leader của phòng ban."}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (!department) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-[24px] border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-[0_18px_44px_-36px_rgba(15,23,42,0.35)]">
        Chọn một phòng ban để xem chi tiết.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_44px_-36px_rgba(15,23,42,0.35)]">
      <div className="border-b border-slate-100 px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-[18px] bg-blue-50 text-blue-700">
            <Building2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-xl font-semibold tracking-[-0.02em] text-slate-900">
              {department.name}
            </h3>
            <p className="truncate text-xs text-slate-500">{department.headRole}</p>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Số người</p>
              <p className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-900">{department.members}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Leader</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900">{department.head}</p>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Thành viên</p>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
              {department.membersList.length}
            </span>
          </div>

          {department.membersList.length > 0 ? (
            <div className="space-y-2">
              {department.membersList.map((person) => (
                <div key={person.nodeId} className="flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-2.5">
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-2xl text-xs font-semibold ${person.tone}`}
                  >
                    {person.avatar}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-800">{person.name}</p>
                      {person.isHead ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700">
                          {person.isDirector ? "Director" : "Leader"}
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-slate-500">{person.role}</p>
                    {person.email ? (
                      <p className="truncate text-[11px] text-slate-400">{person.email}</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Chưa có nhân sự được gắn.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DepartmentsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedDepartmentIdState, setSelectedDepartmentIdState] = useState<string | null>(null);
  const [selectedMemberNodeIdState, setSelectedMemberNodeIdState] = useState<string | null>(null);
  const [departmentPositions, setDepartmentPositions] = useState<Record<string, CanvasPosition>>({});
  const [canvasScale, setCanvasScale] = useState(CANVAS_INITIAL_SCALE);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const [draggingTarget, setDraggingTarget] = useState<CanvasDragTarget | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const canvasScaleRef = useRef(CANVAS_INITIAL_SCALE);
  const canvasPanRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef<{ pointerX: number; pointerY: number; originX: number; originY: number } | null>(
    null,
  );
  const dragMovedRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const autoFittedLayoutKeyRef = useRef("");

  const mode: DepartmentMode = searchParams.get("mode") === "people" ? "people" : "departments";
  const selectedDepartmentIdParam = searchParams.get("dept");

  const updateQuery = useCallback(
    (next: { mode?: DepartmentMode; dept?: string | null }) => {
      const params = new URLSearchParams(searchParams.toString());

      if (next.mode) {
        params.set("mode", next.mode);
      }

      if (next.dept !== undefined) {
        if (next.dept) {
          params.set("dept", next.dept);
        } else {
          params.delete("dept");
        }
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    canvasScaleRef.current = canvasScale;
  }, [canvasScale]);

  useEffect(() => {
    canvasPanRef.current = canvasPan;
  }, [canvasPan]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadDepartments = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const [
          { data: departmentsData, error: departmentsError },
          { data: urdData, error: urdError },
          { data: profilesData, error: profilesError },
          { data: rolesData, error: rolesError },
        ] = await Promise.all([
          supabase.from("departments").select("id,name,parent_department_id"),
          supabase.from("user_role_in_department").select("department_id,profile_id,role_id"),
          supabase.from("profiles").select("id,name,email,is_active").eq("is_active", true),
          supabase.from("roles").select("id,name"),
        ]);

        if (!isActive) {
          return;
        }

        if (departmentsError) {
          setLoadError(departmentsError.message || "Không tải được danh sách phòng ban.");
          setDepartments([]);
          return;
        }

        const departmentRows = ((departmentsData ?? []) as DepartmentRow[]).map((row) => ({
          id: String(row.id),
          name: String(row.name),
          parent_department_id: row.parent_department_id ? String(row.parent_department_id) : null,
        }));
        const urdRows = (urdData ?? []) as UserRoleDepartmentRow[];
        const profileRows = (profilesData ?? []) as ProfileRow[];
        const roleRows = (rolesData ?? []) as RoleRow[];

        const departmentRowsById = departmentRows.reduce<Record<string, DepartmentRow>>((acc, row) => {
          acc[row.id] = row;
          return acc;
        }, {});

        const roleNameById = roleRows.reduce<Record<string, string>>((acc, row) => {
          acc[String(row.id)] = String(row.name ?? "Thành viên");
          return acc;
        }, {});

        const profileInfoById = profileRows.reduce<Record<string, { name: string; email: string | null }>>(
          (acc, row) => {
            acc[String(row.id)] = {
              name: String(row.name ?? "Chưa có tên"),
              email: row.email ? String(row.email) : null,
            };
            return acc;
          },
          {},
        );

        const subDepartmentsById = departmentRows.reduce<Record<string, number>>((acc, row) => {
          if (!row.parent_department_id) {
            return acc;
          }

          acc[row.parent_department_id] = (acc[row.parent_department_id] ?? 0) + 1;
          return acc;
        }, {});

        const membersByDepartmentId = urdRows.reduce<
          Record<string, Array<{ profileId: string; roleId: string | null }>>
        >((acc, row) => {
          if (!row.department_id || !row.profile_id) {
            return acc;
          }

          const departmentId = String(row.department_id);
          if (!acc[departmentId]) {
            acc[departmentId] = [];
          }

          acc[departmentId].push({
            profileId: String(row.profile_id),
            roleId: row.role_id ? String(row.role_id) : null,
          });

          return acc;
        }, {});

        const mappedDepartments = sortByVietnameseName(
          departmentRows.map((row) => {
            const rawMembers = (membersByDepartmentId[row.id] ?? []).filter(
              (member) => Boolean(profileInfoById[member.profileId]),
            );
            const memberByProfileId = new Map<string, { profileId: string; roleName: string }>();

            rawMembers.forEach((member) => {
              const roleName = member.roleId ? (roleNameById[member.roleId] ?? "Thành viên") : "Thành viên";
              const existing = memberByProfileId.get(member.profileId);

              if (!existing) {
                memberByProfileId.set(member.profileId, {
                  profileId: member.profileId,
                  roleName,
                });
                return;
              }

              if (getRolePriority(roleName) < getRolePriority(existing.roleName)) {
                memberByProfileId.set(member.profileId, {
                  profileId: member.profileId,
                  roleName,
                });
              }
            });

            const membersList = Array.from(memberByProfileId.values())
              .map((member, index) => {
                const profile = profileInfoById[member.profileId];
                return {
                  nodeId: `member:${row.id}:${member.profileId}`,
                  profileId: member.profileId,
                  departmentId: row.id,
                  departmentName: row.name,
                  name: profile.name,
                  email: profile.email,
                  role: member.roleName,
                  avatar: toInitials(profile.name),
                  tone: memberToneClasses[index % memberToneClasses.length],
                  isHead: isHeadRole(member.roleName),
                  isDirector: isDirectorRole(member.roleName),
                } satisfies DepartmentMember;
              })
              .sort((a, b) => {
                if (a.isDirector !== b.isDirector) {
                  return a.isDirector ? -1 : 1;
                }
                if (a.isHead !== b.isHead) {
                  return a.isHead ? -1 : 1;
                }
                return a.name.localeCompare(b.name, "vi");
              });

            const headCandidate =
              membersList.find((member) => member.isDirector) ??
              membersList.find((member) => member.isHead) ??
              null;
            const parentId = row.parent_department_id ? String(row.parent_department_id) : null;

            return {
              id: row.id,
              name: row.name,
              parentId,
              parentName: parentId ? (departmentRowsById[parentId]?.name ?? "—") : "—",
              pathLabel: getDepartmentPathLabel(row.id, departmentRowsById),
              head: headCandidate?.name ?? "Chưa có",
              headRole: headCandidate?.role ?? "Chưa gán vai trò",
              members: membersList.length,
              subDepartments: subDepartmentsById[row.id] ?? 0,
              description: parentId
                ? `Nhóm chức năng trực thuộc ${departmentRowsById[parentId]?.name ?? "đơn vị cha"}.`
                : "Đơn vị gốc trong cơ cấu tổ chức hiện tại.",
              membersList,
            } satisfies DepartmentItem;
          }),
        );

        setDepartments(mappedDepartments);

        const nonFatalErrors: string[] = [];
        if (urdError) {
          nonFatalErrors.push("Không tải được liên kết vai trò-phòng ban.");
        }
        if (profilesError) {
          nonFatalErrors.push("Không tải được hồ sơ nhân sự.");
        }
        if (rolesError) {
          nonFatalErrors.push("Không tải được danh sách vai trò.");
        }
        setLoadError(nonFatalErrors.length > 0 ? nonFatalErrors.join(" ") : null);
      } catch {
        if (!isActive) {
          return;
        }

        setLoadError("Có lỗi xảy ra khi tải dữ liệu cơ cấu tổ chức.");
        setDepartments([]);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadDepartments();

    return () => {
      isActive = false;
    };
  }, []);

  const visibleDepartments = useMemo(() => {
    const keyword = normalizeText(searchKeyword.trim());
    if (!keyword) {
      return departments;
    }

    return departments.filter((department) => {
      const memberNames = department.membersList.map((member) => `${member.name} ${member.role}`).join(" ");
      const haystack = normalizeText(
        `${department.name} ${department.parentName} ${department.head} ${department.pathLabel} ${memberNames}`,
      );
      return haystack.includes(keyword);
    });
  }, [departments, searchKeyword]);

  const visibleDepartmentById = useMemo(
    () =>
      visibleDepartments.reduce<Record<string, DepartmentItem>>((acc, department) => {
        acc[department.id] = department;
        return acc;
      }, {}),
    [visibleDepartments],
  );

  const layout = useMemo(() => buildCanvasLayout(visibleDepartments), [visibleDepartments]);
  const personnelLayout = useMemo(() => buildPersonnelLayout(visibleDepartments), [visibleDepartments]);

  const departmentLayoutKey = useMemo(
    () => layout.departmentNodes.map((node) => node.id).sort((a, b) => a.localeCompare(b)).join("|"),
    [layout.departmentNodes],
  );
  const personnelLayoutKey = useMemo(
    () => personnelLayout.personnelNodes.map((node) => node.id).sort((a, b) => a.localeCompare(b)).join("|"),
    [personnelLayout.personnelNodes],
  );

  useEffect(() => {
    setDepartmentPositions((prev) =>
      layout.departmentNodes.reduce<Record<string, CanvasPosition>>((acc, node) => {
        acc[node.id] = prev[node.id] ?? { x: node.x, y: node.y };
        return acc;
      }, {}),
    );
  }, [layout.departmentNodes]);

  const departmentNodeMap = useMemo(
    () =>
      layout.departmentNodes.reduce<Record<string, LayoutDepartmentNode>>((acc, node) => {
        const position = departmentPositions[node.id] ?? { x: node.x, y: node.y };
        acc[node.id] = { ...node, ...position };
        return acc;
      }, {}),
    [departmentPositions, layout.departmentNodes],
  );
  useEffect(() => {
    const nextSelectedDepartmentId =
      selectedDepartmentIdParam && visibleDepartmentById[selectedDepartmentIdParam]
        ? selectedDepartmentIdParam
        : null;

    setSelectedDepartmentIdState((current) => {
      if (current && visibleDepartmentById[current]) {
        return current;
      }
      return nextSelectedDepartmentId;
    });
  }, [selectedDepartmentIdParam, visibleDepartmentById]);

  const selectedDepartmentId =
    selectedDepartmentIdState && visibleDepartmentById[selectedDepartmentIdState]
      ? selectedDepartmentIdState
      : (selectedDepartmentIdParam && visibleDepartmentById[selectedDepartmentIdParam]
          ? selectedDepartmentIdParam
          : null);
  const selectedDepartment = selectedDepartmentId ? (visibleDepartmentById[selectedDepartmentId] ?? null) : null;
  const selectedPersonnelMember =
    mode === "people" && selectedMemberNodeIdState
      ? (personnelLayout.personnelNodes.find((node) => node.id === selectedMemberNodeIdState)?.member ?? null)
      : null;

  const canvasBounds = useMemo<CanvasBounds | null>(() => {
    const nodes = (mode === "departments" ? layout.departmentNodes : personnelLayout.personnelNodes).map((node) => {
      const position = mode === "departments" ? (departmentNodeMap[node.id] ?? node) : node;
      const cardWidth = mode === "departments" ? DEPARTMENT_CARD_WIDTH : PERSON_CARD_WIDTH;
      const cardHeight = mode === "departments" ? DEPARTMENT_CARD_HEIGHT : PERSON_CARD_HEIGHT;
      return {
        minX: position.x,
        minY: position.y,
        maxX: position.x + cardWidth,
        maxY: position.y + cardHeight,
      };
    });

    if (!nodes.length) {
      return null;
    }

    return {
      minX: Math.min(...nodes.map((node) => node.minX)),
      minY: Math.min(...nodes.map((node) => node.minY)),
      maxX: Math.max(...nodes.map((node) => node.maxX)),
      maxY: Math.max(...nodes.map((node) => node.maxY)),
    };
  }, [departmentNodeMap, layout.departmentNodes, mode, personnelLayout.personnelNodes]);

  const clampScale = useCallback(
    (value: number) => Math.min(CANVAS_MAX_SCALE, Math.max(CANVAS_MIN_SCALE, value)),
    [],
  );

  const clampPanToViewport = useCallback(
    (nextPan: { x: number; y: number }, scale: number, rect?: DOMRect) => {
      const viewportRect = rect ?? canvasRef.current?.getBoundingClientRect();
      if (!viewportRect) {
        return nextPan;
      }

      const worldPixelWidth = (mode === "departments" ? layout.worldWidth : personnelLayout.worldWidth) * scale;
      const worldPixelHeight = (mode === "departments" ? layout.worldHeight : personnelLayout.worldHeight) * scale;

      if (worldPixelWidth <= viewportRect.width && worldPixelHeight <= viewportRect.height) {
        return {
          x: (viewportRect.width - worldPixelWidth) / 2,
          y: (viewportRect.height - worldPixelHeight) / 2,
        };
      }

      const minX = Math.min(0, viewportRect.width - worldPixelWidth);
      const minY = Math.min(0, viewportRect.height - worldPixelHeight);

      return {
        x:
          worldPixelWidth <= viewportRect.width
            ? (viewportRect.width - worldPixelWidth) / 2
            : Math.min(0, Math.max(minX, nextPan.x)),
        y:
          worldPixelHeight <= viewportRect.height
            ? (viewportRect.height - worldPixelHeight) / 2
            : Math.min(0, Math.max(minY, nextPan.y)),
      };
    },
    [layout.worldHeight, layout.worldWidth, mode, personnelLayout.worldHeight, personnelLayout.worldWidth],
  );

  const focusCanvasBounds = useCallback(
    (bounds: CanvasBounds) => {
      if (!canvasRef.current) {
        return;
      }

      const rect = canvasRef.current.getBoundingClientRect();
      const width = Math.max(1, bounds.maxX - bounds.minX);
      const height = Math.max(1, bounds.maxY - bounds.minY);
      const scaleByWidth = (rect.width - FOCUS_PADDING * 2) / width;
      const scaleByHeight = (rect.height - FOCUS_PADDING * 2) / height;
      const targetScale = clampScale(Math.min(scaleByWidth, scaleByHeight, CANVAS_MAX_SCALE));
      const centerX = bounds.minX + width / 2;
      const centerY = bounds.minY + height / 2;
      const targetPan = {
        x: rect.width / 2 - centerX * targetScale,
        y: rect.height / 2 - centerY * targetScale,
      };

      setCanvasScale(targetScale);
      setCanvasPan(clampPanToViewport(targetPan, targetScale, rect));
    },
    [clampPanToViewport, clampScale],
  );

  const fitCanvasToNodes = useCallback(() => {
    if (!canvasBounds) {
      return;
    }
    focusCanvasBounds(canvasBounds);
  }, [canvasBounds, focusCanvasBounds]);

  const applyCanvasZoom = useCallback(
    (nextScaleRaw: number, anchor?: { x: number; y: number }) => {
      if (!canvasRef.current) {
        return;
      }

      const rect = canvasRef.current.getBoundingClientRect();
      const anchorX = anchor?.x ?? rect.width / 2;
      const anchorY = anchor?.y ?? rect.height / 2;
      const nextScale = clampScale(nextScaleRaw);
      const worldX = (anchorX - canvasPanRef.current.x) / canvasScaleRef.current;
      const worldY = (anchorY - canvasPanRef.current.y) / canvasScaleRef.current;

      const nextPan = {
        x: anchorX - worldX * nextScale,
        y: anchorY - worldY * nextScale,
      };

      setCanvasScale(nextScale);
      setCanvasPan(clampPanToViewport(nextPan, nextScale, rect));
    },
    [clampPanToViewport, clampScale],
  );

  useEffect(() => {
    const layoutKey = mode === "departments" ? departmentLayoutKey : personnelLayoutKey;
    if (isLoading || !canvasBounds || !layoutKey) {
      return;
    }

    const autoFitKey = `${mode}:${layoutKey}`;
    if (autoFittedLayoutKeyRef.current === autoFitKey) {
      return;
    }

    autoFittedLayoutKeyRef.current = autoFitKey;
    const frameId = requestAnimationFrame(() => {
      fitCanvasToNodes();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [canvasBounds, departmentLayoutKey, fitCanvasToNodes, isLoading, mode, personnelLayoutKey]);

  useEffect(() => {
    if (isLoading || !canvasBounds || !canvasRef.current) {
      return;
    }

    const canvasElement = canvasRef.current;
    const observer = new ResizeObserver(() => {
      fitCanvasToNodes();
    });

    observer.observe(canvasElement);
    return () => observer.disconnect();
  }, [canvasBounds, fitCanvasToNodes, isLoading, mode]);

  const handleSelectDepartment = useCallback(
    (departmentId: string) => {
      setSelectedMemberNodeIdState(null);
      setSelectedDepartmentIdState(departmentId);
      updateQuery({ dept: departmentId });
    },
    [updateQuery],
  );

  const handleSelectMember = useCallback(
    (node: PersonnelNode) => {
      setSelectedMemberNodeIdState(node.id);
      setSelectedDepartmentIdState(node.departmentId);
      updateQuery({ dept: node.departmentId });
    },
    [updateQuery],
  );

  const consumeSuppressedClick = useCallback(() => Date.now() < suppressClickUntilRef.current, []);

  const startDraggingNode = useCallback(
    (
      event: React.PointerEvent<HTMLButtonElement>,
      target: { type: "department"; id: string; position: CanvasPosition },
    ) => {
      event.stopPropagation();
      dragMovedRef.current = false;
      setDraggingTarget({
        type: target.type,
        id: target.id,
        originX: target.position.x,
        originY: target.position.y,
        pointerX: event.clientX,
        pointerY: event.clientY,
      });
    },
    [],
  );

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== "departments" && mode !== "people") {
      return;
    }

    if ((event.target as HTMLElement).closest("[data-node-card='true']")) {
      return;
    }

    panStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: canvasPanRef.current.x,
      originY: canvasPanRef.current.y,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canvasRef.current) {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();

    if (draggingTarget) {
      const deltaX = (event.clientX - draggingTarget.pointerX) / canvasScaleRef.current;
      const deltaY = (event.clientY - draggingTarget.pointerY) / canvasScaleRef.current;
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        dragMovedRef.current = true;
      }

      const nextPosition = {
        x: Math.max(24, Math.min(layout.worldWidth - DEPARTMENT_CARD_WIDTH - 24, draggingTarget.originX + deltaX)),
        y: Math.max(24, Math.min(layout.worldHeight - DEPARTMENT_CARD_HEIGHT - 24, draggingTarget.originY + deltaY)),
      };

      setDepartmentPositions((prev) => ({
        ...prev,
        [draggingTarget.id]: nextPosition,
      }));

      return;
    }

    if (!isPanning || !panStartRef.current) {
      return;
    }

    const deltaX = event.clientX - panStartRef.current.pointerX;
    const deltaY = event.clientY - panStartRef.current.pointerY;
    const nextPan = {
      x: panStartRef.current.originX + deltaX,
      y: panStartRef.current.originY + deltaY,
    };
    setCanvasPan(clampPanToViewport(nextPan, canvasScaleRef.current, rect));
  };

  const handleCanvasPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragMovedRef.current) {
      suppressClickUntilRef.current = Date.now() + 180;
    }

    dragMovedRef.current = false;
    setDraggingTarget(null);
    setIsPanning(false);
    panStartRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleNativeCanvasWheel = useCallback(
    (event: WheelEvent) => {
      if (!canvasRef.current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const rect = canvasRef.current.getBoundingClientRect();
      const pointer = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      applyCanvasZoom(canvasScaleRef.current * (event.deltaY < 0 ? 1.08 : 0.92), pointer);
    },
    [applyCanvasZoom],
  );

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const element = canvasRef.current;
    if (!element) {
      return;
    }

    element.addEventListener("wheel", handleNativeCanvasWheel, { passive: false });

    return () => {
      element.removeEventListener("wheel", handleNativeCanvasWheel);
    };
  }, [handleNativeCanvasWheel, isLoading]);

  const activeDepartmentForHighlight = selectedDepartment?.id ?? null;

  const isDepartmentFaded = useCallback(
    (departmentId: string) => {
      if (!activeDepartmentForHighlight) {
        return false;
      }
      return departmentId !== activeDepartmentForHighlight;
    },
    [activeDepartmentForHighlight],
  );

  return (
    <TooltipProvider>
      <div className="h-dvh overflow-hidden bg-[#f3f5fa] text-slate-900">
        <div className="flex h-full w-full overflow-hidden">
          <WorkspaceSidebar active="departments" />

          <div className="flex h-dvh min-h-0 w-full flex-1 flex-col overflow-hidden lg:pl-[var(--workspace-sidebar-width)]">
            <WorkspacePageHeader title="Phòng ban" items={[{ label: "Phòng ban" }]} />

            <main className="flex min-h-0 flex-1 overflow-hidden px-4 py-4 lg:px-6">
              <div className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-slate-200 bg-white px-3 py-2 shadow-[0_16px_30px_-32px_rgba(15,23,42,0.4)]">
                  <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => updateQuery({ mode: "departments" })}
                      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                        mode === "departments"
                          ? "bg-white text-slate-800 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Phòng ban
                    </button>
                    <button
                      type="button"
                      onClick={() => updateQuery({ mode: "people" })}
                      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                        mode === "people"
                          ? "bg-white text-slate-800 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Nhân sự
                    </button>
                  </div>

                  <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                    <label className="relative block min-w-[220px] flex-1 md:max-w-[360px]">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={searchKeyword}
                        onChange={(event) => setSearchKeyword(event.target.value)}
                        placeholder="Tìm phòng ban hoặc nhân sự"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => setIsDetailDialogOpen(true)}
                      disabled={!selectedDepartment && !selectedPersonnelMember}
                      className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm xl:hidden"
                    >
                      Chi tiết
                    </button>

                    {mode === "departments" || mode === "people" ? (
                      <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                        <button
                          type="button"
                          onClick={() => applyCanvasZoom(canvasScaleRef.current - 0.08)}
                          className="h-8 w-8 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100"
                        >
                          −
                        </button>
                        <button
                          type="button"
                          onClick={fitCanvasToNodes}
                          className="h-8 rounded-lg px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                        >
                          {Math.round(canvasScale * 100)}%
                        </button>
                        <button
                          type="button"
                          onClick={() => applyCanvasZoom(canvasScaleRef.current + 0.08)}
                          className="h-8 w-8 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100"
                        >
                          +
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {isLoading ? (
                  <div className="flex min-h-0 flex-1 items-center justify-center rounded-[28px] border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">
                    Đang tải dữ liệu cơ cấu tổ chức...
                  </div>
                ) : null}

                {!isLoading && loadError ? (
                  <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    {loadError}
                  </div>
                ) : null}

                {!isLoading ? (
                  <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
                    <section className="min-h-0 min-w-0 flex-1">
                      {mode === "departments" ? (
                        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_20px_50px_-38px_rgba(15,23,42,0.25)]">
                          <div className="mb-3 flex items-center justify-between gap-3 px-1">
                            <div className="flex items-center gap-2">
                              <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-900">
                                Cây phòng ban
                              </h2>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                                  >
                                    <Info className="h-4 w-4" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[220px] text-xs font-medium">
                                  Kéo nền để pan, lăn chuột để zoom và kéo thẻ phòng ban để sắp xếp lại.
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <p className="text-xs font-medium text-slate-500">
                              {visibleDepartments.length} phòng ban
                            </p>
                          </div>

                          <div
                            ref={canvasRef}
                            onPointerDown={handleCanvasPointerDown}
                            onPointerMove={handleCanvasPointerMove}
                            onPointerUp={handleCanvasPointerUp}
                            onPointerCancel={handleCanvasPointerUp}
                            className={`relative min-h-0 flex-1 overflow-hidden rounded-[24px] border border-slate-200/80 bg-[#f8fbff] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] select-none ${
                              isPanning || draggingTarget ? "cursor-grabbing" : "cursor-grab"
                            }`}
                            style={{
                              touchAction: "none",
                              overscrollBehavior: "contain",
                              backgroundImage:
                                "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.12) 1px, transparent 0)",
                              backgroundSize: "24px 24px",
                            }}
                          >
                            {layout.departmentNodes.length === 0 ? (
                              <div className="grid h-full place-items-center px-4 text-center text-sm text-slate-500">
                                Không có phòng ban hoặc nhân sự phù hợp với bộ lọc hiện tại.
                              </div>
                            ) : (
                              <div
                                className="absolute left-0 top-0"
                                style={{
                                  width: layout.worldWidth,
                                  height: layout.worldHeight,
                                  transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasScale})`,
                                  transformOrigin: "0 0",
                                  willChange: isPanning || draggingTarget ? "transform" : "auto",
                                }}
                              >
                                <svg
                                  className="pointer-events-none absolute inset-0"
                                  style={{ width: layout.worldWidth, height: layout.worldHeight }}
                                >
                                  {layout.edges.map((edge) => {
                                    const fromDepartment = departmentNodeMap[edge.from];
                                    const toDepartment = departmentNodeMap[edge.to];

                                    if (!fromDepartment) {
                                      return null;
                                    }

                                    const targetBox = toDepartment
                                      ? {
                                          x: toDepartment.x,
                                          y: toDepartment.y,
                                          width: DEPARTMENT_CARD_WIDTH,
                                          height: DEPARTMENT_CARD_HEIGHT,
                                        }
                                      : null;

                                    if (!targetBox) {
                                      return null;
                                    }

                                    const isActiveDepartmentEdge =
                                      edge.type === "department" &&
                                      activeDepartmentForHighlight &&
                                      (edge.from === activeDepartmentForHighlight ||
                                        edge.to === activeDepartmentForHighlight);

                                    return (
                                      <path
                                        key={edge.id}
                                        d={getConnectorPath(
                                          {
                                            x: fromDepartment.x,
                                            y: fromDepartment.y,
                                            width: DEPARTMENT_CARD_WIDTH,
                                            height: DEPARTMENT_CARD_HEIGHT,
                                          },
                                          targetBox,
                                        )}
                                        stroke={
                                          isActiveDepartmentEdge
                                            ? "#2563eb"
                                            : "#bfd0e7"
                                        }
                                        strokeWidth={isActiveDepartmentEdge ? 3 : 2.1}
                                        opacity={
                                          activeDepartmentForHighlight
                                            ? isActiveDepartmentEdge
                                              ? 0.96
                                              : 0.42
                                            : 0.72
                                        }
                                        strokeLinecap="round"
                                        fill="none"
                                      />
                                    );
                                  })}
                                </svg>

                                {layout.departmentNodes.map((departmentNode) => {
                                  const department = visibleDepartmentById[departmentNode.id];
                                  const position = departmentNodeMap[departmentNode.id];

                                  if (!department || !position) {
                                    return null;
                                  }

                                  return (
                                    <div
                                      key={department.id}
                                      className="absolute"
                                      style={{
                                        left: position.x,
                                        top: position.y,
                                        width: DEPARTMENT_CARD_WIDTH,
                                      }}
                                    >
                                      <DepartmentCanvasCard
                                        item={department}
                                        active={selectedDepartment?.id === department.id}
                                        faded={isDepartmentFaded(department.id)}
                                        onSelect={() => {
                                          if (consumeSuppressedClick()) {
                                            return;
                                          }
                                          handleSelectDepartment(department.id);
                                        }}
                                        onPointerDown={(event) =>
                                          startDraggingNode(event, {
                                            type: "department",
                                            id: department.id,
                                            position,
                                          })
                                        }
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_20px_50px_-38px_rgba(15,23,42,0.25)]">
                          <div className="mb-3 flex items-center justify-between gap-3 px-1">
                            <div className="flex items-center gap-2">
                              <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-900">Cây nhân sự</h2>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                                  >
                                    <Info className="h-4 w-4" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[220px] text-xs font-medium">
                                  Director luôn được ưu tiên ở gốc cây; leader được nối với thành viên và các phòng ban trực thuộc.
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <p className="text-xs font-medium text-slate-500">
                              {personnelLayout.personnelNodes.length} nhân sự
                            </p>
                          </div>

                          <div
                            ref={canvasRef}
                            onPointerDown={handleCanvasPointerDown}
                            onPointerMove={handleCanvasPointerMove}
                            onPointerUp={handleCanvasPointerUp}
                            onPointerCancel={handleCanvasPointerUp}
                            className={`relative min-h-0 flex-1 overflow-hidden rounded-[24px] border border-slate-200/80 bg-[#f8fbff] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] select-none ${
                              isPanning ? "cursor-grabbing" : "cursor-grab"
                            }`}
                            style={{
                              touchAction: "none",
                              overscrollBehavior: "contain",
                              backgroundImage:
                                "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.12) 1px, transparent 0)",
                              backgroundSize: "24px 24px",
                            }}
                          >
                            {personnelLayout.personnelNodes.length === 0 ? (
                              <div className="grid h-full place-items-center px-4 text-center text-sm text-slate-500">
                                Không có nhân sự phù hợp với bộ lọc hiện tại.
                              </div>
                            ) : (
                              <div
                                className="absolute left-0 top-0"
                                style={{
                                  width: personnelLayout.worldWidth,
                                  height: personnelLayout.worldHeight,
                                  transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasScale})`,
                                  transformOrigin: "0 0",
                                  willChange: isPanning ? "transform" : "auto",
                                }}
                              >
                                <svg
                                  className="pointer-events-none absolute inset-0"
                                  style={{ width: personnelLayout.worldWidth, height: personnelLayout.worldHeight }}
                                >
                                  {personnelLayout.edges.map((edge) => {
                                    const from = personnelLayout.personnelNodes.find((node) => node.id === edge.from);
                                    const to = personnelLayout.personnelNodes.find((node) => node.id === edge.to);
                                    if (!from || !to) return null;
                                    const isActive =
                                      activeDepartmentForHighlight &&
                                      (from.departmentId === activeDepartmentForHighlight ||
                                        to.departmentId === activeDepartmentForHighlight);

                                    return (
                                      <path
                                        key={edge.id}
                                        d={getConnectorPath(
                                          { x: from.x, y: from.y, width: PERSON_CARD_WIDTH, height: PERSON_CARD_HEIGHT },
                                          { x: to.x, y: to.y, width: PERSON_CARD_WIDTH, height: PERSON_CARD_HEIGHT },
                                        )}
                                        stroke={isActive ? "#2563eb" : "#bfd0e7"}
                                        strokeWidth={isActive ? 3 : 2.1}
                                        opacity={activeDepartmentForHighlight ? (isActive ? 0.96 : 0.42) : 0.72}
                                        strokeLinecap="round"
                                        fill="none"
                                      />
                                    );
                                  })}
                                </svg>

                                {personnelLayout.personnelNodes.map((node) => (
                                  <div
                                    key={node.id}
                                    className="absolute"
                                    style={{ left: node.x, top: node.y, width: PERSON_CARD_WIDTH }}
                                  >
                                    <PersonnelCanvasCard
                                      member={node.member}
                                      active={selectedDepartment?.id === node.departmentId}
                                      faded={isDepartmentFaded(node.departmentId)}
                                      onSelect={() => handleSelectMember(node)}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </section>

                    <aside className="hidden h-full min-h-0 w-[320px] xl:block">
                      <DetailPanelContent department={selectedDepartment} member={selectedPersonnelMember} />
                    </aside>
                  </div>
                ) : null}
              </div>
            </main>

            <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
              <DialogContent className="top-auto bottom-0 left-1/2 max-h-[82dvh] w-[calc(100vw-1rem)] max-w-none translate-x-[-50%] translate-y-0 gap-0 overflow-hidden rounded-t-[28px] rounded-b-none border-slate-200 p-0 sm:bottom-4 sm:w-[560px] sm:rounded-[28px]">
                <DialogHeader className="border-b border-slate-100 px-4 py-4">
                  <DialogTitle>Chi tiết</DialogTitle>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-hidden p-4">
                  <DetailPanelContent department={selectedDepartment} member={selectedPersonnelMember} />
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default function DepartmentsPage() {
  return (
    <Suspense
      fallback={
        <div className="h-dvh overflow-hidden bg-[#f3f5fa] text-slate-900">
          <div className="flex h-full w-full overflow-hidden">
            <WorkspaceSidebar active="departments" />
            <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden lg:pl-[280px]">
              <main className="flex min-h-0 flex-1 items-center px-4 py-4 lg:px-6">
                <div className="w-full rounded-[28px] border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">
                  Đang tải canvas cơ cấu tổ chức...
                </div>
              </main>
            </div>
          </div>
        </div>
      }
    >
      <DepartmentsPageContent />
    </Suspense>
  );
}
