"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { supabase } from "@/lib/supabase";

type DepartmentMode = "tree" | "list";

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
};

type RoleRow = {
  id: string;
  name: string | null;
};

type DepartmentMember = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  avatar: string;
  tone: string;
};

type DepartmentItem = {
  id: string;
  tag: string;
  name: string;
  parentId: string | null;
  parent: string;
  head: string;
  headRole: string;
  members: number;
  subDepartments: number;
  createdAt: string;
  description: string;
  membersList: DepartmentMember[];
};

type TreeNode = {
  id: string;
  x: number;
  y: number;
};

type TreeEdge = {
  from: string;
  to: string;
};

const TREE_CARD_WIDTH = 320;
const TREE_CARD_HEIGHT = 212;
const TREE_INITIAL_SCALE = 0.86;
const TREE_MIN_SCALE = 0.2;
const TREE_MAX_SCALE = 1.4;
const TREE_WORLD_WIDTH = 2200;
const TREE_WORLD_HEIGHT = 1500;
const TREE_LEVEL_GAP_Y = 280;
const TREE_NODE_GAP_X = 80;

const memberToneClasses = [
  "bg-cyan-100 text-cyan-700",
  "bg-indigo-100 text-indigo-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-emerald-100 text-emerald-700",
  "bg-orange-100 text-orange-700",
  "bg-purple-100 text-purple-700",
  "bg-blue-100 text-blue-700",
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

const normalizeText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const isHeadRole = (roleName: string) => {
  const normalized = normalizeText(roleName);
  return (
    normalized.includes("leader") ||
    normalized.includes("head") ||
    normalized.includes("manager") ||
    normalized.includes("truong")
  );
};

const buildTreeLayout = (items: DepartmentItem[]): { nodes: TreeNode[]; edges: TreeEdge[] } => {
  if (!items.length) {
    return { nodes: [], edges: [] };
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

  const sortByName = (list: DepartmentItem[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, "vi"));

  const roots = sortByName(items.filter((item) => !item.parentId || !byId[item.parentId]));
  const queue = roots.map((item) => item.id);

  const levelById: Record<string, number> = {};
  roots.forEach((root) => {
    levelById[root.id] = 0;
  });

  while (queue.length) {
    const currentId = queue.shift() as string;
    const childIds = (childrenByParent[currentId] ?? []).filter((id) => Boolean(byId[id]));
    const children = sortByName(childIds.map((id) => byId[id]));

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

  const nodes: TreeNode[] = [];
  Object.entries(levelBuckets).forEach(([levelRaw, rawItems]) => {
    const level = Number(levelRaw);
    const levelItems = sortByName(rawItems);
    const rowWidth = levelItems.length * TREE_CARD_WIDTH + (levelItems.length - 1) * TREE_NODE_GAP_X;
    const startX = Math.max(20, (TREE_WORLD_WIDTH - rowWidth) / 2);

    levelItems.forEach((item, index) => {
      nodes.push({
        id: item.id,
        x: startX + index * (TREE_CARD_WIDTH + TREE_NODE_GAP_X),
        y: 120 + level * TREE_LEVEL_GAP_Y,
      });
    });
  });

  const edges: TreeEdge[] = items
    .filter((item) => item.parentId && byId[item.parentId])
    .map((item) => ({ from: item.parentId as string, to: item.id }));

  return { nodes, edges };
};

function TreeCard({
  item,
  active,
  onSelect,
  onPointerDown,
}: {
  item: DepartmentItem;
  active: boolean;
  onSelect: (departmentId: string) => void;
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      data-tree-card="true"
      type="button"
      onPointerDown={onPointerDown}
      onClick={() => onSelect(item.id)}
      className={`flex h-[212px] w-[320px] flex-col rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
        active ? "border-blue-500 ring-1 ring-blue-200" : "border-slate-200 hover:border-blue-300"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 uppercase">
          {item.tag}
        </span>
        <span className="text-xs text-slate-500">{item.members} thành viên</span>
      </div>
      <p className="mt-3 text-xl font-semibold tracking-[-0.01em] text-slate-900">{item.name}</p>
      <p className="mt-2 line-clamp-2 text-sm text-slate-500">{item.description}</p>
      <div className="mt-auto flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
          {toInitials(item.head)}
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-700">{item.head}</p>
          <p className="text-xs text-slate-500">{item.headRole}</p>
        </div>
      </div>
    </button>
  );
}

function DepartmentPanel({ item }: { item: DepartmentItem | null }) {
  if (!item) {
    return (
      <aside className="self-start rounded-2xl border border-slate-200 bg-white p-5 xl:sticky xl:top-[92px]">
        <p className="text-sm text-slate-500">Chưa có dữ liệu phòng ban để hiển thị.</p>
      </aside>
    );
  }

  return (
    <aside className="self-start overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 xl:sticky xl:top-[92px] xl:max-h-[calc(100vh-112px)]">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-100 text-blue-700">▣</div>
      <h3 className="mt-3 text-2xl font-semibold tracking-[-0.01em] text-slate-900">{item.name}</h3>
      <p className="mt-1 text-sm text-slate-500">
        {item.members} thành viên · {item.subDepartments} phòng ban con
      </p>

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">Trưởng phòng</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
            {toInitials(item.head)}
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-700">{item.head}</p>
            <p className="text-xs text-slate-500">{item.headRole}</p>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">Thành viên</p>
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
            {item.members}
          </span>
        </div>

        {item.membersList.length > 0 ? (
          <div className="space-y-3">
            {item.membersList.slice(0, 12).map((member) => (
              <div key={member.id} className="flex items-center gap-2">
                <span className={`grid h-9 w-9 place-items-center rounded-full text-xs font-semibold ${member.tone}`}>
                  {member.avatar}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-700">{member.name}</p>
                  <p className="text-xs text-slate-500">{member.role}</p>
                  {member.email ? (
                    <p className="text-[11px] text-slate-400">{member.email}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Chưa có thành viên trong phòng ban này.</p>
        )}
      </div>
    </aside>
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

  const mode: DepartmentMode = searchParams.get("mode") === "list" ? "list" : "tree";
  const selectedId = searchParams.get("dept") ?? "";

  const updateQuery = (next: { mode?: DepartmentMode; dept?: string | null }) => {
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
  };

  useEffect(() => {
    let isActive = true;

    const loadDepartments = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const [{ data: departmentsData, error: departmentsError }, { data: urdData, error: urdError }, { data: profilesData, error: profilesError }, { data: rolesData, error: rolesError }] =
          await Promise.all([
            supabase.from("departments").select("id,name,parent_department_id"),
            supabase.from("user_role_in_department").select("department_id,profile_id,role_id"),
            supabase.from("profiles").select("id,name,email"),
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

        const rows = (departmentsData ?? []) as DepartmentRow[];
        const urdRows = (urdData ?? []) as UserRoleDepartmentRow[];
        const profileRows = (profilesData ?? []) as ProfileRow[];
        const roleRows = (rolesData ?? []) as RoleRow[];

        const nameByDepartmentId = rows.reduce<Record<string, string>>((acc, row) => {
          acc[String(row.id)] = String(row.name);
          return acc;
        }, {});

        const profileInfoById = profileRows.reduce<
          Record<string, { name: string; email: string | null }>
        >((acc, row) => {
          acc[String(row.id)] = {
            name: String(row.name ?? "Chưa có tên"),
            email: row.email ? String(row.email) : null,
          };
          return acc;
        }, {});

        const roleNameById = roleRows.reduce<Record<string, string>>((acc, row) => {
          acc[String(row.id)] = String(row.name ?? "Thành viên");
          return acc;
        }, {});

        const subDepartmentsById = rows.reduce<Record<string, number>>((acc, row) => {
          if (!row.parent_department_id) {
            return acc;
          }
          const parentId = String(row.parent_department_id);
          acc[parentId] = (acc[parentId] ?? 0) + 1;
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

        const mappedDepartments = rows.map((row) => {
          const rawMembers = membersByDepartmentId[String(row.id)] ?? [];
          const uniqueMembersByProfile = new Map<string, { profileId: string; roleName: string }>();

          rawMembers.forEach((member) => {
            const roleName = member.roleId ? roleNameById[member.roleId] ?? "Thành viên" : "Thành viên";
            if (!uniqueMembersByProfile.has(member.profileId)) {
              uniqueMembersByProfile.set(member.profileId, {
                profileId: member.profileId,
                roleName,
              });
            }
          });

          const membersList: DepartmentMember[] = Array.from(uniqueMembersByProfile.values())
            .map((member, index) => {
              const info = profileInfoById[member.profileId] ?? { name: "Chưa có tên", email: null };
              return {
                id: member.profileId,
                name: info.name,
                email: info.email,
                role: member.roleName,
                avatar: toInitials(info.name),
                tone: memberToneClasses[index % memberToneClasses.length],
              };
            })
            .sort((a, b) => a.name.localeCompare(b.name, "vi"));

          const headCandidate = membersList.find((member) => isHeadRole(member.role)) ?? membersList[0] ?? null;

          const parentId = row.parent_department_id ? String(row.parent_department_id) : null;
          const parentName = parentId ? nameByDepartmentId[parentId] ?? "—" : "—";

          return {
            id: String(row.id),
            tag: parentId ? "Phòng ban con" : "Phòng ban gốc",
            name: String(row.name),
            parentId,
            parent: parentName,
            head: headCandidate?.name ?? "Chưa có",
            headRole: headCandidate?.role ?? "Chưa gán vai trò",
            members: membersList.length,
            subDepartments: subDepartmentsById[String(row.id)] ?? 0,
            createdAt: "Chưa có",
            description: `Phòng ban ${row.name}.`,
            membersList,
          } as DepartmentItem;
        });

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
        setLoadError("Có lỗi xảy ra khi tải dữ liệu phòng ban.");
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
    const normalizedKeyword = normalizeText(searchKeyword.trim());

    if (!normalizedKeyword) {
      return departments;
    }

    return departments.filter((item) => {
      const haystack = normalizeText(`${item.name} ${item.parent} ${item.head}`);
      return haystack.includes(normalizedKeyword);
    });
  }, [departments, searchKeyword]);

  const visibleDepartmentById = useMemo(
    () =>
      visibleDepartments.reduce<Record<string, DepartmentItem>>((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {}),
    [visibleDepartments],
  );

  const selectedDepartment =
    visibleDepartments.find((item) => item.id === selectedId) ?? visibleDepartments[0] ?? null;

  const layout = useMemo(() => buildTreeLayout(visibleDepartments), [visibleDepartments]);

  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([]);
  const [draggingTreeId, setDraggingTreeId] = useState<string | null>(null);
  const [treeScale, setTreeScale] = useState(TREE_INITIAL_SCALE);
  const [treePan, setTreePan] = useState({ x: -520, y: -160 });
  const [isTreePanning, setIsTreePanning] = useState(false);
  const treeCanvasRef = useRef<HTMLDivElement | null>(null);
  const treeDragOffsetRef = useRef({ x: 0, y: 0 });
  const autoCenteredTreeKeyRef = useRef<string>("");
  const treePanStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    startX: number;
    startY: number;
  } | null>(null);

  useEffect(() => {
    setTreeNodes((prev) => {
      if (!layout.nodes.length) {
        return [];
      }

      const prevById = prev.reduce<Record<string, TreeNode>>((acc, node) => {
        acc[node.id] = node;
        return acc;
      }, {});

      return layout.nodes.map((node) => prevById[node.id] ?? node);
    });
  }, [layout.nodes]);

  const treeNodeMap = useMemo(
    () =>
      treeNodes.reduce<Record<string, TreeNode>>((acc, node) => {
        acc[node.id] = node;
        return acc;
      }, {}),
    [treeNodes],
  );

  const treeNodeIdentityKey = useMemo(
    () =>
      layout.nodes
        .map((node) => node.id)
        .sort((a, b) => a.localeCompare(b))
        .join("|"),
    [layout.nodes],
  );

  const clampScale = useCallback(
    (nextScale: number) => Math.min(TREE_MAX_SCALE, Math.max(TREE_MIN_SCALE, nextScale)),
    [],
  );

  const clampPanToViewport = useCallback(
    (nextPan: { x: number; y: number }, scale: number, rect?: DOMRect) => {
      const viewportRect = rect ?? treeCanvasRef.current?.getBoundingClientRect();
      if (!viewportRect) {
        return nextPan;
      }

      const worldPixelWidth = TREE_WORLD_WIDTH * scale;
      const worldPixelHeight = TREE_WORLD_HEIGHT * scale;
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
          : Math.min(0, Math.max(minX, nextPan.x));
      const centeredY =
        worldPixelHeight <= viewportRect.height
          ? (viewportRect.height - worldPixelHeight) / 2
          : Math.min(0, Math.max(minY, nextPan.y));

      return {
        x: centeredX,
        y: centeredY,
      };
    },
    [],
  );

  const fitTreeToNodes = useCallback(() => {
    if (!treeCanvasRef.current || treeNodes.length === 0) {
      return;
    }

    const rect = treeCanvasRef.current.getBoundingClientRect();
    const minNodeX = Math.min(...treeNodes.map((node) => node.x));
    const minNodeY = Math.min(...treeNodes.map((node) => node.y));
    const maxNodeX = Math.max(...treeNodes.map((node) => node.x + TREE_CARD_WIDTH));
    const maxNodeY = Math.max(...treeNodes.map((node) => node.y + TREE_CARD_HEIGHT));

    const contentWidth = Math.max(1, maxNodeX - minNodeX);
    const contentHeight = Math.max(1, maxNodeY - minNodeY);
    const padding = 72;

    const scaleByWidth = (rect.width - padding * 2) / contentWidth;
    const scaleByHeight = (rect.height - padding * 2) / contentHeight;
    const targetScale = clampScale(Math.min(scaleByWidth, scaleByHeight, TREE_MAX_SCALE));
    const contentCenterX = minNodeX + contentWidth / 2;
    const contentCenterY = minNodeY + contentHeight / 2;
    const targetPan = {
      x: rect.width / 2 - contentCenterX * targetScale,
      y: rect.height / 2 - contentCenterY * targetScale,
    };

    setTreeScale(targetScale);
    setTreePan(clampPanToViewport(targetPan, targetScale, rect));
  }, [clampPanToViewport, clampScale, treeNodes]);

  const applyTreeZoom = (nextScaleRaw: number, anchor?: { x: number; y: number }) => {
    if (!treeCanvasRef.current) {
      return;
    }

    const rect = treeCanvasRef.current.getBoundingClientRect();
    const anchorX = anchor?.x ?? rect.width / 2;
    const anchorY = anchor?.y ?? rect.height / 2;
    const nextScale = clampScale(nextScaleRaw);

    const worldX = (anchorX - treePan.x) / treeScale;
    const worldY = (anchorY - treePan.y) / treeScale;
    const nextPan = {
      x: anchorX - worldX * nextScale,
      y: anchorY - worldY * nextScale,
    };

    setTreeScale(nextScale);
    setTreePan(clampPanToViewport(nextPan, nextScale, rect));
  };

  const handleTreeCardPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    departmentId: string,
  ) => {
    if (mode !== "tree") {
      return;
    }

    event.stopPropagation();
    const cardRect = event.currentTarget.getBoundingClientRect();
    treeDragOffsetRef.current = {
      x: event.clientX - cardRect.left,
      y: event.clientY - cardRect.top,
    };
    updateQuery({ dept: departmentId });
    setDraggingTreeId(departmentId);
    if (treeCanvasRef.current) {
      treeCanvasRef.current.setPointerCapture(event.pointerId);
    }
  };

  const handleTreePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== "tree" || draggingTreeId) {
      return;
    }

    treePanStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: treePan.x,
      startY: treePan.y,
    };
    setIsTreePanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleTreePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!treeCanvasRef.current || mode !== "tree") {
      return;
    }

    const rect = treeCanvasRef.current.getBoundingClientRect();
    if (draggingTreeId) {
      const nextX =
        (event.clientX - rect.left - treeDragOffsetRef.current.x - treePan.x) / treeScale;
      const nextY =
        (event.clientY - rect.top - treeDragOffsetRef.current.y - treePan.y) / treeScale;

      const clampedX = Math.max(20, Math.min(nextX, TREE_WORLD_WIDTH - TREE_CARD_WIDTH - 20));
      const clampedY = Math.max(20, Math.min(nextY, TREE_WORLD_HEIGHT - TREE_CARD_HEIGHT - 20));

      setTreeNodes((prev) =>
        prev.map((node) =>
          node.id === draggingTreeId ? { ...node, x: clampedX, y: clampedY } : node,
        ),
      );
      return;
    }

    if (!isTreePanning || !treePanStartRef.current) {
      return;
    }

    const deltaX = event.clientX - treePanStartRef.current.pointerX;
    const deltaY = event.clientY - treePanStartRef.current.pointerY;
    const tentativeX = treePanStartRef.current.startX + deltaX;
    const tentativeY = treePanStartRef.current.startY + deltaY;
    setTreePan(clampPanToViewport({ x: tentativeX, y: tentativeY }, treeScale, rect));
  };

  const handleTreePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (draggingTreeId) {
      setDraggingTreeId(null);
    }
    if (isTreePanning) {
      setIsTreePanning(false);
    }
    treePanStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleTreeWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!treeCanvasRef.current || mode !== "tree") {
      return;
    }

    event.preventDefault();
    const rect = treeCanvasRef.current.getBoundingClientRect();
    const pointer = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    applyTreeZoom(treeScale * factor, pointer);
  };

  useEffect(() => {
    if (mode !== "tree" || treeNodes.length === 0 || !treeNodeIdentityKey) {
      return;
    }

    if (autoCenteredTreeKeyRef.current === treeNodeIdentityKey) {
      return;
    }

    autoCenteredTreeKeyRef.current = treeNodeIdentityKey;
    const frameId = requestAnimationFrame(() => {
      fitTreeToNodes();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [fitTreeToNodes, mode, treeNodeIdentityKey, treeNodes.length]);

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="departments" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-[-0.02em] text-slate-900">Phòng ban</h1>
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => updateQuery({ mode: "tree" })}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                      mode === "tree" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Tree
                  </button>
                  <button
                    type="button"
                    onClick={() => updateQuery({ mode: "list" })}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                      mode === "list" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    List
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="Tìm phòng ban..."
                  className="h-11 w-[280px] rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-7">
            {isLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">
                Đang tải dữ liệu phòng ban...
              </div>
            ) : null}

            {!isLoading && loadError ? (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {loadError}
              </div>
            ) : null}

            {!isLoading ? (
              <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <section className="min-w-0">
                  {mode === "tree" ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm text-slate-500">
                          Giữ chuột để kéo sơ đồ. Lăn chuột để zoom.
                        </p>
                        <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
                          <button
                            type="button"
                            onClick={() => applyTreeZoom(treeScale - 0.08)}
                            className="h-7 w-7 rounded text-sm font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            −
                          </button>
                          <button
                            type="button"
                            onClick={fitTreeToNodes}
                            className="h-7 rounded px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            {Math.round(treeScale * 100)}%
                          </button>
                          <button
                            type="button"
                            onClick={() => applyTreeZoom(treeScale + 0.08)}
                            className="h-7 w-7 rounded text-sm font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div
                        ref={treeCanvasRef}
                        onPointerDown={handleTreePointerDown}
                        onPointerMove={handleTreePointerMove}
                        onPointerUp={handleTreePointerUp}
                        onPointerCancel={handleTreePointerUp}
                        onWheel={handleTreeWheel}
                        className={`relative h-[700px] overflow-hidden rounded-xl border border-slate-100 bg-slate-50/60 select-none ${
                          isTreePanning || draggingTreeId ? "cursor-grabbing" : "cursor-grab"
                        }`}
                        style={{ touchAction: "none" }}
                      >
                        {treeNodes.length === 0 ? (
                          <div className="grid h-full place-items-center text-sm text-slate-500">
                            Không có phòng ban phù hợp.
                          </div>
                        ) : (
                          <div
                            className="absolute left-0 top-0"
                            style={{
                              width: TREE_WORLD_WIDTH,
                              height: TREE_WORLD_HEIGHT,
                              transform: `translate(${treePan.x}px, ${treePan.y}px) scale(${treeScale})`,
                              transformOrigin: "0 0",
                            }}
                          >
                            <svg
                              className="pointer-events-none absolute inset-0"
                              style={{ width: TREE_WORLD_WIDTH, height: TREE_WORLD_HEIGHT }}
                            >
                              {layout.edges.map((edge) => {
                                const fromNode = treeNodeMap[edge.from];
                                const toNode = treeNodeMap[edge.to];
                                if (!fromNode || !toNode) {
                                  return null;
                                }

                                const startX = fromNode.x + TREE_CARD_WIDTH / 2;
                                const startY = fromNode.y + TREE_CARD_HEIGHT;
                                const endX = toNode.x + TREE_CARD_WIDTH / 2;
                                const endY = toNode.y;
                                const midY = startY + (endY - startY) * 0.55;

                                return (
                                  <path
                                    key={`${edge.from}-${edge.to}`}
                                    d={`M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`}
                                    stroke="#a8bedf"
                                    strokeWidth="2.4"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    fill="none"
                                  />
                                );
                              })}
                            </svg>

                            {treeNodes.map((node) => {
                              const item = visibleDepartmentById[node.id];
                              if (!item) {
                                return null;
                              }

                              return (
                                <div
                                  key={node.id}
                                  className="absolute"
                                  style={{ left: node.x, top: node.y, width: TREE_CARD_WIDTH }}
                                >
                                  <TreeCard
                                    item={item}
                                    active={selectedDepartment?.id === item.id}
                                    onSelect={(dept) => updateQuery({ dept })}
                                    onPointerDown={(event) => handleTreeCardPointerDown(event, item.id)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white">
                      <div className="border-b border-slate-100 px-5 py-4">
                        <h2 className="text-3xl font-semibold tracking-[-0.02em] text-slate-900">Cơ cấu tổ chức</h2>
                        <p className="mt-1 text-sm text-slate-500">
                          Quản lý và theo dõi cấu trúc phòng ban cùng nguồn lực nhân sự.
                        </p>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[980px] text-left">
                          <thead>
                            <tr className="text-xs tracking-[0.08em] text-slate-400 uppercase">
                              <th className="px-5 py-3 font-semibold">Phòng ban</th>
                              <th className="px-5 py-3 font-semibold">Phòng ban cha</th>
                              <th className="px-5 py-3 font-semibold">Trưởng phòng</th>
                              <th className="px-5 py-3 font-semibold">Thành viên</th>
                              <th className="px-5 py-3 font-semibold">Ngày tạo</th>
                              <th className="px-5 py-3 font-semibold text-right">Hành động</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleDepartments.map((item) => (
                              <tr
                                key={item.id}
                                className={`cursor-pointer border-t border-slate-100 transition hover:bg-slate-50 ${
                                  selectedDepartment?.id === item.id ? "bg-blue-50/50" : ""
                                }`}
                                onClick={() => updateQuery({ dept: item.id })}
                              >
                                <td className="px-5 py-4">
                                  <p className="text-lg font-semibold text-slate-800">{item.name}</p>
                                </td>
                                <td className="px-5 py-4 text-base text-slate-600">{item.parent}</td>
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-2">
                                    <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                                      {toInitials(item.head)}
                                    </span>
                                    <span className="text-base font-medium text-slate-700">{item.head}</span>
                                  </div>
                                </td>
                                <td className="px-5 py-4 text-base font-semibold text-slate-700">{item.members}</td>
                                <td className="px-5 py-4 text-base text-slate-600">{item.createdAt}</td>
                                <td className="px-5 py-4 text-right text-lg text-slate-400">⋯</td>
                              </tr>
                            ))}

                            {visibleDepartments.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">
                                  Không có phòng ban phù hợp.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex items-center justify-between px-5 py-4 text-sm text-slate-500">
                        <p>Hiển thị {visibleDepartments.length} phòng ban</p>
                        <div className="flex items-center gap-2">
                          <button type="button" className="rounded-xl border border-slate-200 px-3 py-1.5 text-slate-500">
                            Trước
                          </button>
                          <button type="button" className="rounded-xl border border-slate-200 px-3 py-1.5 text-slate-500">
                            Sau
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                <DepartmentPanel item={selectedDepartment} />
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}

export default function DepartmentsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
          <div className="flex min-h-screen w-full">
            <WorkspaceSidebar active="departments" />
            <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[280px]">
              <main className="px-4 py-6 lg:px-7">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">
                  Đang tải sơ đồ phòng ban...
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
