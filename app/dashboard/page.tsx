import Link from "next/link";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";

const statCards = [
  {
    title: "Công việc của tôi",
    value: "12",
    badge: "Hôm nay",
    badgeClass: "bg-blue-50 text-blue-600",
    note: "3 việc đến hạn hôm nay",
    iconClass: "bg-blue-50 text-blue-600",
  },
  {
    title: "Tỷ lệ hoàn thành",
    value: "82%",
    badge: "Tuần này",
    badgeClass: "bg-emerald-50 text-emerald-600",
    note: "+5.4% so với tuần trước",
    iconClass: "bg-emerald-50 text-emerald-600",
  },
  {
    title: "Mục tiêu đang chạy",
    value: "4",
    badge: "Quý này",
    badgeClass: "bg-violet-50 text-violet-600",
    note: "Chu kỳ Q4 2024",
    iconClass: "bg-violet-50 text-violet-600",
  },
  {
    title: "Giờ làm việc",
    value: "6.5h",
    badge: "Hôm nay",
    badgeClass: "bg-orange-50 text-orange-600",
    note: "Đã check-in lúc 09:12",
    iconClass: "bg-orange-50 text-orange-600",
  },
];

const taskRows = [
  {
    name: "Refactor phần hero landing page",
    goal: "Thiết kế lại website",
    status: "Đang làm",
    statusClass: "bg-amber-50 text-amber-600",
    progress: 64,
    dueDate: "Hôm nay",
  },
  {
    name: "Tài liệu công cụ nội bộ",
    goal: "Hiệu suất vận hành",
    status: "Cần làm",
    statusClass: "bg-slate-100 text-slate-600",
    progress: 0,
    dueDate: "24/10",
  },
  {
    name: "Kiểm thử tích hợp API",
    goal: "Nhân lõi",
    status: "Hoàn thành",
    statusClass: "bg-emerald-50 text-emerald-600",
    progress: 100,
    dueDate: "Hôm qua",
  },
];

const deadlines = [
  { date: "22/10", title: "Rà soát chiến lược Q4", tag: "Cao", team: "Nhóm Marketing" },
  { date: "24/10", title: "Luồng onboarding mới", tag: "Trung bình", team: "Nhóm Sản phẩm" },
  { date: "27/10", title: "Kiểm tra log tuân thủ", tag: "Thấp", team: "Bảo mật" },
];

const goals = [
  { label: "Ra mắt Mobile V2", team: "Quản lý sản phẩm", progress: 75 },
  { label: "Tăng trưởng MRR 30%", team: "Bán hàng & Marketing", progress: 42 },
  { label: "Giữ chân khách hàng 95%", team: "Chăm sóc khách hàng", progress: 92 },
];

const velocities = [
  { name: "Sarah Jenkins", tasks: 24, progress: 84 },
  { name: "Mark Wu", tasks: 18, progress: 60 },
  { name: "Elena Rossi", tasks: 31, progress: 100 },
];

const recentActivities = [
  { user: "John", action: "đã hoàn thành báo cáo audit UI", when: "2 giờ trước" },
  { user: "Anna", action: "đã tạo mục tiêu Mobile Onboarding V2", when: "4 giờ trước" },
  { user: "Hệ thống", action: "đã cập nhật lên phiên bản v2.4.1", when: "Hôm qua, 11:30 PM" },
];

function TinyDot({ className }: { className: string }) {
  return <span className={`inline-flex h-2.5 w-2.5 rounded-full ${className}`} />;
}

function ProgressBar({ value, colorClass }: { value: number; colorClass?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full ${colorClass ?? "bg-blue-600"}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="dashboard" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[280px]">
          <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <input
                  placeholder="Tìm công việc, mục tiêu hoặc thành viên..."
                  className="h-11 w-full max-w-[520px] rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold tracking-[0.06em] text-emerald-700 uppercase">
                  <TinyDot className="bg-emerald-500" />
                  Đang hoạt động
                </span>
                <div className="hidden h-8 w-px bg-slate-200 md:block" />
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-800">Alex Rivest</p>
                  <p className="text-xs text-slate-500">TCM</p>
                </div>
              </div>
            </div>
          </header>

          <main className="space-y-6 px-4 py-6 lg:px-8 lg:py-7">
            <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-4xl font-semibold tracking-[-0.025em] text-slate-950">
                  Tổng quan
                </h1>
                <p className="text-sm text-slate-500">
                  Chào mừng trở lại, Alex. Đây là những gì đang diễn ra hôm nay.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Xuất báo cáo
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  + Việc mới
                </button>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
              {statCards.map((card, index) => (
                <article
                  key={card.title}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)] animate-[panel-in_300ms_ease-out]"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <div className="flex items-start justify-between">
                    <span className={`grid h-10 w-10 place-items-center rounded-xl ${card.iconClass}`}>
                      •
                    </span>
                    <span
                      className={`rounded-lg px-2 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase ${card.badgeClass}`}
                    >
                      {card.badge}
                    </span>
                  </div>
                  <p className="mt-4 text-[47px] font-semibold leading-none tracking-[-0.03em] text-slate-950">
                    {card.value}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{card.title}</p>
                  <p className="mt-4 text-sm text-slate-600">{card.note}</p>
                </article>
              ))}
            </section>

            <section className="grid gap-4 xl:grid-cols-[2.1fr_1fr]">
              <article className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-slate-900">
                    Xu hướng hoàn thành công việc
                  </h2>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                  >
                    7 ngày qua
                  </button>
                </div>
                <div className="p-5">
                  <div className="h-[290px] rounded-xl bg-gradient-to-b from-blue-50/60 to-white p-4">
                    <svg viewBox="0 0 700 240" className="h-full w-full">
                      <polyline
                        points="30,180 130,165 230,175 330,140 430,155 530,120 630,95"
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <polyline
                        points="30,205 130,188 230,198 330,170 430,180 530,155 630,142"
                        fill="none"
                        stroke="#34d399"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="5 6"
                      />
                      <g fill="#94a3b8" fontSize="13">
                        <text x="52" y="228">
                          T2
                        </text>
                        <text x="147" y="228">
                          T3
                        </text>
                        <text x="248" y="228">
                          T4
                        </text>
                        <text x="347" y="228">
                          T5
                        </text>
                        <text x="446" y="228">
                          T6
                        </text>
                        <text x="545" y="228">
                          T7
                        </text>
                        <text x="645" y="228">
                          CN
                        </text>
                      </g>
                    </svg>
                  </div>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-slate-900">
                    Theo dõi thời gian
                  </h2>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-semibold tracking-[0.08em] text-emerald-700 uppercase">
                    Đang làm
                  </span>
                </div>
                <div className="space-y-4 px-5 py-5">
                  <p className="text-center text-[62px] font-semibold leading-none tracking-[-0.04em] text-slate-950">
                    06:34:12
                  </p>
                  <p className="text-center text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
                    Tổng thời gian hôm nay
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-400">Vào ca</p>
                      <p className="text-xl font-semibold text-slate-700">09:12 AM</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-400">Ra ca</p>
                      <p className="text-xl font-semibold text-slate-400">-:-- --</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" className="rounded-xl bg-slate-100 py-2 text-sm font-medium">
                      Nghỉ giải lao
                    </button>
                    <button
                      type="button"
                      className="rounded-xl bg-rose-500 py-2 text-sm font-semibold text-white"
                    >
                      Kết thúc ca
                    </button>
                  </div>
                  <div className="space-y-2 border-t border-slate-100 pt-4">
                    <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
                      Hoạt động hôm nay
                    </p>
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span className="flex items-center gap-2">
                        <TinyDot className="bg-blue-500" />
                        Họp sản phẩm
                      </span>
                      <span>1h 30m</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span className="flex items-center gap-2">
                        <TinyDot className="bg-slate-300" />
                        Email và Slack
                      </span>
                      <span>45m</span>
                    </div>
                  </div>
                </div>
              </article>
            </section>

            <section className="grid gap-4 xl:grid-cols-[2.1fr_1fr]">
              <article className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-slate-900">
                    Công việc của tôi
                  </h2>
                  <button type="button" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                    Xem tất cả
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[660px] text-left">
                    <thead>
                      <tr className="text-[11px] tracking-[0.08em] text-slate-400 uppercase">
                        <th className="px-5 py-3 font-semibold">Tên công việc</th>
                        <th className="px-5 py-3 font-semibold">Mục tiêu</th>
                        <th className="px-5 py-3 font-semibold">Trạng thái</th>
                        <th className="px-5 py-3 font-semibold">Tiến độ</th>
                        <th className="px-5 py-3 font-semibold">Hạn chót</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taskRows.map((task) => (
                        <tr key={task.name} className="border-t border-slate-100">
                          <td className="px-5 py-4 text-sm font-medium text-slate-700">{task.name}</td>
                          <td className="px-5 py-4 text-sm text-slate-500">{task.goal}</td>
                          <td className="px-5 py-4">
                            <span
                              className={`rounded-full px-2 py-1 text-[10px] font-semibold tracking-[0.06em] uppercase ${task.statusClass}`}
                            >
                              {task.status}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <ProgressBar
                              value={task.progress}
                              colorClass={task.progress === 100 ? "bg-emerald-500" : "bg-blue-600"}
                            />
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-500">{task.dueDate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-slate-900">
                    Hạn sắp tới
                  </h2>
                </div>
                <div className="space-y-4 px-5 py-4">
                  {deadlines.map((item) => (
                    <div key={item.title} className="flex items-start gap-3">
                      <div className="w-14 rounded-xl bg-slate-50 px-2 py-1 text-center text-[11px] font-bold text-slate-700 uppercase">
                        {item.date}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                        <p className="text-xs text-slate-500">
                          <span className="font-semibold text-rose-500">{item.tag}</span> · {item.team}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="m-4 w-[calc(100%-2rem)] rounded-xl border border-slate-200 bg-slate-50 py-2 text-xs font-semibold tracking-[0.06em] text-slate-600 uppercase"
                >
                  Xem toàn bộ lịch
                </button>
              </article>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-slate-900">
                    Tiến độ mục tiêu
                  </h2>
                </div>
                <div className="space-y-5 px-5 py-5">
                  {goals.map((item) => (
                    <div key={item.label} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <p className="font-medium text-slate-700">{item.label}</p>
                        <span className="font-semibold text-slate-500">{item.progress}%</span>
                      </div>
                      <ProgressBar
                        value={item.progress}
                        colorClass={item.progress > 80 ? "bg-emerald-500" : "bg-blue-600"}
                      />
                      <p className="text-xs text-slate-400">{item.team}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-slate-900">
                    Hiệu suất nhóm
                  </h2>
                </div>
                <div className="space-y-4 px-5 py-5">
                  {velocities.map((member) => (
                    <div key={member.name} className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-500 uppercase">
                        <p className="font-semibold text-slate-600">{member.name}</p>
                        <p>{member.tasks} công việc</p>
                      </div>
                      <ProgressBar value={member.progress} />
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_26px_-20px_rgba(15,23,42,0.45)]">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-slate-900">
                    Hoạt động gần đây
                  </h2>
                </div>
                <div className="space-y-4 px-5 py-5">
                  {recentActivities.map((activity) => (
                    <div key={`${activity.user}-${activity.action}`} className="flex items-start gap-3">
                      <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                        {activity.user[0]}
                      </span>
                      <div>
                        <p className="text-sm text-slate-700">
                          <span className="font-semibold">{activity.user}</span> {activity.action}
                        </p>
                        <p className="text-xs text-slate-400">{activity.when}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <div className="text-sm text-slate-500 lg:hidden">
              <Link href="/" className="font-semibold text-blue-600 hover:text-blue-700">
                ← Quay lại đăng nhập
              </Link>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
