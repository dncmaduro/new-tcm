"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";

type TaskMode = "list" | "kanban" | "gantt";
type TaskStatus = "todo" | "inprogress" | "review" | "done";

type TaskItem = {
  id: string;
  name: string;
  goalTags: string[];
  assignee: string;
  assigneeShort: string;
  status: TaskStatus;
  progress: number;
  priority: "thap" | "trungbinh" | "cao";
  dueDate: string;
  gantt?: {
    start: number;
    duration: number;
    color: "blue" | "green" | "amber";
    label: string;
  };
};

const tasks: TaskItem[] = [
  {
    id: "task-auth-flow",
    name: "Triển khai luồng xác thực",
    goalTags: ["Sản phẩm", "Ra mắt Q4"],
    assignee: "Alex Rivera",
    assigneeShort: "AR",
    status: "inprogress",
    progress: 65,
    priority: "cao",
    dueDate: "24/10/2023",
    gantt: { start: 1, duration: 14, color: "blue", label: "75%" },
  },
  {
    id: "task-db-opt",
    name: "Tối ưu cơ sở dữ liệu",
    goalTags: ["Hạ tầng", "Nâng cấp"],
    assignee: "Sarah Chen",
    assigneeShort: "SC",
    status: "todo",
    progress: 0,
    priority: "trungbinh",
    dueDate: "28/10/2023",
    gantt: { start: 8, duration: 10, color: "blue", label: "40%" },
  },
  {
    id: "task-api-phase1",
    name: "Tích hợp API giai đoạn 1",
    goalTags: ["Nền tảng", "API lõi"],
    assignee: "James Wilson",
    assigneeShort: "JW",
    status: "done",
    progress: 100,
    priority: "thap",
    dueDate: "15/10/2023",
    gantt: { start: 29, duration: 11, color: "green", label: "Phát triển API" },
  },
  {
    id: "task-feedback-review",
    name: "Rà soát phản hồi khách hàng",
    goalTags: ["Khách hàng", "Trải nghiệm"],
    assignee: "Maya Patel",
    assigneeShort: "MP",
    status: "review",
    progress: 90,
    priority: "cao",
    dueDate: "22/10/2023",
    gantt: { start: 40, duration: 9, color: "amber", label: "Kiểm thử QA" },
  },
  {
    id: "task-beta-launch",
    name: "Chuẩn bị ra mắt Beta",
    goalTags: ["Tăng trưởng", "Phát hành"],
    assignee: "Luna Ross",
    assigneeShort: "LR",
    status: "inprogress",
    progress: 48,
    priority: "trungbinh",
    dueDate: "02/11/2023",
  },
  {
    id: "task-market-analysis",
    name: "Báo cáo phân tích thị trường",
    goalTags: ["Thị trường", "Phân tích"],
    assignee: "Milo Vega",
    assigneeShort: "MV",
    status: "todo",
    progress: 12,
    priority: "thap",
    dueDate: "10/11/2023",
  },
];

const DAY_WIDTH = 54;
const TIMELINE_TOTAL_DAYS = 49;
const TODAY_INDEX = 14;
const timelineStart = new Date(Date.UTC(2023, 9, 1));

const timelineDays = Array.from({ length: TIMELINE_TOTAL_DAYS }, (_, index) => {
  const date = new Date(timelineStart);
  date.setUTCDate(timelineStart.getUTCDate() + index);

  const month = `T${date.getUTCMonth() + 1}`;
  const day = date.getUTCDate();
  const isMonthStart = day === 1 || index === 0;

  return {
    index,
    month,
    day,
    isMonthStart,
  };
});

function StatusBadge({ status }: { status: TaskStatus }) {
  if (status === "inprogress") {
    return (
      <span className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
        Đang làm
      </span>
    );
  }
  if (status === "review") {
    return (
      <span className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
        Đánh giá
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
        Hoàn thành
      </span>
    );
  }
  return (
    <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
      Cần làm
    </span>
  );
}

function ProgressBar({ value, color }: { value: number; color?: "blue" | "green" }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full ${color === "green" ? "bg-emerald-500" : "bg-blue-600"}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function PriorityBars({ level }: { level: TaskItem["priority"] }) {
  const colors =
    level === "cao"
      ? ["bg-rose-500", "bg-rose-500", "bg-rose-500"]
      : level === "trungbinh"
        ? ["bg-amber-500", "bg-amber-500", "bg-slate-200"]
        : ["bg-slate-300", "bg-slate-200", "bg-slate-200"];

  return (
    <span className="inline-flex items-end gap-1">
      <span className={`h-2 w-1 rounded ${colors[0]}`} />
      <span className={`h-3 w-1 rounded ${colors[1]}`} />
      <span className={`h-4 w-1 rounded ${colors[2]}`} />
    </span>
  );
}

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
        active ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

export default function TasksPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const mode: TaskMode =
    searchParams.get("mode") === "kanban"
      ? "kanban"
      : searchParams.get("mode") === "gantt"
        ? "gantt"
        : "list";

  const changeMode = (nextMode: TaskMode) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", nextMode);
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const todo = tasks.filter((task) => task.status === "todo");
  const inprogress = tasks.filter((task) => task.status === "inprogress");
  const review = tasks.filter((task) => task.status === "review");
  const done = tasks.filter((task) => task.status === "done");

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="tasks" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[280px]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">
                  Không gian làm việc <span className="px-2">›</span> Công việc
                </p>
                <h1 className="text-5xl font-semibold tracking-[-0.03em] text-slate-900">Công việc</h1>
              </div>
              <div className="flex items-center gap-3">
                <input
                  placeholder="Tìm kiếm công việc..."
                  className="h-11 w-[280px] rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
                />
                <button
                  type="button"
                  className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  + Tạo việc mới
                </button>
              </div>
            </div>
          </header>

          <main className="space-y-4 px-4 py-5 lg:px-7">
            <section className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-base font-medium text-slate-700 hover:bg-slate-50"
                >
                  ☰ Lọc
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-base font-medium text-slate-700 hover:bg-slate-50"
                >
                  ⇅ Sắp xếp
                </button>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-100 p-1">
                <ModeButton active={mode === "list"} onClick={() => changeMode("list")}>
                  Danh sách
                </ModeButton>
                <ModeButton active={mode === "kanban"} onClick={() => changeMode("kanban")}>
                  Bảng
                </ModeButton>
                <ModeButton active={mode === "gantt"} onClick={() => changeMode("gantt")}>
                  Biểu đồ Gantt
                </ModeButton>
              </div>
            </section>

            {mode === "list" ? (
              <section className="rounded-2xl border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left">
                    <thead>
                      <tr className="text-sm tracking-[0.08em] text-slate-400 uppercase">
                        <th className="px-6 py-4 font-semibold">Tên công việc</th>
                        <th className="px-4 py-4 font-semibold">Mục tiêu</th>
                        <th className="px-4 py-4 font-semibold">Người phụ trách</th>
                        <th className="px-4 py-4 font-semibold">Trạng thái</th>
                        <th className="px-4 py-4 font-semibold">Tiến độ</th>
                        <th className="px-4 py-4 font-semibold">Ưu tiên</th>
                        <th className="px-4 py-4 font-semibold">Hạn chót</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.slice(0, 4).map((task) => (
                        <tr key={task.id} className="border-t border-slate-100">
                          <td className="px-6 py-5">
                            <Link
                              href={`/tasks/${task.id}`}
                              className="text-xl font-medium leading-tight text-slate-800 hover:text-blue-700"
                            >
                              {task.name}
                            </Link>
                          </td>
                          <td className="px-4 py-5">
                            <div className="space-y-1">
                              {task.goalTags.map((tag) => (
                                <span
                                  key={tag}
                                  className="mr-1 inline-block rounded-lg bg-slate-100 px-2 py-1 text-sm text-slate-600"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-5">
                            <div className="flex items-center gap-2">
                              <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                                {task.assigneeShort}
                              </span>
                              <span className="text-lg text-slate-700">{task.assignee}</span>
                            </div>
                          </td>
                          <td className="px-4 py-5">
                            <StatusBadge status={task.status} />
                          </td>
                          <td className="px-4 py-5">
                            <div className="w-40 space-y-1">
                              <ProgressBar value={task.progress} color={task.status === "done" ? "green" : "blue"} />
                              <p className="text-right text-sm font-semibold text-slate-500">{task.progress}%</p>
                            </div>
                          </td>
                          <td className="px-4 py-5">
                            <PriorityBars level={task.priority} />
                          </td>
                          <td className="px-4 py-5 text-base text-slate-500">{task.dueDate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between px-6 py-4">
                  <p className="text-base text-slate-500">Hiển thị 1-4 trên 24 công việc</p>
                  <div className="flex items-center gap-2">
                    <button type="button" className="h-10 w-10 rounded-xl border border-slate-200 text-slate-500">
                      ‹
                    </button>
                    <button type="button" className="h-10 w-10 rounded-xl bg-blue-600 text-white">
                      1
                    </button>
                    <button type="button" className="h-10 w-10 rounded-xl border border-slate-200 text-slate-600">
                      2
                    </button>
                    <button type="button" className="h-10 w-10 rounded-xl border border-slate-200 text-slate-600">
                      3
                    </button>
                    <button type="button" className="h-10 w-10 rounded-xl border border-slate-200 text-slate-500">
                      ›
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {mode === "kanban" ? (
              <section className="grid gap-4 xl:grid-cols-4">
                {[
                  { key: "todo", title: "Cần làm", items: todo },
                  { key: "inprogress", title: "Đang làm", items: inprogress },
                  { key: "review", title: "Đánh giá", items: review },
                  { key: "done", title: "Hoàn thành", items: done },
                ].map((column) => (
                  <article key={column.key} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-xl font-semibold text-slate-800">{column.title}</h2>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                        {column.items.length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {column.items.map((task) => (
                        <div key={task.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <Link
                            href={`/tasks/${task.id}`}
                            className="text-xl font-semibold leading-tight text-slate-800 hover:text-blue-700"
                          >
                            {task.name}
                          </Link>
                          <p className="mt-1 text-sm text-slate-500">{task.goalTags.join(" · ")}</p>
                          <div className="mt-3">
                            <ProgressBar value={task.progress} color={task.status === "done" ? "green" : "blue"} />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
                            <span>{task.progress}%</span>
                            <span>{task.assignee}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </section>
            ) : null}

            {mode === "gantt" ? (
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="grid grid-cols-[300px_minmax(0,1fr)]">
                  <div className="border-r border-slate-200 bg-white">
                    <div className="h-14 border-b border-slate-200 px-4 text-sm font-semibold tracking-[0.08em] text-slate-500 uppercase leading-[56px]">
                      Tên công việc
                    </div>
                    {tasks.slice(0, 7).map((task) => (
                      <div key={`${task.id}-name`} className="h-16 border-b border-slate-100 px-4 leading-[64px]">
                        <Link
                          href={`/tasks/${task.id}`}
                          className="text-base font-medium text-slate-800 hover:text-blue-700"
                        >
                          {task.name}
                        </Link>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-x-auto">
                    <div className="relative" style={{ width: `${timelineDays.length * DAY_WIDTH}px` }}>
                      <div
                        className="grid border-b border-slate-200 bg-slate-50"
                        style={{ gridTemplateColumns: `repeat(${timelineDays.length}, ${DAY_WIDTH}px)` }}
                      >
                        {timelineDays.map((day) => (
                          <div
                            key={`${day.month}-${day.day}-${day.index}`}
                            className="border-l border-slate-200 px-1 py-2 text-center"
                          >
                            <p className="h-3 text-[10px] font-semibold tracking-[0.06em] text-slate-400 uppercase">
                              {day.isMonthStart ? day.month : ""}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-700">{day.day}</p>
                          </div>
                        ))}
                      </div>

                      <div
                        className="pointer-events-none absolute bottom-0 top-0 w-px bg-blue-500/80"
                        style={{ left: `${TODAY_INDEX * DAY_WIDTH + DAY_WIDTH / 2}px` }}
                      >
                        <span className="absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                          Hôm nay
                        </span>
                      </div>

                      {tasks.slice(0, 7).map((task) => (
                        <div key={`${task.id}-timeline`} className="relative h-16 border-b border-slate-100">
                          <div
                            className="grid h-full"
                            style={{ gridTemplateColumns: `repeat(${timelineDays.length}, ${DAY_WIDTH}px)` }}
                          >
                            {timelineDays.map((day) => (
                              <div
                                key={`${task.id}-${day.index}`}
                                className="border-l border-slate-100"
                              />
                            ))}
                          </div>
                          {task.gantt ? (
                            <div
                              className={`pointer-events-none absolute top-3 h-10 rounded-full px-3 text-sm font-semibold leading-10 ${
                                task.gantt.color === "green"
                                  ? "bg-emerald-200 text-emerald-800"
                                  : task.gantt.color === "amber"
                                    ? "bg-amber-200 text-amber-800"
                                    : "bg-blue-200 text-blue-800"
                              }`}
                              style={{
                                left: `${task.gantt.start * DAY_WIDTH + 4}px`,
                                width: `${Math.max(task.gantt.duration * DAY_WIDTH - 8, 42)}px`,
                              }}
                            >
                              {task.gantt.label}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between px-6 py-3 text-sm text-slate-500">
                  <div className="flex items-center gap-4">
                    <span>✓ 12 hoàn thành</span>
                    <span>• 4 đang làm</span>
                    <span>• 2 có rủi ro</span>
                  </div>
                  <span>Đồng bộ lần cuối: 2 phút trước</span>
                </div>
              </section>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
