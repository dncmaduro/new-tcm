import Link from "next/link";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";

const miniCalendarDays = [
  ["", "", "", "", "", "1", "2"],
  ["3", "4", "5", "6", "7", "8", "9"],
  ["10", "11", "12", "13", "14", "15", "16"],
  ["17", "18", "19", "20", "21", "22", "23"],
  ["24", "25", "26", "27", "28", "29", "30"],
  ["31", "", "", "", "", "", ""],
];

export default function CreateTimeRequestPage() {
  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="timesheet" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[280px]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-7">
            <div className="space-y-2">
              <p className="text-sm text-slate-500">
                <Link href="/timesheet" className="hover:text-slate-700">
                  Chấm công
                </Link>
                <span className="px-2">›</span>
                <span>Yêu cầu công</span>
                <span className="px-2">›</span>
                <span className="font-semibold text-slate-700">Tạo mới</span>
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.02em] text-slate-900">
                Tạo yêu cầu điều chỉnh công
              </h1>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-7">
            <section className="mx-auto w-full max-w-[920px] rounded-2xl border border-slate-200 bg-white p-5 lg:p-6">
              <form className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-800">Loại yêu cầu</label>
                  <select className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-700 outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-100">
                    <option>Chọn loại yêu cầu</option>
                    <option>Check-in trễ</option>
                    <option>Check-out sớm</option>
                    <option>Thiếu lượt chấm công</option>
                    <option>Khai báo tăng ca</option>
                  </select>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">Chọn ngày cần điều chỉnh</p>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                    >
                      Tháng 10/2023
                    </button>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
                    <input
                      type="date"
                      defaultValue="2023-10-05"
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
                    />

                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="grid grid-cols-7 text-center text-[11px] font-bold tracking-[0.08em] text-slate-400 uppercase">
                        <span>CN</span>
                        <span>T2</span>
                        <span>T3</span>
                        <span>T4</span>
                        <span>T5</span>
                        <span>T6</span>
                        <span>T7</span>
                      </div>
                      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-sm">
                        {miniCalendarDays.flatMap((week, weekIndex) =>
                          week.map((day, dayIndex) => {
                            const isSelected = day === "5";
                            return (
                              <button
                                key={`${weekIndex}-${dayIndex}-${day}`}
                                type="button"
                                className={`h-8 rounded-md ${
                                  day === ""
                                    ? "cursor-default"
                                    : isSelected
                                      ? "bg-blue-600 font-semibold text-white"
                                      : "text-slate-700 hover:bg-slate-100"
                                }`}
                              >
                                {day}
                              </button>
                            );
                          }),
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800">Giờ vào cần chỉnh</label>
                    <input
                      type="time"
                      defaultValue="09:00"
                      className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-700 outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800">Giờ ra cần chỉnh</label>
                    <input
                      type="time"
                      defaultValue="18:00"
                      className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-700 outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-800">Lý do điều chỉnh</label>
                  <textarea
                    rows={5}
                    placeholder="Mô tả ngắn gọn lý do cần điều chỉnh..."
                    className="w-full rounded-xl border border-slate-200 bg-white p-4 text-base text-slate-700 outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                  <Link
                    href="/timesheet"
                    className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Hủy
                  </Link>
                  <button
                    type="submit"
                    className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Gửi yêu cầu
                  </button>
                </div>
              </form>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
