"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";

type GoalDetail = {
  title: string;
  phongBan: string;
  quy: string;
  owner: string;
  createdAt: string;
  progress: number;
  delta: string;
  note: string;
  description: string;
  bullets: string[];
  parentGoal: string;
  tasksDone: string;
  weeklyVelocity: string;
};

const goalDetails: Record<string, GoalDetail> = {
  "goal-company": {
    title: "Tăng thị phần thêm 15% tại thị trường EU",
    phongBan: "Sales & Marketing",
    quy: "2024 - Q4",
    owner: "Sarah Johnson",
    createdAt: "Tạo ngày 12/10/2023",
    progress: 65,
    delta: "+12% so với tháng trước",
    note: "Đang vượt mục tiêu tại khu vực DACH 5%, nhưng Scandinavia đang chậm tiến độ.",
    description:
      "Mục tiêu chiến lược này tập trung khai thác hệ thống bản địa hóa mới để mở rộng tệp khách hàng doanh nghiệp tại Liên minh Châu Âu.",
    bullets: [
      "Triển khai chiến dịch marketing bản địa hóa cho 4 ngôn ngữ trọng điểm.",
      "Tuyển thêm 3 quản lý kinh doanh khu vực DACH.",
      "Thiết lập hợp tác với 2 nhà phân phối lớn tại EU.",
    ],
    parentGoal: "Tăng trưởng doanh thu toàn cầu 25%",
    tasksDone: "24 / 32",
    weeklyVelocity: "4.2 điểm",
  },
};

const relatedTasks = [
  { name: "Bản địa hóa trang pricing", status: "Hoàn thành", assignee: "Sarah", progress: 100 },
  { name: "Tuyển trưởng nhóm Sales DACH", status: "Đang làm", assignee: "Milo", progress: 40 },
  { name: "Rà soát pháp lý hợp đồng EU", status: "Kế hoạch", assignee: "Alex", progress: 0 },
];

const activityFeed = [
  { user: "Sarah J.", action: "cập nhật tiến độ lên 65%", time: "2 giờ trước" },
  { user: "Alex M.", action: 'tạo task "Rà soát pháp lý hợp đồng EU"', time: "Hôm qua, 16:32" },
  { user: "Luna R.", action: "đính kèm file Q4_Competitive_Analysis.pdf", time: "24/10/2023" },
];

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-blue-600" style={{ width: `${value}%` }} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "Hoàn thành") {
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
        Hoàn thành
      </span>
    );
  }

  if (status === "Đang làm") {
    return (
      <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
        Đang làm
      </span>
    );
  }

  return (
    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
      Kế hoạch
    </span>
  );
}

export default function GoalDetailPage() {
  const params = useParams<{ goalId: string }>();
  const goalId = params.goalId ?? "goal-company";
  const goal = goalDetails[goalId] ?? goalDetails["goal-company"];

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="goals" />

        <div className="flex h-screen w-full flex-1 flex-col overflow-hidden lg:pl-[280px]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                <Link href="/goals" className="hover:text-slate-700">
                  Mục tiêu
                </Link>{" "}
                <span className="px-2">›</span>
                <span>Kế hoạch tăng trưởng Q4</span>
                <span className="px-2">›</span>
                <span className="font-semibold text-slate-700">{goal.title}</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  ✎ Sửa mục tiêu
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  + Thêm việc
                </button>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-7">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="space-y-5">
                <div>
                  <h1 className="text-4xl font-semibold tracking-[-0.03em] text-slate-900">
                    {goal.title}
                  </h1>
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
                    <span>{goal.phongBan}</span>
                    <span>{goal.quy}</span>
                    <span>{goal.owner}</span>
                    <span>{goal.createdAt}</span>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-2xl font-semibold text-slate-900">Tiến độ mục tiêu</h2>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        On Track
                      </span>
                    </div>
                    <div className="flex items-end gap-3">
                      <p className="text-6xl font-bold tracking-[-0.04em] text-blue-600">{goal.progress}%</p>
                      <p className="pb-2 text-sm text-slate-500">{goal.delta}</p>
                    </div>
                    <div className="mt-2">
                      <ProgressBar value={goal.progress} />
                    </div>
                    <p className="mt-5 text-lg leading-relaxed text-slate-600">{goal.note}</p>
                  </article>

                  <div className="space-y-4">
                    <article className="rounded-2xl border border-slate-200 bg-white p-5">
                      <p className="text-sm text-slate-500">Tasks Completed</p>
                      <p className="mt-2 text-4xl font-semibold tracking-[-0.02em] text-slate-900">
                        {goal.tasksDone}
                      </p>
                      <div className="mt-4 grid grid-cols-4 gap-1.5">
                        <div className="h-2 rounded bg-blue-600" />
                        <div className="h-2 rounded bg-blue-600" />
                        <div className="h-2 rounded bg-blue-600" />
                        <div className="h-2 rounded bg-slate-100" />
                      </div>
                    </article>
                    <article className="rounded-2xl border border-slate-200 bg-white p-5">
                      <p className="text-sm text-slate-500">Weekly Velocity</p>
                      <p className="mt-2 text-4xl font-semibold tracking-[-0.02em] text-slate-900">
                        {goal.weeklyVelocity}
                      </p>
                      <div className="mt-4 flex h-12 items-end gap-1.5">
                        <div className="h-4 flex-1 rounded bg-blue-100" />
                        <div className="h-6 flex-1 rounded bg-blue-200" />
                        <div className="h-8 flex-1 rounded bg-blue-300" />
                        <div className="h-10 flex-1 rounded bg-blue-600" />
                        <div className="h-5 flex-1 rounded bg-blue-200" />
                      </div>
                    </article>
                  </div>
                </div>

                <section>
                  <h2 className="text-sm font-bold tracking-[0.08em] text-slate-400 uppercase">Description</h2>
                  <p className="mt-2 text-lg leading-relaxed text-slate-700">{goal.description}</p>
                  <ul className="mt-3 list-disc space-y-1 pl-6 text-lg text-slate-700">
                    {goal.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>

                <section className="space-y-3">
                  <h2 className="text-sm font-bold tracking-[0.08em] text-slate-400 uppercase">
                    Mục tiêu cha
                  </h2>
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                    <p className="text-xs font-semibold tracking-[0.06em] text-slate-400 uppercase">
                      Mục tiêu cha
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-800">{goal.parentGoal}</p>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <h2 className="text-sm font-bold tracking-[0.08em] text-slate-400 uppercase">
                      Related Tasks
                    </h2>
                    <button type="button" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                      Xem tất cả
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left">
                      <thead>
                        <tr className="text-xs text-slate-400 uppercase">
                          <th className="px-5 py-3 font-semibold">Task Name</th>
                          <th className="px-5 py-3 font-semibold">Status</th>
                          <th className="px-5 py-3 font-semibold">Assignee</th>
                          <th className="px-5 py-3 font-semibold">Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {relatedTasks.map((task) => (
                          <tr key={task.name} className="border-t border-slate-100">
                            <td className="px-5 py-4 text-sm font-medium text-slate-700">{task.name}</td>
                            <td className="px-5 py-4">
                              <StatusBadge status={task.status} />
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">{task.assignee}</td>
                            <td className="px-5 py-4 text-sm text-slate-600">{task.progress}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>

              <aside className="space-y-5">
                <article className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h2 className="text-sm font-bold tracking-[0.08em] text-slate-400 uppercase">Activity Feed</h2>
                  <div className="mt-4 space-y-4">
                    {activityFeed.map((item) => (
                      <div key={`${item.user}-${item.action}`} className="flex gap-3">
                        <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                          {item.user[0]}
                        </span>
                        <div>
                          <p className="text-sm text-slate-700">
                            <span className="font-semibold">{item.user}</span> {item.action}
                          </p>
                          <p className="text-xs text-slate-400">{item.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                  <h2 className="text-xl font-semibold text-blue-700">Tóm tắt mục tiêu</h2>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Hạn chót</span>
                      <span className="font-semibold text-slate-800">31/12/2024</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Tổng cộng tác viên</span>
                      <span className="font-semibold text-slate-800">12</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Mức độ rủi ro</span>
                      <span className="font-semibold text-amber-600">Trung bình</span>
                    </div>
                  </div>
                  <p className="mt-4 border-t border-blue-100 pt-4 text-sm italic text-slate-600">
                    “Targeting high-value accounts in Germany is the current bottleneck. Review session scheduled for Monday.”
                  </p>
                </article>
              </aside>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
