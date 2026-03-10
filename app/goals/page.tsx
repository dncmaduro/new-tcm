"use client";

import Link from "next/link";
import {
  PointerEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Mode = "canvas" | "list";

type GoalNode = {
  id: string;
  nhom: string;
  tieuDe: string;
  phongBan: string;
  quy: string;
  owner: string;
  vaiTro: string;
  moTa: string;
  progress: number;
  x: number;
  y: number;
  mau: "blue" | "indigo" | "emerald" | "orange";
};

const CARD_WIDTH = 320;
const CARD_HEIGHT = 158;
const WORLD_WIDTH = 2200;
const WORLD_HEIGHT = 1400;

const menuItems = [
  { label: "Bảng điều khiển", href: "/dashboard", active: false },
  { label: "Mục tiêu", href: "/goals", active: true },
  { label: "Công việc", href: "#", active: false },
  { label: "Chấm công", href: "#", active: false },
  { label: "Báo cáo", href: "#", active: false },
  { label: "Nhóm", href: "#", active: false },
];

const initialNodes: GoalNode[] = [
  {
    id: "goal-company",
    nhom: "Công ty",
    tieuDe: "Tăng thị phần thêm 15% tại thị trường EU",
    phongBan: "Khối doanh nghiệp",
    quy: "Q4 2023",
    owner: "Elena Rodriguez",
    vaiTro: "Trưởng chiến lược",
    moTa:
      "Mục tiêu tăng trưởng trọng điểm cho năm tài chính, tập trung mở rộng DACH và Bắc Âu thông qua hợp tác chiến lược.",
    progress: 65,
    x: 460,
    y: 120,
    mau: "blue",
  },
  {
    id: "goal-product",
    nhom: "Sản phẩm",
    tieuDe: "Ra mắt bản địa hóa ứng dụng cho 5 ngôn ngữ EU",
    phongBan: "Sản phẩm",
    quy: "Q4 2023",
    owner: "Anna Mueller",
    vaiTro: "Quản lý sản phẩm",
    moTa: "Tập trung nâng trải nghiệm ngôn ngữ và tối ưu funnel chuyển đổi tại từng thị trường.",
    progress: 42,
    x: 230,
    y: 430,
    mau: "indigo",
  },
  {
    id: "goal-sales",
    nhom: "Kinh doanh",
    tieuDe: "Thiết lập 3 đối tác phân phối chiến lược tại EU",
    phongBan: "Kinh doanh",
    quy: "Q4 2023",
    owner: "Marcus Chen",
    vaiTro: "Giám đốc kinh doanh khu vực",
    moTa: "Mở rộng mạng lưới đối tác cấp vùng để tăng tốc doanh thu và độ phủ bán hàng.",
    progress: 58,
    x: 600,
    y: 430,
    mau: "emerald",
  },
  {
    id: "goal-marketing",
    nhom: "Marketing",
    tieuDe: "Tăng 25% lượng lead chất lượng từ chiến dịch nội dung",
    phongBan: "Marketing",
    quy: "Q4 2023",
    owner: "Sarah Jenkins",
    vaiTro: "Trưởng marketing tăng trưởng",
    moTa: "Tập trung nội dung theo nhóm ngành để cải thiện CAC và tỉ lệ chuyển đổi MQL -> SQL.",
    progress: 36,
    x: 960,
    y: 430,
    mau: "orange",
  },
];

const taskRows = [
  {
    tieuDe: "Rà soát pháp lý dữ liệu thị trường EU",
    trangThai: "Đang xử lý",
    nguoiPhuTrach: "Sarah Jenkins",
    tienDo: 58,
  },
  {
    tieuDe: "Dịch toàn bộ chuỗi giao diện sang DE/FR",
    trangThai: "Tồn đọng",
    nguoiPhuTrach: "Marcus Chen",
    tienDo: 22,
  },
  {
    tieuDe: "Ký MOU với 2 đối tác DACH",
    trangThai: "Hoàn thành",
    nguoiPhuTrach: "Elena Rodriguez",
    tienDo: 100,
  },
];

const connections = [
  { from: "goal-company", to: "goal-product" },
  { from: "goal-company", to: "goal-sales" },
  { from: "goal-company", to: "goal-marketing" },
];

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

function SidebarBadge() {
  return (
    <div className="grid h-8 w-8 place-items-center rounded-xl bg-blue-500">
      <div className="h-3 w-3 rounded-sm border-2 border-white" />
    </div>
  );
}

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

  const [nodes, setNodes] = useState<GoalNode[]>(initialNodes);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [viewportOffset, setViewportOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ pointerX: 0, pointerY: 0, originX: 0, originY: 0 });

  const mode: Mode = searchParams.get("mode") === "list" ? "list" : "canvas";

  const validGoalIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const selectedIdParam = searchParams.get("goal");
  const selectedId =
    selectedIdParam && validGoalIds.has(selectedIdParam)
      ? selectedIdParam
      : initialNodes[0].id;
  const isDetailOpen = searchParams.get("detail") !== "closed";

  const selectedGoal = useMemo(
    () => nodes.find((node) => node.id === selectedId) ?? nodes[0],
    [nodes, selectedId],
  );

  const nodeMap = useMemo(
    () =>
      nodes.reduce<Record<string, GoalNode>>((acc, node) => {
        acc[node.id] = node;
        return acc;
      }, {}),
    [nodes],
  );

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
    nextParams.set("goal", nextGoalId ?? selectedId);

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
    event.currentTarget.setPointerCapture(event.pointerId);
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
        event.clientX - rect.left - dragOffsetRef.current.x - viewportOffset.x;
      const nextY =
        event.clientY - rect.top - dragOffsetRef.current.y - viewportOffset.y;

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

    const minX = Math.min(0, rect.width - WORLD_WIDTH);
    const minY = Math.min(0, rect.height - WORLD_HEIGHT);
    const clampedViewportX = Math.min(0, Math.max(minX, tentativeX));
    const clampedViewportY = Math.min(0, Math.max(minY, tentativeY));

    setViewportOffset({ x: clampedViewportX, y: clampedViewportY });
  };

  const onPointerUpCanvas = () => {
    if (draggingId) {
      setDraggingId(null);
    }

    if (isPanning) {
      setIsPanning(false);
    }
  };

  const handleSelectGoal = (goalId: string) => {
    updateUrlState({ nextGoalId: goalId, nextDetailOpen: true });
  };

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[280px] flex-col overflow-y-auto bg-[#081633] px-5 pb-5 pt-6 text-slate-100 lg:flex">
          <div className="mb-10 flex items-center gap-3">
            <SidebarBadge />
            <p className="text-2xl font-semibold tracking-[-0.02em]">TCM</p>
          </div>

          <nav className="space-y-2">
            {menuItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-lg font-medium tracking-[-0.01em] transition ${
                  item.active
                    ? "bg-[#1e62d8] text-white"
                    : "text-slate-300 hover:bg-[#0b1e43] hover:text-white"
                }`}
              >
                <span className="grid h-5 w-5 place-items-center rounded-md border border-current/45 text-[11px]">
                  {item.label[0]}
                </span>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto space-y-4">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-lg text-slate-300 transition hover:bg-[#0b1e43] hover:text-white"
            >
              <span className="grid h-5 w-5 place-items-center rounded-md border border-current/45 text-[11px]">
                S
              </span>
              Cài đặt
            </button>
            <div className="rounded-xl bg-[#0d234f] p-3">
              <p className="text-base font-semibold">Alex Thompson</p>
              <p className="text-sm text-slate-400">Quản trị viên</p>
            </div>
          </div>
        </aside>

        <div className="flex h-screen w-full flex-1 flex-col overflow-hidden lg:pl-[280px]">
          <main
            className={`grid h-screen w-full ${
              isDetailOpen ? "xl:grid-cols-[minmax(0,1fr)_390px]" : "xl:grid-cols-1"
            }`}
          >
            <section className="flex min-h-0 flex-col border-r border-slate-200">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#f3f5fa] px-4 py-4 lg:px-7">
                <div className="text-sm text-slate-500">
                  Chiến lược doanh nghiệp <span className="px-2">›</span>
                  <span className="font-semibold text-slate-700">Kế hoạch tăng trưởng Q4</span>
                </div>
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
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {mode === "canvas" ? (
                  <div className="space-y-4 p-4 lg:p-7">
                  <div
                    ref={canvasRef}
                    onPointerDown={onPointerDownCanvas}
                    onPointerMove={onPointerMoveCanvas}
                    onPointerUp={onPointerUpCanvas}
                    onPointerCancel={onPointerUpCanvas}
                    className={`relative h-[700px] overflow-hidden rounded-2xl border border-slate-200 bg-[#fbfcff] ${
                      isPanning ? "cursor-grabbing" : "cursor-grab"
                    }`}
                  >
                    <div
                      className="absolute left-0 top-0"
                      style={{
                        width: WORLD_WIDTH,
                        height: WORLD_HEIGHT,
                        transform: `translate(${viewportOffset.x}px, ${viewportOffset.y}px)`,
                        backgroundImage:
                          "radial-gradient(#dbe4f3 1.1px, transparent 1.1px)",
                        backgroundSize: "36px 36px",
                      }}
                    >
                    <svg
                      className="pointer-events-none absolute inset-0"
                      style={{ width: WORLD_WIDTH, height: WORLD_HEIGHT }}
                    >
                      {connections.map((edge) => {
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
                            className={`rounded-lg px-3 py-1 text-[11px] font-bold tracking-[0.07em] uppercase ${badgeMap[goal.mau]}`}
                          >
                            {goal.nhom}
                          </span>
                          <span
                            className={`inline-flex h-3 w-3 rounded-full ${colorMap[goal.mau]}`}
                          />
                        </div>
                        <p className="line-clamp-2 text-2xl font-semibold leading-tight tracking-[-0.02em] text-slate-900">
                          {goal.tieuDe}
                        </p>
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
                    <div className="border-b border-slate-100 px-5 py-4">
                      <h2 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">
                        Danh sách mục tiêu
                      </h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-left">
                        <thead>
                          <tr className="text-[11px] tracking-[0.08em] text-slate-400 uppercase">
                            <th className="px-5 py-3 font-semibold">Mục tiêu</th>
                            <th className="px-5 py-3 font-semibold">Phòng ban</th>
                            <th className="px-5 py-3 font-semibold">Quý</th>
                            <th className="px-5 py-3 font-semibold">Chủ sở hữu</th>
                            <th className="px-5 py-3 font-semibold">Tiến độ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {nodes.map((goal) => (
                            <tr
                              key={goal.id}
                              className={`cursor-pointer border-t border-slate-100 transition ${
                                selectedId === goal.id ? "bg-blue-50/40" : "hover:bg-slate-50"
                              }`}
                              onClick={() => handleSelectGoal(goal.id)}
                            >
                              <td className="px-5 py-4 text-sm font-semibold text-slate-700">{goal.tieuDe}</td>
                              <td className="px-5 py-4 text-sm text-slate-600">{goal.phongBan}</td>
                              <td className="px-5 py-4 text-sm text-slate-600">{goal.quy}</td>
                              <td className="px-5 py-4 text-sm text-slate-600">{goal.owner}</td>
                              <td className="px-5 py-4">
                                <div className="w-40 space-y-1">
                                  <ProgressBar value={goal.progress} />
                                  <p className="text-right text-xs font-semibold text-slate-500">
                                    {goal.progress}%
                                  </p>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                  </div>
                )}
              </div>
            </section>

            {isDetailOpen ? (
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
                  <p className="text-sm text-slate-400">Chủ sở hữu</p>
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
                      Phân rã công việc
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-200">
                    {taskRows.map((task) => (
                      <div key={task.tieuDe} className="space-y-2 px-4 py-3">
                        <p className="text-sm font-medium text-slate-800">{task.tieuDe}</p>
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
                    ))}
                  </div>
                </div>

                <div className="space-y-3 border-t border-slate-200 pt-5">
                  <Link
                    href={`/goals/${selectedGoal.id}`}
                    className="flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 text-base font-semibold text-white"
                  >
                    Mở trang chi tiết
                  </Link>
                  <button
                    type="button"
                    className="h-11 w-full rounded-xl bg-[#081633] text-base font-semibold text-white"
                  >
                    ✎ Chỉnh sửa chiến lược
                  </button>
                  <button
                    type="button"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white text-base font-semibold text-slate-700"
                  >
                    Xem nhật ký kiểm tra
                  </button>
                </div>
              </div>
              </aside>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
