"use client";

import { useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";

type DepartmentMode = "tree" | "list";

type DepartmentMember = {
  name: string;
  role: string;
  avatar: string;
  tone: string;
};

type DepartmentItem = {
  id: string;
  tag: string;
  name: string;
  parent: string;
  head: string;
  headRole: string;
  members: number;
  subDepartments: number;
  createdAt: string;
  description: string;
};

type TreeNode = {
  id: string;
  x: number;
  y: number;
};

const departments: DepartmentItem[] = [
  {
    id: "board",
    tag: "Điều hành",
    name: "Ban giám đốc",
    parent: "—",
    head: "Jonathan Wick",
    headRole: "Giám đốc điều hành",
    members: 12,
    subDepartments: 2,
    createdAt: "10/01/2023",
    description: "Định hướng chiến lược, ngân sách và mục tiêu phát triển toàn công ty.",
  },
  {
    id: "engineering",
    tag: "Kỹ thuật",
    name: "Khối kỹ thuật sản phẩm",
    parent: "Ban giám đốc",
    head: "Sarah Chen",
    headRole: "VP Engineering",
    members: 42,
    subDepartments: 3,
    createdAt: "12/10/2023",
    description: "Phát triển nền tảng, sản phẩm cốt lõi và vận hành hạ tầng kỹ thuật.",
  },
  {
    id: "growth",
    tag: "Tăng trưởng",
    name: "Marketing & Sales",
    parent: "Ban giám đốc",
    head: "David Miller",
    headRole: "CMO",
    members: 28,
    subDepartments: 2,
    createdAt: "20/01/2024",
    description: "Xây dựng thương hiệu, tạo nhu cầu và mở rộng doanh thu cho sản phẩm.",
  },
  {
    id: "product",
    tag: "Sản phẩm",
    name: "Product Team",
    parent: "Khối kỹ thuật sản phẩm",
    head: "Marcus Thorne",
    headRole: "Frontend Lead",
    members: 18,
    subDepartments: 1,
    createdAt: "05/11/2023",
    description: "Quản lý roadmap, trải nghiệm người dùng và chiến lược tính năng.",
  },
  {
    id: "backend",
    tag: "Nền tảng",
    name: "Backend Team",
    parent: "Khối kỹ thuật sản phẩm",
    head: "Elena Kovac",
    headRole: "Backend Architect",
    members: 24,
    subDepartments: 1,
    createdAt: "14/02/2024",
    description: "Xây dựng dịch vụ lõi, API, dữ liệu và đảm bảo hiệu năng hệ thống.",
  },
  {
    id: "design",
    tag: "Thiết kế",
    name: "Design Team",
    parent: "Product Team",
    head: "Arjun Mehta",
    headRole: "Product Designer",
    members: 9,
    subDepartments: 0,
    createdAt: "14/02/2024",
    description: "Thiết kế trải nghiệm, UI system và định hướng nhận diện sản phẩm.",
  },
];

const TREE_CARD_WIDTH = 320;
const TREE_CARD_HEIGHT = 212;
const TREE_INITIAL_SCALE = 0.86;
const TREE_MIN_SCALE = 0.6;
const TREE_MAX_SCALE = 1.4;
const TREE_WORLD_WIDTH = 1220;
const TREE_WORLD_HEIGHT = 820;

const initialTreeNodes: TreeNode[] = [
  { id: "board", x: 450, y: 20 },
  { id: "engineering", x: 170, y: 300 },
  { id: "growth", x: 730, y: 300 },
  { id: "product", x: 170, y: 568 },
  { id: "backend", x: 500, y: 568 },
  { id: "design", x: 830, y: 568 },
];

const treeEdges = [
  { from: "board", to: "engineering" },
  { from: "board", to: "growth" },
  { from: "engineering", to: "product" },
  { from: "engineering", to: "backend" },
  { from: "engineering", to: "design" },
];

const departmentMembers: Record<string, DepartmentMember[]> = {
  board: [
    { name: "Jonathan Wick", role: "CEO", avatar: "JW", tone: "bg-cyan-100 text-cyan-700" },
    { name: "Nora Lin", role: "CFO", avatar: "NL", tone: "bg-indigo-100 text-indigo-700" },
    { name: "Hiro Tan", role: "COO", avatar: "HT", tone: "bg-amber-100 text-amber-700" },
  ],
  engineering: [
    { name: "Marcus Thorne", role: "Frontend Lead", avatar: "MT", tone: "bg-rose-100 text-rose-700" },
    { name: "Elena Kovac", role: "Backend Architect", avatar: "EK", tone: "bg-emerald-100 text-emerald-700" },
    { name: "Arjun Mehta", role: "Fullstack Developer", avatar: "AM", tone: "bg-orange-100 text-orange-700" },
    { name: "Lisa Thompson", role: "DevOps Engineer", avatar: "LT", tone: "bg-purple-100 text-purple-700" },
    { name: "Wei Zhang", role: "Data Engineer", avatar: "WZ", tone: "bg-blue-100 text-blue-700" },
  ],
  growth: [
    { name: "David Miller", role: "CMO", avatar: "DM", tone: "bg-amber-100 text-amber-700" },
    { name: "Luna Ross", role: "Brand Manager", avatar: "LR", tone: "bg-rose-100 text-rose-700" },
    { name: "Milo Vega", role: "Performance Lead", avatar: "MV", tone: "bg-cyan-100 text-cyan-700" },
  ],
  product: [
    { name: "Marcus Thorne", role: "Product Lead", avatar: "MT", tone: "bg-rose-100 text-rose-700" },
    { name: "Anna Lee", role: "Product Owner", avatar: "AL", tone: "bg-indigo-100 text-indigo-700" },
  ],
  backend: [
    { name: "Elena Kovac", role: "Backend Architect", avatar: "EK", tone: "bg-emerald-100 text-emerald-700" },
    { name: "Nam Phan", role: "API Engineer", avatar: "NP", tone: "bg-blue-100 text-blue-700" },
  ],
  design: [
    { name: "Arjun Mehta", role: "Product Designer", avatar: "AM", tone: "bg-orange-100 text-orange-700" },
    { name: "Mia Tran", role: "UI Designer", avatar: "MT", tone: "bg-pink-100 text-pink-700" },
  ],
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
      className={`w-[320px] rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
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
      <div className="mt-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
          {item.head
            .split(" ")
            .slice(0, 2)
            .map((word) => word[0])
            .join("")}
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-700">{item.head}</p>
          <p className="text-xs text-slate-500">{item.headRole}</p>
        </div>
      </div>
    </button>
  );
}

function DepartmentPanel({ item }: { item: DepartmentItem }) {
  const members = departmentMembers[item.id] ?? [];

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
            {item.head
              .split(" ")
              .slice(0, 2)
              .map((word) => word[0])
              .join("")}
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

        <div className="space-y-3">
          {members.map((member) => (
            <div key={member.name} className="flex items-center gap-2">
              <span className={`grid h-9 w-9 place-items-center rounded-full text-xs font-semibold ${member.tone}`}>
                {member.avatar}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-700">{member.name}</p>
                <p className="text-xs text-slate-500">{member.role}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="mt-4 w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
        >
          Xem toàn bộ thành viên
        </button>
      </div>
    </aside>
  );
}

export default function DepartmentsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const mode: DepartmentMode = searchParams.get("mode") === "list" ? "list" : "tree";
  const selectedId = searchParams.get("dept") ?? "engineering";
  const selectedDepartment = departments.find((item) => item.id === selectedId) ?? departments[1];

  const updateQuery = (next: { mode?: DepartmentMode; dept?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next.mode) {
      params.set("mode", next.mode);
    }
    if (next.dept) {
      params.set("dept", next.dept);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const listRows = departments.filter((item) => ["engineering", "product", "growth", "design"].includes(item.id));
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>(initialTreeNodes);
  const [draggingTreeId, setDraggingTreeId] = useState<string | null>(null);
  const [treeScale, setTreeScale] = useState(TREE_INITIAL_SCALE);
  const [treePan, setTreePan] = useState({ x: -20, y: -14 });
  const [isTreePanning, setIsTreePanning] = useState(false);
  const treeCanvasRef = useRef<HTMLDivElement | null>(null);
  const treeDragOffsetRef = useRef({ x: 0, y: 0 });
  const treePanStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const treeNodeMap = useMemo(
    () =>
      treeNodes.reduce<Record<string, TreeNode>>((acc, node) => {
        acc[node.id] = node;
        return acc;
      }, {}),
    [treeNodes],
  );

  const clampScale = (nextScale: number) =>
    Math.min(TREE_MAX_SCALE, Math.max(TREE_MIN_SCALE, nextScale));

  const clampPanToViewport = (
    nextPan: { x: number; y: number },
    scale: number,
    rect?: DOMRect,
  ) => {
    const viewportRect = rect ?? treeCanvasRef.current?.getBoundingClientRect();
    if (!viewportRect) {
      return nextPan;
    }
    const minX = Math.min(0, viewportRect.width - TREE_WORLD_WIDTH * scale);
    const minY = Math.min(0, viewportRect.height - TREE_WORLD_HEIGHT * scale);
    return {
      x: Math.min(0, Math.max(minX, nextPan.x)),
      y: Math.min(0, Math.max(minY, nextPan.y)),
    };
  };

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

    if (!event.ctrlKey && !event.metaKey) {
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

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="departments" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[280px]">
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
                  placeholder="Tìm phòng ban..."
                  className="h-11 w-[280px] rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
                />
                <button
                  type="button"
                  className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  + Tạo phòng ban
                </button>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-7">
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <section className="min-w-0">
                {mode === "tree" ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm text-slate-500">
                        Giữ chuột để kéo sơ đồ. Dùng Ctrl/Cmd + lăn chuột để zoom.
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
                          onClick={() => applyTreeZoom(1)}
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
                          {treeEdges.map((edge) => {
                            const fromNode = treeNodeMap[edge.from];
                            const toNode = treeNodeMap[edge.to];
                            if (!fromNode || !toNode) {
                              return null;
                            }

                            const startX = fromNode.x + TREE_CARD_WIDTH / 2;
                            const startY = fromNode.y + TREE_CARD_HEIGHT - 1;
                            const endX = toNode.x + TREE_CARD_WIDTH / 2;
                            const endY = toNode.y + 1;
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
                          const item = departments.find((department) => department.id === node.id);
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
                                active={selectedDepartment.id === item.id}
                                onSelect={(dept) => updateQuery({ dept })}
                                onPointerDown={(event) => handleTreeCardPointerDown(event, item.id)}
                              />
                            </div>
                          );
                        })}
                      </div>
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
                          {listRows.map((item) => (
                            <tr
                              key={item.id}
                              className={`cursor-pointer border-t border-slate-100 transition hover:bg-slate-50 ${
                                selectedDepartment.id === item.id ? "bg-blue-50/50" : ""
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
                                    {item.head
                                      .split(" ")
                                      .slice(0, 2)
                                      .map((word) => word[0])
                                      .join("")}
                                  </span>
                                  <span className="text-base font-medium text-slate-700">{item.head}</span>
                                </div>
                              </td>
                              <td className="px-5 py-4 text-base font-semibold text-slate-700">{item.members}</td>
                              <td className="px-5 py-4 text-base text-slate-600">{item.createdAt}</td>
                              <td className="px-5 py-4 text-right text-lg text-slate-400">⋯</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between px-5 py-4 text-sm text-slate-500">
                      <p>Hiển thị {listRows.length} phòng ban</p>
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
          </main>
        </div>
      </div>
    </div>
  );
}
