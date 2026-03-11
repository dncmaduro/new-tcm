"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";

type SubtaskItem = {
  id: string;
  text: string;
  done: boolean;
};

type AttachmentItem = {
  id: string;
  name: string;
  size: string;
  kind: "image" | "pdf";
};

type CommentItem = {
  id: string;
  author: string;
  short: string;
  time: string;
  content: string;
  you?: boolean;
};

type ActivityItem = {
  id: string;
  actor: string;
  action: string;
  time: string;
};

type TaskDetail = {
  title: string;
  overview: string;
  bulletPoints: string[];
  status: string;
  assignee: string;
  progress: number;
  priority: string;
  linkedGoal: string;
  startDate: string;
  dueDate: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  subtasks: SubtaskItem[];
  attachments: AttachmentItem[];
  comments: CommentItem[];
  activities: ActivityItem[];
};

const defaultTaskDetail: TaskDetail = {
  title: "Refactor phần hero của landing page",
  overview:
    "Công việc này tập trung tái cấu trúc toàn bộ khu vực hero để cải thiện tỉ lệ chuyển đổi. Cần bảo đảm đồng bộ guideline thương hiệu và thứ bậc nội dung.",
  bulletPoints: [
    "Tăng độ tương phản chữ để dễ đọc trên mọi thiết bị.",
    "Tối ưu vị trí CTA ở vùng nhìn thấy đầu tiên.",
    "Điều chỉnh thứ bậc thị giác để nhấn mạnh đề xuất giá trị.",
  ],
  status: "Đang làm",
  assignee: "Sarah Jenkins",
  progress: 33,
  priority: "Cao",
  linkedGoal: "Nâng cao trải nghiệm sản phẩm",
  startDate: "20/10/2024",
  dueDate: "24/10/2024",
  createdBy: "Alex Chen",
  createdAt: "20/10/2024",
  updatedAt: "10 phút trước",
  subtasks: [
    { id: "sub-1", text: "Cập nhật lại bố cục hero", done: false },
    { id: "sub-2", text: "Thay ảnh cũ bằng bản tối ưu hóa", done: true },
    { id: "sub-3", text: "Tối ưu hiển thị trên mobile", done: false },
  ],
  attachments: [
    { id: "att-1", name: "mockup-landing.png", size: "1.2 MB", kind: "image" },
    { id: "att-2", name: "yeu-cau-du-an.pdf", size: "450 KB", kind: "pdf" },
    { id: "att-3", name: "Thêm tệp", size: "", kind: "image" },
  ],
  comments: [
    {
      id: "cmt-1",
      author: "Sarah Jenkins",
      short: "SJ",
      time: "2 giờ trước",
      content:
        "Mình đã bắt đầu chỉnh bố cục Figma. Dự kiến cuối ngày sẽ có bản gần hoàn chỉnh để review.",
    },
    {
      id: "cmt-2",
      author: "Alex Chen",
      short: "AC",
      time: "45 phút trước",
      content: "Tốt, mình sẽ báo đội dev chuẩn bị để vào giai đoạn triển khai.",
    },
  ],
  activities: [
    {
      id: "act-1",
      actor: "Alex Chen",
      action: "đổi trạng thái sang Đang làm",
      time: "3 giờ trước",
    },
    {
      id: "act-2",
      actor: "Alex Chen",
      action: "giao việc cho Sarah Jenkins",
      time: "Hôm qua, 16:12",
    },
    {
      id: "act-3",
      actor: "Hệ thống",
      action: "tạo công việc",
      time: "20/10/2024",
    },
  ],
};

const taskDetailsById: Record<string, TaskDetail> = {
  "task-auth-flow": defaultTaskDetail,
  "task-db-opt": {
    ...defaultTaskDetail,
    title: "Tối ưu cơ sở dữ liệu",
    linkedGoal: "Nâng cấp hạ tầng hệ thống",
  },
  "task-api-phase1": {
    ...defaultTaskDetail,
    title: "Tích hợp API giai đoạn 1",
    progress: 100,
    status: "Hoàn thành",
    priority: "Trung bình",
  },
  "task-feedback-review": {
    ...defaultTaskDetail,
    title: "Rà soát phản hồi khách hàng",
    progress: 90,
    status: "Đánh giá",
  },
};

export default function TaskDetailPage() {
  const params = useParams<{ taskId: string }>();
  const taskId = params.taskId ?? "task-auth-flow";
  const task = taskDetailsById[taskId] ?? {
    ...defaultTaskDetail,
    title: "Chi tiết công việc",
  };
  const completedSubtasks = task.subtasks.filter((item) => item.done).length;

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="tasks" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[280px]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                <Link href="/tasks" className="hover:text-slate-700">
                  Công việc
                </Link>
                <span className="px-2">›</span>
                <span className="font-semibold text-slate-700">{task.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Sửa công việc
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-100"
                >
                  Xóa công việc
                </button>
                <button
                  type="button"
                  className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                >
                  ⋮
                </button>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-7">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <section className="space-y-6">
                <div className="space-y-4">
                  <h1 className="text-3xl font-semibold tracking-[-0.02em] text-slate-900 lg:text-5xl">
                    {task.title}
                  </h1>
                  <p className="max-w-4xl text-lg leading-relaxed text-slate-600">{task.overview}</p>
                  <ul className="list-disc space-y-1 pl-6 text-lg text-slate-700">
                    {task.bulletPoints.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>

                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-2xl font-semibold text-slate-900">Công việc con</h2>
                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">
                      {completedSubtasks} / {task.subtasks.length} hoàn thành
                    </span>
                  </div>
                  <div className="space-y-2">
                    {task.subtasks.map((item) => (
                      <label key={item.id} className="flex items-center gap-3 text-base text-slate-700">
                        <input type="checkbox" checked={item.done} readOnly className="h-4 w-4 rounded border-slate-300" />
                        <span className={item.done ? "text-slate-400 line-through" : ""}>{item.text}</span>
                      </label>
                    ))}
                  </div>
                  <button type="button" className="mt-3 text-base font-semibold text-blue-600 hover:text-blue-700">
                    + Thêm công việc con
                  </button>
                </section>

                <section className="space-y-3">
                  <h2 className="text-3xl font-semibold tracking-[-0.02em] text-slate-900">Tệp đính kèm</h2>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {task.attachments.map((item) => (
                      <article
                        key={item.id}
                        className={`rounded-2xl border p-3 ${
                          item.name === "Thêm tệp"
                            ? "grid place-items-center border-dashed border-slate-300 bg-slate-50 text-slate-500"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        {item.name === "Thêm tệp" ? (
                          <>
                            <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-200 text-lg">+</div>
                            <p className="mt-2 text-sm font-medium">Thêm tệp</p>
                          </>
                        ) : (
                          <>
                            <div className="grid h-32 place-items-center rounded-xl bg-slate-100 text-slate-500">
                              {item.kind === "pdf" ? "PDF" : "Ảnh"}
                            </div>
                            <p className="mt-2 text-sm font-semibold text-slate-700">{item.name}</p>
                            <p className="text-xs text-slate-500">{item.size}</p>
                          </>
                        )}
                      </article>
                    ))}
                  </div>
                </section>

                <section className="space-y-4">
                  <h2 className="text-3xl font-semibold tracking-[-0.02em] text-slate-900">Thảo luận</h2>
                  <div className="space-y-4">
                    {task.comments.map((comment) => (
                      <div key={comment.id} className="flex items-start gap-3">
                        <span
                          className={`mt-1 grid h-9 w-9 place-items-center rounded-full text-xs font-semibold ${
                            comment.you ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {comment.short}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-semibold text-slate-800">
                            {comment.author} <span className="ml-2 text-sm font-normal text-slate-500">{comment.time}</span>
                          </p>
                          <div className="mt-2 rounded-xl border border-slate-200 bg-white p-4 text-base text-slate-700">
                            {comment.content}
                          </div>
                        </div>
                      </div>
                    ))}

                    <div className="flex items-start gap-3">
                      <span className="mt-1 grid h-9 w-9 place-items-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                        BẠN
                      </span>
                      <div className="min-w-0 flex-1">
                        <textarea
                          rows={4}
                          placeholder="Viết bình luận..."
                          className="w-full rounded-xl border border-slate-200 bg-white p-4 text-base text-slate-700 outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
                        />
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                          >
                            Đăng bình luận
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="border-t border-slate-200 pt-5">
                  <h2 className="text-3xl font-semibold tracking-[-0.02em] text-slate-900">Hoạt động</h2>
                  <div className="mt-4 space-y-3">
                    {task.activities.map((item) => (
                      <div key={item.id} className="flex items-start gap-3">
                        <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-full bg-slate-200 text-xs">•</span>
                        <p className="text-base text-slate-700">
                          <span className="font-semibold">{item.actor}</span> {item.action}
                          <span className="ml-2 text-sm text-slate-500">{item.time}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </section>

              <aside className="xl:sticky xl:top-[88px] xl:h-[calc(100vh-108px)] xl:overflow-y-auto">
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
                  <div>
                    <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">Trạng thái</p>
                    <button
                      type="button"
                      className="mt-2 flex h-11 w-full items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700"
                    >
                      <span>• {task.status}</span>
                      <span>⌄</span>
                    </button>
                  </div>

                  <div>
                    <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">Người phụ trách</p>
                    <div className="mt-2 flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-orange-100 text-xs font-semibold text-orange-700">
                        SJ
                      </span>
                      <span className="text-sm font-semibold text-slate-700">{task.assignee}</span>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">Tiến độ</p>
                      <p className="text-sm font-semibold text-slate-700">{task.progress}%</p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${task.progress}%` }} />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">Mức ưu tiên</p>
                    <span className="mt-2 inline-flex rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                      ! {task.priority}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">Mục tiêu liên kết</p>
                    <Link href="/goals" className="mt-2 inline-block text-base font-semibold text-blue-600 hover:text-blue-700">
                      {task.linkedGoal}
                    </Link>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-400">Bắt đầu</p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">{task.startDate}</p>
                    </div>
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                      <p className="text-xs text-rose-400">Hạn chót</p>
                      <p className="mt-1 text-sm font-semibold text-rose-700">{task.dueDate}</p>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3 text-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-slate-500">Tạo bởi</span>
                      <span className="font-medium text-slate-700">{task.createdBy}</span>
                    </div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-slate-500">Ngày tạo</span>
                      <span className="font-medium text-slate-700">{task.createdAt}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Cập nhật</span>
                      <span className="font-medium text-slate-700">{task.updatedAt}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm text-slate-600">Cần hỗ trợ từ team cho công việc này?</p>
                  <button
                    type="button"
                    className="mt-3 w-full rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    Yêu cầu duyệt
                  </button>
                </div>
              </aside>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
